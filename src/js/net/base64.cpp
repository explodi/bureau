#include "base64.h"

#include <utility>

namespace bureau::net {
namespace {

constexpr std::string_view kAlphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** A letter's six bits, or -1 for a character outside the alphabet. */
int sextet(char letter, bool url) {
  if (letter >= 'A' && letter <= 'Z') return letter - 'A';
  if (letter >= 'a' && letter <= 'z') return letter - 'a' + 26;
  if (letter >= '0' && letter <= '9') return letter - '0' + 52;
  if (letter == (url ? '-' : '+')) return 62;
  if (letter == (url ? '_' : '/')) return 63;
  return -1;
}

bool isAsciiWhitespace(char letter) {
  return letter == ' ' || letter == '\t' || letter == '\n' || letter == '\f' ||
         letter == '\r';
}

}  // namespace

std::string base64(const std::uint8_t* bytes, std::size_t length) {
  std::string encoded;
  encoded.reserve((length + 2) / 3 * 4);
  for (std::size_t i = 0; i < length; i += 3) {
    const std::uint32_t one = bytes[i];
    const std::uint32_t two = i + 1 < length ? bytes[i + 1] : 0;
    const std::uint32_t three = i + 2 < length ? bytes[i + 2] : 0;
    const std::uint32_t triple = (one << 16) | (two << 8) | three;

    encoded.push_back(kAlphabet[(triple >> 18) & 0x3F]);
    encoded.push_back(kAlphabet[(triple >> 12) & 0x3F]);
    encoded.push_back(i + 1 < length ? kAlphabet[(triple >> 6) & 0x3F] : '=');
    encoded.push_back(i + 2 < length ? kAlphabet[triple & 0x3F] : '=');
  }
  return encoded;
}

Decoded fromBase64(std::string_view text, bool url, LastChunk last) {
  Decoded decoded;
  decoded.bytes.reserve(text.size() / 4 * 3 + 2);
  std::uint32_t chunk = 0;
  int letters = 0;
  std::size_t index = 0;
  const auto skipWhitespace = [&] {
    while (index < text.size() && isAsciiWhitespace(text[index])) ++index;
  };
  const auto failed = [&](const char* why) {
    decoded.bytes.clear();
    decoded.error = why;
    return std::move(decoded);
  };
  // A chunk of two or three letters: one or two bytes, and the bits left
  // over, which only a strict reading refuses.
  const auto shortChunk = [&] {
    const int bytes = letters - 1;
    const std::uint32_t whole = chunk << (6 * (4 - letters));
    const std::uint32_t spare = bytes == 1 ? whole & 0xFFFF : whole & 0xFF;
    if (last == LastChunk::Strict && spare != 0)
      return failed("base64 with bits after its last byte");
    decoded.bytes.push_back(static_cast<std::uint8_t>(whole >> 16));
    if (bytes == 2)
      decoded.bytes.push_back(static_cast<std::uint8_t>(whole >> 8));
    return std::move(decoded);
  };
  for (;;) {
    skipWhitespace();
    if (index == text.size()) {
      if (letters == 0 || last == LastChunk::StopBeforePartial)
        return decoded;
      if (last == LastChunk::Strict)
        return failed("base64 without its padding");
      if (letters == 1) return failed("base64 ending in a lone letter");
      return shortChunk();
    }
    const char letter = text[index++];
    if (letter == '=') {
      if (letters < 2) return failed("base64 padding too early");
      skipWhitespace();
      if (letters == 2) {
        if (index == text.size()) {
          if (last == LastChunk::StopBeforePartial) return decoded;
          return failed("base64 with half its padding");
        }
        if (text[index] == '=') {
          ++index;
          skipWhitespace();
        }
      }
      if (index < text.size()) return failed("base64 with text after padding");
      return shortChunk();
    }
    const int value = sextet(letter, url);
    if (value < 0) return failed("a character outside base64");
    chunk = (chunk << 6) | static_cast<std::uint32_t>(value);
    if (++letters < 4) continue;
    decoded.bytes.push_back(static_cast<std::uint8_t>(chunk >> 16));
    decoded.bytes.push_back(static_cast<std::uint8_t>(chunk >> 8));
    decoded.bytes.push_back(static_cast<std::uint8_t>(chunk));
    chunk = 0;
    letters = 0;
  }
}

}  // namespace bureau::net
