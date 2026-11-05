// What the view's files share and nothing outside them needs: each node's
// place after layout, its live state, and readers for its props.
#pragma once

#include <optional>
#include <string>
#include <string_view>

#include "view.h"
#include "streets.h"

namespace bureau {

using Json = nlohmann::json;

inline constexpr std::string_view kBox = "bureau-box";
inline constexpr std::string_view kText = "bureau-text";
inline constexpr std::string_view kImage = "bureau-image";
inline constexpr std::string_view kScroll = "bureau-scroll";
inline constexpr std::string_view kField = "bureau-field";
inline constexpr std::string_view kPlot = "bureau-plot";
inline constexpr std::string_view kLayer = "bureau-layer";
inline constexpr std::string_view kTextLeaf = "#text";

struct View::Place {
  /** The border box, in UI pixels from the viewport's corner. */
  UiRect rect;
  /** What the node is drawn and hit inside: its ancestors' overflow. */
  UiRect clip;
  bool clipped = false;
  /** UI pixels on the screen per pixel the node lays out in: below 1 inside
   * a box that scales what it holds down (`scaleBelow`). */
  float scale = 1;
  /** A Scroll's content, from its padding box's corner, unscrolled, in its
   * own pixels. */
  float contentWidth = 0;
  float contentHeight = 0;
  bool barVertical = false;
  bool barHorizontal = false;
  /** A Text's lines, or a Box's loose text's. */
  text::Paragraph paragraph;
  std::vector<int> spanNodes;
  /** The paragraph's inline boxes, in span order. */
  std::vector<int> atomNodes;
  /** One laid-out street name can repeat along several visible stretches. */
  std::vector<labels::StreetPlacement> streetPlacements;
};

struct View::Live {
  float scrollX = 0;
  float scrollY = 0;
  /** The pointer, Enter or Space holds it down. */
  bool held = false;
  /** A Scroll's bar shown at the last layout, for `auto`. */
  bool wantsBarVertical = false;
  bool wantsBarHorizontal = false;
  /** The last offset React set, so a new one is applied once. */
  std::string offsetSet;
  std::string animation;
  double animationStartMs = -1;
  /** Stopped or paused under the pointer or focus (whileHovered): paused,
   * how far it had run. */
  bool animationHeld = false;
  std::optional<double> animationPausedMs;
  std::string count;
  double countStartMs = -1;
  /** A field's caret, in bytes of its value. */
  size_t caret = std::string::npos;
  size_t selectionStart = std::string::npos;
  std::uint64_t editSequence = 0;
  std::uint64_t acknowledgedEdit = 0;
  std::string editedValue;
  /** The committed value when the latest edit arrived, and the edit before
   * it: a commit that is neither answers the latest edit with other text. */
  std::string valueAtEdit;
  std::string previousEditedValue;
  /** The value the field's last edit produced, by any input path. */
  std::string typedValue;
};

inline const Json* prop(const Node& node, const char* key) {
  const auto found = node.props.find(key);
  return found == node.props.end() || found->is_null() ? nullptr : &*found;
}

inline bool flag(const Node& node, const char* key) {
  const Json* value = prop(node, key);
  return value != nullptr && value->is_boolean() && value->get<bool>();
}

inline float number(const Node& node, const char* key, float otherwise) {
  const Json* value = prop(node, key);
  return value != nullptr && value->is_number() ? value->get<float>()
                                                : otherwise;
}

inline std::string textProp(const Node& node, const char* key) {
  const Json* value = prop(node, key);
  return value != nullptr && value->is_string() ? value->get<std::string>()
                                                : std::string();
}

inline bool isSticky(const Node& node) {
  return textProp(node, "position") == "sticky";
}

inline bool isStackingContext(const Node& node) {
  return isSticky(node) || number(node, "opacity", 1) < 1;
}

inline bool has(const Node& node, const char* key) {
  return prop(node, key) != nullptr;
}

UiRect intersect(const UiRect& a, const UiRect& b);

/** A rectangle on the screen in the pixels of a node drawn at `scale`: what
 * its scroll offsets, content and painting are measured in. */
inline UiRect inOwnPixels(const UiRect& rect, float scale) {
  return {rect.x / scale, rect.y / scale, rect.width / scale,
          rect.height / scale};
}

}  // namespace bureau
