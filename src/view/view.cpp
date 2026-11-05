// The view's tree: commits, the placement tree (a Layer placed in its
// target, the UI root by default), and what a node inherits from its
// ancestors: the chrome, the ink, the type, and a look's state.
#include <algorithm>

#include "view_internal.h"

namespace bureau {

UiRect intersect(const UiRect& a, const UiRect& b) {
  const float left = std::max(a.x, b.x);
  const float top = std::max(a.y, b.y);
  const float right = std::min(a.x + a.width, b.x + b.width);
  const float bottom = std::min(a.y + a.height, b.y + b.height);
  return UiRect{left, top, std::max(0.0f, right - left),
                std::max(0.0f, bottom - top)};
}

View::View(Reader read)
    : fonts_(read), typesetter_(fonts_, tokens_), images_(read) {}

View::~View() = default;

bool View::loadTokens(std::string_view json) {
  const bool loaded = tokens_.load(json);
  layoutDirty_ = true;
  return loaded;
}

void View::setLanguage(const std::string& language) {
  if (language == language_) return;
  language_ = language;
  layoutDirty_ = true;
}

void View::setViewport(float width, float height, float screenScale) {
  const bool rescaled = screenScale != screenScale_;
  windowWidth_ = width;
  windowHeight_ = height;
  screenScale_ = screenScale;
  if (rescaled) atlas_.clear();
  layoutDirty_ = true;
}

void View::setInsets(float top, float right, float bottom, float left,
                     float keyboardHeight) {
  insetTop_ = std::max(0.0f, top);
  insetRight_ = std::max(0.0f, right);
  insetBottom_ = std::max(0.0f, bottom);
  insetLeft_ = std::max(0.0f, left);
  keyboardHeight_ = std::max(0.0f, keyboardHeight);
  layoutDirty_ = true;
  if (focused_ != 0) scrollIntoView(focused_);
}

Json View::safeArea() const {
  return {{"top", insetTop_}, {"right", insetRight_},
          {"bottom", insetBottom_}, {"left", insetLeft_}};
}

void View::event(const Json& frame) {
  if (!frame.is_object() || !frame.contains("event") ||
      !frame["event"].is_string() || !frame.contains("data")) return;
  ensurePlacementTree();
  const auto name = frame["event"].get<std::string>();
  const Json& data = frame["data"];
  if (!boundEvents_.contains(name)) return;
  if (events_.contains(name) && events_.at(name) == data) return;
  events_[name] = data;
  layoutDirty_ = true;
}

void View::clearEvents() {
  if (!events_.empty()) layoutDirty_ = true;
  events_.clear();
}

void View::setAtlas(int size, int pageBudget) {
  atlas_ = Atlas(size);
  atlasPageFloor_ = std::max(1, pageBudget);
  atlasPageBudget_ = atlasPageFloor_;
  paintDirty_ = true;
}

void View::setMonochromeText(bool monochrome) {
  monochromeText_ = monochrome;
  atlas_.clear();
  paintDirty_ = true;
}

void View::setUiScale(float scale) {
  if (scale <= 0 || scale == uiScale_) return;
  uiScale_ = scale;
  // Glyphs are rasterized at the scaled size, never stretched.
  atlas_.clear();
  layoutDirty_ = true;
}

void View::setInputMode(const std::string& mode) {
  if (mode == "gamepad" && inputMode_ != mode) {
    presenceX_ = pointerX_;
    presenceY_ = pointerY_;
  }
  inputMode_ = mode;
  paintDirty_ = true;
}

void View::setGamepadConnected(bool connected) {
  gamepadConnected_ = connected;
  paintDirty_ = true;
}

bool View::commit(const int32_t* operations, size_t count,
                  const std::vector<std::string>& strings) {
  const Node* focusedBefore = node(focused_);
  const bool focusedField = focusedBefore != nullptr && focusedBefore->type == kField;
  const std::string valueBefore =
      focusedField ? textProp(*focusedBefore, "value") : std::string();
  const bool applied = tree_.apply(operations, count, strings);
  // The caret goes to the end when the program sets other text than was
  // typed, as a number field answers "" with "0".
  const Node* focusedAfter = node(focused_);
  if (focusedField && focusedAfter != nullptr && focusedAfter->type == kField) {
    const std::string valueAfter = textProp(*focusedAfter, "value");
    Live& live = live_[focused_];
    const bool replaced = valueAfter != valueBefore && valueAfter != live.typedValue;
    if (replaced) {
      live.caret = valueAfter.size();
      live.selectionStart = std::string::npos;
    }
  }
  layoutDirty_ = true;
  placementDirty_ = true;
  // Places and state outlive nothing they describe.
  for (auto it = live_.begin(); it != live_.end();) {
    it = tree_.node(it->first) == nullptr ? live_.erase(it) : std::next(it);
  }
  for (auto it = marks_.begin(); it != marks_.end();) {
    it = tree_.node(it->first) == nullptr ? marks_.erase(it) : std::next(it);
  }
  if (focused_ != 0 && !connected(focused_)) {
    focused_ = 0;
    call(0, "__focus", Json::array({0}));
  }
  return applied;
}

bool View::windowBusy() const {
  if (windowBusyRevision_ == tree_.revision()) return windowBusy_;
  windowBusyRevision_ = tree_.revision();
  windowBusy_ = true;
  bool declared = false;
  std::vector<int32_t> pending = tree_.roots();
  while (!pending.empty()) {
    const int32_t id = pending.back();
    pending.pop_back();
    const Node* found = node(id);
    if (found == nullptr) continue;
    const bool hidden = flag(*found, "hidden") || flag(*found, "__hidden");
    if (hidden) continue;
    const Json* busy = prop(*found, "windowBusy");
    if (busy != nullptr && busy->is_boolean()) {
      declared = true;
      if (busy->get<bool>()) return true;
    }
    pending.insert(pending.end(), found->children.begin(),
                   found->children.end());
  }
  windowBusy_ = !declared;
  return windowBusy_;
}

void View::setProjection(const std::array<double, 16>& matrix) {
  if (projection_ && *projection_ == matrix) return;
  projection_ = matrix;
  // A camera move re-lays the whole tree out, so with nothing anchored to
  // the world it costs a layout every frame for no change.
  if (worldAnchored_) layoutDirty_ = true;
}

void View::clear() {
  tree_.clear();
  projection_.reset();
  placementDirty_ = true;
  places_.clear();
  live_.clear();
  marks_.clear();
  placedLayers_.clear();
  focused_ = 0;
  hovered_ = 0;
  hoverChain_.clear();
  reactHoverChain_.clear();
  press_ = Press{};
  coast_ = ScrollCoast{};
  events_.clear();
  surfaceTouches_.clear();
  // A reloaded tree reuses ids; none still names the previous surface.
  surface_ = 0;
  uiTouch_.reset();
  layoutDirty_ = true;
}

Json View::call(int nodeId, std::string_view handler, const Json& args) {
  if (!dispatch_) return nullptr;
  return dispatch_(nodeId, handler, args);
}

bool View::isLayer(int id) const {
  const Node* found = node(id);
  return found != nullptr && found->type == kLayer;
}

void View::ensurePlacementTree() const {
  if (!placementDirty_) return;
  placementDirty_ = false;
  namedNodes_.clear();
  boundEvents_.clear();
  placedParents_.clear();
  placedChildren_.clear();
  layers_.clear();
  std::vector<int> pending(tree_.roots().rbegin(), tree_.roots().rend());
  while (!pending.empty()) {
    const int id = pending.back();
    pending.pop_back();
    const Node* item = node(id);
    if (item == nullptr) continue;
    const auto name = textProp(*item, "id");
    if (!name.empty()) namedNodes_.emplace(name, id);
    const auto* binding = prop(*item, "binding");
    if (binding != nullptr && binding->is_object()) {
      const auto field = binding->value("field", std::string());
      boundEvents_.insert(field.substr(0, field.find('.')));
    }
    placedParents_[id] = item->parent;
    if (item->type == kLayer) {
      if (!flag(*item, "__hidden")) layers_.push_back(id);
    } else {
      placedChildren_[item->parent].push_back(id);
    }
    pending.insert(pending.end(), item->children.rbegin(), item->children.rend());
  }
  std::sort(layers_.begin(), layers_.end(),
            [this](int a, int b) { return node(a)->serial < node(b)->serial; });
  for (const int id : layers_) {
    const auto target = textProp(*node(id), "rootId");
    const auto found = namedNodes_.find(target.empty() ? "ui-root" : target);
    placedParents_[id] = found == namedNodes_.end() ? 0 : found->second;
  }
  // A malformed layer target must not make paint or input walk in circles.
  for (const int id : layers_) {
    std::set<int> visited{id};
    int parent = placedParents_[id];
    for (int current = parent; current > 0; current = placedParents_[current]) {
      if (visited.insert(current).second) continue;
      parent = placedParents_[id] = 0;
      break;
    }
    placedChildren_[parent].push_back(id);
  }
  stickyContexts_.clear();
  std::function<void(int, int)> collectSticky = [&](int id, int context) {
    const Node* item = node(id);
    if (item == nullptr || flag(*item, "__hidden")) return;
    const bool stackedLayer = item->type == kLayer &&
        tokens_.stacking(textProp(*item, "stacking")) > 0;
    if (stackedLayer && id != context) return;
    if (isStackingContext(*item) && id != context) {
      if (isSticky(*item)) stickyContexts_[context].push_back(id);
      context = id;
    }
    const auto children = placedChildren_.find(id);
    if (children == placedChildren_.end()) return;
    for (const int child : children->second) collectSticky(child, context);
  };
  for (const int root : tree_.roots()) {
    if (!isLayer(root)) collectSticky(root, 0);
  }
  for (const int layer : layers_) {
    if (tokens_.stacking(textProp(*node(layer), "stacking")) > 0)
      collectSticky(layer, layer);
  }
}

std::vector<int> View::stickyChildren(int context) const {
  ensurePlacementTree();
  const auto found = stickyContexts_.find(context);
  return found == stickyContexts_.end() ? std::vector<int>{} : found->second;
}

int View::find(const std::string& id) const {
  ensurePlacementTree();
  const auto found = namedNodes_.find(id);
  return found == namedNodes_.end() ? 0 : found->second;
}

int View::placedParent(int id) const {
  ensurePlacementTree();
  const auto found = placedParents_.find(id);
  return found == placedParents_.end() ? -1 : found->second;
}

std::vector<int> View::layers() const {
  ensurePlacementTree();
  return layers_;
}

std::vector<int> View::placedChildren(int id) const {
  ensurePlacementTree();
  const auto found = placedChildren_.find(id);
  return found == placedChildren_.end() ? std::vector<int>{} : found->second;
}

bool View::contains(int root, int target) const {
  for (int current = target; current > 0; current = placedParent(current)) {
    if (current == root) return true;
  }
  return false;
}

bool View::connected(int id) const {
  for (int current = id; current > 0;) {
    const Node* found = node(current);
    if (found == nullptr) return false;
    if (found->parent == 0) return true;
    current = found->parent;
  }
  return false;
}

bool View::boxHasPress(const Node& box) const {
  return flag(box, "onPress") || flag(box, "onHoldChange");
}

void View::callPress(int id, const Node& box, bool touch) {
  if (!flag(box, "onPress")) return;
  call(id, "onPress", Json::array({Json{{"touch", touch}}}));
}

bool View::canFocus(int id) const {
  const Node* found = node(id);
  if (found == nullptr) return false;
  if (found->type == kField) return !flag(*found, "disabled");
  if (found->type == kScroll) return flag(*found, "focusable");
  if (found->type != kBox) return false;
  const bool interactive =
      !flag(*found, "disabled") && !flag(*found, "passThrough");
  const Json* focusable = prop(*found, "focusable");
  const bool wants = focusable != nullptr && focusable->is_boolean()
                         ? focusable->get<bool>()
                         : flag(*found, "onPress");
  return wants && interactive;
}

bool View::disabledWithin(int id) const {
  for (int current = id; current > 0; current = placedParent(current)) {
    const Node* found = node(current);
    if (found == nullptr) return false;
    if (flag(*found, "inert") || flag(*found, "__hidden")) return true;
  }
  return false;
}

style::Chrome View::chromeOf(int id) const {
  for (int current = id; current > 0; current = placedParent(current)) {
    const Node* found = node(current);
    if (found == nullptr) break;
    const std::string chrome = textProp(*found, "chrome");
    if (chrome == "dark") return style::Chrome::Dark;
    if (chrome == "light") return style::Chrome::Light;
  }
  return style::Chrome::Light;
}

std::string View::typeStyleNameOf(int id) const {
  // Follows React's tree, not the placement tree: a Layer's text takes its
  // owner's type.
  bool inText = false;
  for (int current = id; current > 0;) {
    const Node* found = node(current);
    if (found == nullptr) break;
    const std::string style = textProp(*found, "typeStyle");
    if (!style.empty()) return style;
    inText = inText || found->type == kText;
    current = found->parent;
  }
  return inText ? "text" : "";
}

const style::TypeStyle* View::typeOf(int id) const {
  const std::string name = typeStyleNameOf(id);
  const std::string& style = name.empty() ? tokens_.effects().typeStyle : name;
  return tokens_.type(style, language_);
}

View::BoxState View::stateOf(int id) const {
  BoxState state;
  const Node* found = node(id);
  if (found == nullptr) return state;
  state.disabled = flag(*found, "disabled");
  state.selected = flag(*found, "selected");
  const auto live = live_.find(id);
  const bool held = flag(*found, "held") ||
                    (live != live_.end() && live->second.held);
  state.pressed = (flag(*found, "pressed") || held) && !state.disabled;
  state.latched = flag(*found, "pressed") && !state.disabled;
  state.hover = !state.disabled &&
                std::find(hoverChain_.begin(), hoverChain_.end(), id) !=
                    hoverChain_.end();
  state.focused = focusMarkOf(id) != FocusMark::None;
  state.focusWithin = focused_ != 0 && contains(id, focused_);
  return state;
}

View::FocusMark View::focusMarkOf(int id) const {
  const bool hasFocus = id != 0 && focused_ == id && canFocus(id);
  if (!hasFocus) return FocusMark::None;
  if (gamepadConnected_) return FocusMark::Band;
  return focusVisible_ ? FocusMark::Dotted : FocusMark::None;
}

namespace {

void layer(style::LookState& into, const style::LookState& over) {
  if (over.surface) into.surface = over.surface;
  if (over.fill) into.fill = over.fill;
  if (over.fillOpacity) into.fillOpacity = over.fillOpacity;
  if (over.ink) into.ink = over.ink;
  if (over.opacity) into.opacity = over.opacity;
  if (over.emboss) into.emboss = over.emboss;
  if (over.ring) into.ring = over.ring;
  into.band = into.band || over.band;
  if (over.size) into.size = over.size;
  if (over.leading) into.leading = over.leading;
  if (over.face) into.face = over.face;
  into.travel = into.travel || over.travel;
  into.dither = into.dither || over.dither;
  into.textStipple = into.textStipple || over.textStipple;
}

}  // namespace

style::LookState View::lookStateOf(int id) const {
  style::LookState resolved;
  const Node* found = node(id);
  if (found == nullptr || found->type != kBox) return resolved;
  const std::string name = textProp(*found, "look");
  const style::Look* look = name.empty() ? nullptr : tokens_.look(name);
  const BoxState state = stateOf(id);

  // The primitives' own rules, under every look's: a surface starts on the
  // face, a raised key held down is pressed, a dead box is engraved.
  const std::string surface = textProp(*found, "surface");
  if (!surface.empty()) {
    resolved.surface = surface;
    if (!surface.starts_with("print-")) resolved.fill = std::string("face");
  }
  if (look != nullptr) {
    // A look's rest outranks the face a surface starts on; the surface's
    // own bevel outranks the rest's.
    if (look->rest.fill) resolved.fill = look->rest.fill;
    style::LookState rest = look->rest;
    if (!surface.empty()) rest.surface = surface;
    layer(resolved, rest);
  }
  const bool raisedHeld =
      state.pressed &&
      (resolved.surface == "raised" || resolved.surface == "thumb");
  if (raisedHeld) {
    resolved.surface = *resolved.surface == "raised"
                           ? std::string("pressed")
                           : std::string("thumb-pressed");
  }
  if (look != nullptr) {
    if (state.hover && look->hover) layer(resolved, *look->hover);
    if (state.focused && look->focused) layer(resolved, *look->focused);
    if (state.focusWithin && look->focusWithin) {
      layer(resolved, *look->focusWithin);
    }
    if (state.selected && look->selected) layer(resolved, *look->selected);
    if (state.pressed && look->pressed) {
      style::LookState pressed = *look->pressed;
      layer(resolved, pressed);
    }
    if (state.latched && look->latched) {
      // Down as a held key is, without travelling again.
      style::LookState latched;
      latched.surface = look->rest.surface;
      latched.fill = look->rest.fill;
      if (look->pressed) layer(latched, *look->pressed);
      latched.travel = false;
      layer(latched, *look->latched);
      latched.travel = look->latched->travel;
      layer(resolved, latched);
    }
  }
  if (state.disabled) {
    style::LookState dead;
    dead.ink = std::string("ink-disabled");
    dead.emboss = true;
    layer(resolved, dead);
    if (look != nullptr && look->disabled) layer(resolved, *look->disabled);
  }
  return resolved;
}

std::optional<style::Color> View::inkOf(int id) const {
  // The nearest box that sets an ink; a chrome restarts it from its own ink;
  // the page's is near white.
  for (int current = id; current > 0; current = placedParent(current)) {
    const Node* found = node(current);
    if (found == nullptr) break;
    const style::Chrome chrome = chromeOf(current);
    const std::string own = textProp(*found, "ink");
    if (!own.empty()) return tokens_.ink(own, chrome);
    if (found->type == kBox) {
      const auto look = lookStateOf(current);
      if (look.ink) return tokens_.ink(*look.ink, chrome);
      if (has(*found, "chrome")) return tokens_.ink("ink", chrome);
    }
    if (found->type == kField) return tokens_.ink("ink", chrome);
  }
  return style::Color{250, 250, 250, 255};
}

bool View::frame(double nowMs) {
  const double elapsedMs = nowMs - nowMs_;
  nowMs_ = nowMs;
  coastScroll(elapsedMs);
  repeatScrollbar();
  settleRestingFinger();
  if (counting_) layoutDirty_ = true;
  ensureLayout();
  const bool isRepaintDue = nowMs_ >= repaintAtMs_;
  if (!paintDirty_ && !isRepaintDue) return false;
  paint();
  paintDirty_ = false;
  return true;
}

}  // namespace bureau
