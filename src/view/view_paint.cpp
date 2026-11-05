// Painting: the laid-out tree into quads, in stacking order: every
// ordinary box in tree order, sticky contexts above ordinary content, and
// a Layer with a stacking level above the rest. A box paints its shadows, fill,
// pattern, bevel (front line last), content and ring.
#include <algorithm>
#include <cmath>

#include "anim.h"
#include "format.h"
#include "plot.h"
#include "vector.h"
#include "view_internal.h"

namespace bureau {

struct View::PaintState {
  struct Sticky;
  std::vector<Sticky>* sticky = nullptr;
  DisplayList* list = nullptr;
  /** Device pixels per pixel of the node being painted. */
  float scale = 1;
  /** UI pixels on the screen per pixel of the node being painted: below 1
   * inside a box that scales what it holds down. */
  float frame = 1;
  std::uint16_t clip = 0;
  /** What moves this subtree, in the node's pixels: a held key's travel, an
   * animation. */
  float dx = 0;
  float dy = 0;
  float opacity = 1;
  /** The engraved shadow under text, inherited down the subtree. */
  std::optional<style::Color> emboss;
  bool textStipple = false;
};

struct View::PaintState::Sticky {
  int id;
  PaintState parent;
};

namespace {

style::Color faded(style::Color color, float opacity) {
  return style::withAlpha(color, opacity);
}

int snap(float value, float scale) {
  return static_cast<int>(std::lround(value * scale));
}

/** At most `width` x `height` of `source` from (`x`, `y`), clamped to its
 * edges. */
Bitmap cropped(const Bitmap& source, int x, int y, int width, int height) {
  Bitmap tile;
  tile.width = std::min(width, source.width - x);
  tile.height = std::min(height, source.height - y);
  tile.rgba.resize(static_cast<size_t>(tile.width) * tile.height * 4);
  for (int row = 0; row < tile.height; ++row) {
    const auto from = source.rgba.begin() +
                      (static_cast<std::ptrdiff_t>(y + row) * source.width + x) * 4;
    std::copy(from, from + static_cast<std::ptrdiff_t>(tile.width) * 4,
              tile.rgba.begin() + static_cast<std::ptrdiff_t>(row) * tile.width * 4);
  }
  return tile;
}

/** The atlas's key for a glyph: its face, its size and where in its pixel the
 * pen stands, to a quarter. */
std::string glyphKey(const std::string& source, float size, uint32_t glyph,
                     int quarter) {
  return "g|" + source + "|" + std::to_string(std::lround(size * 64)) + "|" +
         std::to_string(glyph) + "|" + std::to_string(quarter);
}

}  // namespace

void View::paint() {
  // A chart given new figures is a new bake, and the atlas frees none: over
  // its budget it starts over, and this frame bakes only what it draws.
  const bool startsOver = atlas_.pages() > atlasPageBudget_;
  if (startsOver) atlas_.clear();
  images_.beginPaint();
  auto list = std::make_shared<DisplayList>();
  const float scale = screenScale_ * uiScale_;
  list->width = static_cast<int>(std::lround(windowWidth_ * screenScale_));
  list->height = static_cast<int>(std::lround(windowHeight_ * screenScale_));
  list->clips.push_back(Clip{0, 0, list->width, list->height});
  list->version = ++listVersion_;
  repaintAtMs_ = std::numeric_limits<double>::infinity();
  pointerOverPress_ = false;
  paintedShifts_.clear();

  PaintState state;
  state.list = list.get();
  state.scale = scale;
  std::vector<PaintState::Sticky> sticky;
  state.sticky = &sticky;
  for (const int root : tree_.roots()) {
    if (!isLayer(root)) paintChild(root, state);
  }
  for (const auto& item : sticky) paintContext(item.id, item.parent);
  // A Layer with a stacking level is a stacking context over the page,
  // lowest level first, then the order they mounted.
  std::vector<std::pair<int, int>> stacked;
  for (const int layer : layers()) {
    const Node* found = node(layer);
    const int level = tokens_.stacking(textProp(*found, "stacking"));
    if (level > 0) stacked.emplace_back(level, layer);
  }
  std::stable_sort(stacked.begin(), stacked.end(),
                   [](const auto& a, const auto& b) { return a.first < b.first; });
  for (const auto& [level, layer] : stacked) {
    PaintState layered = state;
    const size_t start = list->quads.size();
    paintContext(layer, layered);
    const auto placed = places_.find(layer);
    if (placed == places_.end()) continue;
    const auto& repeats = placed->second->streetPlacements;
    if (repeats.empty()) continue;
    const std::vector<Quad> label(list->quads.begin() + start, list->quads.end());
    list->quads.resize(start);
    for (const auto& repeat : repeats) {
      const float left = (repeat.x - repeat.width / 2) * scale;
      const float top = (repeat.y - repeat.height / 2) * scale;
      for (auto quad : label) {
        quad.x0 += left;
        quad.x1 += left;
        quad.y0 += top;
        quad.y1 += top;
        quad.angle = static_cast<float>(repeat.angle);
        quad.originX = repeat.x * scale;
        quad.originY = repeat.y * scale;
        quad.smooth = true;
        list->quads.push_back(quad);
      }
    }
  }
  list->missingImages = images_.missingImages();
  list_ = std::move(list);
  // A frame that alone fills most of the budget raises it, or the next frame
  // would start over again.
  if (startsOver) {
    atlasPageBudget_ = std::max(kAtlasPageBudget, 2 * atlas_.pages());
  }
}

void View::paintChild(int id, PaintState& parent) {
  const Node* found = node(id);
  if (found != nullptr && isSticky(*found)) {
    parent.sticky->push_back({id, parent});
    return;
  }
  if (found != nullptr && isStackingContext(*found)) {
    paintContext(id, parent);
    return;
  }
  paintNode(id, parent);
}

void View::paintContext(int id, PaintState state) {
  // Context descendants cannot rise above a later sibling of the context.
  std::vector<PaintState::Sticky> sticky;
  state.sticky = &sticky;
  paintNode(id, state);
  for (const auto& item : sticky) paintContext(item.id, item.parent);
}

void View::paintNode(int id, PaintState& parent) {
  const Node* found = node(id);
  if (found == nullptr || flag(*found, "__hidden")) return;
  const auto placed = places_.find(id);
  if (placed == places_.end()) return;
  const Place& place = *placed->second;
  PaintState state = parent;
  // Portals lay out outside their parent's clip, including the safe area.
  if (found->type == kLayer) state.clip = 0;
  // A node drawn at another scale paints in its own pixels: its rectangles
  // and shifts divided by its scale, its device pixels each times it.
  if (place.scale != parent.frame) {
    state.scale = parent.scale / parent.frame * place.scale;
    state.dx = parent.dx * parent.frame / place.scale;
    state.dy = parent.dy * parent.frame / place.scale;
    state.frame = place.scale;
  }
  // Hit testing reads the shifts in UI pixels.
  const float parentShiftX = parent.dx * parent.frame;
  const float parentShiftY = parent.dy * parent.frame;
  const bool parentShifted = parent.dx != 0 || parent.dy != 0;
  if (parentShifted) {
    paintedShifts_[id] = {parentShiftX, parentShiftY, parentShiftX, parentShiftY};
  }
  if (place.clipped) {
    const UiRect clip = inOwnPixels(place.clip, state.frame);
    const Clip& outer = state.list->clips[state.clip];
    const int left = std::max(outer.x, static_cast<int>(std::floor(
                                           (clip.x + state.dx) * state.scale)));
    const int top = std::max(outer.y, static_cast<int>(std::floor(
                                          (clip.y + state.dy) * state.scale)));
    const int right = std::min(
        outer.x + outer.width,
        static_cast<int>(std::ceil((clip.x + clip.width + state.dx) *
                                   state.scale)));
    const int bottom = std::min(
        outer.y + outer.height,
        static_cast<int>(std::ceil((clip.y + clip.height + state.dy) *
                                   state.scale)));
    state.list->clips.push_back(
        Clip{left, top, std::max(0, right - left), std::max(0, bottom - top)});
    state.clip = static_cast<std::uint16_t>(state.list->clips.size() - 1);
  }
  UiRect rect = inOwnPixels(place.rect, state.frame);

  const std::string_view type = found->type;
  if (type == kTextLeaf) {
    // A run of loose text paints from its first leaf, which holds the lines.
    if (!place.spanNodes.empty()) paintText(id, rect, state);
    return;
  }
  if (type == kText) {
    paintText(id, rect, state);
    for (const int atom : place.atomNodes) paintChild(atom, state);
    if (holdsBlocks(id)) {
      for (const int child : found->children) paintChild(child, state);
    }
    return;
  }
  if (type == kImage) {
    paintImage(id, rect, state);
    return;
  }
  if (type == kField) {
    paintField(id, rect, state);
    return;
  }
  if (type == kPlot) {
    paintPlot(id, rect, state);
    return;
  }

  // A Box, a Scroll or a Layer's root.
  const Json* animation = prop(*found, "animation");
  std::optional<float> animatedOpacity;
  if (animation != nullptr && animation->is_string()) {
    Live& live = live_[id];
    const std::string name = animation->get<std::string>();
    if (live.animation != name || live.animationStartMs < 0) {
      live.animation = name;
      live.animationStartMs = nowMs_;
    }
    const auto delay = has(*found, "animationDelayMs")
                           ? std::optional<double>(
                                 number(*found, "animationDelayMs", 0))
                           : std::nullopt;
    const auto duration = has(*found, "animationDurationMs")
                              ? std::optional<double>(
                                    number(*found, "animationDurationMs", 0))
                              : std::nullopt;
    // A shake that holds still for the pointer, keyboard focus or the pad.
    using WhileHovered = style::Animation::WhileHovered;
    const style::Animation* record = tokens_.animation(name);
    const WhileHovered rule = record ? record->whileHovered : WhileHovered::Run;
    const bool hovered = std::find(hoverChain_.begin(), hoverChain_.end(),
                                   id) != hoverChain_.end();
    const bool focusShown = focusMarkOf(id) != FocusMark::None;
    const bool wasHeld = live.animationHeld;
    live.animationHeld = rule != WhileHovered::Run && (hovered || focusShown);
    // A stopped animation starts over once the pointer leaves.
    const bool restarts = live.animationHeld || wasHeld;
    if (restarts && rule == WhileHovered::Stop) {
      live.animationStartMs = nowMs_;
    }
    // A paused one keeps its place, and resumes from it.
    if (live.animationHeld && rule == WhileHovered::Pause &&
        !live.animationPausedMs) {
      live.animationPausedMs = nowMs_ - live.animationStartMs;
    }
    if (live.animationPausedMs) {
      live.animationStartMs = nowMs_ - *live.animationPausedMs;
    }
    if (!live.animationHeld) live.animationPausedMs.reset();
    const bool stopped = live.animationHeld && rule == WhileHovered::Stop;
    std::optional<AnimationSample> sample;
    if (reducedMotion_) {
      sample = stillAnimation(tokens_, name);
    } else if (!stopped) {
      sample = sampleAnimation(tokens_, name, nowMs_ - live.animationStartMs,
                               delay, duration);
    }
    if (sample) {
      if (!live.animationHeld) {
        repaintAtMs_ = std::min(repaintAtMs_, nowMs_ + sample->untilChangeMs);
      }
      if (sample->hidden) return;
      state.dx += sample->translateX +
                  sample->translateXPercent / 100 * rect.width;
      state.dy += sample->translateY +
                  sample->translateYPercent / 100 * rect.height;
      const bool shifted = state.dx * state.frame != parentShiftX ||
                           state.dy * state.frame != parentShiftY;
      if (shifted) {
        paintedShifts_[id] = {parentShiftX, parentShiftY, state.dx * state.frame,
                              state.dy * state.frame};
      }
      animatedOpacity = sample->opacity;
      // A scale about the box's centre, or along its width from its left.
      const float sx = sample->scale * sample->scaleX;
      const float sy = sample->scale;
      if (sx != 1 || sy != 1) {
        const bool fromLeft = name == "bureau-hold-fill";
        const float cx = fromLeft ? rect.x : rect.x + rect.width / 2;
        const float cy = rect.y + rect.height / 2;
        rect = UiRect{cx + (rect.x - cx) * sx, cy + (rect.y - cy) * sy,
                      rect.width * sx, rect.height * sy};
      }
      if (sample->widthPercent) {
        rect.width = rect.width * *sample->widthPercent / 100;
      }
    }
  } else if (Live* live = live_.count(id) ? &live_[id] : nullptr) {
    live->animation.clear();
    live->animationStartMs = -1;
  }
  const auto look = lookStateOf(id);
  // A curtain lifts from `opacity={0}` with an animation running 1 to 0.
  const float opacity = animatedOpacity.value_or(
      number(*found, "opacity", look.opacity.value_or(1)));
  state.opacity *= opacity;
  if (look.emboss) {
    state.emboss = *look.emboss
                       ? tokens_.ink(tokens_.extras(chromeOf(id)).embossColor,
                                     chromeOf(id))
                       : std::nullopt;
  }
  if (look.textStipple) state.textStipple = true;
  if (boxHasPress(*found) && !flag(*found, "disabled") &&
      std::find(hoverChain_.begin(), hoverChain_.end(), id) !=
          hoverChain_.end()) {
    pointerOverPress_ = true;
  }

  paintBox(id, rect, state);

  PaintState inner = state;
  if (look.travel) {
    inner.dx += 1;
    inner.dy += 1;
  }
  for (const int child : placedChildren(id)) {
    const Node* item = node(child);
    // Stacked layers paint over the page, after it.
    const bool stacked =
        item != nullptr && item->type == kLayer &&
        tokens_.stacking(textProp(*item, "stacking")) > 0;
    if (!stacked) paintChild(child, inner);
  }
  if (type == kScroll) paintScrollbars(id, rect, state);
  paintFocusMark(id, rect, state);
}

void View::paintBox(int id, const UiRect& rect, PaintState& state) {
  const Node& box = *node(id);
  const style::Chrome chrome = chromeOf(id);
  const auto look = lookStateOf(id);
  const float scale = state.scale;
  // Boxes and their shadows snap to whole UI pixels before display density,
  // so a one-pixel line stays whole device pixels at every scale.
  const int x0 = snap(std::round(rect.x + state.dx), scale);
  const int y0 = snap(std::round(rect.y + state.dy), scale);
  const int x1 = snap(std::round(rect.x + rect.width + state.dx), scale);
  const int y1 = snap(std::round(rect.y + rect.height + state.dy), scale);
  if (x1 <= x0 || y1 <= y0) return;
  const auto white = [&](int ax, int ay, int bx, int by, style::Color color,
                         std::uint8_t stipple = 0) {
    color = faded(color, state.opacity);
    if (bx <= ax || by <= ay || color.a == 0) return;
    state.list->quads.push_back(Quad{
        static_cast<float>(ax), static_cast<float>(ay), static_cast<float>(bx),
        static_cast<float>(by), atlas_.whiteU(), atlas_.whiteV(),
        atlas_.whiteU(), atlas_.whiteV(), color.r, color.g, color.b, color.a,
        QuadMode::Fill, 0, stipple, false, state.clip});
  };

  // The box's animation now: a flash's fill, the attention ring's inks.
  std::optional<AnimationSample> animated;
  const Live& boxLive = live_[id];
  const bool stopped =
      boxLive.animationHeld && !boxLive.animationPausedMs.has_value();
  if (prop(box, "animation") != nullptr && reducedMotion_) {
    animated = stillAnimation(tokens_, boxLive.animation);
  } else if (prop(box, "animation") != nullptr && !stopped) {
    const Live& live = boxLive;
    animated = sampleAnimation(tokens_, live.animation,
                               nowMs_ - live.animationStartMs, std::nullopt,
                               std::nullopt);
  }
  const bool ringed = animated && animated->ringColor;

  // The bevel: inset lines take no space; the outer ones fall outside.
  std::vector<style::BevelLine> lines;
  if (ringed) {
    // The attention ring takes the bevel's place, but for the recipe it
    // rides over.
    if (animated->ringOver) lines = tokens_.bevel(*animated->ringOver, chrome);
  } else if (look.surface && *look.surface != "none") {
    lines = tokens_.bevel(*look.surface, chrome);
  }
  for (auto line = lines.rbegin(); line != lines.rend(); ++line) {
    if (line->side == style::BevelLine::Side::Drop) {
      // Never under the box itself, so a box without a fill shows only the
      // edge its shadow sticks out by (a census rule).
      const int spread = snap(line->spread, scale);
      const int sx0 = x0 + snap(line->x, scale) - spread;
      const int sy0 = y0 + snap(line->y, scale) - spread;
      const int sx1 = x1 + snap(line->x, scale) + spread;
      const int sy1 = y1 + snap(line->y, scale) + spread;
      const int bandTop = std::clamp(y0, sy0, sy1);
      const int bandBottom = std::clamp(y1, sy0, sy1);
      white(sx0, sy0, sx1, bandTop, line->color);
      white(sx0, bandBottom, sx1, sy1, line->color);
      white(sx0, bandTop, std::min(x0, sx1), bandBottom, line->color);
      white(std::max(x1, sx0), bandTop, sx1, bandBottom, line->color);
    }
    if (line->side == style::BevelLine::Side::OuterRing) {
      const int w = std::max(1, snap(line->width, scale));
      white(x0 - w, y0 - w, x1 + w, y0, line->color);
      white(x0 - w, y1, x1 + w, y1 + w, line->color);
      white(x0 - w, y0, x0, y1, line->color);
      white(x1, y0, x1 + w, y1, line->color);
    }
  }

  // The fill: the prop's, else the look's, else the face a surface starts on.
  std::optional<style::Color> fill;
  const std::string fillName = textProp(box, "fill");
  if (!fillName.empty()) {
    fill = tokens_.ink(fillName, chrome);
  } else if (look.fill && *look.fill != "none") {
    fill = tokens_.ink(*look.fill, chrome);
    if (fill && look.fillOpacity) fill = faded(*fill, *look.fillOpacity);
  }
  if (animated && animated->fill) fill = tokens_.ink(*animated->fill, chrome);
  // A folder tab: one picture at the box's device size, so the slants and
  // the top meet without seams, and its outline is as wide as a bevel line.
  if (const float slant = number(box, "slant", 0); slant > 0) {
    std::optional<style::Color> outline;
    int line = 0;
    for (const auto& bevel : lines) {
      if (bevel.side != style::BevelLine::Side::Top) continue;
      outline = bevel.color;
      line = std::max(1, snap(bevel.width, scale));
    }
    const int width = x1 - x0;
    const int height = y1 - y0;
    const float lean = slant * scale;
    const auto colorKey = [](std::optional<style::Color> color) {
      if (!color) return std::string("-");
      return std::to_string(color->r) + "." + std::to_string(color->g) + "." +
             std::to_string(color->b) + "." + std::to_string(color->a);
    };
    const std::string key = "tab|" + std::to_string(width) + "x" +
                            std::to_string(height) + "|" +
                            std::to_string(std::lround(lean * 64)) + "|" +
                            std::to_string(line) + "|" + colorKey(fill) + "|" +
                            colorKey(outline);
    std::optional<AtlasEntry> entry;
    if (const AtlasEntry* known = atlas_.find(key)) {
      entry = *known;
    } else {
      Bitmap tab{width, height,
                 std::vector<std::uint8_t>(static_cast<size_t>(width) * height * 4, 0)};
      const float w = static_cast<float>(width);
      const float h = static_cast<float>(height);
      if (outline) {
        fillPolygon(tab, {{lean, 0}, {w - lean, 0}, {w, h}, {0, h}}, *outline,
                    false);
      }
      // The face is the same shape a line in from the top and both sides;
      // the foot stays open.
      if (fill) {
        const float in = static_cast<float>(line);
        const float faceLean = lean * (h - in) / h;
        fillPolygon(tab,
                    {{in + faceLean, in}, {w - in - faceLean, in},
                     {w - in, h}, {in, h}},
                    *fill, false);
      }
      entry = atlas_.add(key, width, height, premultiplied(tab));
    }
    if (!entry) return;
    const style::Color tint = faded(style::Color{255, 255, 255, 255}, state.opacity);
    state.list->quads.push_back(Quad{
        static_cast<float>(x0), static_cast<float>(y0), static_cast<float>(x1),
        static_cast<float>(y1), static_cast<float>(entry->x) / kAtlasSize,
        static_cast<float>(entry->y) / kAtlasSize,
        static_cast<float>(entry->x + width) / kAtlasSize,
        static_cast<float>(entry->y + height) / kAtlasSize, tint.r, tint.g,
        tint.b, tint.a, QuadMode::Picture, static_cast<std::uint8_t>(entry->page),
        0, false, state.clip});
    return;
  }

  if (fill) white(x0, y0, x1, y1, *fill);

  // The pattern on the ground.
  const std::string patternName = textProp(box, "pattern");
  if (const style::Pattern* pattern =
          patternName.empty() ? nullptr : tokens_.pattern(patternName)) {
    using Kind = style::Pattern::Kind;
    const auto ink = tokens_.ink(pattern->ink, chrome).value_or(style::Color{});
    if (pattern->kind == Kind::Stipple) {
      white(x0, y0, x1, y1, ink,
            static_cast<std::uint8_t>(std::max(
                1, snap(tokens_.effects().stippleSize / 2, scale))));
    } else if (pattern->kind == Kind::Lines) {
      for (float y = pattern->period - 1; y < rect.height; y += pattern->period) {
        const int top = snap(rect.y + state.dy + y, scale);
        white(x0, top, x1, top + std::max(1, snap(1, scale)),
              faded(ink, pattern->alpha));
      }
    } else if (pattern->kind == Kind::Blocks || pattern->kind == Kind::Dots) {
      for (float x = 0; x < rect.width; x += pattern->period + pattern->gap) {
        const int left = snap(rect.x + state.dx + x, scale);
        const int right = std::min(
            x1, snap(rect.x + state.dx + std::min(x + pattern->period, rect.width),
                     scale));
        white(left, y0, right, y1, ink);
      }
    } else if (pattern->kind == Kind::Gridlines) {
      for (float share = 0; share < 100; share += pattern->gap) {
        const int left = snap(rect.x + state.dx + rect.width * share / 100, scale);
        white(left, y0, left + std::max(1, snap(pattern->width, scale)), y1, ink);
      }
    } else if (pattern->kind == Kind::Stripes) {
      const auto second =
          tokens_.ink(pattern->secondInk, chrome).value_or(style::Color{});
      white(x0, y0, x1, y1, ink);
      // Diagonal bands, as rows of short runs.
      const float band = pattern->period * scale;
      for (int y = y0; y < y1; ++y) {
        for (float start = -band * 2 + std::fmod(static_cast<float>(y - y0), band * 2);
             start < x1 - x0; start += band * 2) {
          const int left = x0 + static_cast<int>(std::lround(start + band));
          white(std::max(x0, left), y, std::min(x1, left + static_cast<int>(band)),
                y + 1, second);
        }
      }
    } else if (pattern->kind == Kind::Picture) {
      if (const Bitmap* bitmap = images_.get(pattern->source)) {
        const std::string key = "p|" + pattern->source;
        auto entry = atlas_.find(key) ? std::optional(*atlas_.find(key))
                                      : atlas_.add(key, bitmap->width,
                                                   bitmap->height,
                                                   premultiplied(*bitmap));
        if (entry) {
          // Covering the box, centred.
          const float boxWidth = static_cast<float>(x1 - x0);
          const float boxHeight = static_cast<float>(y1 - y0);
          const float cover = std::max(boxWidth / entry->width,
                                       boxHeight / entry->height);
          const float shownWidth = boxWidth / cover;
          const float shownHeight = boxHeight / cover;
          const float u0 = entry->x + (entry->width - shownWidth) / 2;
          const float v0 = entry->y + (entry->height - shownHeight) / 2;
          const style::Color tint = faded(style::Color{255, 255, 255, 255},
                                          state.opacity);
          state.list->quads.push_back(
              Quad{static_cast<float>(x0), static_cast<float>(y0),
                   static_cast<float>(x1), static_cast<float>(y1),
                   u0 / kAtlasSize, v0 / kAtlasSize,
                   (u0 + shownWidth) / kAtlasSize,
                   (v0 + shownHeight) / kAtlasSize, tint.r, tint.g, tint.b,
                   tint.a, QuadMode::Picture,
                   static_cast<std::uint8_t>(entry->page), 0, true,
                   state.clip});
        }
      }
    }
  }

  // A latched key's dither: the shade's checkerboard inside its bevel.
  if (look.dither) {
    const int inset = snap(tokens_.effects().ditherInset, scale);
    white(x0 + inset, y0 + inset, x1 - inset, y1 - inset,
          tokens_.ink("shade", chrome).value_or(style::Color{}),
          static_cast<std::uint8_t>(
              std::max(1, snap(tokens_.effects().stippleSize / 2, scale))));
  }

  // The inset lines, back to front.
  for (auto line = lines.rbegin(); line != lines.rend(); ++line) {
    using Side = style::BevelLine::Side;
    if (line->side == Side::Drop || line->side == Side::OuterRing) continue;
    const int w = std::max(1, snap(line->width, scale));
    const style::Color color = line->color;
    switch (line->side) {
      case Side::Ring:
        white(x0, y0, x1, y0 + w, color);
        white(x0, y1 - w, x1, y1, color);
        white(x0, y0 + w, x0 + w, y1 - w, color);
        white(x1 - w, y0 + w, x1, y1 - w, color);
        break;
      case Side::TopLeft:
        white(x0, y0, x1, y0 + w, color);
        white(x0, y0 + w, x0 + w, y1, color);
        break;
      case Side::BottomRight:
        white(x0, y1 - w, x1, y1, color);
        white(x1 - w, y0, x1, y1 - w, color);
        break;
      case Side::Top:
        white(x0, y0, x1, y0 + w, color);
        break;
      case Side::Bottom:
        white(x0, y1 - w, x1, y1, color);
        break;
      case Side::Left:
        white(x0, y0, x0 + w, y1, color);
        break;
      case Side::Right:
        white(x1 - w, y0, x1, y1, color);
        break;
      default:
        break;
    }
  }

  // The attention ring: a band inside the edge, an outline outside it.
  if (ringed) {
    if (const auto ink = tokens_.ink(*animated->ringColor, chrome)) {
      const int w = std::max(1, snap(tokens_.effects().attentionInset, scale));
      white(x0, y0, x1, y0 + w, *ink);
      white(x0, y1 - w, x1, y1, *ink);
      white(x0, y0 + w, x0 + w, y1 - w, *ink);
      white(x1 - w, y0 + w, x1, y1 - w, *ink);
    }
  }
  if (animated && animated->outlineColor) {
    if (const auto ink = tokens_.ink(*animated->outlineColor, chrome)) {
      const int gap = snap(tokens_.effects().attentionOffset, scale);
      const int w = std::max(1, snap(tokens_.effects().attentionWidth, scale));
      const int ox0 = x0 - gap - w;
      const int oy0 = y0 - gap - w;
      const int ox1 = x1 + gap + w;
      const int oy1 = y1 + gap + w;
      white(ox0, oy0, ox1, oy0 + w, *ink);
      white(ox0, oy1 - w, ox1, oy1, *ink);
      white(ox0, oy0 + w, ox0 + w, oy1 - w, *ink);
      white(ox1 - w, oy0 + w, ox1, oy1 - w, *ink);
    }
  }
}

// Focus's mark, over the box and all it holds. Real focus draws the pad's
// band while a pad is connected, else the keyboard's dotted ring; a look's
// ring (a virtual pad cursor, a cell round its focused value) draws the same
// mark for good.
void View::paintFocusMark(int id, const UiRect& rect, PaintState& state) {
  const Node& found = *node(id);
  const style::Chrome chrome = chromeOf(id);
  const std::string lookName = textProp(found, "look");
  const style::Look* look = lookName.empty() ? nullptr : tokens_.look(lookName);
  const style::LookState worn = lookStateOf(id);

  FocusMark mark = focusMarkOf(id);
  const bool leftToContent = look != nullptr && look->focusRingNone;
  // A look with a focused state of its own needs no dotted ring besides.
  const bool markedByLook = look != nullptr && look->focused.has_value();
  if (leftToContent) mark = FocusMark::None;
  if (mark == FocusMark::Dotted && markedByLook) mark = FocusMark::None;
  float offset = tokens_.effects().focusOffset;
  std::optional<style::Color> ink;
  if (mark == FocusMark::Dotted && look != nullptr) {
    if (look->focusRingOffset) offset = *look->focusRingOffset;
    if (look->focusRingInk) ink = tokens_.ink(*look->focusRingInk, chrome);
  }
  if (mark == FocusMark::None && worn.ring) {
    const bool padMark = gamepadConnected_ || worn.band;
    mark = padMark ? FocusMark::Band : FocusMark::Dotted;
    offset = *worn.ring;
  }
  if (mark == FocusMark::None) return;

  // A slider's mark rings its track from outside, clear of the thumb that
  // marks its value.
  const bool slider =
      found.type == kField && textProp(found, "kind") == "range";
  if (slider) offset = 1;
  const float scale = state.scale;
  const int x0 = snap(rect.x + state.dx, scale);
  const int y0 = snap(rect.y + state.dy, scale);
  const int x1 = snap(rect.x + rect.width + state.dx, scale);
  const int y1 = snap(rect.y + rect.height + state.dy, scale);
  const auto add = [&](int ax, int ay, int bx, int by, style::Color color) {
    color = faded(color, state.opacity);
    if (bx <= ax || by <= ay || color.a == 0) return;
    state.list->quads.push_back(Quad{
        static_cast<float>(ax), static_cast<float>(ay), static_cast<float>(bx),
        static_cast<float>(by), atlas_.whiteU(), atlas_.whiteV(),
        atlas_.whiteU(), atlas_.whiteV(), color.r, color.g, color.b, color.a,
        QuadMode::Fill, 0, 0, false, state.clip});
  };

  if (mark == FocusMark::Band) {
    // A line on a backing a pixel wider each side: yellow on black reads on
    // paper and on dark chrome alike. Inside the box's edge, clipping never
    // takes it.
    const auto& effects = tokens_.effects();
    const int backing = std::max(1, snap(effects.padFocusBacking, scale));
    const int width = std::max(1, snap(effects.padFocusWidth, scale));
    const int edge = (backing - width) / 2;
    const auto band = [&](int grow, int thickness, std::string_view inkName) {
      const auto color = tokens_.ink(inkName, chrome);
      if (!color) return;
      const int ix0 = x0 - grow, iy0 = y0 - grow;
      const int ix1 = x1 + grow, iy1 = y1 + grow;
      add(ix0 - thickness, iy0 - thickness, ix1 + thickness, iy0, *color);
      add(ix0 - thickness, iy1, ix1 + thickness, iy1 + thickness, *color);
      add(ix0 - thickness, iy0, ix0, iy1, *color);
      add(ix1, iy0, ix1 + thickness, iy1, *color);
    };
    const int grow = slider ? 0 : -backing;
    band(grow, backing, effects.padFocusBackingColor);
    band(grow + edge, width, effects.padFocusColor);
    return;
  }

  if (!ink) ink = tokens_.ink(tokens_.extras(chrome).focusColor, chrome);
  if (!ink) return;
  // A dotted line outside the edge `offset` away (inside when negative): dots
  // and gaps each the line's width.
  const int grow = snap(offset, scale);
  const int ax0 = x0 - grow, ay0 = y0 - grow;
  const int ax1 = x1 + grow, ay1 = y1 + grow;
  const int w = std::max(1, snap(tokens_.extras(chrome).focusWidth, scale));
  for (int x = ax0 - w; x < ax1 + w; x += 2 * w) {
    add(x, ay0 - w, std::min(x + w, ax1 + w), ay0, *ink);
    add(x, ay1, std::min(x + w, ax1 + w), ay1 + w, *ink);
  }
  for (int y = ay0; y < ay1; y += 2 * w) {
    add(ax0 - w, y, ax0, std::min(y + w, ay1), *ink);
    add(ax1, y, ax1 + w, std::min(y + w, ay1), *ink);
  }
}

void View::paintText(int id, const UiRect& rect, PaintState& state) {
  const Place& place = *places_.at(id);
  const Node& found = *node(id);
  const float scale = state.scale;
  const style::Chrome chrome = chromeOf(id);

  // Each span's ink, its shadow, and the emboss it inherits.
  struct Ink {
    style::Color color;
    std::optional<style::Color> shadow;
    std::optional<style::Color> halo;
    float shadowX = 0;
    float shadowY = 0;
  };
  std::vector<Ink> inks;
  for (const int span : place.spanNodes) {
    Ink ink;
    ink.color = inkOf(span).value_or(style::Color{250, 250, 250, 255});
    // The shadow: the Text's own, else its type's, else the emboss.
    int owner = span;
    const Node* spanNode = node(span);
    if (spanNode != nullptr && spanNode->type == kTextLeaf) owner = spanNode->parent;
    const Node* text = node(owner);
    const style::TypeStyle* type = typeOf(span);
    if (type != nullptr && type->halo) ink.halo = tokens_.ink(*type->halo, chrome);
    const Json* shadow = text != nullptr ? prop(*text, "shadow") : nullptr;
    if (shadow != nullptr && shadow->is_object()) {
      ink.shadow = tokens_.ink(shadow->value("ink", std::string()), chrome);
      ink.shadowX = ink.shadowY = shadow->value("offset", 1.0f);
    } else if (type != nullptr && type->shadow) {
      ink.shadow = tokens_.ink(type->shadow->color, chrome);
      if (ink.shadow) ink.shadow = faded(*ink.shadow, type->shadow->opacity);
      ink.shadowX = type->shadow->x;
      ink.shadowY = type->shadow->y;
    } else if (state.emboss) {
      ink.shadow = state.emboss;
      ink.shadowX = tokens_.extras(chrome).embossX;
      ink.shadowY = tokens_.extras(chrome).embossY;
    }
    inks.push_back(ink);
  }
  const std::uint8_t stipple =
      state.textStipple || (typeOf(id) != nullptr && typeOf(id)->stipple)
          ? static_cast<std::uint8_t>(
                std::max(1, snap(tokens_.effects().stippleSize / 2, scale)))
          : 0;

  const auto glyphQuad = [&](const text::PlacedGlyph& glyph, float lineX,
                             style::Color color, float offsetX,
                             float offsetY) {
    Font* device = fonts_.scaled(glyph.font, scale);
    if (device == nullptr) return;
    const float penX =
        (rect.x + state.dx + lineX + glyph.x + offsetX) * scale;
    const float baseline =
        std::round((rect.y + state.dy + glyph.baseline + offsetY) * scale);
    float whole = std::floor(penX);
    int quarter = static_cast<int>(std::lround((penX - whole) * 4));
    if (quarter == 4) {
      whole += 1;
      quarter = 0;
    }
    const std::string source = fonts_.sourceOf(device);
    const std::string key = glyphKey(source, device->size(), glyph.glyph, quarter);
    const AtlasEntry* found = atlas_.find(key);
    std::optional<AtlasEntry> entry;
    if (found != nullptr) {
      entry = *found;
    } else {
      const RasterGlyph raster = device->raster(glyph.glyph, quarter / 4.0f);
      std::vector<std::uint8_t> pixels(raster.coverage.size() * 4);
      for (size_t index = 0; index < raster.coverage.size(); ++index) {
        const std::uint8_t coverage = raster.coverage[index];
        pixels[index * 4 + 0] = coverage;
        pixels[index * 4 + 1] = coverage;
        pixels[index * 4 + 2] = coverage;
        pixels[index * 4 + 3] = coverage;
      }
      entry = atlas_.add(key, raster.width, raster.height, pixels, raster.left,
                         raster.top);
    }
    if (!entry || entry->width == 0) return;
    const float x0 = whole + static_cast<float>(entry->left);
    const float y0 = baseline - static_cast<float>(entry->top);
    color = faded(color, state.opacity);
    state.list->quads.push_back(Quad{
        x0, y0, x0 + entry->width, y0 + entry->height,
        static_cast<float>(entry->x) / kAtlasSize,
        static_cast<float>(entry->y) / kAtlasSize,
        static_cast<float>(entry->x + entry->width) / kAtlasSize,
        static_cast<float>(entry->y + entry->height) / kAtlasSize, color.r,
        color.g, color.b, color.a, QuadMode::Mask,
        static_cast<std::uint8_t>(entry->page), stipple, false, state.clip});
  };

  // A plate behind each run that asks for one.
  for (const auto& line : place.paragraph.lines) {
    for (const auto& stretch : line.stretches) {
      const Node* spanNode = node(place.spanNodes[stretch.span]);
      if (spanNode == nullptr) continue;
      const int owner = spanNode->type == kTextLeaf ? spanNode->parent
                                                    : place.spanNodes[stretch.span];
      const Node* text = node(owner);
      const Json* plate = text != nullptr ? prop(*text, "plate") : nullptr;
      if (plate == nullptr || !plate->is_object()) continue;
      const auto padding = plate->value("padding", Json::array({0, 0}));
      const float padY = padding.size() > 0 ? padding[0].get<float>() : 0;
      const float padX = padding.size() > 1 ? padding[1].get<float>() : 0;
      const auto color =
          tokens_.ink(plate->value("fill", std::string("face")), chrome);
      if (!color) continue;
      const float left = rect.x + state.dx + line.x + stretch.x - padX;
      const float top = rect.y + state.dy + stretch.top - padY;
      const style::Color shown = faded(*color, state.opacity);
      state.list->quads.push_back(Quad{
          std::round(left * scale), std::round(top * scale),
          std::round((left + stretch.width + 2 * padX) * scale),
          std::round((top + stretch.height + 2 * padY) * scale),
          atlas_.whiteU(), atlas_.whiteV(), atlas_.whiteU(), atlas_.whiteV(),
          shown.r, shown.g, shown.b, shown.a, QuadMode::Fill, 0, 0, false,
          state.clip});
    }
  }
  for (const auto& line : place.paragraph.lines) {
    for (const auto& glyph : line.glyphs) {
      const Ink& ink = inks[glyph.span];
      if (ink.halo) {
        glyphQuad(glyph, line.x, *ink.halo, -1, 0);
        glyphQuad(glyph, line.x, *ink.halo, 1, 0);
        glyphQuad(glyph, line.x, *ink.halo, 0, -1);
        glyphQuad(glyph, line.x, *ink.halo, 0, 1);
      }
      if (ink.shadow) {
        glyphQuad(glyph, line.x, *ink.shadow, ink.shadowX, ink.shadowY);
      }
    }
  }
  for (const auto& line : place.paragraph.lines) {
    for (const auto& glyph : line.glyphs) {
      glyphQuad(glyph, line.x, inks[glyph.span].color, 0, 0);
    }
    // Underlines, a pixel or more under the baseline.
    for (const auto& stretch : line.stretches) {
      const style::TypeStyle* type = typeOf(place.spanNodes[stretch.span]);
      if (type == nullptr || !type->underline) continue;
      const style::Color color = faded(inks[stretch.span].color, state.opacity);
      const float top = rect.y + state.dy + line.baseline + type->underline->offset;
      state.list->quads.push_back(Quad{
          std::round((rect.x + state.dx + line.x + stretch.x) * scale),
          std::round(top * scale),
          std::round((rect.x + state.dx + line.x + stretch.x + stretch.width) *
                     scale),
          std::round(top * scale) +
              std::max(1.0f, std::round(type->underline->thickness * scale)),
          atlas_.whiteU(), atlas_.whiteV(), atlas_.whiteU(), atlas_.whiteV(),
          color.r, color.g, color.b, color.a, QuadMode::Fill, 0, 0, false,
          state.clip});
    }
  }
  (void)found;
}

void View::paintImage(int id, const UiRect& rect, PaintState& state) {
  const Node& image = *node(id);
  const float scale = state.scale;
  const style::Chrome chrome = chromeOf(id);
  std::string source = textProp(image, "source");
  const std::string source2x = textProp(image, "source2x");
  const bool useSource2x = !source2x.empty() && scale >= 2;
  if (useSource2x) source = source2x;
  const VectorPicture* picture = images_.vector(source);
  const Bitmap* bitmap = picture != nullptr ? nullptr : images_.get(source);
  const bool drawable =
      picture != nullptr || (bitmap != nullptr && bitmap->width != 0);
  if (!drawable) return;

  ImageFilters filters;
  filters.grayscale = flag(image, "grayscale");
  filters.washedOut = flag(image, "washedOut");
  const std::string silhouette = textProp(image, "silhouette");
  filters.silhouetteBlack = silhouette == "black";
  filters.silhouetteGrey = silhouette == "grey";
  const auto inkProp = [&](const char* key) -> std::optional<style::Color> {
    const std::string name = textProp(image, key);
    return name.empty() ? std::nullopt : tokens_.ink(name, chrome);
  };
  filters.rim = inkProp("rim");
  filters.outline = inkProp("outline");
  if (const Json* shadow = prop(image, "shadow");
      shadow != nullptr && shadow->is_object()) {
    filters.shadow = tokens_.ink(shadow->value("ink", std::string()), chrome);
    filters.shadowOffset = shadow->value("offset", 1.0f);
  }
  const std::string filterKey =
      !filters.any()
          ? std::string()
          : "|f" + std::to_string(filters.grayscale) +
                std::to_string(filters.washedOut) +
                std::to_string(filters.silhouetteBlack) +
                std::to_string(filters.silhouetteGrey) +
                (filters.rim ? "r" + std::to_string(filters.rim->r) : "") +
                (filters.outline ? "o" + std::to_string(filters.outline->r) +
                                       std::to_string(filters.outline->g)
                                 : "") +
                (filters.shadow ? "s" + std::to_string(filters.shadow->r) : "");
  const int unit = std::max(1, static_cast<int>(std::lround(scale)));
  const Json* frames = picture != nullptr ? nullptr : prop(image, "frames");
  const int frameCount = frames != nullptr && frames->is_object()
                             ? std::max(1, frames->value("count", 1))
                             : 1;
  const float naturalWidth =
      picture != nullptr ? picture->width : static_cast<float>(bitmap->width);
  const float naturalHeight =
      picture != nullptr ? picture->height
                         : static_cast<float>(bitmap->height) / frameCount;
  const bool integerPixels = flag(image, "integerScale");
  const float sourceArtScale = std::max(1.0f, number(image, "artScale", 1));
  const float artScale =
      sourceArtScale * (integerPixels && useSource2x ? 2 : 1);

  UiRect shown = rect;
  if (flag(image, "contain")) {
    const float aspect = naturalWidth / naturalHeight;
    if (rect.width / rect.height > aspect) {
      shown.width = rect.height * aspect;
      shown.x += (rect.width - shown.width) / 2;
    } else {
      shown.height = rect.width / aspect;
      shown.y += (rect.height - shown.height) / 2;
    }
  }
  bool integerFitted = false;
  if (bitmap != nullptr && integerPixels) {
    const float artWidth = naturalWidth / artScale;
    const float artHeight = naturalHeight / artScale;
    const float fittingScale = std::min(rect.width * scale / artWidth,
                                        rect.height * scale / artHeight);
    const float wholeScale = std::floor(fittingScale + 0.001f);
    // An undersized slot keeps its ordinary fit instead of losing the image.
    if (wholeScale >= 1) {
      shown.width = artWidth * wholeScale / scale;
      shown.height = artHeight * wholeScale / scale;
      shown.x = rect.x + (rect.width - shown.width) / 2;
      shown.y = rect.y + (rect.height - shown.height) / 2;
      integerFitted = true;
    }
  }
  const auto position = [&](float value) {
    // The fitted art owns its device-pixel grid inside the fractional UI slot.
    return integerFitted ? std::round(value * scale)
                         : snap(std::round(value), scale);
  };
  const float opacity = number(image, "opacity", 1) * state.opacity;
  const std::uint8_t stipple =
      flag(image, "stipple")
          ? static_cast<std::uint8_t>(
                std::max(1, snap(tokens_.effects().stippleSize / 2, scale)))
          : 0;
  const auto tint = inkProp("tint");
  const style::Color color =
      faded(tint ? *tint : style::Color{255, 255, 255, 255}, opacity);
  const auto drawQuad = [&](float x0, float y0, float x1, float y1,
                            const AtlasEntry& entry, float v0, float height,
                            bool smooth) {
    state.list->quads.push_back(Quad{
        x0, y0, x1, y1, static_cast<float>(entry.x) / kAtlasSize,
        v0 / kAtlasSize, static_cast<float>(entry.x + entry.width) / kAtlasSize,
        (v0 + height) / kAtlasSize, color.r, color.g, color.b, color.a,
        tint ? QuadMode::Mask : QuadMode::Picture,
        static_cast<std::uint8_t>(entry.page), stipple, smooth, state.clip});
  };

  if (picture != nullptr) {
    // Drawn at its very device pixels, never resampled.
    const int x0 = position(shown.x + state.dx);
    const int y0 = position(shown.y + state.dy);
    const int width = position(shown.x + shown.width + state.dx) - x0;
    const int height = position(shown.y + shown.height + state.dy) - y0;
    const int dot = ditherDot(screenScale_);
    const int period = 4 * dot;
    const std::string key = "v|" + source + "|" + std::to_string(width) + "x" +
                            std::to_string(height) + "|d" + std::to_string(dot) +
                            "|" + std::to_string((x0 % period + period) % period) +
                            "," + std::to_string((y0 % period + period) % period) +
                            filterKey;
    int padLeft = 0;
    int padTop = 0;
    std::optional<AtlasEntry> entry;
    if (const AtlasEntry* known = atlas_.find(key)) {
      entry = *known;
      padLeft = known->left;
      padTop = known->top;
    } else {
      VectorRaster raster;
      raster.width = width;
      raster.height = height;
      raster.dot = dot;
      raster.screenX = x0;
      raster.screenY = y0;
      raster.ink = [this](style::Color ink) { return tokens_.drawnAs(ink); };
      Bitmap baked = rasterizeVector(*picture, raster);
      if (filters.any()) baked = applyFilters(baked, filters, unit, padLeft, padTop);
      entry = atlas_.add(key, baked.width, baked.height, premultiplied(baked),
                         padLeft, padTop);
    }
    if (!entry) return;
    drawQuad(static_cast<float>(x0 - padLeft), static_cast<float>(y0 - padTop),
             static_cast<float>(x0 - padLeft + entry->width),
             static_cast<float>(y0 - padTop + entry->height), *entry,
             static_cast<float>(entry->y), static_cast<float>(entry->height),
             false);
    return;
  }

  // Baked at whole device pixels per picture pixel, so a pixelated picture
  // samples nearest and its filters reach whole pixels.
  const float drawnWidth = (integerFitted ? shown.width : rect.width) * scale;
  const float ratio = drawnWidth / bitmap->width;
  // Pixel art kept larger than it is drawn (the toolbox's 4x copies) lands
  // evenly only on whole device pixels per art pixel; between them, the mips
  // sampled smoothly keep every art pixel the same width.
  const float artRatio = ratio * artScale;
  const bool evenArt = std::abs(artRatio - std::round(artRatio)) < 0.01f;
  const bool unevenShrunkArt = artScale > 1 && ratio < 1 && !evenArt;
  const bool smooth =
      !integerPixels && (flag(image, "smooth") || unevenShrunkArt);
  // Nearest sampling at a fractional ratio alternates wide and narrow
  // pixels; baked up to the next whole ratio and sampled down smoothly,
  // every picture pixel comes out the same width, with soft seams.
  const bool wholeRatio = std::abs(ratio - std::round(ratio)) < 0.01f;
  bool sharpBilinear = !integerPixels && !smooth && ratio > 1 && !wholeRatio;
  int factor = std::max(1, static_cast<int>(std::lround(ratio)));
  if (smooth) factor = 1;
  if (sharpBilinear) factor = static_cast<int>(std::ceil(ratio));
  // A bake must fit one atlas page, or the picture vanishes; past it, the
  // largest factor that fits is stretched the rest of the way.
  // The margin leaves room for the gutter and a filter's outline.
  constexpr int kLargestBake = kAtlasSize - 16;
  const int largestSide = std::max(bitmap->width, bitmap->height);
  const int fittingFactor = std::max(1, kLargestBake / largestSide);
  if (factor > fittingFactor) {
    factor = fittingFactor;
    sharpBilinear = !integerPixels;
  }
  int mip = 0;
  int imageWidth = bitmap->width * factor;
  int imageHeight = bitmap->height * factor;
  if (smooth && frameCount == 1) {
    while (imageWidth / 2 >= std::max(1.0f, drawnWidth) &&
           imageHeight / 2 >= std::max(1.0f, rect.height * scale)) {
      ++mip;
      imageWidth /= 2;
      imageHeight /= 2;
    }
  }
  const std::string key = "i|" + source + "|" + std::to_string(factor) + "|m" +
                          std::to_string(mip) + filterKey;
  int padLeft = 0;
  int padTop = 0;
  const AtlasEntry* known = atlas_.find(key);
  std::optional<AtlasEntry> entry;
  if (known != nullptr) {
    entry = *known;
    padLeft = known->left;
    padTop = known->top;
  } else {
    Bitmap baked = mip > 0 ? imageMip(*bitmap, mip) : scaleNearest(*bitmap, factor);
    if (filters.any()) baked = applyFilters(baked, filters, unit, padLeft, padTop);
    entry = atlas_.add(key, baked.width, baked.height, premultiplied(baked),
                       padLeft, padTop);
  }
  if (!entry) return;

  // A strip of frames shows one at a time.
  float frameV0 = static_cast<float>(entry->y);
  float frameHeight = static_cast<float>(entry->height);
  if (frameCount > 1) {
    frameHeight = static_cast<float>(entry->height) / frameCount;
  }
  // Under reduced motion a strip holds its first frame.
  if (frameCount > 1 && !reducedMotion_) {
    const float frameMs = std::max(1.0f, frames->value("frameMs", 100.0f));
    const int frame = static_cast<int>(
        std::fmod(nowMs_ / frameMs, static_cast<double>(frameCount)));
    frameV0 = entry->y + frame * frameHeight;
    const double nextFrameMs = (std::floor(nowMs_ / frameMs) + 1) * frameMs;
    repaintAtMs_ = std::min(repaintAtMs_, nextFrameMs);
  }
  const float x0 = position(shown.x + state.dx) - padLeft;
  const float y0 = position(shown.y + state.dy) - padTop;
  const float x1 = position(shown.x + shown.width + state.dx) +
                   (entry->width - padLeft - imageWidth);
  const float y1 =
      position(shown.y + shown.height + state.dy) +
      (frameCount > 1 ? 0 : entry->height - padTop - imageHeight);
  drawQuad(x0, y0, x1, y1, *entry, frameV0, frameHeight, smooth || sharpBilinear);
}

void View::paintField(int id, const UiRect& rect, PaintState& state) {
  const Node& field = *node(id);
  const style::Chrome chrome = chromeOf(id);
  const float scale = state.scale;
  const std::string kind = textProp(field, "kind");
  const bool bare = flag(field, "bare");
  const int x0 = snap(rect.x + state.dx, scale);
  const int y0 = snap(rect.y + state.dy, scale);
  const int x1 = snap(rect.x + rect.width + state.dx, scale);
  const int y1 = snap(rect.y + rect.height + state.dy, scale);
  const auto white = [&](int ax, int ay, int bx, int by, style::Color color,
                         std::uint8_t stipple = 0) {
    color = faded(color, state.opacity);
    if (bx <= ax || by <= ay) return;
    state.list->quads.push_back(Quad{
        static_cast<float>(ax), static_cast<float>(ay), static_cast<float>(bx),
        static_cast<float>(by), atlas_.whiteU(), atlas_.whiteV(),
        atlas_.whiteU(), atlas_.whiteV(), color.r, color.g, color.b, color.a,
        QuadMode::Fill, 0, stipple, false, state.clip});
  };
  const auto bevel = [&](const char* recipe, int ax, int ay, int bx, int by) {
    const auto lines = tokens_.bevel(recipe, chrome);
    for (auto line = lines.rbegin(); line != lines.rend(); ++line) {
      const int w = std::max(1, snap(line->width, scale));
      using Side = style::BevelLine::Side;
      if (line->side == Side::Ring || line->side == Side::TopLeft) {
        white(ax, ay, bx, ay + w, line->color);
        white(ax, ay, ax + w, by, line->color);
      }
      if (line->side == Side::Ring || line->side == Side::BottomRight) {
        white(ax, by - w, bx, by, line->color);
        white(bx - w, ay, bx, by, line->color);
      }
    }
  };

  if (kind == "range") {
    // The kit's slider: a well of the track's ink, and a raised thumb on it.
    const bool disabled = flag(field, "disabled");
    const auto face = tokens_.ink("face", chrome).value_or(style::Color{});
    const auto track =
        tokens_.ink("scrollbar-track", chrome).value_or(style::Color{});
    const auto stipple = static_cast<std::uint8_t>(
        std::max(1, snap(tokens_.effects().stippleSize / 2, scale)));
    const float minimum = number(field, "min", 0);
    const float maximum = number(field, "max", 100);
    const std::string valueText = textProp(field, "value");
    const float value =
        valueText.empty() ? minimum : std::strtof(valueText.c_str(), nullptr);
    white(x0, y0, x1, y1, track);
    if (disabled) {
      const int inset = snap(2, scale);
      white(x0 + inset, y0 + inset, x1 - inset, y1 - inset, face, stipple);
    }
    bevel("thumb-pressed", x0, y0, x1, y1);
    const int thumbWidth = snap(56, scale);
    const float share =
        maximum > minimum
            ? std::clamp((value - minimum) / (maximum - minimum), 0.0f, 1.0f)
            : 0;
    const int thumbLeft =
        x0 + snap(2, scale) +
        static_cast<int>(share * (x1 - x0 - thumbWidth - snap(4, scale)));
    const int thumbTop = y0 + snap(2, scale);
    const int thumbBottom = y1 - snap(2, scale);
    white(thumbLeft, thumbTop, thumbLeft + thumbWidth, thumbBottom, face);
    if (disabled) {
      const int inset = snap(3, scale);
      white(thumbLeft + inset, thumbTop + inset, thumbLeft + thumbWidth - inset,
            thumbBottom - inset, track, stipple);
    }
    bevel("raised", thumbLeft, thumbTop, thumbLeft + thumbWidth, thumbBottom);
    // The central score marks the value precisely despite the broad thumb.
    const int scoreLeft = thumbLeft + (thumbWidth - snap(4, scale)) / 2;
    const int scoreTop = thumbTop + snap(4, scale);
    const int scoreBottom = thumbBottom - snap(4, scale);
    white(scoreLeft, scoreTop, scoreLeft + snap(2, scale), scoreBottom,
          tokens_.ink("mid", chrome).value_or(style::Color{}));
    white(scoreLeft + snap(2, scale), scoreTop, scoreLeft + snap(4, scale),
          scoreBottom, tokens_.ink("shade", chrome).value_or(style::Color{}));
  } else {
    if (!bare) {
      white(x0, y0, x1, y1,
            tokens_.ink("paper", chrome).value_or(style::Color{}));
      bevel("field", x0, y0, x1, y1);
    }
    std::string value = textProp(field, "value");
    const bool placeholder = value.empty();
    if (placeholder) value = textProp(field, "placeholder");
    const std::string styleName = textProp(field, "typeStyle");
    const style::TypeStyle* type =
        tokens_.type(styleName.empty() ? "text-field" : styleName, language_);
    if (type != nullptr && !value.empty()) {
      text::Span span;
      span.text = value;
      span.type = type;
      span.node = id;
      text::ParagraphOptions options;
      options.language = language_;
      options.strut = type;
      options.preserveBreaks = kind == "multiline";
      options.nowrap = kind != "multiline";
      options.maxWidth = std::max(0.0f, rect.width - 16);
      const std::string align = textProp(field, "align");
      if (align == "center") options.align = text::ParagraphOptions::Align::Center;
      if (align == "end") options.align = text::ParagraphOptions::Align::End;
      Place& textPlace = *places_.at(id);
      textPlace.paragraph = typesetter_.set({span}, options);
      textPlace.spanNodes = {id};
      UiRect textRect = rect;
      textRect.x += 8;
      textRect.width -= 16;
      if (kind != "multiline") {
        textRect.y += (rect.height - textPlace.paragraph.height) / 2;
      } else {
        textRect.y += 2;
      }
      PaintState inner = state;
      if (placeholder || flag(field, "disabled")) {
        // The placeholder and a dead field's value take the mid ink.
        const std::string saved = textProp(field, "ink");
        (void)saved;
      }
      // Clip the value to the field's box.
      const Clip& outer = inner.list->clips[inner.clip];
      const int left = std::max(outer.x, x0);
      const int top = std::max(outer.y, y0);
      const int right = std::min(outer.x + outer.width, x1);
      const int bottom = std::min(outer.y + outer.height, y1);
      inner.list->clips.push_back(
          Clip{left, top, std::max(0, right - left), std::max(0, bottom - top)});
      inner.clip = static_cast<std::uint16_t>(inner.list->clips.size() - 1);
      if (placeholder) inner.opacity *= 0.55f;
      paintText(id, textRect, inner);
    }
    // The caret, while the field has the keyboard: on for half a second,
    // off for half, from the last key.
    const bool caretOn =
        focused_ == id && !flag(field, "readOnly") &&
        std::fmod(nowMs_ - caretMovedMs_, 1000.0) < 500.0;
    if (focused_ == id) {
      // The caret toggles every half second from the last key.
      const double sinceMoved = nowMs_ - caretMovedMs_;
      const double nextToggleMs =
          caretMovedMs_ + (std::floor(sinceMoved / 500.0) + 1) * 500.0;
      repaintAtMs_ = std::min(repaintAtMs_, nextToggleMs);
    }
    if (caretOn && type != nullptr) {
      const Live& live = live_[id];
      const std::string current = textProp(field, "value");
      const size_t caret = std::min(live.caret, current.size());
      // The caret is measured from where the aligned line starts, which an
      // empty field takes at its alignment's edge.
      const std::string align = textProp(field, "align");
      const float textWidth = std::max(0.0f, rect.width - 16);
      float caretX = 0;
      if (!current.empty() && !places_.at(id)->paragraph.lines.empty()) {
        caretX = places_.at(id)->paragraph.lines[0].x;
      } else if (align == "end") {
        caretX = textWidth;
      } else if (align == "center") {
        caretX = textWidth / 2;
      }
      if (caret > 0) {
        text::Span before;
        before.text = current.substr(0, caret);
        before.type = type;
        text::ParagraphOptions options;
        options.nowrap = true;
        options.language = language_;
        caretX += typesetter_.set({before}, options).width;
      }
      const int cx = snap(rect.x + state.dx + 8 + caretX, scale);
      const int ch = snap(type->lineHeight, scale);
      const int cy = y0 + (y1 - y0 - ch) / 2;
      white(cx, cy, cx + std::max(1, snap(1, scale)), cy + ch,
            inkOf(id).value_or(style::Color{0, 0, 0, 255}));
    }
  }
  // A bare field's mark is its cell's (the field-cell look's focusWithin).
  if (!bare) paintFocusMark(id, rect, state);
}

void View::paintPlot(int id, const UiRect& rect, PaintState& state) {
  const Node& plot = *node(id);
  const float scale = state.scale;
  const style::Chrome chrome = chromeOf(id);
  const Json* commands = prop(plot, "commands");
  if (commands == nullptr) return;
  const std::string key = "plot|" + std::to_string(std::hash<std::string>{}(
                                        commands->dump())) +
                          "|" + std::to_string(std::lround(rect.width * scale)) +
                          "x" + std::to_string(std::lround(rect.height * scale)) +
                          "|" + std::to_string(static_cast<int>(chrome));
  const InkLookup ink = [&](const std::string& name) {
    return tokens_.ink(name, chrome);
  };
  // A wide chart at a large UI scale outgrows an atlas page, so the drawing
  // goes into the atlas as tiles that each fit one.
  constexpr int kTile = kAtlasSize / 2;
  const int pixelWidth = std::max(1, snap(rect.width, scale));
  const int pixelHeight = std::max(1, snap(rect.height, scale));
  std::optional<Bitmap> raster;
  // Placed as a box is, so a drawing lines up with the boxes around it.
  const float x0 = static_cast<float>(snap(std::round(rect.x + state.dx), scale));
  const float y0 = static_cast<float>(snap(std::round(rect.y + state.dy), scale));
  const std::uint8_t stipple =
      flag(plot, "stipple")
          ? static_cast<std::uint8_t>(
                std::max(1, snap(tokens_.effects().stippleSize / 2, scale)))
          : 0;
  const style::Color white = faded(style::Color{255, 255, 255, 255}, state.opacity);
  for (int tileY = 0; tileY < pixelHeight; tileY += kTile) {
    for (int tileX = 0; tileX < pixelWidth; tileX += kTile) {
      const std::string tileKey =
          key + "|" + std::to_string(tileX) + "," + std::to_string(tileY);
      std::optional<AtlasEntry> entry;
      if (const AtlasEntry* known = atlas_.find(tileKey)) {
        entry = *known;
      } else {
        if (!raster) {
          raster = rasterizePlot(*commands, rect.width, rect.height, scale, ink);
        }
        const Bitmap tile = cropped(*raster, tileX, tileY, kTile, kTile);
        entry = atlas_.add(tileKey, tile.width, tile.height, premultiplied(tile));
      }
      if (!entry) continue;
      const float left = x0 + static_cast<float>(tileX);
      const float top = y0 + static_cast<float>(tileY);
      state.list->quads.push_back(Quad{
          left, top, left + entry->width, top + entry->height,
          static_cast<float>(entry->x) / kAtlasSize,
          static_cast<float>(entry->y) / kAtlasSize,
          static_cast<float>(entry->x + entry->width) / kAtlasSize,
          static_cast<float>(entry->y + entry->height) / kAtlasSize, white.r,
          white.g, white.b, white.a, QuadMode::Picture,
          static_cast<std::uint8_t>(entry->page), stipple, false, state.clip});
    }
  }
  // The figures and pictures over the drawing, as quads of their own.
  const PlotOverlays overlay = plotOverlays(*commands);
  for (const auto& image : overlay.images) {
    const Bitmap* bitmap = images_.get(image.source);
    if (bitmap == nullptr) continue;
    const std::string imageKey = "i|" + image.source + "|1";
    std::optional<AtlasEntry> sprite =
        atlas_.find(imageKey) ? std::optional(*atlas_.find(imageKey))
                              : atlas_.add(imageKey, bitmap->width,
                                           bitmap->height, premultiplied(*bitmap));
    if (!sprite) continue;
    const style::Color white = faded(style::Color{255, 255, 255, 255}, state.opacity);
    state.list->quads.push_back(Quad{
        x0 + std::round(image.x * scale), y0 + std::round(image.y * scale),
        x0 + std::round((image.x + image.width) * scale),
        y0 + std::round((image.y + image.height) * scale),
        static_cast<float>(sprite->x) / kAtlasSize,
        static_cast<float>(sprite->y) / kAtlasSize,
        static_cast<float>(sprite->x + sprite->width) / kAtlasSize,
        static_cast<float>(sprite->y + sprite->height) / kAtlasSize, white.r,
        white.g, white.b, white.a, QuadMode::Picture,
        static_cast<std::uint8_t>(sprite->page), 0, false, state.clip});
  }
  for (const auto& figure : overlay.texts) {
    const style::TypeStyle* type = tokens_.type(figure.typeStyle, language_);
    if (type == nullptr) continue;
    text::Span span;
    span.text = figure.text;
    span.type = type;
    span.node = id;
    text::ParagraphOptions options;
    options.nowrap = true;
    options.language = language_;
    const text::Paragraph set = typesetter_.set({span}, options);
    if (set.lines.empty()) continue;
    const auto color = tokens_.ink(figure.ink, chrome).value_or(style::Color{});
    const text::Line& line = set.lines[0];
    float left = figure.x - set.width / 2;
    if (figure.align == PlotText::Align::Start) left = figure.x;
    if (figure.align == PlotText::Align::End) left = figure.x - set.width;
    const float top = figure.y - line.top - line.height / 2;
    for (const auto& glyph : line.glyphs) {
      Font* device = fonts_.scaled(glyph.font, scale);
      if (device == nullptr) continue;
      const float penX = x0 + (left + glyph.x) * scale;
      const float baseline = y0 + std::round((top + glyph.baseline) * scale);
      const float whole = std::floor(penX);
      const std::string glyphId =
          glyphKey(fonts_.sourceOf(device), device->size(), glyph.glyph, 0);
      std::optional<AtlasEntry> placed;
      if (const AtlasEntry* known = atlas_.find(glyphId)) {
        placed = *known;
      } else {
        const RasterGlyph raster = device->raster(glyph.glyph);
        std::vector<std::uint8_t> pixels(raster.coverage.size() * 4);
        for (size_t index = 0; index < raster.coverage.size(); ++index) {
          std::fill_n(&pixels[index * 4], 4, raster.coverage[index]);
        }
        placed = atlas_.add(glyphId, raster.width, raster.height, pixels,
                            raster.left, raster.top);
      }
      if (!placed || placed->width == 0) continue;
      const style::Color shown = faded(color, state.opacity);
      const float gx = whole + placed->left;
      const float gy = baseline - placed->top;
      state.list->quads.push_back(Quad{
          gx, gy, gx + placed->width, gy + placed->height,
          static_cast<float>(placed->x) / kAtlasSize,
          static_cast<float>(placed->y) / kAtlasSize,
          static_cast<float>(placed->x + placed->width) / kAtlasSize,
          static_cast<float>(placed->y + placed->height) / kAtlasSize, shown.r,
          shown.g, shown.b, shown.a, QuadMode::Mask,
          static_cast<std::uint8_t>(placed->page), 0, false, state.clip});
    }
  }
}

void View::paintScrollbars(int id, const UiRect& rect, PaintState& state) {
  const Place& place = *places_.at(id);
  const style::Chrome chrome = chromeOf(id);
  const float scale = state.scale;
  const float breadth = tokens_.effects().scrollbar;
  const Live& live = live_[id];
  const auto color = [&](const char* name) {
    return faded(tokens_.ink(name, chrome).value_or(style::Color{}), state.opacity);
  };
  const auto white = [&](float ax, float ay, float bx, float by,
                         style::Color shade) {
    const float x0 = std::round((ax + state.dx) * scale);
    const float y0 = std::round((ay + state.dy) * scale);
    const float x1 = std::round((bx + state.dx) * scale);
    const float y1 = std::round((by + state.dy) * scale);
    if (x1 <= x0 || y1 <= y0) return;
    state.list->quads.push_back(Quad{x0, y0, x1, y1, atlas_.whiteU(),
                                     atlas_.whiteV(), atlas_.whiteU(),
                                     atlas_.whiteV(), shade.r, shade.g, shade.b,
                                     shade.a, QuadMode::Fill, 0, 0, false,
                                     state.clip});
  };
  const auto bevel = [&](float ax, float ay, float bx, float by, const char* recipe) {
    const auto lines = tokens_.bevel(recipe, chrome);
    for (auto line = lines.rbegin(); line != lines.rend(); ++line) {
      const float w = std::max(1 / scale, std::round(line->width * scale) / scale);
      const style::Color shade = faded(line->color, state.opacity);
      using Side = style::BevelLine::Side;
      if (line->side == Side::Ring || line->side == Side::TopLeft) {
        white(ax, ay, bx, ay + w, shade);
        white(ax, ay, ax + w, by, shade);
      }
      if (line->side == Side::Ring || line->side == Side::BottomRight) {
        white(ax, by - w, bx, by, shade);
        white(bx - w, ay, bx, by, shade);
      }
    }
  };
  const auto sprite = [&](const std::string& name, float cx, float cy, float width, float height) {
    const std::string source = "/bureau/scroll-" + name + (scale >= 2 ? "@2x.png" : ".png");
    const Bitmap* bitmap = images_.get(source);
    if (bitmap == nullptr) return;
    const std::string key = "scroll|" + source;
    std::optional<AtlasEntry> entry;
    if (const auto* known = atlas_.find(key)) entry = *known;
    else entry = atlas_.add(key, bitmap->width, bitmap->height, premultiplied(*bitmap));
    if (!entry) return;
    const auto ink = faded(style::Color{255, 255, 255, 255}, state.opacity);
    // Background positions snap to whole UI pixels before display density.
    const float x0 = std::round(cx - width / 2 + state.dx) * scale;
    const float y0 = std::round(cy - height / 2 + state.dy) * scale;
    state.list->quads.push_back(Quad{
      x0, y0, x0 + width * scale, y0 + height * scale,
      float(entry->x) / kAtlasSize, float(entry->y) / kAtlasSize,
      float(entry->x + entry->width) / kAtlasSize, float(entry->y + entry->height) / kAtlasSize,
      ink.r, ink.g, ink.b, ink.a, QuadMode::Picture,
      static_cast<uint8_t>(entry->page), 0, true, state.clip});
  };
  // The key's arrow is engraved as a key's mark is (Mark.tsx).
  const auto arrow = [&](const std::string& direction, float cx, float cy, bool dead) {
    const float base = 9;
    const float rise = 5;
    const bool vertical = direction == "up" || direction == "down";
    const float width = vertical ? base : rise;
    const float height = vertical ? rise : base;
    std::vector<PlotPoint> art;
    if (direction == "up") art = {{base / 2, 0}, {base, rise}, {0, rise}};
    if (direction == "down") art = {{0, 0}, {base, 0}, {base / 2, rise}};
    if (direction == "left") art = {{0, base / 2}, {rise, 0}, {rise, base}};
    if (direction == "right") art = {{0, 0}, {rise, base / 2}, {0, base}};
    // Room down-right for the lit wall, a device pixel or two past the art.
    const float room = 2;
    const std::string key = "scroll-arrow|" + direction + "|" +
                            std::to_string(static_cast<int>(chrome)) + "|" +
                            (dead ? "dead" : "live") + "|" + std::to_string(scale);
    std::optional<AtlasEntry> entry;
    if (const auto* known = atlas_.find(key)) {
      entry = *known;
    } else {
      Bitmap pixels;
      pixels.width = static_cast<int>(std::lround((width + room) * scale));
      pixels.height = static_cast<int>(std::lround((height + room) * scale));
      pixels.rgba.assign(static_cast<size_t>(pixels.width) * pixels.height * 4, 0);
      const auto ink = [&](const char* name) {
        return tokens_.ink(name, chrome).value_or(style::Color{});
      };
      engrave(pixels, {art}, scale,
              {ink(dead ? "engraving-disabled" : "engraving-shadow"),
               ink(dead ? "engraving-disabled" : "engraving-floor"),
               ink("engraving-lit")});
      entry =
          atlas_.add(key, pixels.width, pixels.height, premultiplied(pixels));
    }
    if (!entry) return;
    const auto white = faded(style::Color{255, 255, 255, 255}, state.opacity);
    const float x0 = std::round(cx - width / 2 + state.dx) * scale;
    const float y0 = std::round(cy - height / 2 + state.dy) * scale;
    state.list->quads.push_back(Quad{
      x0, y0, x0 + entry->width, y0 + entry->height,
      float(entry->x) / kAtlasSize, float(entry->y) / kAtlasSize,
      float(entry->x + entry->width) / kAtlasSize, float(entry->y + entry->height) / kAtlasSize,
      white.r, white.g, white.b, white.a, QuadMode::Picture,
      static_cast<uint8_t>(entry->page), 0, false, state.clip});
  };
  const std::string scheme = chrome == style::Chrome::Dark ? "dark" : "light";
  const auto pressed = [&](bool horizontal, const char* part) {
    return press_.scroll == id && press_.scrollHorizontal == horizontal && press_.scrollPart == part;
  };
  const auto key = [&](float ax, float ay, bool horizontal, bool increment, bool disabled) {
    white(ax, ay, ax + breadth, ay + breadth, color("face"));
    const char* part = increment ? "increment" : "decrement";
    bevel(ax, ay, ax + breadth, ay + breadth, pressed(horizontal, part) ? "thumb-pressed" : "thumb");
    const std::string direction = horizontal ? (increment ? "right" : "left") : (increment ? "down" : "up");
    arrow(direction, ax + breadth / 2, ay + breadth / 2, disabled);
  };
  const auto thumb = [&](float ax, float ay, float bx, float by, bool horizontal) {
    white(ax, ay, bx, by, color("face"));
    bevel(ax, ay, bx, by, pressed(horizontal, "thumb") ? "thumb-pressed" : "thumb");
    const float centerX = (std::round(ax + state.dx) +
                           std::round(bx + state.dx)) / 2 - state.dx;
    const float centerY = (std::round(ay + state.dy) +
                           std::round(by + state.dy)) / 2 - state.dy;
    sprite("grip-" + scheme + (horizontal ? "-horizontal" : ""),
           centerX, centerY, 10, 10);
  };
  if (place.barVertical) {
    const float left = rect.x + rect.width - breadth;
    const float bottom = rect.y + rect.height - (place.barHorizontal ? breadth : 0);
    white(left, rect.y, left + breadth, bottom, color("scrollbar-track"));
    bevel(left, rect.y + breadth, left + breadth, bottom - breadth, "well");
    key(left, rect.y, false, false, !live.wantsBarVertical);
    key(left, bottom - breadth, false, true, !live.wantsBarVertical);
    const float track = bottom - rect.y - 2 * breadth;
    const float visible = rect.height;
    if (place.contentHeight > visible + 0.5f && track > 0) {
      const float length =
          std::min(track, std::max(24.0f, track * visible / place.contentHeight));
      const float travel = place.contentHeight - visible;
      const float top = rect.y + breadth +
                        (track - length) * (travel > 0 ? live.scrollY / travel : 0);
      thumb(left, top, left + breadth, top + length, false);
    }
  }
  if (place.barHorizontal) {
    const float top = rect.y + rect.height - breadth;
    const float right = rect.x + rect.width - (place.barVertical ? breadth : 0);
    white(rect.x, top, right, top + breadth, color("scrollbar-track"));
    bevel(rect.x + breadth, top, right - breadth, top + breadth, "well");
    key(rect.x, top, true, false, !live.wantsBarHorizontal);
    key(right - breadth, top, true, true, !live.wantsBarHorizontal);
    const float track = right - rect.x - 2 * breadth;
    const float visible = rect.width;
    if (place.contentWidth > visible + 0.5f && track > 0) {
      const float length = std::min(track, std::max(24.0f, track * visible / place.contentWidth));
      const float travel = place.contentWidth - visible;
      const float left = rect.x + breadth +
                         (track - length) * (travel > 0 ? live.scrollX / travel : 0);
      thumb(left, top, left + length, top + breadth, true);
    }
  }
}

}  // namespace bureau
