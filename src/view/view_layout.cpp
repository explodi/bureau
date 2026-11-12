// Layout: Yoga over the placement tree, text and pictures
// measured, each Layer a root of its own placed in its target, a Scroll's
// content laid out past its box with its bar's gutter kept.
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <limits>
#include <string>
#include <unordered_map>

#include <yoga/Yoga.h>

#include "format.h"
#include "labels.h"
#include "vector.h"
#include "view_internal.h"

namespace bureau {
namespace {

const Json* property(const Json& props, const char* key) {
  const auto found = props.find(key);
  return found == props.end() ? nullptr : &*found;
}

std::string name(const Json& props, const char* key) {
  const auto* value = property(props, key);
  return value != nullptr && value->is_string() ? value->get<std::string>()
                                                : "";
}

void length(YGNodeRef node, const Json& props, const char* key,
            void (*pixels)(YGNodeRef, float),
            void (*percent)(YGNodeRef, float)) {
  const auto* value = property(props, key);
  if (value == nullptr) return;
  if (value->is_number()) {
    pixels(node, value->get<float>());
    return;
  }
  if (!value->is_string()) return;
  const std::string text = value->get<std::string>();
  if (text.size() < 2 || text.back() != '%') return;
  const auto numeric = text.substr(0, text.size() - 1);
  char* end = nullptr;
  const float amount = std::strtof(numeric.c_str(), &end);
  if (end != numeric.c_str() && *end == '\0') percent(node, amount);
}

void edges(YGNodeRef node, const Json& props, const char* key,
           void (*set)(YGNodeRef, YGEdge, float), bool allowAuto = false) {
  const auto* value = property(props, key);
  if (value == nullptr) return;
  if (value->is_number()) {
    set(node, YGEdgeAll, value->get<float>());
    return;
  }
  if (value->is_string()) {
    if (allowAuto && *value == "auto")
      YGNodeStyleSetMarginAuto(node, YGEdgeAll);
    return;
  }
  if (!value->is_array()) return;
  const size_t count = value->size();
  if (count != 2 && count != 4) return;
  const YGEdge sides[] = {YGEdgeTop, YGEdgeRight, YGEdgeBottom, YGEdgeLeft};
  for (size_t index = 0; index < 4; ++index) {
    const size_t source = count == 2 ? index % 2 : index;
    const auto& part = (*value)[source];
    if (part.is_number()) set(node, sides[index], part.get<float>());
    if (allowAuto && part == "auto") {
      YGNodeStyleSetMarginAuto(node, sides[index]);
    }
  }
}

YGAlign alignment(const std::string& value) {
  if (value == "start") return YGAlignFlexStart;
  if (value == "center") return YGAlignCenter;
  if (value == "end") return YGAlignFlexEnd;
  if (value == "baseline") return YGAlignBaseline;
  return YGAlignStretch;
}

/** How a flex container arranges what it holds: its direction, wrapping,
 * gaps, alignment and justification. */
void applyContainerStyle(YGNodeRef node, const Json& props) {
  const std::string direction = name(props, "direction");
  YGFlexDirection flexDirection = YGFlexDirectionRow;
  if (direction == "column") flexDirection = YGFlexDirectionColumn;
  if (direction == "row-reverse") flexDirection = YGFlexDirectionRowReverse;
  if (direction == "column-reverse")
    flexDirection = YGFlexDirectionColumnReverse;
  YGNodeStyleSetFlexDirection(node, flexDirection);
  const auto* wrap = property(props, "wrap");
  if (wrap != nullptr && *wrap == true)
    YGNodeStyleSetFlexWrap(node, YGWrapWrap);
  const auto* gap = property(props, "gap");
  if (gap != nullptr && gap->is_number()) {
    YGNodeStyleSetGap(node, YGGutterAll, gap->get<float>());
  } else if (gap != nullptr && gap->is_array() && gap->size() == 2) {
    if ((*gap)[0].is_number()) {
      YGNodeStyleSetGap(node, YGGutterRow, (*gap)[0].get<float>());
    }
    if ((*gap)[1].is_number()) {
      YGNodeStyleSetGap(node, YGGutterColumn, (*gap)[1].get<float>());
    }
  }
  const std::string align = name(props, "align");
  if (!align.empty()) YGNodeStyleSetAlignItems(node, alignment(align));
  const std::string justify = name(props, "justify");
  if (justify == "start")
    YGNodeStyleSetJustifyContent(node, YGJustifyFlexStart);
  if (justify == "center") YGNodeStyleSetJustifyContent(node, YGJustifyCenter);
  if (justify == "end") YGNodeStyleSetJustifyContent(node, YGJustifyFlexEnd);
  if (justify == "between")
    YGNodeStyleSetJustifyContent(node, YGJustifySpaceBetween);
  if (justify == "around")
    YGNodeStyleSetJustifyContent(node, YGJustifySpaceAround);
  if (justify == "evenly")
    YGNodeStyleSetJustifyContent(node, YGJustifySpaceEvenly);
}

/** A Box's flex properties onto a Yoga node. */
void applyBoxStyle(YGNodeRef node, const Json& props) {
  applyContainerStyle(node, props);
  YGNodeStyleSetMinWidth(node, 0);
  YGNodeStyleSetMinHeight(node, 0);
  YGNodeStyleSetPositionType(node, name(props, "position") == "absolute"
                                       ? YGPositionTypeAbsolute
                                       : YGPositionTypeRelative);

  const auto* grow = property(props, "grow");
  if (grow != nullptr && grow->is_number()) {
    YGNodeStyleSetFlexGrow(node, grow->get<float>());
  }
  const auto* shrink = property(props, "shrink");
  if (shrink != nullptr && shrink->is_number()) {
    YGNodeStyleSetFlexShrink(node, shrink->get<float>());
  }
  length(node, props, "basis", YGNodeStyleSetFlexBasis,
         YGNodeStyleSetFlexBasisPercent);
  length(node, props, "width", YGNodeStyleSetWidth, YGNodeStyleSetWidthPercent);
  length(node, props, "height", YGNodeStyleSetHeight,
         YGNodeStyleSetHeightPercent);
  length(node, props, "minWidth", YGNodeStyleSetMinWidth,
         YGNodeStyleSetMinWidthPercent);
  length(node, props, "minHeight", YGNodeStyleSetMinHeight,
         YGNodeStyleSetMinHeightPercent);
  length(node, props, "maxWidth", YGNodeStyleSetMaxWidth,
         YGNodeStyleSetMaxWidthPercent);
  length(node, props, "maxHeight", YGNodeStyleSetMaxHeight,
         YGNodeStyleSetMaxHeightPercent);
  edges(node, props, "padding", YGNodeStyleSetPadding);
  edges(node, props, "margin", YGNodeStyleSetMargin, true);
  const std::string self = name(props, "alignSelf");
  if (!self.empty() && self != "auto") {
    YGNodeStyleSetAlignSelf(node, alignment(self));
  }

  const auto* inset = property(props, "inset");
  if (inset != nullptr && inset->is_object() && name(props, "position") != "sticky") {
    const struct {
      const char* name;
      YGEdge edge;
    } sides[] = {{"top", YGEdgeTop},
                 {"right", YGEdgeRight},
                 {"bottom", YGEdgeBottom},
                 {"left", YGEdgeLeft}};
    for (const auto& side : sides) {
      const auto* value = property(*inset, side.name);
      if (value != nullptr && value->is_number()) {
        YGNodeStyleSetPosition(node, side.edge, value->get<float>());
      }
    }
  }
  if (name(props, "overflow") == "hidden") {
    YGNodeStyleSetOverflow(node, YGOverflowHidden);
  }
}

/** What a Yoga node stands for. */
struct Built {
  YGNodeRef yoga = nullptr;
  /** The tree node, or the first of a run of loose text. */
  int id = 0;
  bool anonymousText = false;
  std::vector<int> textRun;
  std::vector<Built> children;
};

struct PlacementSpace {
  UiRect clip;
  bool clipped;
  UiRect scrollport;
  UiRect containing;
  /** UI pixels on the screen per pixel what it holds lays out in. */
  float scale = 1;
};

/** The design size a box lays what it holds out at when its content box is
 * smaller (`scaleBelow`), 0 along a side it leaves free; none for a box
 * that does not scale. */
std::optional<std::pair<float, float>> scaleBelow(const Node& node) {
  const Json* design = prop(node, "scaleBelow");
  if (design == nullptr || !design->is_object()) return std::nullopt;
  return std::pair{design->value("width", 0.0f), design->value("height", 0.0f)};
}

/** How far a box scales what it holds down: as far as its tighter side
 * needs to hold the design size, never up. A box with no room at all still
 * lays its content out, drawn too small to see. */
float scaleDown(std::pair<float, float> design, float width, float height) {
  const float acrossWidth = design.first > 0 ? width / design.first : 1;
  const float acrossHeight = design.second > 0 ? height / design.second : 1;
  return std::clamp(std::min(acrossWidth, acrossHeight), 0.01f, 1.0f);
}

UiRect stickyRect(const Node& node, YGNodeRef yoga, UiRect rect,
                  const PlacementSpace& space) {
  const Json* inset = prop(node, "inset");
  if (!isSticky(node) || inset == nullptr || !inset->is_object()) return rect;
  const auto edge = [&](const char* name) -> std::optional<float> {
    const auto found = inset->find(name);
    if (found == inset->end() || !found->is_number()) return std::nullopt;
    return found->get<float>() * space.scale;
  };
  const auto position = [&](bool horizontal) {
    const auto start = edge(horizontal ? "left" : "top");
    const auto end = edge(horizontal ? "right" : "bottom");
    const float normal = horizontal ? rect.x : rect.y;
    if (!start && !end) return normal;
    const float size = horizontal ? rect.width : rect.height;
    const float scrollStart = horizontal ? space.scrollport.x : space.scrollport.y;
    const float scrollSize = horizontal ? space.scrollport.width : space.scrollport.height;
    const float containerStart = horizontal ? space.containing.x : space.containing.y;
    const float containerSize = horizontal ? space.containing.width : space.containing.height;
    const float viewStart = scrollStart + start.value_or(0);
    // A sticky view shorter than its box grows at its end edge, so the box
    // stays whole while it sticks.
    const float viewEnd = std::max(scrollStart + scrollSize - end.value_or(0),
                                   viewStart + size);
    float desired = normal;
    if (start) desired = std::max(desired, viewStart);
    if (end) desired = std::min(desired, viewEnd - size);
    const float marginStart = std::min(
        YGNodeLayoutGetMargin(yoga, horizontal ? YGEdgeLeft : YGEdgeTop) *
            space.scale,
        normal - containerStart);
    const float marginEnd = std::min(
        YGNodeLayoutGetMargin(yoga, horizontal ? YGEdgeRight : YGEdgeBottom) *
            space.scale,
        containerStart + containerSize - normal - size);
    const float minimumShift = std::min(0.0f, containerStart + marginStart - normal);
    const float maximumShift = std::max(
        0.0f, containerStart + containerSize - marginEnd - normal - size);
    return normal + std::clamp(desired - normal, minimumShift, maximumShift);
  };
  rect.x = position(true);
  rect.y = position(false);
  return rect;
}

/** The same edge but for Yoga's rounding of either to the pixel. */
bool sameEdge(float a, float b) {
  constexpr float kSlack = 0.5f;
  return std::abs(a - b) < kSlack;
}

/** A text leaf's measure: its runs set at the width Yoga offers. */
struct TextMeasure {
  text::Typesetter* typesetter = nullptr;
  std::vector<text::Span> spans;
  text::ParagraphOptions options;
  bool truncates = false;
  std::map<long, text::Paragraph> cache;
  /** Sizes the inline boxes for a line of this width, when it holds any. */
  std::function<void(std::vector<text::Span>&, float)> sizeAtoms;

