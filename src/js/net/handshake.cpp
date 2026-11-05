#include "handshake.h"

#include <array>
#include <cstdint>
#include <cstring>

#include "base64.h"

namespace bureau::net {

namespace {

/**
 * The string RFC 6455 appends to the client's key before hashing. It is in the
 * RFC as a literal; it is not a secret and not a salt.
 */
constexpr std::string_view kMagic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

constexpr std::uint32_t rotateLeft(std::uint32_t value, int by) {
  return (value << by) | (value >> (32 - by));
}

/**
 * SHA-1, for the handshake and nothing else. It is broken as a security hash
 * and the RFC uses it anyway, because what it does here is prove a server
 * read the request rather than protect anything.
 */
std::array<std::uint8_t, 20> sha1(std::string_view message) {
  std::uint32_t state[5] = {0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476,
                            0xC3D2E1F0};

  // The message, a 0x80 byte, zeroes, then its length in bits as 64 big-endian
  // bits — padded to a multiple of 64 bytes.
  std::string padded(message);
  const std::uint64_t bits = static_cast<std::uint64_t>(message.size()) * 8;
  padded.push_back(static_cast<char>(0x80));
  while (padded.size() % 64 != 56) padded.push_back('\0');
  for (int shift = 56; shift >= 0; shift -= 8) {
    padded.push_back(static_cast<char>((bits >> shift) & 0xFF));
  }

  for (std::size_t chunk = 0; chunk < padded.size(); chunk += 64) {
    std::uint32_t words[80];
    for (int i = 0; i < 16; ++i) {
      words[i] = 0;
      for (int byte = 0; byte < 4; ++byte) {
        words[i] = (words[i] << 8) |
                   static_cast<std::uint8_t>(padded[chunk + i * 4 + byte]);
      }
    }
    for (int i = 16; i < 80; ++i) {
      words[i] = rotateLeft(
          words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
    }

    std::uint32_t a = state[0], b = state[1], c = state[2], d = state[3],
                  e = state[4];
    for (int i = 0; i < 80; ++i) {
      std::uint32_t mixed = 0;
      std::uint32_t constant = 0;
      if (i < 20) {
        mixed = (b & c) | (~b & d);
        constant = 0x5A827999;
      } else if (i < 40) {
        mixed = b ^ c ^ d;
        constant = 0x6ED9EBA1;
      } else if (i < 60) {
        mixed = (b & c) | (b & d) | (c & d);
        constant = 0x8F1BBCDC;
      } else {
        mixed = b ^ c ^ d;
        constant = 0xCA62C1D6;
      }
      const std::uint32_t next =
          rotateLeft(a, 5) + mixed + e + constant + words[i];
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = next;
    }
    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
    state[4] += e;
  }

  std::array<std::uint8_t, 20> digest{};
  for (int i = 0; i < 5; ++i) {
    for (int byte = 0; byte < 4; ++byte) {
      digest[static_cast<std::size_t>(i * 4 + byte)] =
          static_cast<std::uint8_t>((state[i] >> (24 - byte * 8)) & 0xFF);
    }
  }
  return digest;
}

}  // namespace

std::string acceptKeyFor(std::string_view clientKey) {
  const std::string combined = std::string(clientKey) + std::string(kMagic);
  const auto digest = sha1(combined);
  return base64(digest.data(), digest.size());
}

bool isUpgradeRequest(const HttpRequest& request) {
  if (request.method != "GET") return false;
  if (!request.headerIs("Upgrade", "websocket")) return false;
  // `Connection` may list more than upgrade, so this is a search and not a
  // comparison — a browser sends "keep-alive, Upgrade".
  const auto connection = request.header("Connection");
  if (!connection) return false;
  const bool upgrades = connection->find("pgrade") != std::string::npos;
  return upgrades && request.header("Sec-WebSocket-Key").has_value();
}

std::optional<std::string> upgradeResponse(const HttpRequest& request) {
  if (!isUpgradeRequest(request)) return std::nullopt;
  const auto key = request.header("Sec-WebSocket-Key");
  if (!key) return std::nullopt;

  return "HTTP/1.1 101 Switching Protocols\r\n"
         "Upgrade: websocket\r\n"
         "Connection: Upgrade\r\n"
         "Sec-WebSocket-Accept: " +
         acceptKeyFor(*key) + "\r\n\r\n";
}

}  // namespace bureau::net
