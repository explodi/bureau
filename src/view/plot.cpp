#include "plot.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace bureau {
namespace {

using Json = nlohmann::json;

using Point = PlotPoint;
using Path = std::vector<Point>;

/** Samples a pixel is cut into, each way: 4 x 4 coverage levels. */
constexpr int kSamples = 4;

float numberOf(const Json& command, const char* key, float otherwise = 0) {
  const auto found = command.find(key);
  return found != command.end() && found->is_number() ? found->get<float>()
                                                      : otherwise;
}

std::string textOf(const Json& command, const char* key) {
  const auto found = command.find(key);
  return found != command.end() && found->is_string()
             ? found->get<std::string>()
             : std::string();
}

/** Fills closed paths into `target`, each pixel in the colour `inkAt` gives
 * it, by the nonzero rule or the even-odd one: anti-aliased, or crisp, where
 * a pixel is wholly in when its centre is inside or on an edge. Crisp keeps
 * a 45° edge an even staircase and a symmetric shape symmetric at any
 * scale. */
template <typename InkAt>
void fillWith(Bitmap& target, const std::vector<Path>& paths,
              const InkAt& inkAt, float opacity, bool evenOdd, bool crisp) {
  if (target.width <= 0 || target.height <= 0) return;
  std::vector<float> coverage(static_cast<size_t>(target.width), 0);
  struct Crossing {
    float x;
    int winding;
  };
  std::vector<Crossing> crossings;
  float top = static_cast<float>(target.height);
  float bottom = 0;
  for (const Path& path : paths) {
    for (const Point& point : path) {
      top = std::min(top, point.y);
      bottom = std::max(bottom, point.y);
    }
  }
  const int firstRow = std::max(0, static_cast<int>(std::floor(top)));
  const int lastRow =
      std::min(target.height - 1, static_cast<int>(std::ceil(bottom)));
  for (int row = firstRow; row <= lastRow; ++row) {
    std::fill(coverage.begin(), coverage.end(), 0.0f);
    bool any = false;
    const int samples = crisp ? 1 : kSamples;
    for (int sample = 0; sample < samples; ++sample) {
      const float y = row + (sample + 0.5f) / samples;
      crossings.clear();
      for (const Path& path : paths) {
        for (size_t index = 0; index < path.size(); ++index) {
          const Point& a = path[index];
          const Point& b = path[(index + 1) % path.size()];
          if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
            const float t = (y - a.y) / (b.y - a.y);
            crossings.push_back(
                Crossing{a.x + t * (b.x - a.x), b.y > a.y ? 1 : -1});
          }
        }
      }
      std::sort(crossings.begin(), crossings.end(),
                [](const Crossing& left, const Crossing& right) {
                  return left.x < right.x;
                });
      int winding = 0;
      for (size_t index = 0; index + 1 < crossings.size(); ++index) {
        winding += evenOdd ? 1 : crossings[index].winding;
        const bool inside = evenOdd ? winding % 2 != 0 : winding != 0;
        if (!inside) continue;
        const float from = std::clamp(crossings[index].x, 0.0f,
                                      static_cast<float>(target.width));
        const float to = std::clamp(crossings[index + 1].x, 0.0f,
                                    static_cast<float>(target.width));
        if (crisp) {
          // "On an edge" within rounding: an edge through a pixel centre is
          // computed a hair to either side of it.
          constexpr float kOnEdge = 1e-4f;
          for (int x = static_cast<int>(std::ceil(from - 0.5f - kOnEdge));
               x < target.width && x + 0.5f <= to + kOnEdge; ++x) {
            coverage[x] = 1;
            any = true;
          }
          continue;
        }
        // Each sample row adds the span's exact horizontal coverage.
        for (int x = static_cast<int>(from);
             x < target.width && static_cast<float>(x) < to; ++x) {
          const float left = std::max(from, static_cast<float>(x));
          const float right = std::min(to, static_cast<float>(x + 1));
          if (right > left) {
            coverage[x] += (right - left) / kSamples;
            any = true;
          }
        }
      }
    }
    if (!any) continue;
    for (int x = 0; x < target.width; ++x) {
      if (coverage[x] <= 0) continue;
      const style::Color color = inkAt(x, row);
      const float alpha = std::min(1.0f, coverage[x]) * opacity *
                          (color.a / 255.0f);
      if (alpha <= 0) continue;
      auto* pixel = &target.rgba[(static_cast<size_t>(row) * target.width + x) *
                                 4];
      const float under = pixel[3] / 255.0f;
      const float out = alpha + under * (1 - alpha);
      const std::uint8_t inks[3] = {color.r, color.g, color.b};
      for (int channel = 0; channel < 3; ++channel) {
        const float mixed = (inks[channel] * alpha +
                             pixel[channel] * under * (1 - alpha)) /
                            out;
        pixel[channel] = static_cast<std::uint8_t>(std::lround(mixed));
      }
      pixel[3] = static_cast<std::uint8_t>(std::lround(out * 255));
    }
  }
}

