#include "base64.h"

#include <string_view>

namespace bureau::net {
namespace {

constexpr std::string_view kAlphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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

}  // namespace bureau::net
