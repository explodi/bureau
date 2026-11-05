#include <doctest/doctest.h>

#include <numbers>

#include "streets.h"

namespace {
const std::array<double, 16> identity{
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
}

TEST_CASE("a long street repeats at evenly spaced reading positions") {
  const std::vector<bureau::labels::StreetRun> runs{
      {{{-1, 0, 0.5}, {1, 0, 0.5}}, 100, 14, 75, 11}};
  const auto placed = bureau::labels::placeStreets(runs, identity, 1000, 600);
  REQUIRE(placed.size() == 2);
  CHECK(placed[0].x == doctest::Approx(250));
  CHECK(placed[1].x == doctest::Approx(750));
  CHECK(placed[0].y == doctest::Approx(300));
  CHECK(placed[0].angle == 0);
  CHECK_FALSE(placed[0].small);
}

TEST_CASE("a short street chooses its small measured type") {
  const std::vector<bureau::labels::StreetRun> runs{
      {{{-0.4, 0, 0.5}, {0.4, 0, 0.5}}, 100, 14, 40, 11}};
  const auto placed = bureau::labels::placeStreets(runs, identity, 200, 100);
  REQUIRE(placed.size() == 1);
  CHECK(placed[0].small);
  CHECK(placed[0].width == 40);
  CHECK(placed[0].height == 11);
}

TEST_CASE("a crossing side street yields to the longer avenue") {
  const std::vector<bureau::labels::StreetRun> runs{
      {{{-1, 0, 0.5}, {1, 0, 0.5}}, 60, 14, 40, 11},
      {{{0, -0.9, 0.5}, {0, 0.9, 0.5}}, 60, 14, 40, 11}};
  const auto placed = bureau::labels::placeStreets(runs, identity, 200, 200);
  REQUIRE(placed.size() == 1);
  CHECK(placed[0].run == 0);
}

TEST_CASE("vertical street names read from bottom to top") {
  const std::vector<bureau::labels::StreetRun> runs{
      {{{0, 1, 0.5}, {0, -1, 0.5}}, 60, 14, 40, 11}};
  const auto placed = bureau::labels::placeStreets(runs, identity, 200, 200);
  REQUIRE(placed.size() == 1);
  CHECK(placed[0].angle == doctest::Approx(-std::numbers::pi / 2));
}

TEST_CASE("near-plane clipping keeps only readable pavement") {
  const std::vector<bureau::labels::StreetRun> runs{
      {{{-1, 0, -0.5}, {1, 0, 0.5}}, 100, 14, 75, 11}};
  const auto placed = bureau::labels::placeStreets(runs, identity, 1000, 600);
  REQUIRE(placed.size() == 1);
  CHECK(placed[0].x == doctest::Approx(750));
}

TEST_CASE("camera motion relays out street names without changed content") {
  const std::vector<bureau::labels::StreetRun> runs{
      {{{-0.5, 0, 0.5}, {0.5, 0, 0.5}}, 20, 14, 15, 11}};
  const auto first = bureau::labels::placeStreets(runs, identity, 200, 100);
  auto shifted = identity;
  shifted[12] = 0.5;
  const auto second = bureau::labels::placeStreets(runs, shifted, 200, 100);
  REQUIRE(first.size() == 1);
  REQUIRE(second.size() == 1);
  CHECK(first[0].x == doctest::Approx(100));
  CHECK(second[0].x == doctest::Approx(150));
}
