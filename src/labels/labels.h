#pragma once

#include <array>
#include <string>
#include <vector>

namespace bureau::labels {

struct Anchor {
  double x;
  double y;
  double z;
  double width;
  double height;
  std::string crowd_group;
};

struct Placement {
  double left = 0;
  double top = 0;
  bool visible = false;
};

// The caller supplies the camera's column-major view-projection each frame.
// Camera motion changes placements without committing the marker content.
std::vector<Placement> place(const std::vector<Anchor>& anchors,
                             const std::array<double, 16>& view_projection,
                             double viewport_width, double viewport_height);

}  // namespace bureau::labels
