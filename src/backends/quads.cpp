#include "bureau/backends/quads.h"

#include <algorithm>
#include <cmath>

namespace bureau::backends {

namespace {

/** The scissor for `clip`, which is in the list's pixels. A scissor past the
 * target would fail the whole frame on some drivers, so it stays inside. */
Scissor scissorOf(const Clip& clip, const DisplayList& list, int width,
                  int height) {
  const int listWidth = std::max(list.width, 1);
  const int listHeight = std::max(list.height, 1);
  const auto across = [&](int x) {
    const std::int64_t inside = std::clamp(x, 0, listWidth);
    return static_cast<std::uint32_t>(inside * width / listWidth);
  };
  const auto down = [&](int y) {
    const std::int64_t inside = std::clamp(y, 0, listHeight);
    return static_cast<std::uint32_t>(inside * height / listHeight);
  };
  const std::uint32_t left = across(clip.x);
  const std::uint32_t top = down(clip.y);
  const std::uint32_t right = std::max(across(clip.x + clip.width), left);
  const std::uint32_t bottom = std::max(down(clip.y + clip.height), top);
  return {left, top, right - left, bottom - top};
}

/** Whether any of `corners` can reach a pixel of `clip`: a scissor keeps
 * nothing of a quad off it, so a long list's rows out of sight cost nothing. */
bool reaches(const Vertex (&corners)[4], const Clip& clip) {
  if (clip.width <= 0 || clip.height <= 0) return false;
  float left = corners[0].x, right = corners[0].x;
  float top = corners[0].y, bottom = corners[0].y;
  for (const Vertex& corner : corners) {
    left = std::min(left, corner.x);
    right = std::max(right, corner.x);
    top = std::min(top, corner.y);
    bottom = std::max(bottom, corner.y);
  }
  const bool across = right > clip.x && left < clip.x + clip.width;
  const bool down = bottom > clip.y && top < clip.y + clip.height;
  return across && down;
}

}  // namespace

std::uint64_t vertexBufferBytes(std::uint64_t needed, std::uint64_t held) {
  const std::uint64_t most = kMaxVertices * sizeof(Vertex);
  return std::min(std::max(needed, held) * 2, most);
}

Batches batchesOf(const DisplayList& list, int width, int height) {
  Batches batches;
  batches.vertices.reserve(std::min(list.quads.size() * 6, kMaxVertices));
  int page = -1;
  int clip = -1;
  for (const Quad& quad : list.quads) {
    if (batches.vertices.size() + 6 > kMaxVertices) break;
    const float mode = static_cast<float>(quad.mode);
    const float stipple = static_cast<float>(quad.stipple);
    const float smooth = quad.smooth ? 1.0f : 0.0f;
    Vertex corners[4] = {
        {quad.x0, quad.y0, quad.u0, quad.v0, quad.r, quad.g, quad.b, quad.a,
         mode, stipple, smooth, 0},
        {quad.x1, quad.y0, quad.u1, quad.v0, quad.r, quad.g, quad.b, quad.a,
         mode, stipple, smooth, 0},
        {quad.x1, quad.y1, quad.u1, quad.v1, quad.r, quad.g, quad.b, quad.a,
         mode, stipple, smooth, 0},
        {quad.x0, quad.y1, quad.u0, quad.v1, quad.r, quad.g, quad.b, quad.a,
         mode, stipple, smooth, 0}};
    if (quad.angle != 0) {
      const float cosine = std::cos(quad.angle);
      const float sine = std::sin(quad.angle);
      for (auto& corner : corners) {
        const float x = corner.x - quad.originX;
        const float y = corner.y - quad.originY;
        corner.x = quad.originX + x * cosine - y * sine;
        corner.y = quad.originY + x * sine + y * cosine;
      }
    }
    const Clip& rect =
        list.clips[std::min<size_t>(quad.clip, list.clips.size() - 1)];
    if (!reaches(corners, rect)) continue;
    const bool startsRun = quad.page != page || quad.clip != clip;
    if (startsRun) {
      batches.runs.push_back(
          {static_cast<std::uint32_t>(batches.vertices.size()), 0, quad.page,
           scissorOf(rect, list, width, height)});
      page = quad.page;
      clip = quad.clip;
    }
    for (const int corner : {0, 1, 2, 0, 2, 3}) {
      batches.vertices.push_back(corners[corner]);
    }
    batches.runs.back().vertexCount += 6;
  }
  return batches;
}

}  // namespace bureau::backends
