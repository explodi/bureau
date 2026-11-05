#include "atlas.h"
#include "images.h"

#include <doctest/doctest.h>

#include <limits>

TEST_CASE("smooth minification preserves alpha and includes odd source edges") {
  const bureau::Bitmap even{2, 2, {
    255, 0, 0, 255, 0, 0, 255, 0,
    255, 0, 0, 255, 0, 0, 255, 0}};
  const auto averaged = bureau::imageMip(even, 1);
  CHECK(averaged.width == 1);
  CHECK(averaged.height == 1);
  CHECK(averaged.rgba == std::vector<uint8_t>{255, 0, 0, 127});
  const bureau::Bitmap odd{3, 1, {0, 0, 0, 255, 64, 64, 64, 255, 255, 255, 255, 255}};
  const auto weighted = bureau::imageMip(odd, 1);
  CHECK(weighted.width == 1);
  CHECK(weighted.height == 1);
  CHECK(weighted.rgba == std::vector<uint8_t>{95, 95, 95, 255});
}

TEST_CASE("atlas entries retain bearings, pixels and a transparent gutter") {
  bureau::Atlas atlas;
  atlas.takeUploads();
  const auto entry = atlas.add("glyph", 1, 1, {64, 64, 64, 64}, -2, 7);
  REQUIRE(entry.has_value());
  CHECK(entry->page == 0);
  CHECK(entry->x == 5);
  CHECK(entry->y == 0);
  CHECK(entry->width == 1);
  CHECK(entry->height == 1);
  CHECK(entry->left == -2);
  CHECK(entry->top == 7);

  const auto uploads = atlas.takeUploads();
  REQUIRE(uploads.size() == 1);
  CHECK(uploads[0].x == 5);
  CHECK(uploads[0].y == 0);
  CHECK(uploads[0].pixels == std::vector<uint8_t>{64, 64, 64, 64});
  CHECK(atlas.takeUploads().empty());

  const auto pages = atlas.everything();
  REQUIRE(pages.size() == 1);
  CHECK(pages[0].pixels[5 * 4] == 64);
  CHECK(pages[0].pixels[4 * 4 + 3] == 0);
  CHECK(pages[0].pixels[6 * 4 + 3] == 0);
  CHECK(pages[0].pixels[(bureau::kAtlasSize + 5) * 4 + 3] == 0);

  const auto reused = atlas.add("glyph", 1, 1, {255, 255, 255, 255});
  REQUIRE(reused.has_value());
  CHECK(reused->x == 5);
  CHECK(reused->left == -2);
  CHECK(atlas.takeUploads().empty());
  CHECK(atlas.find("glyph")->top == 7);
}

TEST_CASE("a glyph spilling to another atlas page preserves the old shelf") {
  bureau::Atlas atlas;
  const int size = bureau::kAtlasSize - 1;
  const auto large = atlas.add(
      "large", size, size, std::vector<uint8_t>(size * size * 4, 128));
  REQUIRE(large.has_value());
  CHECK(large->page == 1);
  CHECK(large->x == 0);
  CHECK(large->y == 0);
  CHECK(atlas.pages() == 2);

  const auto small = atlas.add("small", 1, 1, {1, 2, 3, 4});
  REQUIRE(small.has_value());
  CHECK(small->page == 0);
  CHECK(small->x == 5);
  CHECK(small->y == 0);
  const auto pages = atlas.everything();
  REQUIRE(pages.size() == 2);
  CHECK(pages[1].pixels[0] == 128);
  CHECK(pages[1].pixels[(bureau::kAtlasSize - 1) * 4] == 0);
}

TEST_CASE("invalid atlas input leaves packing and uploads untouched") {
  bureau::Atlas atlas;
  atlas.takeUploads();
  CHECK_FALSE(atlas.add("negative", -1, 1, {}).has_value());
  CHECK_FALSE(atlas.add("negative-height", 1, -1, {}).has_value());
  CHECK_FALSE(atlas.add("overflow", std::numeric_limits<int>::max(), 1, {}).has_value());
  CHECK_FALSE(atlas.add("too-wide", bureau::kAtlasSize, 1, {}).has_value());
  CHECK_FALSE(atlas.add("too-tall", 1, bureau::kAtlasSize, {}).has_value());
  CHECK_FALSE(atlas.add("short", 1, 1, {1, 2, 3}).has_value());
  CHECK_FALSE(atlas.add("long", 1, 1, {1, 2, 3, 4, 5}).has_value());
  CHECK(atlas.find("short") == nullptr);
  CHECK(atlas.pages() == 1);
  CHECK(atlas.takeUploads().empty());
  const auto valid = atlas.add("short", 1, 1, {1, 2, 3, 4});
  REQUIRE(valid.has_value());
  CHECK(valid->x == 5);
  CHECK(valid->y == 0);
}

TEST_CASE("clearing the atlas rebuilds the white texel and drops stale entries") {
  bureau::Atlas atlas;
  REQUIRE(atlas.add("glyph", 1, 1, {1, 2, 3, 4}).has_value());
  atlas.clear();
  CHECK(atlas.find("glyph") == nullptr);
  CHECK(atlas.pages() == 1);
  CHECK(atlas.whiteU() == doctest::Approx(2.0 / bureau::kAtlasSize));
  CHECK(atlas.whiteV() == doctest::Approx(2.0 / bureau::kAtlasSize));
  const auto uploads = atlas.takeUploads();
  REQUIRE(uploads.size() == 1);
  CHECK(uploads[0].width == 4);
  CHECK(uploads[0].height == 4);
  CHECK(uploads[0].pixels == std::vector<uint8_t>(4 * 4 * 4, 255));
  const auto pages = atlas.everything();
  REQUIRE(pages.size() == 1);
  CHECK(pages[0].pixels[5 * 4] == 0);
}
