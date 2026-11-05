// The one door to a socket.
//
// This header names what a socket can do and nothing about how, with no OS
// header, so a file that parses a frame has none behind it.
//
// Loopback only: the inspector listens on 127.0.0.1 for a developer's own Chrome
// DevTools and nothing else, not on a network interface, not with TLS.
#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <string_view>

namespace bureau::net {

/** One accepted connection. */
class Connection {
 public:
  virtual ~Connection() = default;

  /**
   * Whatever has arrived, which is usually nothing.
   *
   * An empty string means the connection is open and quiet; `nullopt` means
   * the other end is gone. The two are different answers and a caller that
   * confused them would either spin or hang up on a live client.
   */
  virtual std::optional<std::string> read() = 0;

  /** Queues bytes in order and tries sending without waiting. False closes
   * the connection: it failed, stalled, or exceeded its output limit. */
  virtual bool write(std::string_view bytes) = 0;

  /** Advances queued output without waiting; call every host poll. True
   * means no output remains (sent or closed), so a finished HTTP response's
   * connection can be destroyed. `read` reports a closed connection. */
  virtual bool flush() = 0;

  virtual void close() = 0;
};

/** A socket listening for connections. */
class Listener {
 public:
  virtual ~Listener() = default;

  /** The port it is on, which is the one the system chose when 0 was asked. */
  virtual std::uint16_t port() const = 0;

  /** A connection that has arrived, or nothing when none has. */
  virtual std::unique_ptr<Connection> accept() = 0;
};

/**
 * Listens on loopback. Port 0 asks the system for a free one.
 *
 * Nothing when the port could not be listened on.
 */
std::unique_ptr<Listener> listenLoopback(std::uint16_t port);

/** Now, as ISO 8601 in UTC. */
std::string isoTimestampNow();

/** A monotonic clock in milliseconds, for the host to pace what it deferred
 * by; its zero means nothing. */
std::int64_t monotonicMilliseconds();

/** The same clock in microseconds, for timing what takes less than one: most
 * of a day's phases do. */
std::int64_t monotonicMicroseconds();

/** A clock that stops while the machine sleeps, in milliseconds. On macOS
 * and Windows the monotonic clock runs on through a sleep; on Linux the two
 * are one clock. Its zero means nothing. */
std::int64_t awakeMilliseconds();

/** The CPU time the calling thread has used, in milliseconds. */
std::int64_t threadCpuMilliseconds();

/** Now, as milliseconds since the epoch: `Date.now()`. The wall clock too,
 * for a stamp a save keeps. */
std::int64_t epochMilliseconds();

}  // namespace bureau::net
