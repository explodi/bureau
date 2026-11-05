#pragma once

#include <array>
#include <cstddef>
#include <vector>

namespace bureau::labels {

struct StreetPoint {
  double x, y, z;
};

struct StreetRun {
  std::vector<StreetPoint> points;
  double regularWidth = 0;
  double regularHeight = 0;
  double smallWidth = 0;
  double smallHeight = 0;
};

struct StreetPlacement {
  size_t run = 0;
  bool small = false;
  double x = 0;
  double y = 0;
  double angle = 0;
  double width = 0;
  double height = 0;
};

// Street names along their streets: clipped to the view, repeated along long
// streets, and dropped where rotated names collide.
// Measured text stays unchanged while the native camera moves the labels.
std::vector<StreetPlacement> placeStreets(
    const std::vector<StreetRun>& runs,
    const std::array<double, 16>& viewProjection,
    double viewportWidth, double viewportHeight);

}  // namespace bureau::labels
