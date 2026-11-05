// What a frame of Bureau draws, in device pixels: textured quads in
// paint order, each with its clip, over atlas pages the GPU mirrors.
// Built on the JavaScript thread, drawn on the main thread.
#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace bureau {

/** How a quad reads its texel. */
enum class QuadMode : std::uint8_t {
  /** The colour alone (the atlas's white texel). */
  Fill = 0,
  /** The colour through the texel's alpha: a glyph, or a tinted picture. */
  Mask = 1,
  /** The texel, premultiplied, at the colour's alpha: a picture. */
  Picture = 2,
};

struct Quad {
  float x0, y0, x1, y1;
  float u0, v0, u1, v1;
  /** sRGB-encoded, straight alpha. */
  std::uint8_t r, g, b, a;
  QuadMode mode;
  std::uint8_t page;
  /** A checkerboard knocks out every other cell this many device pixels a
   * side (the register's stipple); 0 for none. */
  std::uint8_t stipple;
  /** Linear sampling: a picture drawn at another size than its pixels. */
  bool smooth;
  std::uint16_t clip;
  /** Radians about a point in device pixels; texture coordinates stay local. */
  float angle = 0;
  float originX = 0;
  float originY = 0;
};

/** A scissor rectangle, in whole device pixels. */
struct Clip {
  int x, y, width, height;
};

/** Pixels written into a page since the last frame, premultiplied RGBA. */
struct AtlasUpload {
  int page;
  int x, y, width, height;
  std::vector<std::uint8_t> pixels;
};

struct DisplayList {
  int width = 0;
  int height = 0;
  std::vector<Quad> quads;
  /** clips[0] is the whole target. */
  std::vector<Clip> clips;
  /** Images this frame requested that could not be read or decoded. */
  std::vector<std::string> missingImages;
  std::uint64_t version = 0;
};

inline constexpr int kAtlasSize = 2048;
/** The pages a view's atlas holds before a frame bakes afresh: 128 MB of
 * pixels, kept once in the view and once on the GPU. */
inline constexpr int kAtlasPageBudget = 8;

}  // namespace bureau