/** Fills closed paths into `target` in one colour (fillWith). */
void fill(Bitmap& target, const std::vector<Path>& paths, style::Color color,
          float opacity, bool evenOdd, bool crisp = false) {
  fillWith(target, paths, [color](int, int) { return color; }, opacity,
           evenOdd, crisp);
}

/** A stroke of `width` along an open polyline, as quads per segment and
 * squares at the joins: butt ends, the joins filled. */
std::vector<Path> strokeOf(const Path& line, float width) {
  std::vector<Path> pieces;
  const float half = width / 2;
  for (size_t index = 0; index + 1 < line.size(); ++index) {
    const Point a = line[index];
    const Point b = line[index + 1];
    const float dx = b.x - a.x;
    const float dy = b.y - a.y;
    const float length = std::hypot(dx, dy);
    if (length <= 0) continue;
    const float nx = -dy / length * half;
    const float ny = dx / length * half;
    pieces.push_back({{a.x + nx, a.y + ny},
                      {b.x + nx, b.y + ny},
                      {b.x - nx, b.y - ny},
                      {a.x - nx, a.y - ny}});
    if (index + 2 < line.size()) {
      // Joins: a disc of the stroke's width, close enough to a miter at the
      // chart's shallow angles.
      Path disc;
      for (int step = 0; step < 12; ++step) {
        const float angle = step * std::numbers::pi_v<float> / 6;
        disc.push_back({b.x + std::cos(angle) * half,
                        b.y + std::sin(angle) * half});
      }
      pieces.push_back(disc);
    }
  }
  return pieces;
}

/** A polyline cut by a dash pattern, as canvas's setLineDash cuts it. */
std::vector<Path> dashed(const Path& line, const std::vector<float>& lengths) {
  if (lengths.empty()) return {line};
  std::vector<Path> dashes;
  size_t dash = 0;
  float left = lengths[0];
  bool on = true;
  Path current = {line.front()};
  for (size_t index = 0; index + 1 < line.size(); ++index) {
    Point a = line[index];
    const Point b = line[index + 1];
    float remaining = std::hypot(b.x - a.x, b.y - a.y);
    while (remaining > 0) {
      const float step = std::min(left, remaining);
      const float t = step / remaining;
      const Point next{a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t};
      if (on) current.push_back(next);
      remaining -= step;
      left -= step;
      a = next;
      if (left <= 0) {
        if (on && current.size() > 1) dashes.push_back(current);
        on = !on;
        dash = (dash + 1) % lengths.size();
        left = std::max(0.5f, lengths[dash]);
        current.clear();
        current.push_back(a);
      }
    }
  }
  if (on && current.size() > 1) dashes.push_back(current);
  return dashes;
}

Path arc(float x, float y, float radius, float start, float end,
         bool backwards = false) {
  Path points;
  const float sweep = end - start;
  const int steps = std::max(
      4, static_cast<int>(std::ceil(std::abs(sweep) * radius / 2)));
  for (int step = 0; step <= steps; ++step) {
    const float t = static_cast<float>(step) / steps;
    const float angle = backwards ? end - sweep * t : start + sweep * t;
    points.push_back({x + std::cos(angle) * radius,
                      y + std::sin(angle) * radius});
  }
  return points;
}

/** Whether `paths` wind around `point`, by the nonzero rule. */
bool encloses(const std::vector<Path>& paths, Point point) {
  int winding = 0;
  for (const Path& path : paths) {
    for (size_t index = 0; index < path.size(); ++index) {
      const Point& a = path[index];
      const Point& b = path[(index + 1) % path.size()];
      const bool upward = a.y <= point.y && b.y > point.y;
      const bool downward = b.y <= point.y && a.y > point.y;
      if (!upward && !downward) continue;
      const float crossingX = a.x + (point.y - a.y) / (b.y - a.y) * (b.x - a.x);
      if (crossingX > point.x) winding += upward ? 1 : -1;
    }
  }
  return winding != 0;
}

