// What every backend draws: a display list as triangles, and the runs of them on
// one atlas page inside one clip. A game with a renderer of its own can draw these
// itself; see the backends for the one pipeline they need.
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

#include "bureau/display.h"

namespace bureau::backends {

/** One vertex: where in device pixels, which texel, which colour, how to read
 * it. */
struct Vertex {
  float x;
  float y;
  float u;
  float v;
  /** sRGB-encoded, straight alpha; a backend reads them normalized. */
  std::uint8_t r, g, b, a;
  /** 0 fill, 1 mask, 2 picture (QuadMode). */
  float mode;
  /** A checkerboard's cell in device pixels; 0 for none. */
  float stipple;
  /** 1 to sample linearly. */
  float smooth;
  float unused;
};
static_assert(sizeof(Vertex) == 36);

/** A scissor rectangle in the target's pixels, from its top left. */
struct Scissor {
  std::uint32_t x, y, width, height;
};

/** Consecutive vertices drawn the same way. */
struct Run {
  std::uint32_t firstVertex;
  std::uint32_t vertexCount;
  int page;
  Scissor scissor;
};

struct Batches {
  std::vector<Vertex> vertices;
  std::vector<Run> runs;
};

/** The most vertices a frame draws: 128 MB, which every backend's device
 * takes in one buffer (Direct3D 11 guarantees no more). */
inline constexpr std::size_t kMaxVertices = (std::size_t{128} << 20) / sizeof(Vertex);

/** `list` for a target of `width` by `height` pixels, onto which it stretches
 * when it was laid out for another size: a window leaving fullscreen draws the
 * old list into its smaller frame until the UI lays out again. A quad wholly
 * outside its clip is left out, as the scissor would discard it, and past
 * kMaxVertices the rest are: the topmost content goes rather than the frame. */
Batches batchesOf(const DisplayList& list, int width, int height);

/** The bytes a vertex buffer holding `held` bytes is made again at for
 * `needed`: twice the larger, so a growing list reallocates rarely, and never
 * past what kMaxVertices fill, which batchesOf never needs more than. */
std::uint64_t vertexBufferBytes(std::uint64_t needed, std::uint64_t held);

}  // namespace bureau::backends
