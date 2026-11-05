#include "labels.h"

#include <cmath>
#include <unordered_map>

namespace bureau::labels {
namespace {

struct Box {
  double left;
  double top;
  double right;
  double bottom;
};

bool overlaps(const Box& a, const Box& b) {
  const bool apart_sideways = a.right <= b.left || b.right <= a.left;
  const bool apart_vertically = a.bottom <= b.top || b.bottom <= a.top;
  return !apart_sideways && !apart_vertically;
}

}  // namespace

std::vector<Placement> place(const std::vector<Anchor>& anchors,
                             const std::array<double, 16>& matrix,
                             double viewport_width, double viewport_height) {
  std::vector<Placement> placed(anchors.size());
  std::unordered_map<std::string, std::vector<Box>> visible_by_group;

  for (size_t index = 0; index < anchors.size(); ++index) {
    const auto& anchor = anchors[index];
    const double clip_x = matrix[0] * anchor.x + matrix[4] * anchor.y +
                          matrix[8] * anchor.z + matrix[12];
    const double clip_y = matrix[1] * anchor.x + matrix[5] * anchor.y +
                          matrix[9] * anchor.z + matrix[13];
    const double clip_z = matrix[2] * anchor.x + matrix[6] * anchor.y +
                          matrix[10] * anchor.z + matrix[14];
    const double clip_w = matrix[3] * anchor.x + matrix[7] * anchor.y +
                          matrix[11] * anchor.z + matrix[15];
    if (!std::isfinite(clip_w) || clip_w <= 0) continue;
    const double x = clip_x / clip_w;
    const double y = clip_y / clip_w;
    const double z = clip_z / clip_w;
    const bool on_screen = std::abs(x) <= 1 && std::abs(y) <= 1 &&
                           z >= 0 && z <= 1;
    if (!on_screen) continue;

    const double center_x = (x + 1) * viewport_width / 2;
    const double center_y = (1 - y) * viewport_height / 2;
    const Box box{center_x - anchor.width / 2,
                  center_y - anchor.height / 2,
                  center_x + anchor.width / 2,
                  center_y + anchor.height / 2};
    if (!anchor.crowd_group.empty()) {
      auto& kept = visible_by_group[anchor.crowd_group];
      bool crowded = false;
      for (const auto& earlier : kept) {
        if (overlaps(box, earlier)) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
      kept.push_back(box);
    }
    placed[index] = {box.left, box.top, true};
  }
  return placed;
}

}  // namespace bureau::labels
