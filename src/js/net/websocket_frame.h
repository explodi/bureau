// WebSocket frames, as bytes and back.
//
// Pure: no socket, no OS header, nothing but a buffer in and a buffer out, as
// the awkward parts of RFC 6455 are the three length forms and the masking, and
// both are arithmetic.
//
// Only what a loopback connection to our own client needs: text frames, close,
// ping and pong, no extensions, no compression, no TLS. A client sends masked
// frames and a server sends unmasked ones, which the RFC requires and this
// enforces rather than tolerates.
#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace bureau::net {

/** What a frame is for. The ones a loopback connection uses. */
enum class Opcode : std::uint8_t {
  Continuation = 0x0,
  Text = 0x1,
  Binary = 0x2,
  Close = 0x8,
  Ping = 0x9,
  Pong = 0xA,
};

struct Frame {
  Opcode opcode = Opcode::Text;
  /** False on a frame the next one continues. */
  bool fin = true;
  std::string payload;

  bool operator==(const Frame&) const = default;
};

/** A frame, and how many bytes of the buffer it took. */
struct DecodedFrame {
  Frame frame;
  std::size_t bytesConsumed = 0;
};

/**
 * The first frame in a buffer, or nothing when the buffer does not hold a
 * whole one yet.
 *
 * Nothing is the ordinary answer, not an error: bytes arrive from a socket in
 * whatever sizes the network felt like, and a caller reads more and asks
 * again. A frame that is malformed rather than incomplete is also nothing —
 * this decides what the inspector will act on, and a caller that cannot tell the two
 * apart can only do one thing about either.
 */
std::optional<DecodedFrame> decodeFrame(std::string_view bytes);

/**
 * A frame as a server sends it, which is never masked. The length takes the
 * shortest of the three forms the frame header allows.
 */
std::string encodeFrame(Opcode opcode, std::string_view payload);

/** A text frame, which is what every message the inspector sends is. */
inline std::string encodeText(std::string_view payload) {
  return encodeFrame(Opcode::Text, payload);
}

}  // namespace bureau::net
