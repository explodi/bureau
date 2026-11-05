#include "font.h"

#include <doctest/doctest.h>
#include <nlohmann/json.hpp>

#include <cmath>
#include <numeric>

#include "goldens.h"

TEST_CASE("Jersey 25 loads, shapes and rasterizes unhinted at UI size") {
  bureau::Font font(std::string(BUREAU_FONT_DIR) + "/Jersey25-Regular.ttf", 18);
  REQUIRE(font.valid());
  const auto glyphs = font.shape("A");
  REQUIRE(glyphs.size() == 1);
  REQUIRE(glyphs[0].index != 0);
  CHECK(glyphs[0].xAdvance == doctest::Approx(8.780487).epsilon(0.001));
  const auto raster = font.raster(glyphs[0].index);
  CHECK(raster.width == 8);
  CHECK(raster.height == 11);
  CHECK(raster.coverage.size() ==
        static_cast<size_t>(raster.width * raster.height));
  CHECK(raster.coverage[2] == 8);
  CHECK(raster.coverage[3] == 181);
  CHECK(raster.coverage[4] == 248);
}

TEST_CASE("Japanese text shapes with a positive advance") {
  bureau::Font font(
      std::string(BUREAU_FONT_DIR) + "/WDXLLubrifontJPN-Regular.ttf", 18);
  REQUIRE(font.valid());
  const auto glyphs = font.shape("東京");
  REQUIRE(glyphs.size() == 2);
  CHECK(glyphs[0].index != 0);
  CHECK(glyphs[1].index != 0);
  CHECK(glyphs[0].xAdvance + glyphs[1].xAdvance ==
        doctest::Approx(27.539978).epsilon(0.001));
}

TEST_CASE("shaping keeps each family's golden advance" *
          doctest::test_suite("goldens")) {
  auto fixture = goldens::read("advances.json");
  for (auto& golden : fixture["cases"]) {
    INFO(golden["family"], ": ", golden["text"]);
    bureau::Font font(std::string(BUREAU_FONT_DIR) + "/" +
                      golden["file"].get<std::string>(), golden["size"].get<float>());
    REQUIRE(font.valid());
    const auto glyphs = font.shape(golden["text"].get<std::string>());
    const double advance = std::accumulate(glyphs.begin(), glyphs.end(), 0.0,
        [](double total, const bureau::ShapedGlyph& glyph) {
          return total + glyph.xAdvance;
        });
    CHECK(std::abs(advance - golden["advance"].get<double>()) < 0.0001);
    golden["advance"] = advance;
  }
  goldens::record("advances.json", [&](nlohmann::json& recorded) {
    for (size_t index = 0; index < fixture["cases"].size(); ++index) {
      recorded["cases"][index]["advance"] = fixture["cases"][index]["advance"];
    }
  });
}
