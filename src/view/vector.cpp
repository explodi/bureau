#include "vector.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#pragma GCC diagnostic ignored "-Wunused-parameter"
#pragma GCC diagnostic ignored "-Wsign-compare"
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#pragma GCC diagnostic ignored "-Wimplicit-fallthrough"
#define NANOSVG_IMPLEMENTATION
#include <nanosvg.h>
#pragma GCC diagnostic pop

namespace bureau {
namespace {

using Path = std::vector<PlotPoint>;

/** The order a 4x4 Bayer pattern lights its cells in: a level of k
 * sixteenths takes the second ink in the cells numbered below k, so 4 is a
 * dot every other pixel of every other row and 8 a checkerboard. */
constexpr int kBayer[4][4] = {
    {0, 8, 2, 10}, {12, 4, 14, 6}, {3, 11, 1, 9}, {15, 7, 13, 5}};

std::optional<std::uint32_t> paintOf(const NSVGpaint& paint) {
  // nanosvg packs a colour as 0xAABBGGRR.
  std::uint32_t abgr = 0;
  if (paint.type == NSVG_PAINT_COLOR) {
    abgr = paint.color;
  } else if ((paint.type == NSVG_PAINT_LINEAR_GRADIENT ||
              paint.type == NSVG_PAINT_RADIAL_GRADIENT) &&
             paint.gradient != nullptr && paint.gradient->nstops > 0) {
    abgr = paint.gradient->stops[0].color;
  } else {
    return std::nullopt;
  }
  return (abgr & 0xff) << 16 | (abgr & 0xff00) | (abgr >> 16 & 0xff);
}

/** A path's curves as straight runs in device pixels, about two pixels a
 * run, so a curve stays round at any size. */
Path flatten(const VectorPath& path, float sx, float sy) {
  const auto place = [&](PlotPoint point) {
    return PlotPoint{point.x * sx, point.y * sy};
  };
  Path line;
  if (path.points.empty()) return line;
  line.push_back(place(path.points[0]));
  for (size_t index = 1; index + 2 < path.points.size(); index += 3) {
    const PlotPoint p0 = line.back();
    const PlotPoint p1 = place(path.points[index]);
    const PlotPoint p2 = place(path.points[index + 1]);
    const PlotPoint p3 = place(path.points[index + 2]);
    const float reach = std::hypot(p1.x - p0.x, p1.y - p0.y) +
                        std::hypot(p2.x - p1.x, p2.y - p1.y) +
                        std::hypot(p3.x - p2.x, p3.y - p2.y);
    const int steps = std::clamp(static_cast<int>(std::ceil(reach / 2)), 1, 64);
    for (int step = 1; step <= steps; ++step) {
      const float t = static_cast<float>(step) / steps;
      const float u = 1 - t;
      const float a = u * u * u;
      const float b = 3 * u * u * t;
      const float c = 3 * u * t * t;
      const float d = t * t * t;
      line.push_back({a * p0.x + b * p1.x + c * p2.x + d * p3.x,
                      a * p0.y + b * p1.y + c * p2.y + d * p3.y});
    }
  }
  return line;
}

/** A disc of `radius` about `centre`, wound as strokeOf's quads are, so the
 * pieces of a stroke join under the nonzero rule. */
Path disc(PlotPoint centre, float radius) {
  const int steps = std::max(8, static_cast<int>(std::ceil(radius * 4)));
  Path points;
  for (int step = 0; step < steps; ++step) {
    const float angle = -2 * std::numbers::pi_v<float> * step / steps;
    points.push_back({centre.x + std::cos(angle) * radius,
                      centre.y + std::sin(angle) * radius});
  }
  return points;
}

/** A stroke of `width` along a line: a quad each run and a disc at each
 * join, so every join is round; a closed line joins its ends too. */
void strokeOf(const Path& line, bool closed, float width, bool roundCaps,
              std::vector<Path>& pieces) {
  const float half = width / 2;
  const size_t runs = closed ? line.size() : line.size() - 1;
  for (size_t index = 0; index < runs && line.size() > 1; ++index) {
    const PlotPoint a = line[index];
    const PlotPoint b = line[(index + 1) % line.size()];
    const float length = std::hypot(b.x - a.x, b.y - a.y);
    if (length <= 0) continue;
    const float nx = -(b.y - a.y) / length * half;
    const float ny = (b.x - a.x) / length * half;
    pieces.push_back({{a.x + nx, a.y + ny},
                      {b.x + nx, b.y + ny},
                      {b.x - nx, b.y - ny},
                      {a.x - nx, a.y - ny}});
  }
  for (size_t index = 0; index < line.size(); ++index) {
    const bool end = !closed && (index == 0 || index + 1 == line.size());
    if (!end || roundCaps) pieces.push_back(disc(line[index], half));
  }
}

}  // namespace

std::unique_ptr<VectorPicture> parseVector(const std::string& text) {
  // nanosvg parses in place.
  std::vector<char> buffer(text.begin(), text.end());
  buffer.push_back('\0');
  NSVGimage* image = nsvgParse(buffer.data(), "px", 96);
  if (image == nullptr) return nullptr;
  auto picture = std::make_unique<VectorPicture>();
  picture->width = image->width;
  picture->height = image->height;
  for (NSVGshape* shape = image->shapes; shape != nullptr; shape = shape->next) {
    if ((shape->flags & NSVG_FLAGS_VISIBLE) == 0) continue;
    VectorShape drawn;
    drawn.fill = paintOf(shape->fill);
    drawn.stroke = paintOf(shape->stroke);
    drawn.strokeWidth = shape->strokeWidth;
    drawn.roundCaps = shape->strokeLineCap == NSVG_CAP_ROUND;
    drawn.evenOdd = shape->fillRule == NSVG_FILLRULE_EVENODD;
    for (NSVGpath* path = shape->paths; path != nullptr; path = path->next) {
      VectorPath copied;
      copied.closed = path->closed != 0;
      for (int index = 0; index < path->npts; ++index) {
        copied.points.push_back({path->pts[index * 2], path->pts[index * 2 + 1]});
      }
      drawn.paths.push_back(std::move(copied));
    }
    picture->shapes.push_back(std::move(drawn));
  }
  nsvgDelete(image);
  const bool drawable = picture->width > 0 && picture->height > 0;
  return drawable ? std::move(picture) : nullptr;
}

int ditherDot(float screenScale) { return screenScale >= 2 ? 2 : 1; }

Bitmap rasterizeVector(const VectorPicture& picture, const VectorRaster& raster) {
  Bitmap bitmap;
  bitmap.width = std::max(0, raster.width);
  bitmap.height = std::max(0, raster.height);
  bitmap.rgba.assign(static_cast<size_t>(bitmap.width) * bitmap.height * 4, 0);
  if (bitmap.width == 0 || bitmap.height == 0) return bitmap;
  const float sx = bitmap.width / picture.width;
  const float sy = bitmap.height / picture.height;
  const int dot = std::max(1, raster.dot);
  const auto inkOf = [&](std::uint32_t rgb) {
    const style::Dither ink = raster.ink(style::Color{
        static_cast<std::uint8_t>(rgb >> 16), static_cast<std::uint8_t>(rgb >> 8),
        static_cast<std::uint8_t>(rgb), 255});
    // Whole dots counted from the screen's corner, also left of it or above.
    const auto cell = [dot](int pixel) {
      const int counted = pixel >= 0 ? pixel / dot : -((dot - 1 - pixel) / dot);
      return (counted % 4 + 4) % 4;
    };
    return [ink, cell, &raster](int x, int y) {
      const int column = cell(raster.screenX + x);
      const int row = cell(raster.screenY + y);
      return kBayer[row][column] < ink.level ? ink.second : ink.first;
    };
  };
  for (const VectorShape& shape : picture.shapes) {
    std::vector<Path> lines;
    for (const VectorPath& path : shape.paths) lines.push_back(flatten(path, sx, sy));
    if (shape.fill) fillCrisp(bitmap, lines, shape.evenOdd, inkOf(*shape.fill));
    if (!shape.stroke || shape.strokeWidth <= 0) continue;
    // An outline is never thinner than one dot, so it holds at any size.
    const float width = std::max(static_cast<float>(dot),
                                 shape.strokeWidth * (sx + sy) / 2);
    std::vector<Path> pieces;
    for (size_t index = 0; index < lines.size(); ++index) {
      strokeOf(lines[index], shape.paths[index].closed, width, shape.roundCaps,
               pieces);
    }
    fillCrisp(bitmap, pieces, false, inkOf(*shape.stroke));
  }
  return bitmap;
}

}  // namespace bureau
