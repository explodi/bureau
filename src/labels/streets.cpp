#include "streets.h"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <optional>

namespace bureau::labels {
namespace {

struct Point {
  double x, y;
};

struct ClipPoint {
  double x, y, z, w;
};

struct Polyline {
  size_t run;
  std::vector<Point> points;
  std::vector<double> cumulative;
  double length = 0;
};

ClipPoint project(const StreetPoint& point, const std::array<double, 16>& m) {
  return {m[0] * point.x + m[4] * point.y + m[8] * point.z + m[12],
          m[1] * point.x + m[5] * point.y + m[9] * point.z + m[13],
          m[2] * point.x + m[6] * point.y + m[10] * point.z + m[14],
          m[3] * point.x + m[7] * point.y + m[11] * point.z + m[15]};
}

ClipPoint interpolate(const ClipPoint& a, const ClipPoint& b, double t) {
  return {a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t};
}

struct Leg {
  Point start, end;
  bool cutAtEnd;
};

std::optional<Leg> clippedLeg(const ClipPoint& a, const ClipPoint& b,
                              double width, double height) {
  // Homogeneous clipping keeps segments crossing the near plane finite.
  const std::array sidesA{a.w + a.x, a.w - a.x, a.w + a.y, a.w - a.y, a.z};
  const std::array sidesB{b.w + b.x, b.w - b.x, b.w + b.y, b.w - b.y, b.z};
  double enter = 0;
  double exit = 1;
  for (size_t edge = 0; edge < sidesA.size(); ++edge) {
    const double from = sidesA[edge];
    const double to = sidesB[edge];
    if (from < 0 && to < 0) return std::nullopt;
    if (from < 0) enter = std::max(enter, from / (from - to));
    if (to < 0) exit = std::min(exit, from / (from - to));
  }
  if (enter > exit) return std::nullopt;
  const auto first = interpolate(a, b, enter);
  const auto last = interpolate(a, b, exit);
  if (first.w <= 0 || last.w <= 0) return std::nullopt;
  const Point start{(first.x / first.w + 1) * width / 2,
                    (1 - first.y / first.w) * height / 2};
  const Point end{(last.x / last.w + 1) * width / 2,
                  (1 - last.y / last.w) * height / 2};
  if (!std::isfinite(start.x + start.y + end.x + end.y)) return std::nullopt;
  return Leg{start, end, exit < 1};
}

bool samePoint(const Point& a, const Point& b) {
  return std::abs(a.x - b.x) < 0.5 && std::abs(a.y - b.y) < 0.5;
}

std::vector<Polyline> projectedRuns(const std::vector<StreetRun>& runs,
                                     const std::array<double, 16>& matrix,
                                     double width, double height) {
  std::vector<Polyline> lines;
  for (size_t run = 0; run < runs.size(); ++run) {
    const auto& points = runs[run].points;
    bool continuing = false;
    for (size_t index = 1; index < points.size(); ++index) {
      const auto leg = clippedLeg(project(points[index - 1], matrix),
                                   project(points[index], matrix), width, height);
      if (!leg) {
        continuing = false;
        continue;
      }
      if (!continuing || !samePoint(lines.back().points.back(), leg->start))
        lines.push_back({run, {leg->start}, {0}, 0});
      auto& line = lines.back();
      const auto previous = line.points.back();
      line.length += std::hypot(leg->end.x - previous.x, leg->end.y - previous.y);
      line.points.push_back(leg->end);
      line.cumulative.push_back(line.length);
      continuing = !leg->cutAtEnd;
    }
  }
  std::stable_sort(lines.begin(), lines.end(),
                    [](const Polyline& a, const Polyline& b) {
                      return a.length > b.length;
                    });
  return lines;
}

double readingAngle(double angle) {
  if (angle >= std::numbers::pi / 2) return angle - std::numbers::pi;
  if (angle < -std::numbers::pi / 2) return angle + std::numbers::pi;
  return angle;
}

StreetPlacement along(const Polyline& line, double distance) {
  for (size_t index = 1; index < line.points.size(); ++index) {
    const bool last = index + 1 == line.points.size();
    if (distance > line.cumulative[index] && !last) continue;
    const auto a = line.points[index - 1];
    const auto b = line.points[index];
    const double start = line.cumulative[index - 1];
    const double length = line.cumulative[index] - start;
    const double t = length > 0 ? (distance - start) / length : 0;
    return {line.run, false, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t,
            readingAngle(std::atan2(b.y - a.y, b.x - a.x)), 0, 0};
  }
  return {};
}

double reach(const StreetPlacement& box, const Point& axis) {
  const double x = std::cos(box.angle);
  const double y = std::sin(box.angle);
  return (box.width / 2 + 3) * std::abs(x * axis.x + y * axis.y) +
         (box.height / 2 + 3) * std::abs(-y * axis.x + x * axis.y);
}

bool overlaps(const StreetPlacement& a, const StreetPlacement& b) {
  const std::array axes{
      Point{std::cos(a.angle), std::sin(a.angle)},
      Point{-std::sin(a.angle), std::cos(a.angle)},
      Point{std::cos(b.angle), std::sin(b.angle)},
      Point{-std::sin(b.angle), std::cos(b.angle)}};
  for (const auto& axis : axes) {
    const double distance = std::abs((b.x - a.x) * axis.x + (b.y - a.y) * axis.y);
    if (distance > reach(a, axis) + reach(b, axis)) return false;
  }
  return true;
}

}  // namespace

std::vector<StreetPlacement> placeStreets(
    const std::vector<StreetRun>& runs,
    const std::array<double, 16>& viewProjection,
    double viewportWidth, double viewportHeight) {
  std::vector<StreetPlacement> placed;
  for (const auto& line : projectedRuns(runs, viewProjection, viewportWidth,
                                        viewportHeight)) {
    const auto& run = runs[line.run];
    const bool small = run.regularWidth + 24 > line.length;
    const double width = small ? run.smallWidth : run.regularWidth;
    const double height = small ? run.smallHeight : run.regularHeight;
    if (width <= 0 || width + 24 > line.length) continue;
    const double stride = std::max(480.0, width + 24);
    const int repeats = std::clamp(static_cast<int>(line.length / stride), 1, 4);
    for (int repeat = 0; repeat < repeats; ++repeat) {
      auto candidate = along(line, line.length * (repeat + 0.5) / repeats);
      candidate.small = small;
      candidate.width = width;
      candidate.height = height;
      const bool crowded = std::any_of(placed.begin(), placed.end(),
                                       [&](const StreetPlacement& other) {
                                         return overlaps(candidate, other);
                                       });
      if (!crowded) placed.push_back(candidate);
      if (placed.size() == 120) return placed;
    }
  }
  return placed;
}

}  // namespace bureau::labels
