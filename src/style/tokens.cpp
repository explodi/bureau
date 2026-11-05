#include "tokens.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <limits>

#include <nlohmann/json.hpp>

namespace bureau::style {
namespace {

using Json = nlohmann::json;

float number(const Json& object, const char* key, float otherwise) {
  const auto found = object.find(key);
  return found != object.end() && found->is_number() ? found->get<float>()
                                                     : otherwise;
}

/** A member of an object, or an empty object: a reference, so a loop over
 * its items never outlives a temporary. */
const Json& member(const Json& object, const char* key) {
  static const Json empty = Json::object();
  const auto found = object.find(key);
  return found == object.end() ? empty : *found;
}

std::optional<float> optionalNumber(const Json& object, const char* key) {
  const auto found = object.find(key);
  if (found == object.end() || !found->is_number()) return std::nullopt;
  return found->get<float>();
}

std::optional<std::string> optionalText(const Json& object, const char* key) {
  const auto found = object.find(key);
  if (found == object.end() || !found->is_string()) return std::nullopt;
  return found->get<std::string>();
}

std::optional<bool> optionalFlag(const Json& object, const char* key) {
  const auto found = object.find(key);
  if (found == object.end() || !found->is_boolean()) return std::nullopt;
  return found->get<bool>();
}

std::map<std::string, Color, std::less<>> colors(const Json& object) {
  std::map<std::string, Color, std::less<>> parsed;
  if (!object.is_object()) return parsed;
  for (const auto& [name, value] : object.items()) {
    if (!value.is_string()) continue;
    if (const auto color = parseHex(value.get<std::string>())) {
      parsed.emplace(name, *color);
    }
  }
  return parsed;
}

std::map<std::string, std::string, std::less<>> names(const Json& object) {
  std::map<std::string, std::string, std::less<>> parsed;
  if (!object.is_object()) return parsed;
  for (const auto& [name, value] : object.items()) {
    if (value.is_string()) parsed.emplace(name, value.get<std::string>());
  }
  return parsed;
}

BevelLine::Side sideOf(std::string_view side) {
  using Side = BevelLine::Side;
  if (side == "outer-ring") return Side::OuterRing;
  if (side == "top-left") return Side::TopLeft;
  if (side == "bottom-right") return Side::BottomRight;
  if (side == "top") return Side::Top;
  if (side == "bottom") return Side::Bottom;
  if (side == "left") return Side::Left;
  if (side == "right") return Side::Right;
  if (side == "drop") return Side::Drop;
  return Side::Ring;
}

LookState lookStateOf(const Json& state) {
  LookState parsed;
  if (!state.is_object()) return parsed;
  parsed.surface = optionalText(state, "surface");
  parsed.fill = optionalText(state, "fill");
  parsed.fillOpacity = optionalNumber(state, "fillOpacity");
  parsed.ink = optionalText(state, "ink");
  parsed.opacity = optionalNumber(state, "opacity");
  parsed.emboss = optionalFlag(state, "emboss");
  parsed.ring = optionalNumber(state, "ring");
  parsed.band = optionalFlag(state, "band").value_or(false);
  parsed.size = optionalNumber(state, "size");
  parsed.leading = optionalNumber(state, "leading");
  parsed.face = optionalText(state, "face");
  parsed.travel = optionalFlag(state, "travel").value_or(false);
  parsed.dither = optionalFlag(state, "dither").value_or(false);
  parsed.textStipple = optionalFlag(state, "textStipple").value_or(false);
  return parsed;
}

std::optional<LookState> optionalState(const Json& look, const char* key) {
  const auto found = look.find(key);
  if (found == look.end() || !found->is_object()) return std::nullopt;
  return lookStateOf(*found);
}

TypeStyle typeStyleOf(const Json& style, const Json* metrics) {
  TypeStyle parsed;
  parsed.face = optionalText(style, "face").value_or("Jersey25");
  parsed.size = number(style, "size", 18);
  parsed.lineHeight = number(style, "lineHeight", parsed.size * 1.2f);
  parsed.letterSpacing = number(style, "letterSpacing", 0);
  parsed.wordSpacing = number(style, "wordSpacing", 0);
  parsed.weight = static_cast<int>(number(style, "weight", 400));
  parsed.italic = optionalFlag(style, "italic").value_or(false);
  const auto textCase = optionalText(style, "case").value_or("none");
  if (textCase == "upper") parsed.textCase = TypeStyle::Case::Upper;
  if (textCase == "lower") parsed.textCase = TypeStyle::Case::Lower;
  if (textCase == "capitalize") parsed.textCase = TypeStyle::Case::Capitalize;
  parsed.tabularFigures = optionalText(style, "figures") == "tabular";
  parsed.halo = optionalText(style, "halo");
  const auto shadow = style.find("shadow");
  if (shadow != style.end() && shadow->is_object()) {
    parsed.shadow = TypeStyle::Shadow{
        number(*shadow, "x", 0), number(*shadow, "y", 0),
        optionalText(*shadow, "color").value_or("db32-black"),
        number(*shadow, "opacity", 1)};
  }
  const auto underline = style.find("underline");
  if (underline != style.end() && underline->is_object()) {
    parsed.underline = TypeStyle::Underline{number(*underline, "offset", 2),
                                            number(*underline, "thickness", 1)};
  }
  if (metrics != nullptr) {
    parsed.stipple = optionalFlag(*metrics, "stipple").value_or(false);
  }
  return parsed;
}

Pattern patternOf(const Json& pattern) {
  Pattern parsed;
  if (const auto lines = pattern.find("lines"); lines != pattern.end()) {
    parsed.kind = Pattern::Kind::Lines;
    parsed.ink = optionalText(*lines, "ink").value_or("");
    parsed.period = number(*lines, "period", 28);
    parsed.alpha = number(*lines, "alpha", 1);
  } else if (const auto stipple = pattern.find("stipple");
             stipple != pattern.end()) {
    parsed.kind = Pattern::Kind::Stipple;
    parsed.ink = optionalText(*stipple, "ink").value_or("");
  } else if (const auto blocks = pattern.find("blocks");
             blocks != pattern.end()) {
    parsed.kind = Pattern::Kind::Blocks;
    parsed.ink = optionalText(*blocks, "ink").value_or("");
    parsed.period = number(*blocks, "size", 10);
    parsed.gap = number(*blocks, "gap", 2);
  } else if (const auto dots = pattern.find("dots"); dots != pattern.end()) {
    parsed.kind = Pattern::Kind::Dots;
    parsed.ink = optionalText(*dots, "ink").value_or("");
    parsed.period = number(*dots, "on", 2);
    parsed.gap = number(*dots, "off", 4);
  } else if (const auto stripes = pattern.find("stripes");
             stripes != pattern.end()) {
    parsed.kind = Pattern::Kind::Stripes;
    parsed.period = number(*stripes, "width", 3);
    parsed.angle = number(*stripes, "angle", 45);
    const auto inks = stripes->find("inks");
    if (inks != stripes->end() && inks->is_array() && inks->size() == 2) {
      parsed.ink = (*inks)[0].get<std::string>();
      parsed.secondInk = (*inks)[1].get<std::string>();
    }
  } else if (const auto gridlines = pattern.find("gridlines");
             gridlines != pattern.end()) {
    parsed.kind = Pattern::Kind::Gridlines;
    parsed.ink = optionalText(*gridlines, "ink").value_or("");
    parsed.gap = number(*gridlines, "every", 25);
    parsed.width = number(*gridlines, "width", 1);
  } else if (const auto picture = pattern.find("picture");
             picture != pattern.end()) {
    parsed.kind = Pattern::Kind::Picture;
    parsed.source = optionalText(*picture, "source").value_or("");
  }
  return parsed;
}

Keyframe keyframeOf(const Json& frame) {
  Keyframe parsed;
  const auto at = frame.find("at");
  if (at != frame.end() && at->is_array()) {
    for (const auto& stop : *at) {
      if (stop.is_number()) parsed.at.push_back(stop.get<float>());
    }
  }
  parsed.scale = optionalNumber(frame, "scale");
  parsed.scaleX = optionalNumber(frame, "scaleX");
  parsed.translateX = optionalNumber(frame, "translateX");
  parsed.translateY = optionalNumber(frame, "translateY");
  parsed.translateXPercent = optionalNumber(frame, "translateXPercent");
  parsed.translateYPercent = optionalNumber(frame, "translateYPercent");
  parsed.rotateDeg = optionalNumber(frame, "rotateDeg");
  parsed.opacity = optionalNumber(frame, "opacity");
  parsed.widthPercent = optionalNumber(frame, "widthPercent");
  parsed.shown = optionalFlag(frame, "shown");
  parsed.hidden = optionalFlag(frame, "hidden");
  parsed.fill = optionalText(frame, "fill");
  parsed.outlineColor = optionalText(frame, "outlineColor");
  parsed.ringColor = optionalText(frame, "ringColor");
  parsed.ringOver = optionalText(frame, "ringOver");
  parsed.ink = optionalText(frame, "ink");
  return parsed;
}

Easing easingOf(const Json& easing) {
  Easing parsed;
  if (easing.is_string()) {
    const std::string name = easing.get<std::string>();
    const auto curve = [&](float x1, float y1, float x2, float y2) {
      parsed.kind = Easing::Kind::Bezier;
      parsed.x1 = x1;
      parsed.y1 = y1;
      parsed.x2 = x2;
      parsed.y2 = y2;
    };
    if (name == "ease-in") curve(0.42f, 0, 1, 1);
    if (name == "ease-out") curve(0, 0, 0.58f, 1);
    if (name == "ease-in-out") curve(0.42f, 0, 0.58f, 1);
    return parsed;
  }
  if (!easing.is_object()) return parsed;
  if (const auto steps = easing.find("steps"); steps != easing.end()) {
    parsed.kind = Easing::Kind::Steps;
    parsed.steps = std::max(1, steps->get<int>());
    parsed.jumpNone = optionalFlag(easing, "jumpNone").value_or(false);
  } else if (const auto bezier = easing.find("bezier");
             bezier != easing.end() && bezier->is_array() &&
             bezier->size() == 4) {
    parsed.kind = Easing::Kind::Bezier;
    parsed.x1 = (*bezier)[0].get<float>();
    parsed.y1 = (*bezier)[1].get<float>();
    parsed.x2 = (*bezier)[2].get<float>();
    parsed.y2 = (*bezier)[3].get<float>();
  }
  return parsed;
}

Animation animationOf(const Json& record) {
  Animation parsed;
  for (const auto& frame : member(record, "frames")) {
    parsed.frames.push_back(keyframeOf(frame));
  }
  for (const auto& moment : member(record, "hold")) {
    parsed.holds.push_back({number(moment, "atMs", 0), keyframeOf(moment)});
  }
  std::sort(parsed.holds.begin(), parsed.holds.end(),
            [](const HoldMoment& a, const HoldMoment& b) {
              return a.atMs < b.atMs;
            });
  parsed.durationMs = number(record, parsed.holds.empty() ? "durationMs"
                                                           : "cycleMs",
                             0);
  parsed.tempo = optionalText(record, "tempo").value_or("");
  if (const auto easing = record.find("easing"); easing != record.end()) {
    parsed.easing = easingOf(*easing);
  }
  parsed.infinite = optionalText(record, "repeat") == "forever";
  parsed.alternate = optionalFlag(record, "alternate").value_or(false);
  parsed.delayMs = number(record, "delayMs", 0);
  const std::string fill = optionalText(record, "fill").value_or("");
  parsed.fillForwards = fill == "forwards" || fill == "both";
  parsed.fillBackwards = fill == "backwards" || fill == "both";
  if (const auto still = record.find("stillAtMs"); still != record.end()) {
    parsed.stillAtMs = still->get<double>();
  }
  const std::string hovered = optionalText(record, "whileHovered").value_or("");
  if (hovered == "stop") parsed.whileHovered = Animation::WhileHovered::Stop;
  if (hovered == "pause") parsed.whileHovered = Animation::WhileHovered::Pause;
  return parsed;
}

/** A family's name as a stack writes it, quotes and all. */
std::string unquoted(std::string family) {
  family.erase(std::remove(family.begin(), family.end(), '"'), family.end());
  return family;
}

}  // namespace

Color withAlpha(Color color, float share) {
  color.a = static_cast<std::uint8_t>(
      std::lround(std::clamp(share, 0.0f, 1.0f) * color.a));
  return color;
}

std::optional<Color> parseHex(std::string_view text) {
  if (!text.starts_with('#')) return std::nullopt;
  const std::string digits(text.substr(1));
  if (digits.size() != 6 && digits.size() != 8) return std::nullopt;
  char* end = nullptr;
  const unsigned long value = std::strtoul(digits.c_str(), &end, 16);
  if (end == nullptr || *end != '\0') return std::nullopt;
  if (digits.size() == 6) {
    return Color{static_cast<std::uint8_t>((value >> 16) & 0xff),
                 static_cast<std::uint8_t>((value >> 8) & 0xff),
                 static_cast<std::uint8_t>(value & 0xff), 255};
  }
  return Color{static_cast<std::uint8_t>((value >> 24) & 0xff),
               static_cast<std::uint8_t>((value >> 16) & 0xff),
               static_cast<std::uint8_t>((value >> 8) & 0xff),
               static_cast<std::uint8_t>(value & 0xff)};
}

bool Tokens::load(std::string_view text) {
  const Json document = Json::parse(text, nullptr, false);
  if (!document.is_object() || !document.contains("chromes")) return false;
  palette_ = colors(member(document, "palette"));
  dithers_.clear();
  for (const auto& [name, entry] : member(document, "dithers").items()) {
    const auto color = parseHex(optionalText(entry, "color").value_or(""));
    const Json& inks = member(entry, "inks");
    const bool pair = inks.is_array() && inks.size() == 2 &&
                      inks[0].is_string() && inks[1].is_string();
    if (!color || !pair) continue;
    const auto first = palette_.find(inks[0].get<std::string>());
    const auto second = palette_.find(inks[1].get<std::string>());
    if (first == palette_.end() || second == palette_.end()) continue;
    const std::uint32_t key = color->r << 16 | color->g << 8 | color->b;
    dithers_[key] = Dither{first->second, second->second,
                           static_cast<int>(number(entry, "level", 0))};
  }
  print_ = colors(member(document, "print"));
  web_ = colors(member(document, "web"));
  chart_ = colors(member(document, "chart"));

  const Json chromes = document.at("chromes");
  for (const auto chrome : {Chrome::Light, Chrome::Dark}) {
    const char* key = chrome == Chrome::Dark ? "dark" : "light";
    const Json scope = chromes.value(key, Json::object());
    auto& inks = chrome == Chrome::Dark ? darkInks_ : lightInks_;
    auto& bevelInks = chrome == Chrome::Dark ? darkBevelInks_ : lightBevelInks_;
    auto& extras = chrome == Chrome::Dark ? darkExtras_ : lightExtras_;
    inks = names(member(scope, "inks"));
    bevelInks = names(member(scope, "bevelInks"));
    const Json focus = member(scope, "focus");
    extras.focusWidth = number(focus, "width", 1);
    extras.focusColor = optionalText(focus, "color").value_or("db32-black");
    const Json emboss = member(scope, "emboss");
    extras.embossX = number(emboss, "x", 1);
    extras.embossY = number(emboss, "y", 1);
    extras.embossColor = optionalText(emboss, "color").value_or("db32-white");
  }

  bevels_.clear();
  const Json bevels = member(document, "bevels");
  for (const auto& [name, lines] : bevels.items()) {
    std::vector<RawLine> parsed;
    if (lines.is_array()) {
      for (const auto& line : lines) {
        RawLine raw;
        raw.side = sideOf(optionalText(line, "side").value_or("ring"));
        raw.width = number(line, "width", 0);
        raw.x = number(line, "x", 0);
        raw.y = number(line, "y", 0);
        raw.spread = number(line, "spread", 0);
        raw.color = optionalText(line, "color").value_or("ring");
        raw.alpha = optionalNumber(line, "alpha");
        parsed.push_back(raw);
      }
    }
    bevels_.emplace(name, std::move(parsed));
  }

  looks_.clear();
  for (const auto& [name, look] : member(document, "looks")
                                      .items()) {
    Look parsed;
    parsed.rest = lookStateOf(member(look, "rest"));
    parsed.hover = optionalState(look, "hover");
    parsed.focused = optionalState(look, "focused");
    parsed.focusWithin = optionalState(look, "focusWithin");
    parsed.selected = optionalState(look, "selected");
    parsed.pressed = optionalState(look, "pressed");
    parsed.latched = optionalState(look, "latched");
    parsed.disabled = optionalState(look, "disabled");
    const auto ring = look.find("focusRing");
    if (ring != look.end() && ring->is_string()) parsed.focusRingNone = true;
    if (ring != look.end() && ring->is_object()) {
      parsed.focusRingOffset = optionalNumber(*ring, "offset");
      parsed.focusRingInk = optionalText(*ring, "ink");
    }
    looks_.emplace(name, std::move(parsed));
  }

  typography_.clear();
  const Json metrics = member(document, "metrics");
  for (const auto& [language, styles] :
       member(document, "typography").items()) {
    auto& parsed = typography_[language];
    for (const auto& [name, style] : styles.items()) {
      const auto metric = metrics.find(name);
      parsed.emplace(name, typeStyleOf(style, metric == metrics.end()
                                                  ? nullptr
                                                  : &*metric));
    }
  }

  faces_.clear();
  for (const auto& face : document.value("faces", Json::array())) {
    faces_.push_back(FontFace{optionalText(face, "family").value_or(""),
                              optionalText(face, "source").value_or(""),
                              static_cast<int>(number(face, "weight", 0)),
                              number(face, "sizeAdjust", 1)});
  }
  // What carries the glyphs a language's UI face lacks: the stack's families
  // after the first, then every face the document ships.
  fallbacks_.clear();
  const Json fonts = member(document, "fonts");
  for (const auto& [language, roles] : fonts.items()) {
    auto& chain = fallbacks_[language];
    for (const auto& [role, stack] : roles.items()) {
      if (!stack.is_array()) continue;
      for (std::size_t index = 1; index < stack.size(); ++index) {
        const std::string family = unquoted(stack[index].get<std::string>());
        if (std::find(chain.begin(), chain.end(), family) == chain.end()) {
          chain.push_back(family);
        }
      }
    }
  }

  patterns_.clear();
  for (const auto& [name, pattern] :
       member(document, "patterns").items()) {
    patterns_.emplace(name, patternOf(pattern));
  }
  animations_.clear();
  for (const auto& [name, record] :
       member(document, "animations").items()) {
    animations_.emplace(name, animationOf(record));
  }
  stacking_.clear();
  for (const auto& layer : document.value("layers", Json::array())) {
    if (!layer.is_string()) continue;
    const int position = static_cast<int>(stacking_.size()) + 1;
    stacking_.emplace(layer.get<std::string>(), position);
  }
  const Json effects = member(document, "effects");
  effects_.focusOffset = number(effects, "focusOffset", -4);
  const Json padFocus = member(effects, "padFocus");
  effects_.padFocusWidth = number(padFocus, "width", 3);
  effects_.padFocusBacking = number(padFocus, "backing", 5);
  effects_.padFocusColor =
      optionalText(padFocus, "color").value_or("db32-yellow-bright");
  effects_.padFocusBackingColor =
      optionalText(padFocus, "backingColor").value_or("db32-black");
  effects_.stippleSize =
      number(member(effects, "stipple"), "size", 2);
  effects_.ditherInset = number(effects, "ditherInset", 3);
  const Json attention = member(effects, "attention");
  effects_.attentionWidth = number(attention, "width", 2);
  effects_.attentionOffset = number(attention, "offset", 1);
  effects_.attentionInset = number(attention, "inset", 2);
  effects_.scrollbar = number(effects, "scrollbar", 18);
  const Json field = member(effects, "field");
  effects_.fieldWidth = number(field, "width", 150);
  effects_.fieldHeight = number(field, "height", 32);
  effects_.rangeHeight = number(field, "rangeHeight", 33);
  effects_.typeStyle =
      optionalText(effects, "typeStyle").value_or("ui-14-solid");
  tempos_.clear();
  for (const auto& [name, milliseconds] :
       member(document, "tempos").items()) {
    if (milliseconds.is_number()) {
      tempos_.emplace(name, milliseconds.get<float>());
    }
  }
  loaded_ = true;
  return true;
}

std::optional<Color> Tokens::resolve(std::string_view name, Chrome chrome,
                                     int depth) const {
  if (depth > 8) return std::nullopt;
  const auto prefixed = [&](std::string_view prefix, const auto& table)
      -> std::optional<Color> {
    const auto found = table.find(name.substr(prefix.size()));
    if (found == table.end()) return std::nullopt;
    return found->second;
  };
  if (name.starts_with("db32-")) return prefixed("db32-", palette_);
  if (name.starts_with("print-")) return prefixed("print-", print_);
  if (name.starts_with("web-")) return prefixed("web-", web_);
  if (name.starts_with("data-")) return prefixed("data-", chart_);
  if (name.starts_with('#')) return parseHex(name);
  const auto& bevelInks =
      chrome == Chrome::Dark ? darkBevelInks_ : lightBevelInks_;
  if (const auto bevel = bevelInks.find(name); bevel != bevelInks.end()) {
    return resolve(bevel->second, chrome, depth + 1);
  }
  const auto& inks = chrome == Chrome::Dark ? darkInks_ : lightInks_;
  const auto role = inks.find(name);
  if (role == inks.end()) return std::nullopt;
  return resolve(role->second, chrome, depth + 1);
}

std::optional<Color> Tokens::ink(std::string_view name, Chrome chrome) const {
  return resolve(name, chrome, 0);
}

Dither Tokens::drawnAs(Color color) const {
  const std::uint32_t key = color.r << 16 | color.g << 8 | color.b;
  if (const auto found = dithers_.find(key); found != dithers_.end()) {
    return found->second;
  }
  const auto distance = [&](Color other) {
    const int r = color.r - other.r;
    const int g = color.g - other.g;
    const int b = color.b - other.b;
    return r * r + g * g + b * b;
  };
  Color nearest = color;
  int best = std::numeric_limits<int>::max();
  for (const auto& [name, candidate] : palette_) {
    if (distance(candidate) < best) {
      best = distance(candidate);
      nearest = candidate;
    }
  }
  return Dither{nearest, nearest, 0};
}

std::vector<BevelLine> Tokens::bevel(std::string_view recipe,
                                     Chrome chrome) const {
  std::vector<BevelLine> lines;
  const auto found = bevels_.find(recipe);
  if (found == bevels_.end()) return lines;
  for (const auto& raw : found->second) {
    BevelLine line;
    line.side = raw.side;
    line.width = raw.width;
    line.x = raw.x;
    line.y = raw.y;
    line.spread = raw.spread;
    const Color solid = ink(raw.color, chrome).value_or(Color{});
    line.color = raw.alpha ? withAlpha(solid, *raw.alpha) : solid;
    lines.push_back(line);
  }
  return lines;
}

const Look* Tokens::look(std::string_view name) const {
  const auto found = looks_.find(name);
  return found == looks_.end() ? nullptr : &found->second;
}

const TypeStyle* Tokens::type(std::string_view style,
                              std::string_view language) const {
  auto styles = typography_.find(language);
  if (styles == typography_.end()) styles = typography_.find("en");
  if (styles == typography_.end()) return nullptr;
  const auto found = styles->second.find(style);
  if (found != styles->second.end()) return &found->second;
  const auto fallback = styles->second.find("text");
  return fallback == styles->second.end() ? nullptr : &fallback->second;
}

const FontFace* Tokens::face(std::string_view family, int weight) const {
  const FontFace* best = nullptr;
  for (const auto& face : faces_) {
    if (face.family != family) continue;
    if (best == nullptr) best = &face;
    if (face.weight == weight) return &face;
  }
  return best;
}

std::vector<std::string> Tokens::fallbackFamilies(
    std::string_view language) const {
  std::vector<std::string> chain;
  const auto add = [&chain](const std::vector<std::string>& families) {
    for (const auto& family : families) {
      if (std::find(chain.begin(), chain.end(), family) == chain.end()) {
        chain.push_back(family);
      }
    }
  };
  if (const auto own = fallbacks_.find(language); own != fallbacks_.end()) {
    add(own->second);
  }
  if (const auto shared = fallbacks_.find("default");
      shared != fallbacks_.end()) {
    add(shared->second);
  }
  std::vector<std::string> shipped;
  for (const auto& face : faces_) shipped.push_back(face.family);
  add(shipped);
  return chain;
}

const Pattern* Tokens::pattern(std::string_view name) const {
  const auto found = patterns_.find(name);
  return found == patterns_.end() ? nullptr : &found->second;
}

const Animation* Tokens::animation(std::string_view name) const {
  const auto found = animations_.find(name);
  return found == animations_.end() ? nullptr : &found->second;
}

int Tokens::stacking(std::string_view level) const {
  const auto found = stacking_.find(level);
  return found == stacking_.end() ? 0 : found->second;
}

float Tokens::tempoMs(std::string_view tempo) const {
  const auto found = tempos_.find(tempo);
  return found == tempos_.end() ? 0 : found->second;
}

}  // namespace bureau::style