  const text::Paragraph& at(float width) {
    const long key =
        std::isfinite(width) ? std::lround(width * 64) : std::numeric_limits<long>::max();
    auto found = cache.find(key);
    if (found != cache.end()) return found->second;
    text::ParagraphOptions sized = options;
    sized.maxWidth = width;
    if (!sizeAtoms) {
      return cache.emplace(key, typesetter->set(spans, sized)).first->second;
    }
    std::vector<text::Span> sizedSpans = spans;
    sizeAtoms(sizedSpans, width);
    return cache.emplace(key, typesetter->set(sizedSpans, sized)).first->second;
  }
};

YGSize measureTextLeaf(YGNodeConstRef node, float width, YGMeasureMode widthMode,
                   float, YGMeasureMode) {
  auto* measure = static_cast<TextMeasure*>(YGNodeGetContext(node));
  const float offered = widthMode == YGMeasureModeUndefined
                            ? std::numeric_limits<float>::infinity()
                            : width;
  const text::Paragraph& paragraph = measure->at(offered);
  float measured = paragraph.width;
  if (widthMode == YGMeasureModeExactly) measured = width;
  if (widthMode == YGMeasureModeAtMost && measure->truncates) {
    measured = std::min(measured, width);
  }
  return YGSize{measured, paragraph.height};
}

bool hidden(const Node& node) { return flag(node, "__hidden"); }

}  // namespace

text::ParagraphOptions View::paragraphOptions(int id) const {
  text::ParagraphOptions options;
  options.language = language_;
  const Node* found = node(id);
  if (found == nullptr || found->type != kText) return options;
  const int lines = static_cast<int>(number(*found, "lines", 0));
  options.maxLines = lines;
  options.nowrap = lines == 1 || flag(*found, "nowrap");
  options.ellipsis = flag(*found, "ellipsis");
  options.preserveBreaks = flag(*found, "preserveBreaks");
  options.breakAnywhere = flag(*found, "breakAnywhere");
  const std::string align = textProp(*found, "align");
  if (align == "center") options.align = text::ParagraphOptions::Align::Center;
  if (align == "end") options.align = text::ParagraphOptions::Align::End;
  if (align == "justify" || align == "justify-characters") {
    options.align = text::ParagraphOptions::Align::Justify;
  }
  options.strut = typeOf(id);
  options.strutScale = number(*found, "scale", 1);
  if (const Json* fit = prop(*found, "fit");
      fit != nullptr && fit->is_object()) {
    options.fitMinSize = fit->value("minSize", 0.0f);
  }
  return options;
}

bool View::holdsBlocks(int id) const {
  const Node* found = node(id);
  if (found == nullptr || found->type != kText) return false;
  for (const int child : found->children) {
    const Node* item = node(child);
    if (item == nullptr || hidden(*item)) continue;
    const bool block = item->type == kBox || item->type == kScroll ||
                       item->type == kField || item->type == kPlot;
    if (block && !has(*item, "inline")) return true;
  }
  return false;
}

void View::collectSpans(int id, std::vector<text::Span>& spans,
                        std::vector<int>& atoms,
                        const std::vector<int>* only) const {
  const Node* found = node(id);
  if (found == nullptr || hidden(*found)) return;
  const float scale = found->type == kText ? number(*found, "scale", 1) : 1;
  if (const Json* binding = prop(*found, "binding");
      binding != nullptr && binding->is_object()) {
    const std::string field = binding->value("field", std::string());
    const auto dot = field.find('.');
    const auto event = events_.find(field.substr(0, dot));
    const Json* value = event == events_.end() ? nullptr : &event->second;
    size_t start = dot == std::string::npos ? field.size() : dot + 1;
    while (value != nullptr && start < field.size()) {
      const auto end = field.find('.', start);
      const std::string part = field.substr(start, end - start);
      const auto child = value->is_object() ? value->find(part) : value->end();
      value = child == value->end() ? nullptr : &*child;
      start = end == std::string::npos ? field.size() : end + 1;
    }
    text::Span span;
    const auto format = binding->value("format", Json::object());
    if (value != nullptr && value->is_string()) {
      span.text = format.value("prefix", std::string()) + value->get<std::string>() +
                  format.value("suffix", std::string());
    } else {
      span.text = formatFigure(value != nullptr && value->is_number()
                                ? value->get<double>() : 0, format);
    }
    span.type = typeOf(id);
    span.scale = scale;
    span.node = id;
    spans.push_back(span);
    return;
  }
  // A count's figure at this moment, from its first value to its last.
  if (const Json* count = prop(*found, "count");
      count != nullptr && count->is_object()) {
    Live& live = live_[id];
    const std::string key = count->dump();
    if (live.count != key) {
      live.count = key;
      live.countStartMs = nowMs_;
    }
    const double from = count->value("from", 0.0);
    const double to = count->value("to", 0.0);
    const double duration = count->value("durationMs", 0.0);
    const double progress =
        duration <= 0 ? 1
                      : std::clamp((nowMs_ - live.countStartMs) / duration,
                                   0.0, 1.0);
    if (progress < 1) counting_ = true;
    text::Span span;
    span.text = formatFigure(from + (to - from) * progress,
                             count->value("format", Json::object()));
    span.type = typeOf(id);
    span.scale = scale;
    span.node = id;
    spans.push_back(span);
    return;
  }
  for (const int child : only != nullptr ? *only : found->children) {
    const Node* item = node(child);
    if (item == nullptr || hidden(*item) || item->type == kLayer) continue;
    if (item->type == kTextLeaf) {
      text::Span span;
      span.text = item->text;
      span.type = typeOf(id);
      span.scale = scale;
      span.node = child;
      spans.push_back(span);
    } else if (item->type == kText) {
      // A plate's sides take room on the line, as an inline element's
      // padding and margin do: empty boxes either side of the run.
      const Json* plate = prop(*item, "plate");
      const bool plated = plate != nullptr && plate->is_object();
      const auto padding = plated ? plate->value("padding", Json::array({0, 0}))
                                  : Json::array();
      const float padY = padding.size() > 0 ? padding[0].get<float>() : 0;
      const float padX = padding.size() > 1 ? padding[1].get<float>() : 0;
      const float trailing = plated ? plate->value("trailing", 0.0f) : 0;
      const auto spacer = [&](float width) {
        if (width <= 0) return;
        text::Span gap;
        gap.atom = true;
        gap.atomWidth = width;
        gap.atomHeight = 0;
        gap.type = typeOf(id);
        spans.push_back(gap);
      };
      spacer(padX);
      const size_t firstRun = spans.size();
      collectSpans(child, spans, atoms);
      if (plated) {
        for (size_t at = firstRun; at < spans.size(); ++at) {
          if (!spans[at].atom) spans[at].platePadding = padY;
        }
      }
      spacer(padX + trailing);
    } else {
      // A picture or a box set in the line, as one box.
      text::Span span;
      span.atom = true;
      span.node = child;
      span.type = typeOf(id);
      const Json* inlineProp = prop(*item, "inline");
      if (inlineProp != nullptr && inlineProp->is_object()) {
        const Json& align = (*inlineProp)["align"];
        span.atomMiddle = !align.is_number() && align != "baseline";
        if (align.is_number()) span.atomRaise = align.get<float>();
        span.atomTrailing = inlineProp->value("trailing", 0.0f);
      }
      spans.push_back(span);
      atoms.push_back(child);
    }
  }
}

void View::ensureLayout() {
  if (!layoutDirty_) return;
  layoutDirty_ = false;
  layoutTree();
  paintDirty_ = true;
  call(0, "__layout");
}

void View::layoutTree() {
  places_.clear();
  counting_ = false;
  YGConfigRef config = YGConfigNew();
  YGConfigSetUseWebDefaults(config, true);
  YGConfigSetPointScaleFactor(config, 0);
  std::vector<std::unique_ptr<TextMeasure>> measures;
  bool barsChanged = false;

  const auto place = [this](int id) -> Place& {
    auto& slot = places_[id];
    if (!slot) slot = std::make_unique<Place>();
    return *slot;
  };

  // A picture's size: its props, else its pixels (an SVG's own size), times
  // its pixel scale.
  const auto imageSize = [this](const Node& image) {
    const float scale = number(image, "pixelScale", 1);
    float width = number(image, "width", -1);
    float height = number(image, "height", -1);
    const std::string source = textProp(image, "source");
    const VectorPicture* vector = images_.vector(source);
    const Bitmap* bitmap = images_.get(source);
    const float naturalWidth = vector   ? vector->width
                               : bitmap ? static_cast<float>(bitmap->width)
                                        : 0;
    const float naturalHeight = vector   ? vector->height
                                : bitmap ? static_cast<float>(bitmap->height)
                                         : 0;
    const Json* frames = prop(image, "frames");
    const float frameCount =
        frames != nullptr && frames->is_object()
            ? std::max(1.0f, frames->value("count", 1.0f))
            : 1.0f;
    if (width < 0 && height < 0) {
      width = naturalWidth;
      height = naturalHeight / frameCount;
    } else if (width < 0) {
      width = naturalHeight > 0 ? height * naturalWidth / naturalHeight : 0;
    } else if (height < 0) {
      height = naturalWidth > 0 ? width * naturalHeight / naturalWidth : 0;
    }
    // Picture sizes floor to 1/64-point layout units, the grid text sets on.
    return std::pair{std::floor(width * scale * 64) / 64,
                     std::floor(height * scale * 64) / 64};
  };

  // Text's runs as a leaf of the flex box it stands in.
  const auto textLeaf = [&](YGNodeRef yoga, std::vector<text::Span> spans,
                            text::ParagraphOptions options, bool truncates,
                            std::function<void(std::vector<text::Span>&, float)>
                                sizeAtoms = nullptr) {
    auto measure = std::make_unique<TextMeasure>();
    measure->typesetter = &typesetter_;
    measure->spans = std::move(spans);
    measure->options = std::move(options);
    measure->truncates = truncates;
    measure->sizeAtoms = std::move(sizeAtoms);
    // A text shrinks no narrower than its longest word; a truncated text's
    // ellipsis lets it shrink to 0.
    const float minimum =
        truncates ? 0
                  : measure->at(std::numeric_limits<float>::infinity())
                        .minContentWidth;
    YGNodeStyleSetMinWidth(yoga, minimum);
    YGNodeSetContext(yoga, measure.get());
    YGNodeSetMeasureFunc(yoga, measureTextLeaf);
    measures.push_back(std::move(measure));
  };

  std::function<Built(int, float)> layoutAtom;
  std::function<void(Built&, int)> appendChildren;

  std::function<Built(int)> build = [&](int id) -> Built {
    Built built;
    built.id = id;
    built.yoga = YGNodeNewWithConfig(config);
    const Node* found = node(id);
    if (found == nullptr) return built;
    if (hidden(*found)) {
      YGNodeStyleSetDisplay(built.yoga, YGDisplayNone);
      return built;
    }
    const std::string_view type = found->type;
    if (type == kText && holdsBlocks(id)) {
      // Blocks in a column; each run of inline content between them an
      // anonymous block of lines, keyed by its first node.
      YGNodeStyleSetFlexDirection(built.yoga, YGFlexDirectionColumn);
      std::vector<int> run;
      const auto flush = [&] {
        if (run.empty()) return;
        Built item;
        item.id = run.front();
        item.anonymousText = true;
        item.textRun = run;
        item.yoga = YGNodeNewWithConfig(config);
        std::vector<text::Span> spans;
        std::vector<int> atoms;
        collectSpans(id, spans, atoms, &run);
        textLeaf(item.yoga, std::move(spans), paragraphOptions(id), false);
        YGNodeInsertChild(built.yoga, item.yoga, YGNodeGetChildCount(built.yoga));
        built.children.push_back(std::move(item));
        run.clear();
      };
      for (const int child : found->children) {
        const Node* item = node(child);
        if (item == nullptr || item->type == kLayer) continue;
        const bool block = (item->type == kBox || item->type == kScroll ||
                            item->type == kField || item->type == kPlot) &&
                           !has(*item, "inline");
        if (!block) {
          run.push_back(child);
          continue;
        }
        flush();
        Built inner = build(child);
        YGNodeInsertChild(built.yoga, inner.yoga, YGNodeGetChildCount(built.yoga));
        built.children.push_back(std::move(inner));
      }
      flush();
      return built;
    }
    if (type == kText) {
      std::vector<text::Span> spans;
      std::vector<int> atoms;
      collectSpans(id, spans, atoms);
      // An inline box is a layout of its own, sized for each line width the
      // paragraph is set at.
      const auto sizeAtoms = [&](std::vector<text::Span>& sized,
                                 float available) {
        for (auto& span : sized) {
          if (!span.atom) continue;
          const Node* atom = node(span.node);
          if (atom == nullptr) continue;
          if (atom->type == kImage) {
            const auto [width, height] = imageSize(*atom);
            span.atomWidth = width;
            span.atomHeight = height;
            continue;
          }
          // The line holds the box's margins, as it holds an inline-block's.
          Built inner = layoutAtom(span.node, available);
          span.atomWidth = YGNodeLayoutGetWidth(inner.yoga) +
                           YGNodeLayoutGetMargin(inner.yoga, YGEdgeLeft) +
                           YGNodeLayoutGetMargin(inner.yoga, YGEdgeRight);
          span.atomHeight = YGNodeLayoutGetHeight(inner.yoga) +
                            YGNodeLayoutGetMargin(inner.yoga, YGEdgeTop) +
                            YGNodeLayoutGetMargin(inner.yoga, YGEdgeBottom);
          YGNodeFreeRecursive(inner.yoga);
        }
      };
      const auto options = paragraphOptions(id);
      const bool truncates =
          options.maxLines > 0 || options.ellipsis || options.fitMinSize > 0;
      textLeaf(built.yoga, std::move(spans), options, truncates, sizeAtoms);
      return built;
    }
    if (type == kImage) {
      const auto [width, height] = imageSize(*found);
      YGNodeStyleSetWidth(built.yoga, width);
      YGNodeStyleSetHeight(built.yoga, height);
      YGNodeStyleSetFlexShrink(built.yoga, 0);
      if (flag(*found, "centered")) {
        YGNodeStyleSetMarginAuto(built.yoga, YGEdgeAll);
      }
      const Json* inlineProp = prop(*found, "inline");
      if (inlineProp != nullptr && inlineProp->is_object()) {
        YGNodeStyleSetMargin(built.yoga, YGEdgeRight,
                             inlineProp->value("trailing", 0.0f));
      }
      return built;
    }
    if (type == kPlot) {
      const float width = number(*found, "width", 0);
      const float height = number(*found, "height", 0);
      YGNodeStyleSetWidth(built.yoga, width);
      YGNodeStyleSetHeight(built.yoga, height);
      YGNodeStyleSetMinWidth(built.yoga, width);
      return built;
    }
    if (type == kField) {
      applyBoxStyle(built.yoga, found->props);
      const std::string kind = textProp(*found, "kind");
      const bool sized = has(*found, "width") || has(*found, "grow") ||
                         has(*found, "basis");
      const auto& effects = tokens_.effects();
      if (!sized) YGNodeStyleSetWidth(built.yoga, effects.fieldWidth);
      if (!has(*found, "height")) {
        const auto* fieldType = typeOf(id);
        const float line = fieldType != nullptr ? fieldType->lineHeight : 19.2f;
        YGNodeStyleSetHeight(built.yoga,
                             kind == "range"       ? effects.rangeHeight
                             : kind == "multiline" ? line * 2 + 4
                                                   : effects.fieldHeight);
      }
      return built;
    }

    // A Box, a Scroll or a Layer's root: a flex container.
    if (type != kLayer) applyBoxStyle(built.yoga, found->props);
    const bool scroll = type == kScroll;
    if (scroll) {
      YGNodeStyleSetOverflow(built.yoga, YGOverflowScroll);
      const Live& state = live_[id];
      const std::string bar = textProp(*found, "scrollbar");
      const float breadth = tokens_.effects().scrollbar;
      const std::string axis = textProp(*found, "axis");
      const bool vertical = axis != "horizontal";
      const bool horizontal = axis == "horizontal" || axis == "both";
      const bool always = bar == "always" || bar == "reserved";
      const bool shown = bar != "hidden";
      const auto padding = [&](YGEdge side, YGEdge axis) {
        auto value = YGNodeStyleGetPadding(built.yoga, side);
        if (value.unit == YGUnitUndefined) value = YGNodeStyleGetPadding(built.yoga, axis);
        if (value.unit == YGUnitUndefined) value = YGNodeStyleGetPadding(built.yoga, YGEdgeAll);
        return value.unit == YGUnitUndefined ? 0.0f : value.value;
      };
      const float padRight = padding(YGEdgeRight, YGEdgeHorizontal);
      const float padBottom = padding(YGEdgeBottom, YGEdgeVertical);
      if (shown && vertical && (always || state.wantsBarVertical)) {
        YGNodeStyleSetPadding(built.yoga, YGEdgeRight,
                              (std::isnan(padRight) ? 0 : padRight) + breadth);
      }
      if (shown && horizontal && (always || state.wantsBarHorizontal)) {
        YGNodeStyleSetPadding(built.yoga, YGEdgeBottom,
                              (std::isnan(padBottom) ? 0 : padBottom) + breadth);
      }
    }
    // What a box that scales down holds lays out on its own, at the design
    // size, once the box's own size is known (collect).
    if (!scaleBelow(*found)) appendChildren(built, id);
    return built;
  };

  // A container's children as its Yoga node's, each run of loose text one
  // item.
  appendChildren = [&](Built& built, int id) {
    const Node* found = node(id);
    const bool scroll = found->type == kScroll;
    const std::vector<int>& children = found->children;
    for (size_t index = 0; index < children.size(); ++index) {
      const Node* child = node(children[index]);
      if (child == nullptr || child->type == kLayer) continue;
      Built item;
      if (child->type == kTextLeaf) {
        // A run of loose text lays out as one item of its own.
        item.id = children[index];
        item.anonymousText = true;
        item.yoga = YGNodeNewWithConfig(config);
        std::vector<text::Span> spans;
        while (index < children.size()) {
          const Node* leaf = node(children[index]);
          if (leaf == nullptr || leaf->type != kTextLeaf) break;
          text::Span span;
          span.text = leaf->text;
          span.type = typeOf(id);
          span.node = children[index];
          spans.push_back(span);
          item.textRun.push_back(children[index]);
          ++index;
        }
        --index;
        text::ParagraphOptions options;
        options.language = language_;
        options.strut = typeOf(id);
        textLeaf(item.yoga, std::move(spans), options, false);
      } else {
        item = build(children[index]);
      }
      // What a Scroll holds keeps its size along the scroll: it scrolls
      // rather than squashes.
      if (scroll && child->type != kTextLeaf && !has(*child, "shrink")) {
        YGNodeStyleSetFlexShrink(item.yoga, 0);
      }
      YGNodeInsertChild(built.yoga, item.yoga, YGNodeGetChildCount(built.yoga));
      built.children.push_back(std::move(item));
    }
  };

  // An inline box laid out alone. Its percentage widths are of the line's
  // width, as an inline-block's are of its containing block; while the line
  // is measured at its content (no width), they count as auto.
  layoutAtom = [&](int id, float available) -> Built {
    Built inner = build(id);
    if (std::isfinite(available)) {
      const YGValue width = YGNodeStyleGetWidth(inner.yoga);
      const YGValue minWidth = YGNodeStyleGetMinWidth(inner.yoga);
      const YGValue maxWidth = YGNodeStyleGetMaxWidth(inner.yoga);
      if (width.unit == YGUnitPercent) {
        YGNodeStyleSetWidth(inner.yoga, available * width.value / 100);
      }
      if (minWidth.unit == YGUnitPercent) {
        YGNodeStyleSetMinWidth(inner.yoga, available * minWidth.value / 100);
      }
      if (maxWidth.unit == YGUnitPercent) {
        YGNodeStyleSetMaxWidth(inner.yoga, available * maxWidth.value / 100);
      }
    }
    YGNodeCalculateLayout(inner.yoga, YGUndefined, YGUndefined, YGDirectionLTR);
    return inner;
  };

  // Rectangles from the Yoga tree: each child's offset is from its parent's
  // border box, which a Scroll moves by its offset. Yoga's figures are the
  // node's own pixels; on the screen they are `space.scale` as large.
  std::function<void(const Built&, float, float, const PlacementSpace&)> collect =
      [&](const Built& built, float originX, float originY,
          const PlacementSpace& space) {
        const float scale = space.scale;
        const float width = YGNodeLayoutGetWidth(built.yoga);
        const float height = YGNodeLayoutGetHeight(built.yoga);
        const Node* found = node(built.id);
        if (found == nullptr) return;
        if (YGNodeStyleGetDisplay(built.yoga) == YGDisplayNone) return;
        Place& placed = place(built.id);
        placed.rect = stickyRect(*found, built.yoga,
            UiRect{originX + YGNodeLayoutGetLeft(built.yoga) * scale,
                   originY + YGNodeLayoutGetTop(built.yoga) * scale,
                   width * scale, height * scale}, space);
        placed.inParentX = YGNodeLayoutGetLeft(built.yoga) * scale;
        placed.inParentY = YGNodeLayoutGetTop(built.yoga) * scale;
        placed.scale = scale;
        const float left = placed.rect.x;
        const float top = placed.rect.y;
        placed.clip = space.clip;
        placed.clipped = space.clipped;

        auto* measure = static_cast<TextMeasure*>(YGNodeGetContext(built.yoga));
        if (measure != nullptr) {
          {
            placed.paragraph = measure->at(width);
            placed.spanNodes.clear();
            placed.atomNodes.clear();
            for (const auto& span : measure->spans) {
              placed.spanNodes.push_back(span.node);
              if (span.atom && span.node != 0) placed.atomNodes.push_back(span.node);
            }
          }
          for (const int run : built.textRun) {
            place(run).rect = placed.rect;
            place(run).scale = scale;
          }
          // Each inline box goes where its line put it, laid out alone.
          for (const auto& line : placed.paragraph.lines) {
            for (const auto& atom : line.atoms) {
              const int atomId = measure->spans[atom.span].node;
              const Node* atomNode = node(atomId);
              if (atomNode == nullptr) continue;
              Built inner = layoutAtom(atomId, width);
              // Its laid-out offset is its margin, inside the line's slot.
              collect(inner, left + (line.x + atom.x) * scale,
                      top + atom.y * scale, space);
              YGNodeFreeRecursive(inner.yoga);
            }
          }
          return;
        }

        PlacementSpace childSpace = space;
        float scrollX = 0;
        float scrollY = 0;
        if (found->type == kScroll) {
          Live& state = live_[built.id];
          // The content's extent: the children's farthest edges and the
          // padding after them.
          float right = 0;
          float bottom = 0;
          for (const Built& child : built.children) {
            right = std::max(right, YGNodeLayoutGetLeft(child.yoga) +
                                        YGNodeLayoutGetWidth(child.yoga) +
                                        YGNodeLayoutGetMargin(child.yoga,
                                                              YGEdgeRight));
            bottom = std::max(bottom, YGNodeLayoutGetTop(child.yoga) +
                                          YGNodeLayoutGetHeight(child.yoga) +
                                          YGNodeLayoutGetMargin(child.yoga,
                                                                YGEdgeBottom));
          }
          right += YGNodeLayoutGetPadding(built.yoga, YGEdgeRight);
          bottom += YGNodeLayoutGetPadding(built.yoga, YGEdgeBottom);
          placed.contentWidth = right;
          placed.contentHeight = bottom;
          const std::string bar = textProp(*found, "scrollbar");
          const std::string axis = textProp(*found, "axis");
          const bool vertical = axis != "horizontal";
          const bool horizontal = axis == "horizontal" || axis == "both";
          const bool overflowsY = bottom > height + 0.5f;
          const bool overflowsX = right > width + 0.5f;
          const bool wantsV = vertical && bar != "hidden" &&
                              (bar == "always" || overflowsY);
          const bool wantsH = horizontal && bar != "hidden" &&
                              (bar == "always" || overflowsX);
          if (bar == "auto" || bar.empty()) {
            if (wantsV != state.wantsBarVertical ||
                wantsH != state.wantsBarHorizontal) {
              barsChanged = true;
            }
            state.wantsBarVertical = wantsV;
            state.wantsBarHorizontal = wantsH;
          }
          placed.barVertical = wantsV || (bar == "reserved" && vertical);
          placed.barHorizontal = wantsH || (bar == "reserved" && horizontal);
          // An offset React sets is applied once; scrolling moves on from it.
          const Json* offset = prop(*found, "offset");
          if (offset != nullptr && offset->is_object()) {
            const std::string key = offset->dump();
            if (key != state.offsetSet) {
              state.offsetSet = key;
              if (offset->contains("x")) state.scrollX = (*offset)["x"].get<float>();
              if (offset->contains("y")) state.scrollY = (*offset)["y"].get<float>();
            }
          }
          const float maxX = std::max(0.0f, right - width);
          const float maxY = std::max(0.0f, bottom - height);
          state.scrollX = std::clamp(state.scrollX, 0.0f, maxX);
          state.scrollY = std::clamp(state.scrollY, 0.0f, maxY);
          scrollX = vertical && !horizontal ? 0 : state.scrollX;
          scrollY = state.scrollY;
          childSpace.clip = intersect(space.clip, placed.rect);
          childSpace.clipped = true;
          childSpace.scrollport = placed.rect;
        } else if (textProp(*found, "overflow") == "hidden") {
          childSpace.clip = space.clipped ? intersect(space.clip, placed.rect) : placed.rect;
          childSpace.clipped = true;
          childSpace.scrollport = placed.rect;
        }
        const float paddingLeft = YGNodeLayoutGetPadding(built.yoga, YGEdgeLeft);
        const float paddingTop = YGNodeLayoutGetPadding(built.yoga, YGEdgeTop);
        const float paddingRight = YGNodeLayoutGetPadding(built.yoga, YGEdgeRight);
        const float paddingBottom = YGNodeLayoutGetPadding(built.yoga, YGEdgeBottom);
        if (found->type == kScroll || textProp(*found, "overflow") == "hidden") {
          childSpace.scrollport.x += paddingLeft * scale;
          childSpace.scrollport.y += paddingTop * scale;
          childSpace.scrollport.width -= (paddingLeft + paddingRight) * scale;
          childSpace.scrollport.height -= (paddingTop + paddingBottom) * scale;
        }
        childSpace.containing = UiRect{
            left + (paddingLeft - scrollX) * scale,
            top + (paddingTop - scrollY) * scale,
            (std::max(width, placed.contentWidth) - paddingLeft - paddingRight) *
                scale,
            (std::max(height, placed.contentHeight) - paddingTop - paddingBottom) *
                scale};
        if (const auto design = scaleBelow(*found)) {
          // What it holds lays out alone in its content box, made as much
          // larger as it is drawn smaller.
          const float contentWidth = std::max(0.0f, width - paddingLeft - paddingRight);
          const float contentHeight = std::max(0.0f, height - paddingTop - paddingBottom);
          const float factor = scaleDown(*design, contentWidth, contentHeight);
          Built content;
          content.yoga = YGNodeNewWithConfig(config);
          applyContainerStyle(content.yoga, found->props);
          YGNodeStyleSetWidth(content.yoga, contentWidth / factor);
          YGNodeStyleSetHeight(content.yoga, contentHeight / factor);
          appendChildren(content, built.id);
          YGNodeCalculateLayout(content.yoga, contentWidth / factor,
                                contentHeight / factor, YGDirectionLTR);
          PlacementSpace contentSpace = childSpace;
          contentSpace.scale = scale * factor;
          for (const Built& child : content.children) {
            collect(child, left + paddingLeft * scale, top + paddingTop * scale,
                    contentSpace);
          }
          YGNodeFreeRecursive(content.yoga);
          return;
        }
        for (const Built& child : built.children) {
          const Node* item = node(child.id);
          const bool header = item != nullptr && flag(*item, "__scrollHeader");
          // The header stands at the top of the view as its content moves.
          collect(child, left - scrollX * scale,
                  top - (header ? 0 : scrollY) * scale, childSpace);
        }
      };

  const UiRect screen = viewport();
  const float viewportWidth = screen.width;
  const float viewportHeight = screen.height;
  // A cover layer on the screen reaches past the safe area: a box that fills
  // it, or a bar that spans its width or height, is drawn and hit to the
  // window's edge on every side it shares with the screen, so a scrim leaves
  // no strip of the game under the home indicator and the top bar no gap
  // beside a phone's notch. What they hold stays laid out inside the safe
  // area, and only a filling box passes the reach on to what it holds.
  const UiRect window{0, 0, windowWidth_ / uiScale_, windowHeight_ / uiScale_};
  std::function<void(const Built&)> reachWindow = [&](const Built& built) {
    const auto placed = places_.find(built.id);
    if (placed == places_.end()) return;
    UiRect& rect = placed->second->rect;
    const bool onLeft = sameEdge(rect.x, screen.x);
    const bool onTop = sameEdge(rect.y, screen.y);
    const bool onRight = sameEdge(rect.x + rect.width, screen.x + screen.width);
    const bool onBottom = sameEdge(rect.y + rect.height, screen.y + screen.height);
    const bool spansWidth = onLeft && onRight;
    const bool spansHeight = onTop && onBottom;
    if (!spansWidth && !spansHeight) return;
    const float left = onLeft ? window.x : rect.x;
    const float top = onTop ? window.y : rect.y;
    const float right = onRight ? window.x + window.width : rect.x + rect.width;
    const float bottom = onBottom ? window.y + window.height : rect.y + rect.height;
    rect = UiRect{left, top, right - left, bottom - top};
    if (!spansWidth || !spansHeight) return;
    for (const Built& child : built.children) reachWindow(child);
  };

  for (int pass = 0; pass < 2; ++pass) {
    barsChanged = false;
    places_.clear();
    // The page: React's roots in a block the size of the viewport.
    YGNodeRef page = YGNodeNewWithConfig(config);
    YGNodeStyleSetFlexDirection(page, YGFlexDirectionColumn);
    YGNodeStyleSetWidth(page, viewportWidth);
    YGNodeStyleSetHeight(page, viewportHeight);
    std::vector<Built> roots;
    for (const int root : tree_.roots()) {
      const Node* item = node(root);
      if (item == nullptr || item->type == kLayer) continue;
      Built built = build(root);
      YGNodeInsertChild(page, built.yoga, YGNodeGetChildCount(page));
      roots.push_back(std::move(built));
    }
    YGNodeCalculateLayout(page, viewportWidth, viewportHeight, YGDirectionLTR);
    for (const Built& root : roots)
      collect(root, screen.x, screen.y, {screen, true, screen, screen});
    YGNodeFreeRecursive(page);

    struct WorldLayer {
      Built built;
      labels::Anchor anchor;
      float dx, dy;
      bool centered;
    };
    std::vector<WorldLayer> worldLayers;
    struct StreetLayer {
      Built built;
      size_t run;
      bool small;
    };
    std::vector<StreetLayer> streetLayers;
    std::vector<labels::StreetRun> streetRuns;
    std::unordered_map<int, size_t> streetIndices;
    // Each Layer's root, in its target, in the order they mounted.
    for (const int layer : layers()) {
      const Node* found = node(layer);
      if (found == nullptr) continue;
      const int target = placedParent(layer);
      UiRect within = screen;
      if (target > 0) {
        if (const auto found = places_.find(target); found != places_.end()) {
          within = found->second->rect;
        }
      }
      if (flag(*found, "pinned")) within = screen;
      Built built = build(layer);
      YGNodeRef root = built.yoga;
      YGNodeStyleSetFlexDirection(root, YGFlexDirectionColumn);
      const Json* anchor = prop(*found, "anchor");
      const std::string kind =
          anchor != nullptr && anchor->is_object()
              ? anchor->value("kind", std::string())
              : std::string();
      const auto edge = [&](const char* side) -> std::optional<float> {
        if (kind != "screen" || !anchor->contains(side)) return std::nullopt;
        const Json& value = (*anchor)[side];
        if (!value.is_number()) return std::nullopt;
        return value.get<float>();
      };
      const bool cover = flag(*found, "cover");
      const auto leftEdge = edge("left");
      const auto rightEdge = cover ? std::optional<float>(0) : edge("right");
      const auto topEdge = edge("top");
      const auto bottomEdge = cover ? std::optional<float>(0) : edge("bottom");
      float width = YGUndefined;
      float height = YGUndefined;
      if (rightEdge && (leftEdge || cover)) {
        width = within.width - leftEdge.value_or(0) - *rightEdge;
        YGNodeStyleSetWidth(root, width);
      } else {
        YGNodeStyleSetMaxWidth(root, within.width - leftEdge.value_or(0));
      }
      if (bottomEdge && (topEdge || cover)) {
        height = within.height - topEdge.value_or(0) - *bottomEdge;
        YGNodeStyleSetHeight(root, height);
      }
      YGNodeCalculateLayout(root, width, height, YGDirectionLTR);
      // A layer sized to its content measures its rows at their longest line;
      // set again at the width it took, text that shrank in a row wraps and
      // its height follows, as the page's exact width gives it.
      if (YGFloatIsUndefined(width)) {
        YGNodeStyleSetWidth(root, YGNodeLayoutGetWidth(root));
        YGNodeCalculateLayout(root, YGUndefined, height, YGDirectionLTR);
      }
      const float laidWidth = YGNodeLayoutGetWidth(root);
      const float laidHeight = YGNodeLayoutGetHeight(root);
      float x = within.x;
      float y = within.y;
      const Json* offset = prop(*found, "offset");
      const float offsetX = offset != nullptr && offset->is_object()
                                ? offset->value("x", 0.0f)
                                : 0.0f;
      const float offsetY = offset != nullptr && offset->is_object()
                                ? offset->value("y", 0.0f)
                                : 0.0f;
      if (kind == "screen") {
        if (leftEdge) {
          x += *leftEdge;
        } else if (rightEdge) {
          x += within.width - *rightEdge - laidWidth;
        }
        if (topEdge) {
          y += *topEdge;
        } else if (bottomEdge) {
          y += within.height - *bottomEdge - laidHeight;
        }
      } else if (kind == "cursor") {
        x = pointerX_ + offsetX;
        y = pointerY_ + offsetY;
      } else if (kind.empty()) {
        x += offsetX;
        y += offsetY;
      }
      if (const auto placed = placedLayers_.find(layer);
          placed != placedLayers_.end()) {
        x = within.x + placed->second.first;
        y = within.y + placed->second.second;
      }
      if (kind == "world") {
        worldLayers.push_back({std::move(built),
          {anchor->value("x", 0.0), anchor->value("y", 0.0), anchor->value("z", 0.0),
           laidWidth, laidHeight, anchor->value("crowdGroup", std::string())},
          offsetX, offsetY, anchor->value("centered", false)});
        continue;
      }
      if (kind == "street") {
        const int key = anchor->value("run", 0);
        const auto [entry, inserted] = streetIndices.emplace(key, streetRuns.size());
        if (inserted) {
          labels::StreetRun run;
          const auto points = anchor->find("points");
          if (points != anchor->end() && points->is_array()) {
            for (const auto& point : *points)
              run.points.push_back({point.value("x", 0.0), point.value("y", 0.0),
                                    point.value("z", 0.0)});
          }
          streetRuns.push_back(std::move(run));
        }
        auto& run = streetRuns[entry->second];
        const bool small = anchor->value("size", std::string()) == "small";
        if (small) {
          run.smallWidth = laidWidth;
          run.smallHeight = laidHeight;
        } else {
          run.regularWidth = laidWidth;
          run.regularHeight = laidHeight;
        }
        streetLayers.push_back({std::move(built), entry->second, small});
        continue;
      }
      collect(built, x - YGNodeLayoutGetLeft(root),
              y - YGNodeLayoutGetTop(root), {screen, false, screen, screen});
      if (cover) reachWindow(built);
      YGNodeFreeRecursive(root);
    }
    worldAnchored_ = !worldLayers.empty() || !streetLayers.empty();
    std::vector<labels::Anchor> anchors;
    for (const auto& layer : worldLayers) anchors.push_back(layer.anchor);
    const auto placements = projection_
      ? labels::place(anchors, *projection_, windowWidth_ / uiScale_, windowHeight_ / uiScale_)
      : std::vector<labels::Placement>(anchors.size());
    for (size_t index = 0; index < worldLayers.size(); ++index) {
      const auto& layer = worldLayers[index];
      const auto& placed = placements[index];
      const auto root = layer.built.yoga;
      if (placed.visible) {
        const float x = placed.left + layer.dx + (layer.centered ? 0 : layer.anchor.width / 2);
        const float y = placed.top + layer.dy + (layer.centered ? 0 : layer.anchor.height / 2);
        collect(layer.built, x - YGNodeLayoutGetLeft(root), y - YGNodeLayoutGetTop(root),
                {screen, false, screen, screen});
      }
      YGNodeFreeRecursive(root);
    }
    const auto streetPlacements = projection_
        ? labels::placeStreets(streetRuns, *projection_,
                              windowWidth_ / uiScale_, windowHeight_ / uiScale_)
        : std::vector<labels::StreetPlacement>();
    for (const auto& layer : streetLayers) {
      std::vector<labels::StreetPlacement> repeats;
      for (const auto& placement : streetPlacements) {
        if (placement.run == layer.run && placement.small == layer.small)
          repeats.push_back(placement);
      }
      const auto root = layer.built.yoga;
      if (!repeats.empty()) {
        collect(layer.built, -YGNodeLayoutGetLeft(root),
                -YGNodeLayoutGetTop(root), {screen, false, screen, screen});
        places_.at(layer.built.id)->streetPlacements = std::move(repeats);
      }
      YGNodeFreeRecursive(root);
    }
    if (!barsChanged) break;
  }
  YGConfigFree(config);
}

}  // namespace bureau
