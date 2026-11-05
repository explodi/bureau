// Sockets on Windows: Winsock, in a file of its own.
//
// The POSIX file is the reference for what each method promises. Winsock
// differs in its handle type (`SOCKET`, not an `int`), its error reporting
// (`WSAGetLastError`, not `errno`) and its startup (`WSAStartup` before the
// first socket), which is why this is a second file and not preprocessor
// branches through the first.
//
// LEAN_AND_MEAN before any include: without it <windows.h>, reached through
// <winsock2.h> or any header, drags in the old <winsock.h>, which clashes
// with <winsock2.h>.
#define WIN32_LEAN_AND_MEAN
#include <array>
#include <chrono>
#include <time.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#include "socket.h"
#include "socket_output.h"

namespace bureau::net {

namespace {

/** A socket handle that closes itself. */
class Handle {
 public:
  explicit Handle(SOCKET handle = INVALID_SOCKET) : handle_(handle) {}
  ~Handle() { reset(); }
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;

  SOCKET get() const { return handle_; }
  bool valid() const { return handle_ != INVALID_SOCKET; }

  void reset(SOCKET handle = INVALID_SOCKET) {
    if (handle_ != INVALID_SOCKET) ::closesocket(handle_);
    handle_ = handle;
  }

  /** Hands the handle on without closing it. `reset` would close it. */
  SOCKET release() {
    const SOCKET handle = handle_;
    handle_ = INVALID_SOCKET;
    return handle;
  }

 private:
  SOCKET handle_ = INVALID_SOCKET;
};

/**
 * Winsock has to be started once per process before the first socket call.
 * Never cleaned up: the server lives as long as the process does.
 */
bool startWinsock() {
  static const bool started = [] {
    WSADATA data{};
    return ::WSAStartup(MAKEWORD(2, 2), &data) == 0;
  }();
  return started;
}

bool wouldBlock() { return ::WSAGetLastError() == WSAEWOULDBLOCK; }

/** Non-blocking, so one thread can serve without waiting on any one socket. */
bool makeNonBlocking(SOCKET handle) {
  u_long one = 1;
  return ::ioctlsocket(handle, FIONBIO, &one) == 0;
}

class WinsockConnection final : public Connection {
 public:
  explicit WinsockConnection(SOCKET handle) : handle_(handle) {
    // A frame is small and a tick sends several; waiting to coalesce them adds
    // latency to every one for no gain on loopback.
    const BOOL one = TRUE;
    ::setsockopt(handle, IPPROTO_TCP, TCP_NODELAY,
                 reinterpret_cast<const char*>(&one), sizeof(one));
  }

  std::optional<std::string> read() override {
    if (!handle_.valid()) return std::nullopt;

    std::string received;
    std::array<char, 4096> buffer{};
    for (;;) {
      const int got = ::recv(handle_.get(), buffer.data(),
                             static_cast<int>(buffer.size()), 0);
      if (got > 0) {
        received.append(buffer.data(), static_cast<std::size_t>(got));
        continue;
      }
      if (got == 0) {
        // An orderly close. Anything already read is still worth returning,
        // and the next call says the connection is gone.
        handle_.reset();
        return received.empty() ? std::nullopt
                                : std::optional<std::string>(received);
      }
      if (wouldBlock()) return received;
      handle_.reset();
      return received.empty() ? std::nullopt
                              : std::optional<std::string>(received);
    }
  }

  bool write(std::string_view bytes) override {
    if (!handle_.valid()) return false;
    if (!output_.append(bytes, monotonicMilliseconds())) {
      close();
      return false;
    }
    flush();
    return handle_.valid();
  }

  bool flush() override {
    if (!handle_.valid()) {
      close();
      return true;
    }
    const auto result = output_.flush(
        [this](std::string_view bytes) -> std::ptrdiff_t {
          const int wrote = ::send(handle_.get(), bytes.data(),
                                   static_cast<int>(bytes.size()), 0);
          if (wrote > 0) return wrote;
          const int error = ::WSAGetLastError();
          const bool retry = wrote == SOCKET_ERROR &&
                             (error == WSAEWOULDBLOCK || error == WSAEINTR);
          return retry ? 0 : -1;
        },
        monotonicMilliseconds());
    if (result == SocketOutput::Flush::Failed) close();
    return result != SocketOutput::Flush::Pending;
  }

