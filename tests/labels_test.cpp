#include <doctest/doctest.h>

#include "labels.h"

TEST_CASE("an anchored layer follows a camera change without a new marker") {
  const std::vector<bureau::labels::Anchor> markers = {
      {0, 0, 0.5, 20, 10, ""}};
  std::array<double, 16> camera = {1, 0, 0, 0, 0, 1, 0, 0,
                                   0, 0, 1, 0, 0, 0, 0, 1};
  const auto first = bureau::labels::place(markers, camera, 200, 100);
  camera[12] = 0.5;
  const auto second = bureau::labels::place(markers, camera, 200, 100);

  REQUIRE(first[0].visible);
  REQUIRE(second[0].visible);
  CHECK(first[0].left == doctest::Approx(90));
  CHECK(second[0].left == doctest::Approx(140));
  CHECK(second[0].top == first[0].top);
}

TEST_CASE("crowded markers thin within their own group") {
  const std::vector<bureau::labels::Anchor> markers = {
      {0, 0, 0.5, 20, 10, "badge"},
      {0, 0, 0.5, 20, 10, "badge"},
      {0, 0, 0.5, 20, 10, "warning"}};
  const std::array<double, 16> camera = {1, 0, 0, 0, 0, 1, 0, 0,
                                         0, 0, 1, 0, 0, 0, 0, 1};
  const auto placed = bureau::labels::place(markers, camera, 200, 100);
  CHECK(placed[0].visible);
  CHECK_FALSE(placed[1].visible);
  CHECK(placed[2].visible);
}
