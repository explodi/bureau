// A Plot's commands (the chart code's moves, lines, dashes, rectangles,
// polygons and wedges) drawn into pixels at the device's scale. Its text and
// pictures are laid on top by the painter, as glyphs and sprites.
#pragma once

#include <functional>
#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "images.h"
#include "tokens.h"

namespace bureau {

/** A run of type whose line box is centred on y; `align` says which part of
 * it stands on x. */
struct PlotText {
  enum class Align { Start, Center, End };
  float x = 0;
  float y = 0;
  Align align = Align::Center;
  std::string text;
  std::string ink;
  std::string typeStyle;
};

struct PlotImage {
  std::string source;
  float x = 0;
  float y = 0;
  float width = 0;
  float height = 0;
};

/** What the painter lays over the drawing. */
struct PlotOverlays {
  std::vector<PlotText> texts;
  std::vector<PlotImage> images;
};

struct PlotPoint {
  float x = 0;
  float y = 0;
};

/** Fills a closed polygon given in `target`'s pixels: anti-aliased, or crisp,
 * where a pixel is wholly in when its centre is inside or on an edge. */
void fillPolygon(Bitmap& target, const std::vector<PlotPoint>& points,
                 style::Color color, bool crisp);

/** Fills closed paths in `target`'s pixels crisply, by the nonzero rule or
 * the even-odd one, each pixel in the colour `inkAt` gives it: a dither. */
void fillCrisp(Bitmap& target,
               const std::vector<std::vector<PlotPoint>>& paths, bool evenOdd,
               const std::function<style::Color(int x, int y)>& inkAt);

struct EngravingInks {
  style::Color shadow;
  style::Color floor;
  style::Color lit;
};

/** Cuts `art`, closed outlines in UI pixels, into `target` at `scale` device
 * pixels each, as OPENSTEP cut its marks: a shadowed wall inside the edges
 * facing the top-left light, a lit wall outside the others, and the floor
 * between. Walls are one UI pixel, whole device pixels, at every
 * scale. Every engraved shape in the UI is cut here. */
void engrave(Bitmap& target, const std::vector<std::vector<PlotPoint>>& art,
             float scale, const EngravingInks& inks);

using InkLookup = std::function<std::optional<style::Color>(const std::string&)>;

/** `width` x `height` UI pixels at `scale` device pixels each. */
Bitmap rasterizePlot(const nlohmann::json& commands, float width, float height,
                     float scale, const InkLookup& ink);

/** The text and image commands, in UI pixels. */
PlotOverlays plotOverlays(const nlohmann::json& commands);

}  // namespace bureau
