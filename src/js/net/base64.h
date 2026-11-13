// Base64, for the places bytes have to travel inside text.
//
// The handshake's accept key is one; the terrain field is another, and it is
// the reason this is not a detail of the handshake any more — 296 KB of
// lattice inside the JSON the terrain route answers with is not something to
// spell out as an array of numbers (`bytesToBase64` in `terrain_field.ts`
// says the same on the other side). The third is `Uint8Array.fromBase64`,
// which Hermes lacks and a loop in its interpreter runs fifty times slower.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace bureau::net {

/** Standard base64 with padding: the alphabet `atob` reads. */
std::string base64(const std::uint8_t* bytes, std::size_t length);

/** What `Uint8Array.fromBase64` does with a last chunk shorter than four
 * letters (its `lastChunkHandling` option). */
enum class LastChunk { Loose, Strict, StopBeforePartial };

struct Decoded {
  std::vector<std::uint8_t> bytes;
  /** Why the text is not base64; empty when it is. */
  std::string error;
};

/** ECMAScript's FromBase64: ASCII whitespace skipped anywhere, `url` for the
 * `-_` alphabet in place of `+/`. */
Decoded fromBase64(std::string_view text, bool url, LastChunk last);

}  // namespace bureau::net
