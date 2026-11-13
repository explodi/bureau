#include <doctest/doctest.h>

#include "bureau/backends/quads.h"

using bureau::Clip;
using bureau::DisplayList;
using bureau::Quad;
using bureau::backends::batchesOf;
using bureau::backends::vertexBufferBytes;

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
      listOf({fill(0, 0, 1, 1, 0, 0), fill(11, 11, 12, 12, 0, 1)}), 100, 50);
  REQUIRE(batches.runs.size() == 2);
  CHECK(batches.runs[1].scissor.x == 10);
  CHECK(batches.runs[1].scissor.y == 10);
  CHECK(batches.runs[1].scissor.width == 20);
  CHECK(batches.runs[1].scissor.height == 20);
}

TEST_CASE("a list drawn into a smaller target scales its scissors inside it") {
  const auto batches = batchesOf(listOf({fill(11, 11, 12, 12, 0, 1)}), 50, 25);
  REQUIRE(batches.runs.size() == 1);
  CHECK(batches.runs[0].scissor.x == 5);
  CHECK(batches.runs[0].scissor.y == 5);
  CHECK(batches.runs[0].scissor.width == 10);
  CHECK(batches.runs[0].scissor.height == 10);
}

TEST_CASE("a clip past the list stays inside the target") {
  auto list = listOf({fill(95, 45, 96, 46, 0, 1)});
  list.clips[1] = Clip{90, 40, 50, 50};
  const auto batches = batchesOf(list, 100, 50);
  CHECK(batches.runs[0].scissor.width == 10);
  CHECK(batches.runs[0].scissor.height == 10);
}

TEST_CASE("a quad turns about its origin") {
  Quad quad = fill(10, 10, 12, 11, 0, 0);
  quad.angle = 3.14159265f;
  quad.originX = 10;
  quad.originY = 10;
  const auto batches = batchesOf(listOf({quad}), 100, 50);
  CHECK(batches.vertices[1].x == doctest::Approx(8.0f));
  CHECK(batches.vertices[1].y == doctest::Approx(10.0f));
}

TEST_CASE("nothing to draw is no run") {
  const auto batches = batchesOf(listOf({}), 100, 50);
  CHECK(batches.vertices.empty());
  CHECK(batches.runs.empty());
}

TEST_CASE("a quad outside its clip is not drawn") {
  const auto batches = batchesOf(listOf({fill(40, 40, 45, 45, 0, 1)}), 100, 50);
  CHECK(batches.vertices.empty());
  CHECK(batches.runs.empty());
}

TEST_CASE("a quad below the window is not drawn") {
  const auto batches = batchesOf(listOf({fill(0, 60, 10, 70, 0, 0)}), 100, 50);
  CHECK(batches.vertices.empty());
}

TEST_CASE("a quad reaching into its clip is drawn whole") {
  const auto batches = batchesOf(listOf({fill(5, 5, 11, 11, 0, 1)}), 100, 50);
  REQUIRE(batches.vertices.size() == 6);
  CHECK(batches.vertices[0].x == 5);
}

TEST_CASE("a quad turned into its clip is drawn") {
  Quad quad = fill(0, 0, 4, 4, 0, 1);
  quad.angle = 3.14159265f;
  quad.originX = 14;
  quad.originY = 14;
  const auto batches = batchesOf(listOf({quad}), 100, 50);
  CHECK(batches.vertices.size() == 6);
}

TEST_CASE("an empty clip draws nothing") {
  auto list = listOf({fill(10, 10, 20, 20, 0, 1)});
  list.clips[1] = Clip{10, 10, 0, 20};
  const auto batches = batchesOf(list, 100, 50);
  CHECK(batches.vertices.empty());
}

TEST_CASE("a list with a run culled away starts the next run afresh") {
  const auto batches = batchesOf(listOf({fill(0, 0, 1, 1, 0, 0),
                                         fill(40, 40, 45, 45, 0, 1),
                                         fill(2, 2, 3, 3, 0, 0)}),
                                 100, 50);
  REQUIRE(batches.runs.size() == 1);
  CHECK(batches.runs[0].vertexCount == 12);
}

TEST_CASE("a frame draws no more than the most vertices a buffer holds") {
  const auto quads = std::vector<Quad>(bureau::backends::kMaxVertices / 6 + 10,
                                       fill(0, 0, 1, 1, 0, 0));
  const auto batches = batchesOf(listOf(quads), 100, 50);
  CHECK(batches.vertices.size() == bureau::backends::kMaxVertices / 6 * 6);
  CHECK(batches.runs[0].vertexCount == batches.vertices.size());
}

TEST_CASE("a vertex buffer grows to twice what a frame needs") {
  CHECK(vertexBufferBytes(1000, 800) == 2000);
}

TEST_CASE("a vertex buffer never grows past the most a frame draws") {
  const std::uint64_t most =
      bureau::backends::kMaxVertices * sizeof(bureau::backends::Vertex);
  CHECK(vertexBufferBytes(most, most - 1) == most);
}
