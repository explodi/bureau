// Base64, for the two places bytes have to travel inside text.
//
// The handshake's accept key is one; the terrain field is the other, and it is
// the reason this is not a detail of the handshake any more — 296 KB of
// lattice inside the JSON the terrain route answers with is not something to
// spell out as an array of numbers (`bytesToBase64` in `terrain_field.ts`
// says the same on the other side).
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

namespace bureau::net {

/** Standard base64 with padding: the alphabet `atob` reads. */
std::string base64(const std::uint8_t* bytes, std::size_t length);

}  // namespace bureau::net