/** Which side of the line through `a` and `b` `point` lies on. */
float sideOf(Point a, Point b, Point point) {
  return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
}

/** Where the path from `from` to `to` crosses the edge from `a` to `b`. */
std::optional<Point> crossing(Point from, Point to, Point a, Point b) {
  const float fromSide = sideOf(a, b, from);
  const float toSide = sideOf(a, b, to);
  const bool splitsEdge = (fromSide > 0) != (toSide > 0);
  const bool splitsPath = (sideOf(from, to, a) > 0) != (sideOf(from, to, b) > 0);
  if (!splitsEdge || !splitsPath) return std::nullopt;
  const float t = fromSide / (fromSide - toSide);
  return Point{from.x + t * (to.x - from.x), from.y + t * (to.y - from.y)};
}

/** Where the light comes from: the top left, as on every bevel, a hair more
 * from above so an edge falling at 45° to the right still takes a side. */
constexpr Point kTowardLight{-1.0f, -1.01f};

struct EngravedEdge {
  Point a;
  Point b;
  /** Faces the light: its wall is the shadowed one, inside the art. */
  bool facesLight;
  /** A wall's width outward, along the axis nearest the edge's normal. */
  Point step;
};

std::vector<EngravedEdge> engravedEdges(const Path& path, float wall) {
  float twiceArea = 0;
  for (size_t index = 0; index < path.size(); ++index) {
    const Point& a = path[index];
    const Point& b = path[(index + 1) % path.size()];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  // Clockwise on screen, y down, has a positive area.
  const float outwardSign = twiceArea > 0 ? 1.0f : -1.0f;
  std::vector<EngravedEdge> edges;
  for (size_t index = 0; index < path.size(); ++index) {
    const Point& a = path[index];
    const Point& b = path[(index + 1) % path.size()];
    const Point normal{outwardSign * (b.y - a.y), outwardSign * (a.x - b.x)};
    const bool facesLight =
        normal.x * kTowardLight.x + normal.y * kTowardLight.y > 0;
    const bool horizontalNormal = std::abs(normal.x) > std::abs(normal.y);
    const Point step = horizontalNormal
                           ? Point{std::copysign(wall, normal.x), 0}
                           : Point{0, std::copysign(wall, normal.y)};
    edges.push_back({a, b, facesLight, step});
  }
  return edges;
}

}  // namespace

void fillPolygon(Bitmap& target, const std::vector<PlotPoint>& points,
                 style::Color color, bool crisp) {
  fill(target, {points}, color, 1, false, crisp);
}

void fillCrisp(Bitmap& target,
               const std::vector<std::vector<PlotPoint>>& paths, bool evenOdd,
               const std::function<style::Color(int x, int y)>& inkAt) {
  fillWith(target, paths, inkAt, 1, evenOdd, true);
}

