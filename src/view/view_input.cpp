// Input: hit testing over the painted tree, topmost first; hover over
// the placed ancestors for looks and the React ancestors for enter and
// leave; a press that captures its pointer; drags, wheels, fields; keys at
// the focused node and then its ancestors.
#include <algorithm>
#include <cmath>

#include "view_internal.h"

namespace bureau {
namespace {

/** Travel past this is a drag, so letting go is not also a press. */
constexpr float kDragSlop = 8;

Json keyJson(const KeyEvent& event) {
  return Json{{"key", event.key},     {"code", event.code},
              {"phase", event.down ? "down" : "up"},
              {"repeat", event.repeat}, {"shift", event.shift},
              {"control", event.control}, {"alt", event.alt},
              {"meta", event.meta}};
}

bool truthy(const Json& value) {
  return value.is_boolean() ? value.get<bool>() : false;
}

size_t previousCharacter(const std::string& text, size_t at) {
  if (at == 0) return 0;
  size_t index = at - 1;
  while (index > 0 && (static_cast<unsigned char>(text[index]) & 0xc0) == 0x80) {
    --index;
  }
  return index;
}

size_t nextCharacter(const std::string& text, size_t at) {
  if (at >= text.size()) return text.size();
  size_t index = at + 1;
  while (index < text.size() &&
         (static_cast<unsigned char>(text[index]) & 0xc0) == 0x80) {
    ++index;
  }
  return index;
}

size_t utf16Offset(const std::string& text, size_t byteOffset) {
  size_t units = 0;
  for (size_t at = 0; at < std::min(byteOffset, text.size());
       at = nextCharacter(text, at)) {
    units += (static_cast<unsigned char>(text[at]) & 0xf8) == 0xf0 ? 2 : 1;
  }
  return units;
}

size_t byteOffset(const std::string& text, size_t units) {
  size_t at = 0;
  size_t consumed = 0;
  while (at < text.size()) {
    const size_t width = (static_cast<unsigned char>(text[at]) & 0xf8) == 0xf0 ? 2 : 1;
    if (consumed + width > units) break;
    consumed += width;
    at = nextCharacter(text, at);
  }
  return at;
}

}  // namespace

View::PaintedShift View::paintedShiftOf(int id) const {
  const auto shift = paintedShifts_.find(id);
  return shift != paintedShifts_.end() ? shift->second : PaintedShift{};
}

int View::hitTest(float x, float y) const {
  // Children over parents, later siblings over earlier, stacked layers over
  // the page. passThrough inherits: a pass-through box lets its loose
  // content through too, while a box inside it takes the pointer back.
  std::function<int(int)> searchContext;
  std::function<int(int, bool)> search = [&](int id, bool parentPasses) -> int {
    const Node* found = node(id);
    if (found == nullptr || flag(*found, "__hidden")) return 0;
    const auto placed = places_.find(id);
    if (placed == places_.end()) return 0;
    const Place& place = *placed->second;
    const PaintedShift painted = paintedShiftOf(id);
    const bool inClip =
        place.clip.contains(x - painted.clipDx, y - painted.clipDy);
    if (place.clipped && !inClip) {
      // Clipped away; a box can still stand out of its parent's clip? No:
      // an overflow clip hides its descendants' pointer area as well.
      return 0;
    }
    const bool isBoxLike = found->type == kBox || found->type == kScroll ||
                           found->type == kLayer || found->type == kField;
    const bool passes = isBoxLike ? flag(*found, "passThrough") : parentPasses;
    const auto children = found->type == kText && !holdsBlocks(id)
                              ? place.atomNodes
                              : placedChildren(id);
    for (auto child = children.rbegin(); child != children.rend(); ++child) {
      const Node* item = node(*child);
      const bool stacked = item != nullptr && item->type == kLayer &&
                           tokens_.stacking(textProp(*item, "stacking")) > 0;
      if (stacked || (item != nullptr && isSticky(*item))) continue;
      if (item != nullptr && isStackingContext(*item)) {
        if (const int hit = searchContext(*child)) return hit;
        continue;
      }
      if (const int hit = search(*child, passes)) return hit;
    }
    if (passes || found->type == kLayer) return 0;
    UiRect area = place.rect;
    if (boxHasPress(*found)) {
      const float slop = std::max(0.0f, number(*found, "hitSlop", 0));
      area = UiRect{area.x - slop, area.y - slop, area.width + 2 * slop,
                    area.height + 2 * slop};
    }
    if (!area.contains(x - painted.dx, y - painted.dy)) return 0;
    if (found->type == kTextLeaf) return found->parent;
    return id;
  };
  searchContext = [&](int id) -> int {
    const auto sticky = stickyChildren(id);
    for (auto child = sticky.rbegin(); child != sticky.rend(); ++child) {
      if (const int hit = searchContext(*child)) return hit;
    }
    return search(id, false);
  };
  std::vector<std::pair<int, int>> stacked;
  for (const int layer : layers()) {
    const int level = tokens_.stacking(textProp(*node(layer), "stacking"));
    if (level > 0) stacked.emplace_back(level, layer);
  }
  std::stable_sort(stacked.begin(), stacked.end(),
                   [](const auto& a, const auto& b) { return a.first < b.first; });
  for (auto layer = stacked.rbegin(); layer != stacked.rend(); ++layer) {
    if (const int hit = searchContext(layer->second)) return hit;
  }
  const auto sticky = stickyChildren(0);
  for (auto child = sticky.rbegin(); child != sticky.rend(); ++child) {
    if (const int hit = searchContext(*child)) return hit;
  }
  const auto& roots = tree_.roots();
  for (auto root = roots.rbegin(); root != roots.rend(); ++root) {
    if (isLayer(*root) || isSticky(*node(*root))) continue;
    if (const int hit = searchContext(*root)) return hit;
  }
  return 0;
}

void View::updateHover(int target) {
  std::vector<int> placedChain;
  for (int current = target; current > 0; current = placedParent(current)) {
    placedChain.push_back(current);
  }
  std::vector<int> reactChain;
  for (int current = target; current > 0;) {
    reactChain.push_back(current);
    const Node* found = node(current);
    current = found == nullptr ? 0 : found->parent;
  }
  if (placedChain != hoverChain_) paintDirty_ = true;
  hoverChain_ = placedChain;
  hovered_ = target;
  const std::vector<int> before = reactHoverChain_;
  reactHoverChain_ = reactChain;
  const auto interactive = [this](int id) {
    const Node* found = node(id);
    return found != nullptr && !flag(*found, "disabled") &&
           !flag(*found, "passThrough");
  };
  for (const int left : before) {
    if (std::find(reactChain.begin(), reactChain.end(), left) != reactChain.end()) {
      continue;
    }
    const Node* found = node(left);
    if (found != nullptr && flag(*found, "onHoverChange") && interactive(left)) {
      call(left, "onHoverChange", Json::array({false}));
    }
  }
  for (auto entered = reactChain.rbegin(); entered != reactChain.rend();
       ++entered) {
    if (std::find(before.begin(), before.end(), *entered) != before.end()) {
      continue;
    }
    const Node* found = node(*entered);
    if (found != nullptr && flag(*found, "onHoverChange") &&
        interactive(*entered)) {
      call(*entered, "onHoverChange", Json::array({true}));
    }
  }
}

void View::setFocus(int id, bool visible) {
  const int before = focused_;
  if (before == id) {
    if (focusVisible_ != visible) paintDirty_ = true;
    focusVisible_ = visible;
    return;
  }
  focused_ = id;
  focusVisible_ = visible;
  paintDirty_ = true;
  if (before != 0) {
    live_[before].held = false;
    const Node* old = node(before);
    if (old != nullptr && flag(*old, "onHoldChange")) {
      call(before, "onHoldChange", Json::array({false, false}));
    }
    if (old != nullptr && flag(*old, "onFocusChange")) {
      call(before, "onFocusChange", Json::array({false}));
    }
  }
  if (id != 0) {
    Live& live = live_[id];
    const Node* fresh = node(id);
    if (fresh != nullptr && fresh->type == kField) {
      live.caret = textProp(*fresh, "value").size();
      live.selectionStart = std::string::npos;
      live.editSequence = live.acknowledgedEdit = 0;
    }
    caretMovedMs_ = nowMs_;
    if (fresh != nullptr && flag(*fresh, "onFocusChange")) {
      call(id, "onFocusChange", Json::array({true}));
    }
    if (inputMode_ == "gamepad" && isNavigable(id)) {
      call(0, "__feedback", Json::array({"move"}));
    }
  }
  call(0, "__focus", Json::array({id}));
}

int View::scrollTarget(int from, float dx, float dy) const {
  for (int current = from; current > 0; current = placedParent(current)) {
    const Node* found = node(current);
    if (found == nullptr || found->type != kScroll) continue;
    const auto placed = places_.find(current);
    if (placed == places_.end()) continue;
    const Place& place = *placed->second;
    const Live& live = live_[current];
    const std::string axis = textProp(*found, "axis");
    const bool vertical = axis != "horizontal";
    const bool horizontal = axis == "horizontal" || axis == "both";
    const UiRect own = inOwnPixels(place.rect, place.scale);
    const float maxY = place.contentHeight - own.height;
    const float maxX = place.contentWidth - own.width;
    const bool canY = vertical && ((dy > 0 && live.scrollY < maxY - 0.5f) ||
                                   (dy < 0 && live.scrollY > 0.5f));
    const bool canX = horizontal && ((dx > 0 && live.scrollX < maxX - 0.5f) ||
                                     (dx < 0 && live.scrollX > 0.5f));
    if (canX || canY) return current;
  }
  return 0;
}

void View::scrollTo(int id, float x, float y, bool notify) {
  const Node* found = node(id);
  if (found == nullptr) return;
  const std::string axis = textProp(*found, "axis");
  if (axis == "horizontal") y = 0;
  if (axis != "horizontal" && axis != "both") x = 0;
  Live& live = live_[id];
  const auto placed = places_.find(id);
  if (placed != places_.end()) {
    const Place& place = *placed->second;
    const UiRect own = inOwnPixels(place.rect, place.scale);
    x = std::clamp(x, 0.0f, std::max(0.0f, place.contentWidth - own.width));
    y = std::clamp(y, 0.0f, std::max(0.0f, place.contentHeight - own.height));
  }
  if (x == live.scrollX && y == live.scrollY) return;
  live.scrollX = x;
  live.scrollY = y;
  layoutDirty_ = true;
  if (notify && flag(*found, "onScroll")) {
    call(id, "onScroll", Json::array({Json{{"x", x}, {"y", y}}}));
  }
}

void View::coastScroll(double elapsedMs) {
  if (coast_.node == 0) return;
  // Resuming after a suspended display must not jump down a page.
  if (elapsedMs > 100 || node(coast_.node) == nullptr) {
    coast_ = ScrollCoast{};
    return;
  }
  if (elapsedMs <= 0) return;
  ensureLayout();
  constexpr float decayPerMs = 0.005f;
  const float decay = std::exp(-decayPerMs * elapsedMs);
  const float travel = (1 - decay) / decayPerMs;
  const float beforeX = live_[coast_.node].scrollX;
  const float beforeY = live_[coast_.node].scrollY;
  scrollTo(coast_.node, beforeX + coast_.velocityX * travel,
           beforeY + coast_.velocityY * travel, true);
  const Live& after = live_[coast_.node];
  coast_.velocityX = after.scrollX == beforeX ? 0 : coast_.velocityX * decay;
  coast_.velocityY = after.scrollY == beforeY ? 0 : coast_.velocityY * decay;
  if (std::hypot(coast_.velocityX, coast_.velocityY) < 0.02f) {
    coast_ = ScrollCoast{};
  }
}

struct View::Scrollbar {
  UiRect rect;
  float buttonSize = 0;
  float thumbStart = 0;
  float thumbLength = 0;
  float thumbTravel = 0;
  float scrollRange = 0;
  float viewportLength = 0;
};

View::Scrollbar View::scrollbar(int id, bool horizontal) const {
  const Node* found = node(id);
  const auto placed = places_.find(id);
  if (found == nullptr || placed == places_.end()) return {};
  const Place& place = *placed->second;
  const bool visible = horizontal ? place.barHorizontal : place.barVertical;
  if (!visible) return {};
  const float breadth = tokens_.effects().scrollbar;
  const UiRect rect = inOwnPixels(place.rect, place.scale);
  Scrollbar bar;
  bar.buttonSize = breadth;
  bar.rect = horizontal
      ? UiRect{rect.x, rect.y + rect.height - breadth,
               rect.width - (place.barVertical ? breadth : 0), breadth}
      : UiRect{rect.x + rect.width - breadth, rect.y, breadth,
               rect.height - (place.barHorizontal ? breadth : 0)};
  bar.viewportLength = horizontal ? rect.width : rect.height;
  const float content = horizontal ? place.contentWidth : place.contentHeight;
  bar.scrollRange = std::max(0.0f, content - bar.viewportLength);
  const float length = horizontal ? bar.rect.width : bar.rect.height;
  const float track = std::max(0.0f, length - 2 * breadth);
  if (bar.scrollRange == 0 || track == 0) return bar;
  bar.thumbLength = std::min(track, std::max(24.0f,
      track * bar.viewportLength / content));
  bar.thumbTravel = track - bar.thumbLength;
  const Live& live = live_[id];
  const float offset = horizontal ? live.scrollX : live.scrollY;
  const float start = horizontal ? bar.rect.x : bar.rect.y;
  bar.thumbStart = start + breadth + bar.thumbTravel * offset / bar.scrollRange;
  return bar;
}

bool View::beginScrollbar(int from, float x, float y) {
  for (int id = from; id > 0; id = placedParent(id)) {
    const Node* found = node(id);
    if (found == nullptr || found->type != kScroll) continue;
    for (const bool horizontal : {false, true}) {
      const Scrollbar bar = scrollbar(id, horizontal);
      const float scale = scaleOf(id);
      if (!bar.rect.contains(x / scale, y / scale)) continue;
      press_ = Press{};
      press_.scroll = id;
      press_.scrollHorizontal = horizontal;
      press_.startX = x;
      press_.startY = y;
      press_.scrollStartX = live_[id].scrollX;
      press_.scrollStartY = live_[id].scrollY;
      const float point = (horizontal ? x : y) / scale;
      const float start = horizontal ? bar.rect.x : bar.rect.y;
      const float length = horizontal ? bar.rect.width : bar.rect.height;
      if (point < start + bar.buttonSize) press_.scrollPart = "decrement";
      else if (point >= start + length - bar.buttonSize) {
        press_.scrollPart = "increment";
      } else if (point >= bar.thumbStart &&
                 point < bar.thumbStart + bar.thumbLength) {
        press_.scrollPart = "thumb";
      } else press_.scrollPart = "track";
      repeatScrollbar();
      press_.scrollRepeatMs = nowMs_ + 400;
      paintDirty_ = true;
      return true;
    }
  }
  return false;
}

void View::moveScrollbar(float x, float y) {
  paintDirty_ = true;
  if (press_.scrollPart != "thumb") return;
  const bool horizontal = press_.scrollHorizontal;
  const Scrollbar bar = scrollbar(press_.scroll, horizontal);
  if (bar.thumbTravel <= 0) return;
  const float delta = (horizontal ? x - press_.startX : y - press_.startY) /
                      scaleOf(press_.scroll);
  const float travel = delta * bar.scrollRange / bar.thumbTravel;
  const float nextX = press_.scrollStartX + (horizontal ? travel : 0);
  const float nextY = press_.scrollStartY + (horizontal ? 0 : travel);
  scrollTo(press_.scroll, nextX, nextY, true);
}

void View::repeatScrollbar() {
  if (press_.scrollPart.empty() || press_.scrollPart == "thumb") return;
  if (nowMs_ < press_.scrollRepeatMs) return;
  press_.scrollRepeatMs = nowMs_ + 50;
  ensureLayout();
  const bool horizontal = press_.scrollHorizontal;
  const Scrollbar bar = scrollbar(press_.scroll, horizontal);
  const float scale = scaleOf(press_.scroll);
  const float pointX = pointerX_ / scale;
  const float pointY = pointerY_ / scale;
  if (!bar.rect.contains(pointX, pointY) || bar.scrollRange == 0) return;
  const float point = horizontal ? pointX : pointY;
  const float start = horizontal ? bar.rect.x : bar.rect.y;
  const float length = horizontal ? bar.rect.width : bar.rect.height;
  float travel = 0;
  if (press_.scrollPart == "decrement" && point < start + bar.buttonSize) {
    travel = -40;
  } else if (press_.scrollPart == "increment" &&
             point >= start + length - bar.buttonSize) {
    travel = 40;
  } else if (press_.scrollPart == "track") {
    if (point < bar.thumbStart) travel = -bar.viewportLength * 0.9f;
    else if (point >= bar.thumbStart + bar.thumbLength) {
      travel = bar.viewportLength * 0.9f;
    }
  }
  const Live& live = live_[press_.scroll];
  scrollTo(press_.scroll, live.scrollX + (horizontal ? travel : 0),
           live.scrollY + (horizontal ? 0 : travel), true);
}

void View::pointer(const PointerEvent& event) {
  ensureLayout();
  const float x = event.x / uiScale_;
  const float y = event.y / uiScale_;
  const Json surface = Json{{"x", event.x},           {"y", event.y},
                            {"button", event.button}, {"shift", event.shift},
                            {"touch", event.touch}};
  const auto overSurface = [&](int target) {
    return surface_ != 0 && target != 0 && contains(surface_, target);
  };

  if (event.touch) {
    const bool begins = event.kind == PointerEvent::Kind::Down;
    const bool ends = event.kind == PointerEvent::Kind::Up ||
                      event.kind == PointerEvent::Kind::Cancel;
    const bool onSurface = surfaceTouches_.contains(event.id) ||
                      (begins && overSurface(hitTest(x, y)));
    if (onSurface) {
      if (ends) surfaceTouches_.erase(event.id);
      else surfaceTouches_[event.id] = event;
      Json touches = Json::array();
      for (const auto& [id, point] : surfaceTouches_) {
        touches.push_back({{"identifier", id}, {"clientX", point.x},
                           {"clientY", point.y}});
      }
      const char* kind = begins ? "touchStart" : ends ? "touchEnd" : "touchMove";
      if (event.kind == PointerEvent::Kind::Cancel) {
        kind = "touchCancel";
        surfaceTouches_.clear();
      }
      if (begins) {
        setFocus(0, false);
        call(0, "__pointerDown", Json::array({Json::array({surface_}), "touch"}));
      }
      call(0, "__surface", Json::array({kind, {{"touches", touches},
                                               {"timeStamp", nowMs_}}}));
      call(0, "__presence", Json::array({"touch"}));
      return;
    }
    // A control owns one finger until release; another cannot steal its drag.
    if (begins && !uiTouch_) uiTouch_ = event.id;
    if (!uiTouch_ || *uiTouch_ != event.id) return;
    if (ends) uiTouch_.reset();
  }

  // The side buttons point at nothing; they are keys the player may bind.
  const bool pressOrRelease = event.kind == PointerEvent::Kind::Down ||
                              event.kind == PointerEvent::Kind::Up;
  if (event.button >= 3 && pressOrRelease) {
    KeyEvent side;
    side.key = "Mouse" + std::to_string(event.button + 1);
    side.code = side.key;
    side.down = event.kind == PointerEvent::Kind::Down;
    side.shift = event.shift;
    deliverKey(side);
    return;
  }

  if (event.kind == PointerEvent::Kind::Wheel) {
    call(0, "__presence", Json::array({"mouse"}));
    coast_ = ScrollCoast{};
    const int target = hitTest(x, y);
    const int scroll = scrollTarget(target, event.deltaX, event.deltaY);
    if (scroll != 0) {
      const Live& live = live_[scroll];
      const float perPixel = uiScale_ * scaleOf(scroll);
      scrollTo(scroll, live.scrollX + event.deltaX / perPixel,
               live.scrollY + event.deltaY / perPixel, true);
      return;
    }
    if (overSurface(target)) {
      call(0, "__surface",
           Json::array({"wheel", Json{{"deltaY", event.deltaY}}}));
    }
    return;
  }

  if (event.kind == PointerEvent::Kind::Leave) {
    updateHover(0);
    if (surface_ != 0) call(0, "__surface", Json::array({"leave", surface}));
    return;
  }

  pointerX_ = x;
  pointerY_ = y;
  call(0, "__cursor", Json::array({Json{{"x", x}, {"y", y}}}));

  if (event.kind == PointerEvent::Kind::Move) {
    if (!press_.scrollPart.empty()) {
      moveScrollbar(x, y);
      return;
    }
    if (press_.scroll != 0) {
      const float scale = scaleOf(press_.scroll);
      scrollTo(press_.scroll, press_.scrollStartX - (x - press_.startX) / scale,
               press_.scrollStartY - (y - press_.startY) / scale, true);
      const double elapsedMs = nowMs_ - press_.scrollSampleMs;
      if (elapsedMs > 0) {
        const Live& live = live_[press_.scroll];
        press_.velocityX = std::clamp(
            static_cast<float>((live.scrollX - press_.scrollSampleX) / elapsedMs),
            -4.0f, 4.0f);
        press_.velocityY = std::clamp(
            static_cast<float>((live.scrollY - press_.scrollSampleY) / elapsedMs),
            -4.0f, 4.0f);
        press_.scrollSampleX = live.scrollX;
        press_.scrollSampleY = live.scrollY;
        press_.scrollSampleMs = nowMs_;
      }
    }
    if (press_.node != 0 || press_.drag != 0 || press_.scroll != 0) {
      const float travelX = x - press_.startX;
      const float travelY = y - press_.startY;
      if (std::hypot(travelX, travelY) > kDragSlop) press_.moved = true;
      if (press_.drag != 0) {
        const float scale = scaleOf(press_.drag);
        call(press_.drag, "onDrag",
             Json::array({Json{{"phase", "move"},
                               {"x", travelX / scale},
                               {"y", travelY / scale},
                               {"touch", press_.touch}}}));
      }
      // A slider follows its thumb.
      const Node* pressed = node(press_.node);
      if (pressed != nullptr && pressed->type == kField &&
          textProp(*pressed, "kind") == "range") {
        const float scale = scaleOf(press_.node);
        const UiRect rect = inOwnPixels(places_.at(press_.node)->rect, scale);
        const float thumbX = (x - paintedShiftOf(press_.node).dx) / scale;
        const float minimum = number(*pressed, "min", 0);
        const float maximum = number(*pressed, "max", 100);
        const float step = std::max(1e-6f, number(*pressed, "step", 1));
        const float share = std::clamp((thumbX - rect.x - 30) / std::max(1.0f, rect.width - 60), 0.0f, 1.0f);
        const float value =
            minimum + std::round(share * (maximum - minimum) / step) * step;
        char buffer[32];
        std::snprintf(buffer, sizeof buffer, "%g", value);
        setControlValue(press_.node, buffer);
      }
    }
    const int target = hitTest(x, y);
    updateHover(target);
    // onHoverMove for each box in React's chain that listens, in its pixels.
    for (const int listener : reactHoverChain_) {
      const Node* found = node(listener);
      if (found == nullptr || !flag(*found, "onHoverMove")) continue;
      if (flag(*found, "disabled") || flag(*found, "passThrough")) continue;
      const auto placed = places_.find(listener);
      if (placed == places_.end()) continue;
      const PaintedShift painted = paintedShiftOf(listener);
      const UiRect& rect = placed->second->rect;
      const float scale = placed->second->scale;
      call(listener, "onHoverMove",
           Json::array({Json{{"x", (x - painted.dx - rect.x) / scale},
                             {"y", (y - painted.dy - rect.y) / scale}}}));
    }
    const bool overCity = overSurface(target);
    if (overCity || press_.node == 0) {
      call(0, "__surface",
           Json::array({overCity ? "move" : "leave", surface}));
    }
    const bool moved = std::hypot(x - presenceX_, y - presenceY_) >= 3;
    if (event.touch || moved) {
      presenceX_ = x;
      presenceY_ = y;
      call(0, "__presence", Json::array({event.touch ? "touch" : "mouse"}));
    }
    return;
  }

  if (event.kind == PointerEvent::Kind::Down) {
    call(0, "__presence", Json::array({event.touch ? "touch" : "mouse"}));
    coast_ = ScrollCoast{};
    keyboardLast_ = false;
    const int target = hitTest(x, y);
    updateHover(target);
    std::vector<int> chain;
    for (int current = target; current > 0; current = placedParent(current)) {
      chain.push_back(current);
    }
    call(0, "__pointerDown",
         Json::array({chain, event.touch ? "touch" : "mouse"}));
    if (overSurface(target)) call(0, "__surface", Json::array({"down", surface}));

    // Focus goes to the nearest focusable box under the press, or nowhere:
    // a click on bare ground blurs what had it.
    int focusTarget = 0;
    for (int current = target; current > 0; current = placedParent(current)) {
      if (canFocus(current)) {
        focusTarget = current;
        break;
      }
    }
    if (event.button != 0) return;
    if (!event.touch && beginScrollbar(target, x, y)) return;
    press_ = Press{};
    press_.startX = x;
    press_.startY = y;
    press_.touch = event.touch;
    // The innermost box that presses owns the press; the nearest that drags
    // hears its travel.
    for (int current = target; current > 0;) {
      const Node* found = node(current);
      if (found == nullptr) break;
      const bool interactive =
          !flag(*found, "disabled") && !flag(*found, "passThrough");
      if (press_.node == 0 && found->type == kBox && boxHasPress(*found)) {
        if (interactive) press_.node = current;
        else break;
      }
      if (press_.drag == 0 && flag(*found, "onDrag") && interactive) {
        press_.drag = current;
      }
      if (found->type == kField && press_.node == 0) {
        if (!interactive || flag(*found, "readOnly")) break;
        press_.node = current;
      }
      current = found->parent;
    }
    if (event.touch) {
      for (int current = target; current > 0; current = placedParent(current)) {
        const Node* found = node(current);
        if (found != nullptr && found->type == kScroll) {
          press_.scroll = current;
          press_.scrollStartX = live_[current].scrollX;
          press_.scrollStartY = live_[current].scrollY;
          press_.scrollSampleX = press_.scrollStartX;
          press_.scrollSampleY = press_.scrollStartY;
          press_.scrollSampleMs = nowMs_;
          break;
        }
      }
    }
    const Node* fieldNode = node(focusTarget);
    const bool textField = fieldNode != nullptr && fieldNode->type == kField &&
                           textProp(*fieldNode, "kind") != "range";
    // A text field shows its ring on a click: typing goes where the ring is.
    if (focusTarget != 0) {
      setFocus(focusTarget, textField);
    } else if (focused_ != 0) {
      setFocus(0, false);
    }
    if (press_.node != 0) {
      const Node* pressed = node(press_.node);
      if (pressed != nullptr && pressed->type == kBox) {
        live_[press_.node].held = true;
        paintDirty_ = true;
        if (flag(*pressed, "onHoldChange")) {
          call(press_.node, "onHoldChange", Json::array({true, false}));
        }
      }
      if (pressed != nullptr && pressed->type == kField &&
          textProp(*pressed, "kind") == "range") {
        PointerEvent move = event;
        move.kind = PointerEvent::Kind::Move;
        pointer(move);
      }
    }
    return;
  }

  if (event.kind == PointerEvent::Kind::Up ||
      event.kind == PointerEvent::Kind::Cancel) {
    const bool cancelled = event.kind == PointerEvent::Kind::Cancel;
    const Press pressed = press_;
    press_ = Press{};
    const bool recentScroll = nowMs_ - pressed.scrollSampleMs < 80;
    if (!pressed.scrollPart.empty()) paintDirty_ = true;
    if (!cancelled && pressed.touch && pressed.scroll != 0 &&
        pressed.moved && recentScroll) {
      coast_ = {pressed.scroll, pressed.velocityX, pressed.velocityY};
    }
    if (pressed.drag != 0) {
      const float scale = scaleOf(pressed.drag);
      call(pressed.drag, "onDrag",
           Json::array({Json{{"phase", "end"},
                             {"x", (x - pressed.startX) / scale},
                             {"y", (y - pressed.startY) / scale},
                             {"touch", pressed.touch}}}));
    }
    const Node* found = node(pressed.node);
    if (found != nullptr && found->type == kBox) {
      live_[pressed.node].held = false;
      paintDirty_ = true;
      const auto placed = places_.find(pressed.node);
      const float slop = std::max(0.0f, number(*found, "hitSlop", 0));
      bool inside = false;
      if (placed != places_.end()) {
        const UiRect& rect = placed->second->rect;
        // The box as painted: an animation or a pressed key's travel moves it.
        const PaintedShift painted = paintedShiftOf(pressed.node);
        const float atX = x - painted.dx;
        const float atY = y - painted.dy;
        inside = atX >= rect.x - slop && atX <= rect.x + rect.width + slop &&
                 atY >= rect.y - slop && atY <= rect.y + rect.height + slop;
      }
      const bool interactive =
          !flag(*found, "disabled") && !flag(*found, "passThrough");
      const bool released =
          !cancelled && interactive && inside && !pressed.moved;
      if (flag(*found, "onHoldChange")) {
        call(pressed.node, "onHoldChange", Json::array({false, released}));
      }
      if (released) {
        const std::string feedback = textProp(*found, "feedback");
        if (!feedback.empty() && feedback != "none") {
          call(0, "__feedback", Json::array({feedback}));
        }
        callPress(pressed.node, *found, pressed.touch);
      }
    }
    if (surface_ != 0) {
      const bool overCity = overSurface(hitTest(x, y));
      if (overCity) call(0, "__surface", Json::array({"up", surface}));
      call(0, "__surface", Json::array({"upAnywhere", surface}));
    }
    updateHover(hitTest(x, y));
  }
}

bool View::dispatchKeyChain(int from, const KeyEvent& event) {
  const Json key = keyJson(event);
  // React's bubbling: the focused node, then its React ancestors.
  for (int current = from; current > 0;) {
    const Node* found = node(current);
    if (found == nullptr) break;
    const bool interactive =
        !flag(*found, "disabled") && !flag(*found, "passThrough");
    if (flag(*found, "onKey") && (interactive || found->type == kField)) {
      if (truthy(call(current, "onKey", Json::array({key})))) return true;
    }
    if (current == from && found->type == kBox && interactive &&
        boxHasPress(*found)) {
      const bool enter = event.key == "Enter";
      const bool space = event.key == " ";
      if (enter || space) {
        Live& live = live_[current];
        if (event.down && !event.repeat) {
          if (!live.held && flag(*found, "onHoldChange")) {
            call(current, "onHoldChange", Json::array({true, false}));
          }
          if (enter) {
            callPress(current, *found, false);
          } else {
            keyboardPress_ = true;
            live.held = true;
            paintDirty_ = true;
          }
        } else if (!event.down) {
          const bool held = keyboardPress_;
          keyboardPress_ = false;
          live.held = false;
          paintDirty_ = true;
          if (flag(*found, "onHoldChange")) {
            call(current, "onHoldChange", Json::array({false, true}));
          }
          if (space && held) callPress(current, *found, false);
        }
        return true;
      }
    }
    current = found->parent;
  }
  return false;
}

void View::editField(int id, const KeyEvent& event) {
  const Node* found = node(id);
  if (found == nullptr || !event.down) return;
  if (flag(*found, "disabled") || flag(*found, "readOnly")) return;
  const std::string kind = textProp(*found, "kind");
  std::string value = textProp(*found, "value");
  Live& live = live_[id];
  size_t caret = std::min(live.caret, value.size());
  const auto changed = [&](const std::string& next, size_t at) {
    live.caret = at;
    live.typedValue = next;
    caretMovedMs_ = nowMs_;
    paintDirty_ = true;
    if (flag(*found, "onChange")) call(id, "onChange", Json::array({next}));
  };
  if (kind == "range") {
    const float minimum = number(*found, "min", 0);
    const float maximum = number(*found, "max", 100);
    const float step = std::max(1e-6f, number(*found, "step", 1));
    const float current = std::strtof(value.c_str(), nullptr);
    float next = current;
    if (event.key == "ArrowRight" || event.key == "ArrowUp") next += step;
    if (event.key == "ArrowLeft" || event.key == "ArrowDown") next -= step;
    if (event.key == "Home") next = minimum;
    if (event.key == "End") next = maximum;
    next = std::clamp(next, minimum, maximum);
    if (next != current) {
      char buffer[32];
      std::snprintf(buffer, sizeof buffer, "%g", next);
      changed(buffer, 0);
    }
    return;
  }
  if (selectAll_ &&
      (event.key == "Backspace" || event.key == "Delete")) {
    selectAll_ = false;
    changed("", 0);
    return;
  }
  if (event.key == "Backspace" && caret > 0) {
    const size_t from = previousCharacter(value, caret);
    changed(value.erase(from, caret - from), from);
  } else if (event.key == "Delete" && caret < value.size()) {
    const size_t to = nextCharacter(value, caret);
    changed(value.erase(caret, to - caret), caret);
  } else if (event.key == "ArrowLeft") {
    live.caret = previousCharacter(value, caret);
    caretMovedMs_ = nowMs_;
    paintDirty_ = true;
  } else if (event.key == "ArrowRight") {
    live.caret = nextCharacter(value, caret);
    caretMovedMs_ = nowMs_;
    paintDirty_ = true;
  } else if (event.key == "Home") {
    live.caret = 0;
    paintDirty_ = true;
  } else if (event.key == "End") {
    live.caret = value.size();
    paintDirty_ = true;
  } else if (event.key == "Enter") {
    if (kind == "multiline") {
      changed(value.insert(caret, "\n"), caret + 1);
    } else if (flag(*found, "onSubmit")) {
      call(id, "onSubmit", Json::array({value}));
    }
  }
  if (event.key != "Shift" && event.key != "Meta" && event.key != "Control" &&
      event.key != "Alt") {
    selectAll_ = false;
  }
}

void View::key(const KeyEvent& event) {
  keyboardLast_ = true;
  deliverKey(event);
}

void View::deliverKey(KeyEvent event) {
  const Node* focusedNode = node(focused_);
  const bool typing = focusedNode != nullptr && focusedNode->type == kField;
  // In a field the cancel key may be a letter being typed; a mouse button is
  // not.
  const bool isCancelKey = !cancelCode_.empty() && event.code == cancelCode_;
  const bool typesText = typing && !event.code.starts_with("Mouse");
  if (isCancelKey && !typesText) {
    event.key = "Escape";
    event.code = "Escape";
  }
  const Json key = keyJson(event);
  // A held key is heard everywhere, consumed or not.
  call(0, "__keyHold", Json::array({key}));
  if (truthy(call(0, "__captureKeys", Json::array({key})))) return;
  if (focused_ != 0 && dispatchKeyChain(focused_, event)) return;
  // A field edits with the keys that are not characters; the characters
  // arrive as typed text.
  if (typing && (event.key.size() > 1 || event.key == "Enter")) {
    editField(focused_, event);
  }
  // Every key leaves the UI for the game's shortcuts, which skip what a
  // field types (`typing`).
  call(0, "__observeKeys", Json::array({key, typing}));
}

void View::typed(const std::string& entered) {
  const Node* found = node(focused_);
  if (found == nullptr || found->type != kField) return;
  if (flag(*found, "disabled") || flag(*found, "readOnly")) return;
  const std::string kind = textProp(*found, "kind");
  if (kind == "range") return;
  std::string accepted;
  for (const char character : entered) {
    const bool newline = character == '\n' || character == '\r';
    if (newline && kind != "multiline") continue;
    if (kind == "number" && !(std::isdigit(static_cast<unsigned char>(character)) ||
                              character == '-' || character == '.')) {
      continue;
    }
    accepted.push_back(character);
  }
  if (accepted.empty()) return;
  std::string value = selectAll_ ? std::string() : textProp(*found, "value");
  Live& live = live_[focused_];
  size_t caret = selectAll_ ? 0 : std::min(live.caret, value.size());
  selectAll_ = false;
  value.insert(caret, accepted);
  caret += accepted.size();
  const float maxLength = number(*found, "maxLength", -1);
  if (maxLength >= 0 && value.size() > static_cast<size_t>(maxLength)) {
    value.resize(static_cast<size_t>(maxLength));
    caret = std::min(caret, value.size());
  }
  live.caret = caret;
  live.typedValue = value;
  caretMovedMs_ = nowMs_;
  paintDirty_ = true;
  if (flag(*found, "onChange")) call(focused_, "onChange", Json::array({value}));
}

Json View::textInput() {
  const Node* found = node(focused_);
  const bool editable = found != nullptr && found->type == kField &&
                        textProp(*found, "kind") != "range" &&
                        !flag(*found, "disabled") && !flag(*found, "readOnly");
  if (!editable) return {{"focused", 0}};
  ensureLayout();
  const std::string value = textProp(*found, "value");
  Live& live = live_[focused_];
  const bool committedEdit = live.editedValue == value;
  // A field that filters what is typed answers with other text, and the
  // hidden input must take it, or it keeps what the field refused.
  const bool committedOtherText = value != live.valueAtEdit &&
                                  value != live.previousEditedValue;
  if (committedEdit || committedOtherText) live.acknowledgedEdit = live.editSequence;
  const size_t end = selectAll_ ? value.size() : std::min(live.caret, value.size());
  const size_t start = selectAll_ ? 0 : std::min(live.selectionStart, end);
  const auto measured = measure(focused_).value_or(UiRect{});
  return {{"focused", focused_}, {"value", value},
          {"sequence", live.acknowledgedEdit},
          {"selectionStart", utf16Offset(value, start)},
          {"selectionEnd", utf16Offset(value, end)},
          {"multiline", textProp(*found, "kind") == "multiline"},
          {"number", textProp(*found, "kind") == "number"},
          {"rect", {{"x", measured.x * uiScale_},
                    {"y", measured.y * uiScale_},
                    {"width", measured.width * uiScale_},
                    {"height", measured.height * uiScale_}}}};
}

void View::editText(const Json& edit) {
  const Node* found = node(focused_);
  if (found == nullptr || found->type != kField || !edit.is_object()) return;
  if (flag(*found, "disabled") || flag(*found, "readOnly")) return;
  const std::string kind = textProp(*found, "kind");
  if (kind == "range") return;
  std::string value = edit.value("value", textProp(*found, "value"));
  if (kind != "multiline") {
    std::erase(value, '\n');
    std::erase(value, '\r');
  }
  const float maximum = number(*found, "maxLength", -1);
  if (maximum >= 0) value.resize(byteOffset(value, static_cast<size_t>(maximum)));
  const size_t units = utf16Offset(value, value.size());
  const size_t start = edit.value("selectionStart", units);
  const size_t end = edit.value("selectionEnd", start);
  Live& live = live_[focused_];
  live.editSequence = edit.value("sequence", live.editSequence);
  live.valueAtEdit = textProp(*found, "value");
  live.previousEditedValue = live.editedValue;
  live.editedValue = value;
  live.typedValue = value;
  live.selectionStart = byteOffset(value, std::min(start, end));
  live.caret = byteOffset(value, std::max(start, end));
  selectAll_ = false;
  caretMovedMs_ = nowMs_;
  paintDirty_ = true;
  const int id = focused_;
  const bool changed = value != textProp(*found, "value") && flag(*found, "onChange");
  const bool submit = edit.value("submit", false) && flag(*found, "onSubmit");
  if (changed) call(id, "onChange", Json::array({value}));
  if (submit) call(id, "onSubmit", Json::array({value}));
}

void View::scrollBy(int id, float x, float y) {
  coast_ = ScrollCoast{};
  ensureLayout();
  const Live& live = live_[id];
  scrollTo(id, live.scrollX + x, live.scrollY + y, true);
}

void View::scrollIntoView(int id) {
  coast_ = ScrollCoast{};
  ensureLayout();
  const auto placed = places_.find(id);
  if (placed == places_.end()) return;
  const UiRect rect = placed->second->rect;
  for (int current = placedParent(id); current > 0; current = placedParent(current)) {
    const Node* found = node(current);
    if (found == nullptr || found->type != kScroll) continue;
    const auto scrollPlace = places_.find(current);
    if (scrollPlace == places_.end()) continue;
    // On the screen, then as far in the Scroll's own pixels.
    const UiRect view = scrollPlace->second->rect;
    const float scale = scrollPlace->second->scale;
    const Live& live = live_[current];
    float travelY = 0;
    float travelX = 0;
    // "nearest": the least travel that brings the box inside.
    if (rect.y < view.y) travelY -= view.y - rect.y;
    else if (rect.y + rect.height > view.y + view.height) {
      travelY += std::min(rect.y - view.y,
                          rect.y + rect.height - (view.y + view.height));
    }
    if (rect.x < view.x) travelX -= view.x - rect.x;
    else if (rect.x + rect.width > view.x + view.width) {
      travelX += std::min(rect.x - view.x,
                          rect.x + rect.width - (view.x + view.width));
    }
    scrollTo(current, live.scrollX + travelX / scale,
             live.scrollY + travelY / scale, true);
    ensureLayout();
    break;
  }
}

}  // namespace bureau