  void close() override {
    handle_.reset();
    output_ = SocketOutput{};
  }

 private:
  Handle handle_;
  SocketOutput output_;
};

class WinsockListener final : public Listener {
 public:
  WinsockListener(SOCKET handle, std::uint16_t port)
      : handle_(handle), port_(port) {}

  std::uint16_t port() const override { return port_; }

  std::unique_ptr<Connection> accept() override {
    if (!handle_.valid()) return nullptr;
    Handle accepted(::accept(handle_.get(), nullptr, nullptr));
    if (!accepted.valid()) return nullptr;
    if (!makeNonBlocking(accepted.get())) return nullptr;
    return std::make_unique<WinsockConnection>(accepted.release());
  }

 private:
  Handle handle_;
  std::uint16_t port_ = 0;
};

}  // namespace

std::unique_ptr<Listener> listenLoopback(std::uint16_t port) {
  if (!startWinsock()) return nullptr;

  Handle listening(::socket(AF_INET, SOCK_STREAM, 0));
  if (!listening.valid()) return nullptr;

  // No SO_REUSEADDR: here it lets a second listener take a port that is in
  // use, the opposite of what the POSIX file wants it for, and a Windows bind
  // does not wait out TIME_WAIT anyway.

  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(port);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (::bind(listening.get(), reinterpret_cast<sockaddr*>(&address),
             sizeof(address)) != 0) {
    return nullptr;
  }
  // The loop does not accept while a day runs, and Winsock refuses what a full
  // queue has no room for, which the page sees as a failed fetch.
  if (::listen(listening.get(), SOMAXCONN) != 0) return nullptr;
  if (!makeNonBlocking(listening.get())) return nullptr;

  // Port 0 asked the system to choose; this is where we find out what it did.
  sockaddr_in bound{};
  int boundSize = sizeof(bound);
  if (::getsockname(listening.get(), reinterpret_cast<sockaddr*>(&bound),
                    &boundSize) != 0) {
    return nullptr;
  }

  // Released, not reset: the listener owns the handle from here, and `reset`
  // would close the socket on the way out.
  return std::make_unique<WinsockListener>(listening.release(),
                                           ntohs(bound.sin_port));
}

std::string isoTimestampNow() {
  const std::time_t now = std::time(nullptr);
  std::tm utc{};
  ::gmtime_s(&utc, &now);
  std::array<char, 32> text{};
  std::strftime(text.data(), text.size(), "%Y-%m-%dT%H:%M:%S.000Z", &utc);
  return std::string(text.data());
}

std::int64_t monotonicMilliseconds() {
  using namespace std::chrono;
  return duration_cast<milliseconds>(steady_clock::now().time_since_epoch())
      .count();
}

std::int64_t monotonicMicroseconds() {
  using namespace std::chrono;
  return duration_cast<microseconds>(steady_clock::now().time_since_epoch())
      .count();
}

std::int64_t awakeMilliseconds() {
  // QueryPerformanceCounter, under steady_clock, counts sleep and
  // hibernation; the unbiased interrupt time does not. It moves a clock tick
  // at a time, at most 15.6 ms, which is plenty for holds judged in seconds.
  ULONGLONG hundredNanoseconds = 0;
  ::QueryUnbiasedInterruptTime(&hundredNanoseconds);
  return static_cast<std::int64_t>(hundredNanoseconds / 10'000);
}

std::int64_t threadCpuMilliseconds() {
  FILETIME created{};
  FILETIME exited{};
  FILETIME kernel{};
  FILETIME user{};
  ::GetThreadTimes(::GetCurrentThread(), &created, &exited, &kernel, &user);
  const auto hundredNanoseconds = [](FILETIME time) {
    return (static_cast<std::uint64_t>(time.dwHighDateTime) << 32) |
           time.dwLowDateTime;
  };
  return static_cast<std::int64_t>(
      (hundredNanoseconds(kernel) + hundredNanoseconds(user)) / 10'000);
}

std::int64_t epochMilliseconds() {
  using namespace std::chrono;
  return duration_cast<milliseconds>(system_clock::now().time_since_epoch())
      .count();
}

}  // namespace bureau::net
