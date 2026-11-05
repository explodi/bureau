// Sockets on a POSIX system: macOS, Linux, iOS and Android all take this one.
//
// Windows needs Winsock, which differs enough in its handle type, its error
// reporting and its startup that it belongs in a file of its own rather than
// in preprocessor branches through this one.#include <arpa/inet.h>
#include <array>
#include <ctime>
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

#include "socket.h"
#include "socket_output.h"

namespace bureau::net {

namespace {

/** A file descriptor that closes itself. */
class Descriptor {
 public:
  explicit Descriptor(int handle = -1) : handle_(handle) {}
  ~Descriptor() { reset(); }
  Descriptor(const Descriptor&) = delete;
  Descriptor& operator=(const Descriptor&) = delete;

  int get() const { return handle_; }
  bool valid() const { return handle_ >= 0; }

  void reset(int handle = -1) {
    if (handle_ >= 0) ::close(handle_);
    handle_ = handle;
  }

  /** Hands the descriptor on without closing it. `reset` would close it. */
  int release() {
    const int handle = handle_;
    handle_ = -1;
    return handle;
  }

 private:
  int handle_ = -1;
};

/** Non-blocking, so one thread can serve without waiting on any one socket. */
bool makeNonBlocking(int handle) {
  const int flags = ::fcntl(handle, F_GETFL, 0);
  if (flags < 0) return false;
  return ::fcntl(handle, F_SETFL, flags | O_NONBLOCK) == 0;
}

class PosixConnection final : public Connection {
 public:
  explicit PosixConnection(int handle) : handle_(handle) {
    // A frame is small and a tick sends several; waiting to coalesce them adds
    // latency to every one for no gain on loopback.
    int one = 1;
    ::setsockopt(handle, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));
#if defined(SO_NOSIGPIPE)
    ::setsockopt(handle, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof(one));
#endif
  }

  std::optional<std::string> read() override {
    if (!handle_.valid()) return std::nullopt;

    std::string received;
    std::array<char, 4096> buffer{};
    for (;;) {
      const auto got = ::recv(handle_.get(), buffer.data(), buffer.size(), 0);
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
      if (errno == EAGAIN || errno == EWOULDBLOCK) return received;
      if (errno == EINTR) continue;
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
          const auto wrote =
              ::send(handle_.get(), bytes.data(), bytes.size(), kNoSignal);
          if (wrote > 0) return wrote;
          const bool retry = wrote < 0 && (errno == EINTR || errno == EAGAIN ||
                                           errno == EWOULDBLOCK);
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
  // A closed peer should be an error here, not a signal that kills the
  // process; macOS spells that on the socket, Linux on the call.
#if defined(MSG_NOSIGNAL)
  static constexpr int kNoSignal = MSG_NOSIGNAL;
#else
  static constexpr int kNoSignal = 0;
#endif

  Descriptor handle_;
  SocketOutput output_;
};

class PosixListener final : public Listener {
 public:
  PosixListener(int handle, std::uint16_t port)
      : handle_(handle), port_(port) {}

  std::uint16_t port() const override { return port_; }

  std::unique_ptr<Connection> accept() override {
    if (!handle_.valid()) return nullptr;
    const int accepted = ::accept(handle_.get(), nullptr, nullptr);
    if (accepted < 0) return nullptr;
    if (!makeNonBlocking(accepted)) {
      ::close(accepted);
      return nullptr;
    }
    return std::make_unique<PosixConnection>(accepted);
  }

 private:
  Descriptor handle_;
  std::uint16_t port_ = 0;
};

}  // namespace

std::unique_ptr<Listener> listenLoopback(std::uint16_t port) {
  Descriptor listening(::socket(AF_INET, SOCK_STREAM, 0));
  if (!listening.valid()) return nullptr;

  // So a restart does not wait out the last socket's TIME_WAIT, which is
  // every second run during development.
  int one = 1;
  ::setsockopt(listening.get(), SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));

  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(port);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (::bind(listening.get(), reinterpret_cast<sockaddr*>(&address),
             sizeof(address)) != 0) {
    return nullptr;
  }
  // The loop does not accept while a day runs; what a page opens meanwhile
  // waits here.
  if (::listen(listening.get(), SOMAXCONN) != 0) return nullptr;
  if (!makeNonBlocking(listening.get())) return nullptr;

  // Port 0 asked the system to choose; this is where we find out what it did.
  sockaddr_in bound{};
  socklen_t boundSize = sizeof(bound);
  if (::getsockname(listening.get(), reinterpret_cast<sockaddr*>(&bound),
                    &boundSize) != 0) {
    return nullptr;
  }

  // Released, not reset: the listener owns the descriptor from here, and
  // `reset` would close the socket on the way out.
  return std::make_unique<PosixListener>(listening.release(),
                                         ntohs(bound.sin_port));
}

std::string isoTimestampNow() {
  const std::time_t now = std::time(nullptr);
  std::tm utc{};
  ::gmtime_r(&now, &utc);
  std::array<char, 32> text{};
  std::strftime(text.data(), text.size(), "%Y-%m-%dT%H:%M:%S.000Z", &utc);
  return std::string(text.data());
}

std::int64_t monotonicMilliseconds() {
  ::timespec now{};
  ::clock_gettime(CLOCK_MONOTONIC, &now);
  return static_cast<std::int64_t>(now.tv_sec) * 1000 + now.tv_nsec / 1'000'000;
}

std::int64_t monotonicMicroseconds() {
  ::timespec now{};
  ::clock_gettime(CLOCK_MONOTONIC, &now);
  return static_cast<std::int64_t>(now.tv_sec) * 1'000'000 + now.tv_nsec / 1000;
}

std::int64_t awakeMilliseconds() {
  // Darwin's CLOCK_MONOTONIC counts the machine's sleep; its uptime clock
  // (mach_absolute_time's) does not. Linux's stops in suspend already.
#if defined(__APPLE__)
  constexpr clockid_t kAwakeClock = CLOCK_UPTIME_RAW;
#else
  constexpr clockid_t kAwakeClock = CLOCK_MONOTONIC;
#endif
  ::timespec now{};
  ::clock_gettime(kAwakeClock, &now);
  return static_cast<std::int64_t>(now.tv_sec) * 1000 + now.tv_nsec / 1'000'000;
}

std::int64_t threadCpuMilliseconds() {
  ::timespec used{};
  ::clock_gettime(CLOCK_THREAD_CPUTIME_ID, &used);
  return static_cast<std::int64_t>(used.tv_sec) * 1000 +
         used.tv_nsec / 1'000'000;
}

std::int64_t epochMilliseconds() {
  ::timespec now{};
  ::clock_gettime(CLOCK_REALTIME, &now);
  return static_cast<std::int64_t>(now.tv_sec) * 1000 + now.tv_nsec / 1'000'000;
}

}  // namespace bureau::net
