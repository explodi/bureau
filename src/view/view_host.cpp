// The host API (primitives/host.ts, K7), answered from the laid-out tree.
// Every answer lays out first, so it reflects the latest commit.
#include <algorithm>

#include "view_internal.h"

namespace bureau {
namespace {

/** What hides a node from focus: an ancestor that is hidden or inert. */
bool hiddenFromFocus(const Node& node) {
  return flag(node, "__hidden") || flag(node, "inert") || flag(node, "hidden");
}

}  // namespace

std::optional<UiRect> View::measure(int id) {
  ensureLayout();
  const auto placed = places_.find(id);
  if (placed == places_.end()) return std::nullopt;
  return placed->second->rect;
}

float View::scaleOf(int id) {
  ensureLayout();
  const auto placed = places_.find(id);
  return placed == places_.end() ? 1 : placed->second->scale;
}

std::vector<int> View::focusables(int root, bool visibleOnly) {
  ensureLayout();
  std::vector<int> found;
  std::function<void(int)> walk = [&](int id) {
    for (const int child : placedChildren(id)) {
      const Node* item = node(child);
      if (item == nullptr || hiddenFromFocus(*item)) continue;
      const bool tabbable = canFocus(child) && !(item->type == kBox &&
                                                  has(*item, "tabStop") &&
                                                  !flag(*item, "tabStop"));
      const bool laidOut = places_.count(child) > 0 &&
                           places_.at(child)->rect.width > 0 &&
                           places_.at(child)->rect.height > 0;
      if (tabbable && (!visibleOnly || laidOut)) found.push_back(child);
      walk(child);
    }
  };
  walk(root);
  return found;
}

bool View::isNavigable(int id) const {
  const Node* found = node(id);
  if (found == nullptr) return false;
  return flag(*found, "navigable") || marks_.count(id) > 0;
}

std::vector<int> View::navigable(const std::string& grid, bool sequential) {
  ensureLayout();
  std::vector<int> found;
  const auto gridOf = [this](int id) {
    std::set<std::string> grids;
    const Node* item = node(id);
    if (item == nullptr) return grids;
    const std::string own = textProp(*item, "navigationGrid");
    if (!own.empty()) grids.insert(own);
    if (const auto marked = marks_.find(id); marked != marks_.end()) {
      for (const auto& mark : marked->second) {
        if (!mark.empty()) grids.insert(mark);
      }
    }
    return grids;
  };
  std::function<void(int, bool)> walk = [&](int id, bool inGrid) {
    const Node* item = node(id);
    if (item == nullptr || flag(*item, "__hidden")) return;
    const bool here = grid.empty() || inGrid || gridOf(id).count(grid) > 0;
    const bool dead = flag(*item, "disabled");
    const bool skipped =
        sequential && has(*item, "tabStop") && !flag(*item, "tabStop");
    if (isNavigable(id) && here && !dead && !skipped) found.push_back(id);
    for (const int child : placedChildren(id)) walk(child, here && !grid.empty());
  };
  for (const int root : tree_.roots()) {
    if (!isLayer(root)) walk(root, false);
  }
  return found;
}

void View::markNavigable(int id, const std::string& grid, bool on) {
  if (on) {
    marks_[id].insert(grid);
  } else if (const auto found = marks_.find(id); found != marks_.end()) {
    found->second.erase(grid);
    if (found->second.empty()) marks_.erase(found);
  }
}

void View::focus(int id, bool preventScroll) {
  if (id == 0 || !connected(id)) return;
  if (!canFocus(id)) {
    // A box with an id but no focus of its own cannot take focus.
    const Node* found = node(id);
    const bool box = found != nullptr && found->type == kBox &&
                     has(*found, "focusable");
    if (!box) return;
  }
  setFocus(id, keyboardLast_);
  if (!preventScroll) scrollIntoView(id);
}

void View::blur(int id) {
  if (id != 0 && focused_ == id) setFocus(0, false);
}

int View::toolbar(int id) const {
  for (int current = id; current > 0; current = placedParent(current)) {
    const Node* found = node(current);
    if (found != nullptr && textProp(*found, "role") == "toolbar") return current;
  }
  return 0;
}

int View::horizontalScroller(int root, int from) {
  ensureLayout();
  for (int current = from; current > 0 && contains(root, current);
       current = placedParent(current)) {
    const Node* found = node(current);
    if (found == nullptr || found->type != kScroll) continue;
    const std::string axis = textProp(*found, "axis");
    if (axis != "horizontal" && axis != "both") continue;
    const auto placed = places_.find(current);
    if (placed == places_.end()) continue;
    if (placed->second->contentWidth > placed->second->rect.width) return current;
    if (current == root) break;
  }
  return 0;
}

Json View::control(int id) const {
  const Node* found = node(id);
  if (found == nullptr) return nullptr;
  const bool disabled = flag(*found, "disabled");
  if (found->type == kField) {
    const std::string kind = textProp(*found, "kind");
    if (kind == "number" || kind == "range") {
      // The pad steps a field as the pointer drags a slider: a slider's ends
      // and step default as it draws, a number field's ends stay open.
      // Doubles, as JavaScript sent them: a float's 0.1 would step the value
      // to 0.10000000149.
      const auto exact = [found](const char* key, double otherwise) {
        const Json* value = prop(*found, key);
        return value != nullptr && value->is_number() ? value->get<double>()
                                                      : otherwise;
      };
      Json control{{"kind", kind},
                   {"disabled", disabled},
                   {"value", textProp(*found, "value")},
                   {"step", std::max(1e-6, exact("step", 1))}};
      if (kind == "range") {
        control["min"] = exact("min", 0);
        control["max"] = exact("max", 100);
        return control;
      }
      if (prop(*found, "min") != nullptr) control["min"] = exact("min", 0);
      if (prop(*found, "max") != nullptr) control["max"] = exact("max", 0);
      return control;
    }
    return Json{{"kind", "text"}, {"disabled", disabled}};
  }
  if (found->type != kBox) return nullptr;
  const std::string role = textProp(*found, "role");
  if (role == "checkbox" || role == "radio") {
    return Json{{"kind", "check"}, {"disabled", disabled}};
  }
  if (role == "button" || (role.empty() && flag(*found, "onPress"))) {
    return Json{{"kind", "button"}, {"disabled", disabled}};
  }
  return nullptr;
}

void View::press(int id) {
  const Node* found = node(id);
  if (found == nullptr || found->type != kBox) return;
  const bool interactive =
      !flag(*found, "disabled") && !flag(*found, "passThrough");
  if (!interactive) return;
  const std::string feedback = textProp(*found, "feedback");
  if (!feedback.empty() && feedback != "none" && boxHasPress(*found)) {
    call(0, "__feedback", Json::array({feedback}));
  }
  callPress(id, *found, false);
}

void View::setControlValue(int id, const std::string& value) {
  const Node* found = node(id);
  if (found == nullptr || found->type != kField) return;
  if (flag(*found, "disabled") || flag(*found, "readOnly")) return;
  if (flag(*found, "onChange")) call(id, "onChange", Json::array({value}));
}

void View::selectText(int id) {
  const Node* found = node(id);
  if (found == nullptr || found->type != kField) return;
  live_[id].caret = textProp(*found, "value").size();
  selectAll_ = focused_ == id;
}

float View::measureText(const std::string& style, const std::string& value) {
  const style::TypeStyle* type = tokens_.type(style, language_);
  if (type == nullptr) return 0;
  text::Span span;
  span.text = value;
  span.type = type;
  text::ParagraphOptions options;
  options.nowrap = true;
  options.language = language_;
  return typesetter_.set({span}, options).width;
}

UiRect View::viewport() const {
  const float bottom = std::max(insetBottom_, keyboardHeight_);
  return UiRect{insetLeft_ / uiScale_, insetTop_ / uiScale_,
                std::max(0.0f, windowWidth_ - insetLeft_ - insetRight_) / uiScale_,
                std::max(0.0f, windowHeight_ - insetTop_ - bottom) / uiScale_};
}

Json View::contentExtent(int id) {
  ensureLayout();
  const auto placed = places_.find(id);
  if (placed == places_.end()) {
    return Json{{"width", 0}, {"height", 0}, {"contentWidth", 0},
                {"contentHeight", 0}};
  }
  const Place& place = *placed->second;
  const Node* found = node(id);
  const bool scroll = found != nullptr && found->type == kScroll;
  const float bar = tokens_.effects().scrollbar;
  const UiRect own = inOwnPixels(place.rect, place.scale);
  const float width = own.width - (place.barVertical ? bar : 0);
  const float height = own.height - (place.barHorizontal ? bar : 0);
  return Json{{"width", width},
              {"height", height},
              {"contentWidth", scroll ? std::max(width, place.contentWidth) : width},
              {"contentHeight",
               scroll ? std::max(height, place.contentHeight) : height}};
}

void View::placeLayer(int id, float x, float y) {
  placedLayers_[id] = {x, y};
  layoutDirty_ = true;
}

Json View::probe(float x, float y) {
  ensureLayout();
  Json chain = Json::array();
  for (int current = hitTest(x / uiScale_, y / uiScale_); current > 0;
       current = placedParent(current)) {
    const Node* found = node(current);
    if (found == nullptr) break;
    Json entry = {{"id", current}, {"type", found->type}, {"props", found->props}};
    if (found->type == kText) {
      std::vector<text::Span> spans;
      std::vector<int> atoms;
      collectSpans(current, spans, atoms);
      std::string text;
      for (const auto& span : spans) text += span.text;
      entry["text"] = text;
    }
    if (const auto placed = places_.find(current); placed != places_.end()) {
      const UiRect& rect = placed->second->rect;
      entry["rect"] = {rect.x, rect.y, rect.width, rect.height};
    }
    chain.push_back(entry);
  }
  return chain;
}

}  // namespace bureau