void engrave(Bitmap& target, const std::vector<Path>& art, float scale,
             const EngravingInks& inks) {
  const float wall = std::max(1.0f, std::round(scale));
  std::vector<Path> cut;
  std::vector<EngravedEdge> edges;
  for (const Path& path : art) {
    if (path.size() < 3) continue;
    Path points;
    for (const Point& point : path) {
      points.push_back({point.x * scale, point.y * scale});
    }
    cut.push_back(points);
    const auto pathEdges = engravedEdges(points, wall);
    edges.insert(edges.end(), pathEdges.begin(), pathEdges.end());
  }
  // A pixel is a wall when stepping a wall's width out of it, along the axis
  // nearest an edge's normal, crosses that edge: one wall wide at any angle,
  // a 45° edge a staircase one pixel deep.
  for (int y = 0; y < target.height; ++y) {
    for (int x = 0; x < target.width; ++x) {
      // Off the centre by a hair: art on whole and half pixels puts a 45°
      // edge exactly through pixel centres, which would take either side.
      const Point centre{x + 0.5f + 1.0f / 64, y + 0.5f + 1.0f / 128};
      const bool inside = encloses(cut, centre);
      bool shadow = false;
      bool lit = false;
      for (const EngravedEdge& edge : edges) {
        const bool shadowSide = inside && edge.facesLight;
        const bool litSide = !inside && !edge.facesLight;
        const Point outward{centre.x + edge.step.x, centre.y + edge.step.y};
        const Point inward{centre.x - edge.step.x, centre.y - edge.step.y};
        if (shadowSide && crossing(centre, outward, edge.a, edge.b)) {
          shadow = true;
        }
        if (!litSide) continue;
        const auto onEdge = crossing(centre, inward, edge.a, edge.b);
        if (!onEdge) continue;
        // Only where the art is a whole wall deep behind the edge: toward a
        // sharp tip it is thinner, and the wall would run on past the art in
        // a spike. Asked at the edge, so every row of the wall ends together.
        const Point wallDeep{onEdge->x - edge.step.x, onEdge->y - edge.step.y};
        if (encloses(cut, wallDeep)) lit = true;
      }
      // The art cast a wall down-right of itself fills the corners where two
      // lit walls meet, which neither edge's step reaches; only where the art
      // runs two walls deep that way, so a sharp tip casts no spike.
      const bool cast = !inside &&
                        encloses(cut, {centre.x - wall, centre.y - wall}) &&
                        encloses(cut, {centre.x - 2 * wall, centre.y - 2 * wall});
      lit = lit || cast;
      if (!inside && !lit) continue;
      const style::Color ink =
          shadow ? inks.shadow : inside ? inks.floor : inks.lit;
      std::uint8_t* out = &target.rgba[(static_cast<size_t>(y) * target.width + x) * 4];
      out[0] = ink.r;
      out[1] = ink.g;
      out[2] = ink.b;
      out[3] = ink.a;
    }
  }
}

