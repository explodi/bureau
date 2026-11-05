// Vector pictures: an Image's `.svg` source, parsed by nanosvg and drawn by
// Bureau's own crisp fills. Edges are never anti-aliased into colours off
// the palette; a colour past it draws as a dither of two palette colours in
// dots of whole device pixels, lined up with the screen's pixels so pictures
// side by side share one pattern.
#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "images.h"
#include "plot.h"
#include "tokens.h"

namespace bureau {

struct VectorPath {
  /** A start point, then three points (two controls and an end) for each
   * cubic Bézier segment, as nanosvg writes them. */
  std::vector<PlotPoint> points;
  bool closed = false;
};

/** One shape in paint order, in the picture's own pixels. */
struct VectorShape {
  std::vector<VectorPath> paths;
  /** 0xRRGGBB; none for no paint. A gradient paints its first stop. */
  std::optional<std::uint32_t> fill;
  std::optional<std::uint32_t> stroke;
  float strokeWidth = 0;
  /** Round ends on an open path; butt and square ends stop at the path. */
  bool roundCaps = false;
  bool evenOdd = false;
};

struct VectorPicture {
  /** Its size in its own pixels: the SVG's width and height. */
  float width = 0;
  float height = 0;
  std::vector<VectorShape> shapes;
};

/** Null when `text` is no SVG nanosvg reads, or draws nothing. */
std::unique_ptr<VectorPicture> parseVector(const std::string& text);

/** How a picture is drawn into device pixels. */
struct VectorRaster {
  int width = 0;
  int height = 0;
  /** A dither dot's side in device pixels, the thinnest an outline draws. */
  int dot = 1;
  /** The picture's corner on the screen, which the dither pattern is laid
   * from, so it lines up with the screen's pixels. */
  int screenX = 0;
  int screenY = 0;
  /** How each colour is drawn (style::Tokens::drawnAs). */
  std::function<style::Dither(style::Color)> ink;
};

Bitmap rasterizeVector(const VectorPicture& picture, const VectorRaster& raster);

/** A dither dot's side on a screen of `screenScale` device pixels a point:
 * two on a HiDPI screen, one on any other. */
int ditherDot(float screenScale);

}  // namespace bureau
