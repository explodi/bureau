// What every backend draws: a display list as triangles, and the runs of them on
// one atlas page inside one clip. A game with a renderer of its own can draw these
// itself; see the backends for the one pipeline they need.
#pragma once

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

/** `list` for a target of `width` by `height` pixels, onto which it stretches
 * when it was laid out for another size: a window leaving fullscreen draws the
 * old list into its smaller frame until the UI lays out again. */
Batches batchesOf(const DisplayList& list, int width, int height);

}  // namespace bureau::backends
