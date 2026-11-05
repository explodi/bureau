#include "plot.h"

#include <doctest/doctest.h>

namespace {

using Json = nlohmann::json;

std::optional<bureau::style::Color> black(const std::string&) {
  return bureau::style::Color{0, 0, 0, 255};
}

int alphaAt(const bureau::Bitmap& raster, int x, int y) {
  return raster.rgba[(static_cast<size_t>(y) * raster.width + x) * 4 + 3];
}

Json polygon(Json points, bool crisp) {
  Json command = {{"kind", "polygon"}, {"points", points}, {"ink", "ink"}};
  if (crisp) command["crisp"] = true;
  return Json::array({command});
}

const Json kDiamond = {{8, 0}, {16, 8}, {8, 16}, {0, 8}};

}  // namespace

TEST_CASE("a crisp diamond at 125% has a two-pixel apex and full width at its middle") {
  const auto raster = bureau::rasterizePlot(polygon(kDiamond, true), 16, 16, 1.25f, black);
  REQUIRE(raster.width == 20);
  CHECK(alphaAt(raster, 8, 0) == 0);
  CHECK(alphaAt(raster, 9, 0) == 255);
  CHECK(alphaAt(raster, 10, 0) == 255);
  CHECK(alphaAt(raster, 11, 0) == 0);
  CHECK(alphaAt(raster, 0, 9) == 255);
  CHECK(alphaAt(raster, 19, 9) == 255);
  CHECK(alphaAt(raster, 0, 10) == 255);
  CHECK(alphaAt(raster, 19, 10) == 255);
  CHECK(alphaAt(raster, 9, 19) == 255);
  CHECK(alphaAt(raster, 10, 19) == 255);
  CHECK(alphaAt(raster, 11, 19) == 0);
}

TEST_CASE("a crisp diamond's staircase steps one pixel a row, without partial pixels") {
  const auto raster = bureau::rasterizePlot(polygon(kDiamond, true), 16, 16, 1.25f, black);
  CHECK(alphaAt(raster, 4, 4) == 0);
  CHECK(alphaAt(raster, 5, 4) == 255);
  CHECK(alphaAt(raster, 14, 4) == 255);
  CHECK(alphaAt(raster, 15, 4) == 0);
  CHECK(alphaAt(raster, 3, 5) == 0);
  CHECK(alphaAt(raster, 4, 5) == 255);
  CHECK(alphaAt(raster, 15, 5) == 255);
  CHECK(alphaAt(raster, 16, 5) == 0);
}

TEST_CASE("a crisp inset diamond at 150% stays centred on the outer one") {
  const Json face = {{8, 3}, {13, 8}, {8, 13}, {3, 8}};
  const auto raster = bureau::rasterizePlot(polygon(face, true), 16, 16, 1.5f, black);
  REQUIRE(raster.width == 24);
  CHECK(alphaAt(raster, 11, 4) == 0);
  CHECK(alphaAt(raster, 12, 4) == 0);
  CHECK(alphaAt(raster, 10, 5) == 0);
  CHECK(alphaAt(raster, 11, 5) == 255);
  CHECK(alphaAt(raster, 12, 5) == 255);
  CHECK(alphaAt(raster, 13, 5) == 0);
  CHECK(alphaAt(raster, 4, 11) == 0);
  CHECK(alphaAt(raster, 5, 11) == 255);
  CHECK(alphaAt(raster, 18, 11) == 255);
  CHECK(alphaAt(raster, 19, 11) == 0);
}

TEST_CASE("a polygon without crisp covers a half-covered pixel by half") {
  const Json halfPixel = {{0, 0}, {1.5, 0}, {1.5, 1}, {0, 1}};
  const auto raster = bureau::rasterizePlot(polygon(halfPixel, false), 2, 1, 1, black);
  CHECK(alphaAt(raster, 0, 0) == 255);
  CHECK(alphaAt(raster, 1, 0) == 128);
}

namespace {

std::optional<bureau::style::Color> inkNamed(const std::string& name) {
  if (name == "shadow") return bureau::style::Color{0, 0, 0, 255};
  if (name == "floor") return bureau::style::Color{100, 100, 100, 255};
  return bureau::style::Color{255, 255, 255, 255};
}

int redAt(const bureau::Bitmap& raster, int x, int y) {
  return raster.rgba[(static_cast<size_t>(y) * raster.width + x) * 4];
}

Json engraving(Json path) {
  return Json::array({Json{{"kind", "engraving"},
                           {"paths", Json::array({path})},
                           {"shadow", "shadow"},
                           {"floor", "floor"},
                           {"lit", "lit"}}});
}

}  // namespace

TEST_CASE("an engraving's walls are two device pixels wide at 150%") {
  // The square spans device pixels 6..17.
  const Json square = Json{{4, 4}, {12, 4}, {12, 12}, {4, 12}};
  const auto raster = bureau::rasterizePlot(engraving(square), 16, 16, 1.5f, inkNamed);
  CHECK(redAt(raster, 10, 6) == 0);
  CHECK(redAt(raster, 10, 7) == 0);
  CHECK(redAt(raster, 6, 10) == 0);
  CHECK(redAt(raster, 7, 10) == 0);
  CHECK(redAt(raster, 8, 10) == 100);
  CHECK(redAt(raster, 17, 10) == 100);
  CHECK(redAt(raster, 18, 10) == 255);
  CHECK(redAt(raster, 19, 10) == 255);
  CHECK(alphaAt(raster, 20, 10) == 0);
  CHECK(redAt(raster, 10, 19) == 255);
  CHECK(redAt(raster, 19, 19) == 255);
}

TEST_CASE("an engraved edge falling at 45 degrees to the right takes the shadowed wall") {
  // The long edge runs along y = x, facing up and right; the art is below it.
  const Json triangle = Json{{2, 2}, {14, 14}, {2, 14}};
  const auto raster = bureau::rasterizePlot(engraving(triangle), 16, 16, 1, inkNamed);
  CHECK(alphaAt(raster, 8, 8) == 0);
  CHECK(redAt(raster, 8, 9) == 0);
  CHECK(redAt(raster, 8, 10) == 100);
}

TEST_CASE("an engraving's lit wall stops where its tip is thinner than a wall") {
  // A sliver pointing right, one pixel high at x = 13: no lit pixel past it.
  const Json sliver = Json{{1, 4}, {15, 7}, {1, 10}};
  const auto raster = bureau::rasterizePlot(engraving(sliver), 16, 16, 1, inkNamed);
  CHECK(redAt(raster, 4, 9) == 255);
  CHECK(alphaAt(raster, 14, 7) == 0);
}
