// The HTTP a loopback connection speaks, which is very little of it.
//
// A client makes a few kinds of request: a GET for `/health` while it
// waits for the simulation to come up, the GET that upgrades to a
// WebSocket, and the routes beside the socket — a GET for what a window
// shows, a POST with a small JSON body for what it asks. So this parses a
// request line, its headers and a body of the length the headers declare,
// and stops — no chunking, no keep-alive bookkeeping, because nothing asks
// for any of it.
//
// Pure, like the framing beside it: bytes in, a request out, no socket.
#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace bureau::net {

/** One request, as far as the inspector reads it. */
struct HttpRequest {
  std::string method;
  /** The path with its query, exactly as sent. */
  std::string target;
  std::vector<std::pair<std::string, std::string>> headers;
  /** What followed the headers, `Content-Length` bytes of it; empty when
   * none was declared. */
  std::string body;

  /**
   * A header's value, matched without regard to case as HTTP requires, or
   * nothing when it was not sent.
   */
  std::optional<std::string> header(std::string_view name) const;

  /** Whether a header was sent with this value, ignoring case on both. */
  bool headerIs(std::string_view name, std::string_view value) const;
};

/**
 * The request in a buffer, or nothing when the buffer does not hold a whole
 * one yet — the headers end at a blank line, and a body of the declared
 * length follows them; until both have arrived there is nothing to answer.
 */
std::optional<HttpRequest> parseRequest(std::string_view bytes);

/** How many bytes the request took, headers and declared body, so a caller
 * can find what follows; nothing until the whole of it is there. */
std::optional<std::size_t> requestLength(std::string_view bytes);

}  // namespace bureau::net
