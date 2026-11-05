#include <doctest/doctest.h>

#include "bureau/backends/quads.h"

using bureau::Clip;
using bureau::DisplayList;
using bureau::Quad;
using bureau::backends::batchesOf;

namespace {

Quad fill(float x0, float y0, float x1, float y1, std::uint8_t page,
          std::uint16_t clip) {
  Quad quad{};
  quad.x0 = x0;
  quad.y0 = y0;
  quad.x1 = x1;
  quad.y1 = y1;
  quad.a = 255;
  quad.page = page;
  quad.clip = clip;
  return quad;
}

DisplayList listOf(std::vector<Quad> quads) {
  DisplayList list;
  list.width = 100;
  list.height = 50;
  list.clips = {Clip{0, 0, 100, 50}, Clip{10, 10, 20, 20}};
  list.quads = std::move(quads);
  return list;
}

}  // namespace

TEST_CASE("a quad is two triangles") {
  const auto batches = batchesOf(listOf({fill(1, 2, 3, 4, 0, 0)}), 100, 50);
  REQUIRE(batches.vertices.size() == 6);
  CHECK(batches.vertices[0].x == 1);
  CHECK(batches.vertices[0].y == 2);
  CHECK(batches.vertices[2].x == 3);
  CHECK(batches.vertices[2].y == 4);
  CHECK(batches.vertices[5].x == 1);
  CHECK(batches.vertices[5].y == 4);
}

TEST_CASE("quads on one page in one clip are one run") {
  const auto batches = batchesOf(
      listOf({fill(0, 0, 1, 1, 0, 0), fill(1, 1, 2, 2, 0, 0)}), 100, 50);
  REQUIRE(batches.runs.size() == 1);
  CHECK(batches.runs[0].firstVertex == 0);
  CHECK(batches.runs[0].vertexCount == 12);
}

TEST_CASE("a new page starts a run") {
  const auto batches = batchesOf(
      listOf({fill(0, 0, 1, 1, 0, 0), fill(1, 1, 2, 2, 1, 0)}), 100, 50);
  REQUIRE(batches.runs.size() == 2);
  CHECK(batches.runs[1].firstVertex == 6);
  CHECK(batches.runs[1].page == 1);
}

TEST_CASE("a new clip starts a run with its scissor") {
  const auto batches = batchesOf(
      listOf({fill(0, 0, 1, 1, 0, 0), fill(1, 1, 2, 2, 0, 1)}), 100, 50);
  REQUIRE(batches.runs.size() == 2);
  CHECK(batches.runs[1].scissor.x == 10);
  CHECK(batches.runs[1].scissor.y == 10);
  CHECK(batches.runs[1].scissor.width == 20);
  CHECK(batches.runs[1].scissor.height == 20);
}

TEST_CASE("a list drawn into a smaller target scales its scissors inside it") {
  const auto batches = batchesOf(listOf({fill(0, 0, 1, 1, 0, 1)}), 50, 25);
  REQUIRE(batches.runs.size() == 1);
  CHECK(batches.runs[0].scissor.x == 5);
  CHECK(batches.runs[0].scissor.y == 5);
  CHECK(batches.runs[0].scissor.width == 10);
  CHECK(batches.runs[0].scissor.height == 10);
}

TEST_CASE("a clip past the list stays inside the target") {
  auto list = listOf({fill(0, 0, 1, 1, 0, 1)});
  list.clips[1] = Clip{90, 40, 50, 50};
  const auto batches = batchesOf(list, 100, 50);
  CHECK(batches.runs[0].scissor.width == 10);
  CHECK(batches.runs[0].scissor.height == 10);
}

TEST_CASE("a quad turns about its origin") {
  Quad quad = fill(0, 0, 2, 0, 0, 0);
  quad.angle = 3.14159265f;
  const auto batches = batchesOf(listOf({quad}), 100, 50);
  CHECK(batches.vertices[1].x == doctest::Approx(-2.0f));
  CHECK(batches.vertices[1].y == doctest::Approx(0.0f).epsilon(0.001));
}

TEST_CASE("nothing to draw is no run") {
  const auto batches = batchesOf(listOf({}), 100, 50);
  CHECK(batches.vertices.empty());
  CHECK(batches.runs.empty());
}
