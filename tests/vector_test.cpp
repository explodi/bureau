#include "vector.h"

#include <doctest/doctest.h>

#include <string>

namespace {

using bureau::style::Color;
using bureau::style::Dither;

constexpr Color kRed{0xac, 0x32, 0x32, 255};
constexpr Color kBlack{0, 0, 0, 255};
constexpr Color kWhite{255, 255, 255, 255};

Color pixelAt(const bureau::Bitmap& bitmap, int x, int y) {
  const auto* pixel = &bitmap.rgba[(static_cast<size_t>(y) * bitmap.width + x) * 4];
  return Color{pixel[0], pixel[1], pixel[2], pixel[3]};
}

/** Every colour drawn as itself. */
Dither solid(Color color) { return Dither{color, color, 0}; }

/** Every colour drawn as a checkerboard of black and white. */
Dither checkerboard(Color) { return Dither{kBlack, kWhite, 8}; }

bureau::Bitmap draw(const std::string& svg, int width, int height, int dot,
                    int screenX, Dither (*ink)(Color)) {
  const auto picture = bureau::parseVector(svg);
  REQUIRE(picture != nullptr);
  bureau::VectorRaster raster;
  raster.width = width;
  raster.height = height;
  raster.dot = dot;
  raster.screenX = screenX;
  raster.ink = ink;
  return bureau::rasterizeVector(*picture, raster);
}

const std::string kSquare =
    R"(<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">)"
    R"(<rect width="4" height="4" fill="#ac3232"/></svg>)";

}  // namespace

TEST_CASE("an SVG's size is its own width and height") {
  const auto picture = bureau::parseVector(
      R"(<svg xmlns="http://www.w3.org/2000/svg" width="171" height="169" viewBox="0 0 171 169"></svg>)");
  REQUIRE(picture != nullptr);
  CHECK(picture->width == 171);
  CHECK(picture->height == 169);
}

TEST_CASE("text that is no SVG parses to nothing") {
  CHECK(bureau::parseVector("not a picture") == nullptr);
}

TEST_CASE("a palette colour fills solid, at the size it is drawn") {
  const auto bitmap = draw(kSquare, 8, 8, 1, 0, solid);
  CHECK(pixelAt(bitmap, 0, 0) == kRed);
  CHECK(pixelAt(bitmap, 7, 7) == kRed);
}

TEST_CASE("a fill's edge is crisp: a pixel is wholly in or out, never blended") {
  const auto bitmap = draw(
      R"(<svg xmlns="http://www.w3.org/2000/svg" width="8" height="1">)"
      R"(<rect x="0.3" width="3.4" height="1" fill="#ac3232"/></svg>)",
      8, 1, 1, 0, solid);
  CHECK(pixelAt(bitmap, 0, 0) == kRed);
  CHECK(pixelAt(bitmap, 3, 0) == kRed);
  CHECK(pixelAt(bitmap, 4, 0).a == 0);
}

TEST_CASE("a dithered colour lays its second ink on the Bayer pattern") {
  const auto bitmap = draw(kSquare, 4, 4, 1, 0, checkerboard);
  CHECK(pixelAt(bitmap, 0, 0) == kWhite);
  CHECK(pixelAt(bitmap, 1, 0) == kBlack);
  CHECK(pixelAt(bitmap, 0, 1) == kBlack);
  CHECK(pixelAt(bitmap, 1, 1) == kWhite);
}

TEST_CASE("a HiDPI screen's dither dots are two device pixels a side") {
  const auto bitmap = draw(kSquare, 4, 4, 2, 0, checkerboard);
  CHECK(pixelAt(bitmap, 0, 0) == kWhite);
  CHECK(pixelAt(bitmap, 1, 1) == kWhite);
  CHECK(pixelAt(bitmap, 2, 0) == kBlack);
  CHECK(pixelAt(bitmap, 0, 2) == kBlack);
  CHECK(pixelAt(bitmap, 2, 2) == kWhite);
}

TEST_CASE("the dither pattern is laid from the screen's corner, not the picture's") {
  const auto bitmap = draw(kSquare, 4, 4, 1, 1, checkerboard);
  CHECK(pixelAt(bitmap, 0, 0) == kBlack);
  CHECK(pixelAt(bitmap, 1, 0) == kWhite);
}

TEST_CASE("an outline thinner than a dot draws one dot wide") {
  const auto bitmap = draw(
      R"(<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4">)"
      R"(<path d="M0 2.5H8" stroke="#ac3232" stroke-width="0.1"/></svg>)",
      8, 4, 1, 0, solid);
  CHECK(pixelAt(bitmap, 4, 2) == kRed);
  CHECK(pixelAt(bitmap, 4, 1).a == 0);
  CHECK(pixelAt(bitmap, 4, 3).a == 0);
}

TEST_CASE("a later shape paints over an earlier one") {
  const auto bitmap = draw(
      R"(<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">)"
      R"(<rect width="4" height="4" fill="#ac3232"/>)"
      R"(<rect width="2" height="4" fill="#000000"/></svg>)",
      4, 4, 1, 0, solid);
  CHECK(pixelAt(bitmap, 0, 0) == kBlack);
  CHECK(pixelAt(bitmap, 3, 0) == kRed);
}

TEST_CASE("a HiDPI screen dithers in two-pixel dots, any other in one") {
  CHECK(bureau::ditherDot(1) == 1);
  CHECK(bureau::ditherDot(1.5f) == 1);
  CHECK(bureau::ditherDot(2) == 2);
  CHECK(bureau::ditherDot(3) == 2);
}
