// One picture every backend must draw alike, its pixels worked out by hand. The
// target is 64 by 64, cleared to the opaque colour kClear.
#pragma once

#include <doctest/doctest.h>

#include <array>
#include <cstdlib>
#include <cstdint>
#include <functional>
#include <vector>

#include "bureau/display.h"

namespace scene {

using Pixel = std::array<int, 4>;
constexpr Pixel kClear = {40, 80, 120, 255};
constexpr int kSize = 64;

inline bureau::Quad quad(float x0, float y0, float x1, float y1,
                         std::array<std::uint8_t, 4> color,
                         bureau::QuadMode mode) {
  bureau::Quad made{};
  made.x0 = x0;
  made.y0 = y0;
  made.x1 = x1;
  made.y1 = y1;
  made.r = color[0];
  made.g = color[1];
  made.b = color[2];
  made.a = color[3];
  made.mode = mode;
  return made;
}

/** A texel's place in atlas coordinates, at a pixel's middle. */
constexpr float texel(int pixel, int pageSize) {
  return (static_cast<float>(pixel) + 0.5f) / pageSize;
}

/** Page 0: 2 by 1 at the corner, the left texel opaque yellow, the right clear.
 * Page 1: 1 by 1 at (4, 4), opaque teal. */
inline std::vector<bureau::AtlasUpload> uploads(int pageSize = bureau::kAtlasSize) {
  bureau::AtlasUpload first;
  first.page = 0;
  first.x = 0;
  first.y = 0;
  first.width = 2;
  first.height = 1;
  first.pixels = {255, 255, 0, 255, 0, 0, 0, 0};
  first.pageSize = pageSize;
  bureau::AtlasUpload second;
  second.page = 1;
  second.x = 4;
  second.y = 4;
  second.width = 1;
  second.height = 1;
  second.pixels = {0, 128, 128, 255};
  second.pageSize = pageSize;
  return {first, second};
}

inline bureau::DisplayList list(int pageSize = bureau::kAtlasSize) {
  using bureau::QuadMode;
  bureau::DisplayList made;
  made.width = kSize;
  made.height = kSize;
  made.clips = {bureau::Clip{0, 0, kSize, kSize}, bureau::Clip{16, 16, 8, 16}};

  // A fill, opaque red.
  made.quads.push_back(quad(0, 0, 16, 16, {255, 0, 0, 255}, QuadMode::Fill));

  // A fill, half white, premultiplied over the clear colour.
  made.quads.push_back(quad(16, 0, 32, 16, {255, 255, 255, 128}, QuadMode::Fill));

  // A mask: green through the yellow texel's alpha, nothing through the clear one.
  auto solid = quad(32, 0, 40, 16, {0, 255, 0, 255}, QuadMode::Mask);
  solid.u0 = solid.u1 = texel(0, pageSize);
  solid.v0 = solid.v1 = texel(0, pageSize);
  made.quads.push_back(solid);
  auto clear = quad(40, 0, 48, 16, {0, 255, 0, 255}, QuadMode::Mask);
  clear.u0 = clear.u1 = texel(1, pageSize);
  clear.v0 = clear.v1 = texel(0, pageSize);
  made.quads.push_back(clear);

  // A picture: the texel itself.
  auto picture = quad(48, 0, 64, 16, {255, 255, 255, 255}, QuadMode::Picture);
  picture.u0 = picture.u1 = texel(0, pageSize);
  picture.v0 = picture.v1 = texel(0, pageSize);
  made.quads.push_back(picture);

  // A stipple of one pixel, counted from the target's top left.
  auto stipple = quad(0, 16, 16, 32, {255, 255, 255, 255}, QuadMode::Fill);
  stipple.stipple = 1;
  made.quads.push_back(stipple);

  // A fill the second clip cuts in half.
  auto clipped = quad(16, 16, 32, 32, {0, 0, 255, 255}, QuadMode::Fill);
  clipped.clip = 1;
  made.quads.push_back(clipped);

  // A picture from the second page.
  auto second = quad(32, 16, 48, 32, {255, 255, 255, 255}, QuadMode::Picture);
  second.page = 1;
  second.u0 = second.u1 = texel(4, pageSize);
  second.v0 = second.v1 = texel(4, pageSize);
  made.quads.push_back(second);

  // Half a texel's worth of linear sampling across the yellow and clear texels.
  auto smooth = quad(48, 16, 64, 32, {255, 255, 255, 255}, QuadMode::Picture);
  smooth.smooth = true;
  smooth.u0 = smooth.u1 = 1.0f / pageSize;
  smooth.v0 = smooth.v1 = texel(0, pageSize);
  made.quads.push_back(smooth);

  return made;
}

/** `read` answers the pixel at x, y from the target's top left. */
inline void check(const std::function<Pixel(int x, int y)>& read) {
  const auto pixelIs = [&](int x, int y, Pixel expected) {
    const Pixel got = read(x, y);
    INFO("at ", x, ",", y, " got ", got[0], " ", got[1], " ", got[2], " ", got[3]);
    for (int channel = 0; channel < 4; ++channel) {
      CHECK(std::abs(got[channel] - expected[channel]) <= 2);
    }
  };
  // Nothing drew here.
  pixelIs(4, 60, kClear);
  // The fill.
  pixelIs(8, 8, {255, 0, 0, 255});
  // Half white over the clear colour: 128 + c * (1 - 128/255), a stays opaque.
  pixelIs(24, 8, {148, 168, 188, 255});
  // The mask.
  pixelIs(36, 8, {0, 255, 0, 255});
  pixelIs(44, 8, kClear);
  // The picture.
  pixelIs(56, 8, {255, 255, 0, 255});
  // The stipple: even cells knocked out, odd ones kept. Both orders of a row.
  pixelIs(0, 16, kClear);
  pixelIs(1, 16, {255, 255, 255, 255});
  pixelIs(0, 17, {255, 255, 255, 255});
  pixelIs(1, 17, kClear);
  // The clip.
  pixelIs(20, 24, {0, 0, 255, 255});
  pixelIs(28, 24, kClear);
  // The second page.
  pixelIs(40, 24, {0, 128, 128, 255});
  // Linear: half of opaque yellow and half of clear, premultiplied.
  pixelIs(56, 24, {148, 168, 60, 255});
}

}  // namespace scene
