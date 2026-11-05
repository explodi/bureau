#include "websocket_frame.h"

#include <cstring>

namespace bureau::net {

namespace {

constexpr std::uint8_t kFinBit = 0x80;
constexpr std::uint8_t kOpcodeMask = 0x0F;
constexpr std::uint8_t kMaskBit = 0x80;
constexpr std::uint8_t kLengthMask = 0x7F;
/** A length of 126 means the next two bytes are the length; 127, the next 8. */
constexpr std::uint8_t kTwoByteLength = 126;
constexpr std::uint8_t kEightByteLength = 127;
constexpr std::size_t kMaskingKeyBytes = 4;

bool isKnownOpcode(std::uint8_t opcode) {
  switch (opcode) {
    case 0x0:
    case 0x1:
    case 0x2:
    case 0x8:
    case 0x9:
    case 0xA:
      return true;
    default:
      return false;
  }
}

std::uint8_t byteAt(std::string_view bytes, std::size_t index) {
  return static_cast<std::uint8_t>(bytes[index]);
}

}  // namespace

std::optional<DecodedFrame> decodeFrame(std::string_view bytes) {
  if (bytes.size() < 2) return std::nullopt;

  const std::uint8_t first = byteAt(bytes, 0);
  const std::uint8_t second = byteAt(bytes, 1);
  const auto opcode = static_cast<std::uint8_t>(first & kOpcodeMask);
  if (!isKnownOpcode(opcode)) return std::nullopt;

  const bool masked = (second & kMaskBit) != 0;
  std::uint64_t length = second & kLengthMask;
  std::size_t cursor = 2;

  if (length == kTwoByteLength) {
    if (bytes.size() < cursor + 2) return std::nullopt;
    length = (static_cast<std::uint64_t>(byteAt(bytes, cursor)) << 8) |
             byteAt(bytes, cursor + 1);
    cursor += 2;
  } else if (length == kEightByteLength) {
    if (bytes.size() < cursor + 8) return std::nullopt;
    length = 0;
    for (std::size_t i = 0; i < 8; ++i) {
      length = (length << 8) | byteAt(bytes, cursor + i);
    }
    cursor += 8;
  }

  std::uint8_t key[kMaskingKeyBytes] = {0, 0, 0, 0};
  if (masked) {
    if (bytes.size() < cursor + kMaskingKeyBytes) return std::nullopt;
    for (std::size_t i = 0; i < kMaskingKeyBytes; ++i) {
      key[i] = byteAt(bytes, cursor + i);
    }
    cursor += kMaskingKeyBytes;
  }

  if (bytes.size() < cursor + length) return std::nullopt;

  Frame frame;
  frame.fin = (first & kFinBit) != 0;
  frame.opcode = static_cast<Opcode>(opcode);
  frame.payload.resize(static_cast<std::size_t>(length));
  for (std::uint64_t i = 0; i < length; ++i) {
    const std::uint8_t byte =
        byteAt(bytes, cursor + static_cast<std::size_t>(i));
    // Unmasking is the same exclusive-or that masked it, keyed by the byte's
    // position in the payload.
    frame.payload[static_cast<std::size_t>(i)] =
        static_cast<char>(masked ? (byte ^ key[i % kMaskingKeyBytes]) : byte);
  }

  return DecodedFrame{std::move(frame),
                      cursor + static_cast<std::size_t>(length)};
}

std::string encodeFrame(Opcode opcode, std::string_view payload) {
  std::string bytes;
  bytes.push_back(
      static_cast<char>(kFinBit | static_cast<std::uint8_t>(opcode)));

  const std::size_t length = payload.size();
  if (length < kTwoByteLength) {
    bytes.push_back(static_cast<char>(length));
  } else if (length <= 0xFFFF) {
    bytes.push_back(static_cast<char>(kTwoByteLength));
    bytes.push_back(static_cast<char>((length >> 8) & 0xFF));
    bytes.push_back(static_cast<char>(length & 0xFF));
  } else {
    bytes.push_back(static_cast<char>(kEightByteLength));
    for (int shift = 56; shift >= 0; shift -= 8) {
      bytes.push_back(static_cast<char>((length >> shift) & 0xFF));
    }
  }

  // No mask bit: a server's frames are never masked, which the RFC requires.
  bytes.append(payload);
  return bytes;
}

}  // namespace bureau::net
