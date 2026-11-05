// The handshake that turns an HTTP request into a WebSocket.
//
// RFC 6455 asks the server to prove it understood the request: take the
// client's `Sec-WebSocket-Key`, append one fixed string, SHA-1 it, and send
// back the base64 of that. Nothing about it is secret or secure — it exists so
// a cache or a proxy that echoes the request cannot be mistaken for a server.
//
// Pure, like everything else in `host/`.
#pragma once

#include <optional>
#include <string>
#include <string_view>

#include "http_request.h"

namespace bureau::net {

/**
 * The `Sec-WebSocket-Accept` for a client's key: base64(SHA-1(key + magic)).
 * The RFC's own example is the test.
 */
std::string acceptKeyFor(std::string_view clientKey);

/**
 * The response that completes the upgrade, or nothing when the request was
 * not one: a request the inspector cannot upgrade is answered as HTTP, not upgraded
 * badly.
 */
std::optional<std::string> upgradeResponse(const HttpRequest& request);

/** Whether a request is asking to become a WebSocket at all. */
bool isUpgradeRequest(const HttpRequest& request);

}  // namespace bureau::net