Bitmap rasterizePlot(const Json& commands, float width, float height,
                     float scale, const InkLookup& ink) {
  Bitmap pixels;
  pixels.width = std::max(1, static_cast<int>(std::lround(width * scale)));
  pixels.height = std::max(1, static_cast<int>(std::lround(height * scale)));
  pixels.rgba.assign(static_cast<size_t>(pixels.width) * pixels.height * 4, 0);
  if (!commands.is_array()) return pixels;

  const auto at = [scale](float x, float y) { return Point{x * scale, y * scale}; };
  const auto colorOf = [&ink](const std::string& name) {
    return ink(name).value_or(style::Color{0, 0, 0, 255});
  };
  Point pen{0, 0};
  std::vector<float> dash;
  // Consecutive lines in one ink and width are one polyline.
  Path polyline;
  std::string polylineInk;
  float polylineWidth = 0;
  const auto strokePolyline = [&] {
    if (polyline.size() < 2) {
      polyline.clear();
      return;
    }
    std::vector<Path> pieces;
    for (const Path& piece : dashed(polyline, dash)) {
      for (const Path& part : strokeOf(piece, polylineWidth * scale)) {
        pieces.push_back(part);
      }
    }
    fill(pixels, pieces, colorOf(polylineInk), 1, false);
    polyline.clear();
  };

  for (const Json& command : commands) {
    const std::string kind = textOf(command, "kind");
    if (kind != "line") strokePolyline();
    if (kind == "move") {
      pen = {numberOf(command, "x"), numberOf(command, "y")};
    } else if (kind == "line") {
      const float lineWidth = numberOf(command, "width", 1);
      const std::string lineInk = textOf(command, "ink");
      const bool continues = !polyline.empty() && polylineInk == lineInk &&
                             polylineWidth == lineWidth;
      if (!continues) {
        strokePolyline();
        polyline = {at(pen.x, pen.y)};
        polylineInk = lineInk;
        polylineWidth = lineWidth;
      }
      pen = {numberOf(command, "x"), numberOf(command, "y")};
      polyline.push_back(at(pen.x, pen.y));
    } else if (kind == "dash") {
      dash.clear();
      if (command.contains("lengths") && command["lengths"].is_array()) {
        for (const Json& length : command["lengths"]) {
          if (length.is_number()) dash.push_back(length.get<float>() * scale);
        }
      }
    } else if (kind == "rect") {
      const Point a = at(numberOf(command, "x"), numberOf(command, "y"));
      const Point b = at(numberOf(command, "x") + numberOf(command, "width"),
                         numberOf(command, "y") + numberOf(command, "height"));
      fill(pixels, {{a, {b.x, a.y}, b, {a.x, b.y}}},
           colorOf(textOf(command, "ink")), 1, false);
    } else if (kind == "polygon") {
      Path points;
      if (command.contains("points") && command["points"].is_array()) {
        for (const Json& point : command["points"]) {
          if (point.is_array() && point.size() == 2) {
            points.push_back(at(point[0].get<float>(), point[1].get<float>()));
          }
        }
      }
      if (points.size() < 3) continue;
      const auto crispFlag = command.find("crisp");
      const bool crisp = crispFlag != command.end() && crispFlag->is_boolean() &&
                         crispFlag->get<bool>();
      fill(pixels, {points}, colorOf(textOf(command, "ink")),
           numberOf(command, "opacity", 1), false, crisp);
      const auto stroke = command.find("stroke");
      if (stroke != command.end() && stroke->is_object()) {
        Path closed = points;
        closed.push_back(points.front());
        closed.push_back(points[1]);
        fill(pixels,
             strokeOf(closed, numberOf(*stroke, "width", 1) * scale),
             colorOf(textOf(*stroke, "ink")), 1, false);
      }
    } else if (kind == "engraving") {
      std::vector<Path> art;
      if (command.contains("paths") && command["paths"].is_array()) {
        for (const Json& path : command["paths"]) {
          if (!path.is_array()) continue;
          Path points;
          for (const Json& point : path) {
            if (!point.is_array() || point.size() != 2) continue;
            points.push_back({point[0].get<float>(), point[1].get<float>()});
          }
          art.push_back(points);
        }
      }
      engrave(pixels, art, scale,
              {colorOf(textOf(command, "shadow")),
               colorOf(textOf(command, "floor")),
               colorOf(textOf(command, "lit"))});
    } else if (kind == "wedge") {
      const Point centre = at(numberOf(command, "x"), numberOf(command, "y"));
      const float radius = numberOf(command, "radius") * scale;
      const float inner = numberOf(command, "innerRadius") * scale;
      const float start = numberOf(command, "start");
      const float end = numberOf(command, "end");
      std::vector<Path> paths;
      const bool whole = end - start >= 2 * std::numbers::pi_v<float>;
      if (inner > 0 && whole) {
        paths = {arc(centre.x, centre.y, radius, 0,
                     2 * std::numbers::pi_v<float>),
                 arc(centre.x, centre.y, inner, 0,
                     2 * std::numbers::pi_v<float>)};
      } else if (inner > 0) {
        Path ring = arc(centre.x, centre.y, radius, start, end);
        const Path back = arc(centre.x, centre.y, inner, start, end, true);
        ring.insert(ring.end(), back.begin(), back.end());
        paths = {ring};
      } else if (whole) {
        // A whole disc is its rim alone: running it through the centre would
        // leave a zero-width spike out to angle 0 that antialiasing shows as
        // a hairline.
        paths = {arc(centre.x, centre.y, radius, 0,
                     2 * std::numbers::pi_v<float>)};
      } else {
        Path slice = {centre};
        const Path edge = arc(centre.x, centre.y, radius, start, end);
        slice.insert(slice.end(), edge.begin(), edge.end());
        paths = {slice};
      }
      fill(pixels, paths, colorOf(textOf(command, "ink")), 1, true);
      const auto stroke = command.find("stroke");
      if (stroke != command.end() && stroke->is_object()) {
        for (Path outline : paths) {
          outline.push_back(outline.front());
          fill(pixels,
               strokeOf(outline, numberOf(*stroke, "width", 1) * scale),
               colorOf(textOf(*stroke, "ink")), 1, false);
        }
      }
    }
  }
  strokePolyline();
  return pixels;
}

PlotOverlays plotOverlays(const Json& commands) {
  PlotOverlays overlays;
  if (!commands.is_array()) return overlays;
  for (const Json& command : commands) {
    const std::string kind = textOf(command, "kind");
    if (kind == "text") {
      const std::string align = textOf(command, "align");
      PlotText text;
      text.x = numberOf(command, "x");
      text.y = numberOf(command, "y");
      if (align == "start") text.align = PlotText::Align::Start;
      if (align == "end") text.align = PlotText::Align::End;
      text.text = textOf(command, "text");
      text.ink = textOf(command, "ink");
      text.typeStyle = textOf(command, "typeStyle");
      overlays.texts.push_back(text);
    } else if (kind == "image") {
      overlays.images.push_back(PlotImage{
          textOf(command, "source"), numberOf(command, "x"),
          numberOf(command, "y"), numberOf(command, "width"),
          numberOf(command, "height")});
    }
  }
  return overlays;
}

}  // namespace bureau
