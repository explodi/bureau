// The token document (kit/tokens.ts, as tools/tokens.ts writes it): Bureau's
// looks as data, resolved by chrome.
#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace bureau::style {

/** sRGB-encoded, straight alpha: as the token document writes colours, and
 * the space the UI blends in. */
struct Color {
  std::uint8_t r = 0;
  std::uint8_t g = 0;
  std::uint8_t b = 0;
  std::uint8_t a = 255;
  bool operator==(const Color&) const = default;
};

/** The colour with its alpha scaled by `share`. */
Color withAlpha(Color color, float share);

/** A colour as a picture draws it: `first`, with `level` sixteenths of
 * `second` on a 4x4 Bayer pattern; at level 0, `first` alone. */
struct Dither {
  Color first;
  Color second;
  int level = 0;
};

enum class Chrome { Light, Dark };

/** One line of a recipe: inset sides draw
 * inside the box, `OuterRing` and `Drop` outside it. Front to back. */
struct BevelLine {
  enum class Side {
    Ring,
    OuterRing,
    TopLeft,
    BottomRight,
    Top,
    Bottom,
    Left,
    Right,
    Drop
  };
  Side side = Side::Ring;
  float width = 0;
  /** A drop's offset and spread. */
  float x = 0;
  float y = 0;
  float spread = 0;
  Color color;
};

/** What a look sets in one state; an unset field keeps the state below's. */
struct LookState {
  std::optional<std::string> surface;  // a recipe, or "none"
  std::optional<std::string> fill;     // an ink, or "none"
  std::optional<float> fillOpacity;
  std::optional<std::string> ink;
  std::optional<float> opacity;
  std::optional<bool> emboss;
  std::optional<float> ring;
  /** `ring` drawn as the pad's band even with no pad connected. */
  bool band = false;
  std::optional<float> size;
  std::optional<float> leading;
  std::optional<std::string> face;
  bool travel = false;
  bool dither = false;
  bool textStipple = false;
};

struct Look {
  LookState rest;
  std::optional<LookState> hover;
  std::optional<LookState> focused;
  std::optional<LookState> focusWithin;
  std::optional<LookState> selected;
  std::optional<LookState> pressed;
  std::optional<LookState> latched;
  std::optional<LookState> disabled;
  /** Where the dotted focus ring sits from the edge, and its ink; `none`
   * leaves the box's focus to what it holds: no ring, and no pad's band. */
  bool focusRingNone = false;
  std::optional<float> focusRingOffset;
  std::optional<std::string> focusRingInk;
};

/** A type style as TYPOGRAPHY resolves it for one language. */
struct TypeStyle {
  std::string face;  // a family, as FONT_FACES names it
  float size = 18;
  float lineHeight = 21.6f;
  float letterSpacing = 0;
  float wordSpacing = 0;
  int weight = 400;
  bool italic = false;
  enum class Case { None, Upper, Lower, Capitalize } textCase = Case::None;
  bool tabularFigures = false;
  bool stipple = false;
  struct Shadow {
    float x = 0;
    float y = 0;
    std::string color;
    float opacity = 1;
  };
  std::optional<Shadow> shadow;
  std::optional<std::string> halo;
  struct Underline {
    float offset = 2;
    float thickness = 1;
  };
  std::optional<Underline> underline;
};

/** A bundled face and its visual size relative to the nominal type size. */
struct FontFace {
  std::string family;
  std::string source;
  int weight = 0;
  float sizeAdjust = 1;
};

/** A pattern on a box's ground (tokens.ts PATTERNS). */
struct Pattern {
  enum class Kind { Lines, Stipple, Blocks, Dots, Stripes, Gridlines, Picture };
  Kind kind = Kind::Stipple;
  std::string ink;
  std::string secondInk;
  float alpha = 1;
  float period = 0;  // lines: period; blocks: size; dots: on; stripes: width
  float gap = 0;     // blocks: gap; dots: off; gridlines: every (%)
  float width = 1;   // gridlines' width
  float angle = 0;
  std::string source;  // picture
};

/** One keyframe of a kit animation (tokens.ts AnimationFrame). */
struct Keyframe {
  std::vector<float> at;  // percent
  std::optional<float> scale;
  std::optional<float> scaleX;
  std::optional<float> translateX;
  std::optional<float> translateY;
  std::optional<float> translateXPercent;
  std::optional<float> translateYPercent;
  std::optional<float> rotateDeg;
  std::optional<float> opacity;
  std::optional<float> widthPercent;
  std::optional<bool> shown;
  std::optional<bool> hidden;
  std::optional<std::string> fill;
  std::optional<std::string> ink;
  /** The attention ring: an outline's ink, an inset ring's, and the recipe
   * whose bevel stays under the ring. */
  std::optional<std::string> outlineColor;
  std::optional<std::string> ringColor;
  std::optional<std::string> ringOver;
};

/** How an animation moves between its frames (tokens.ts AnimationEasing). */
struct Easing {
  enum class Kind { Linear, Steps, Bezier } kind = Kind::Linear;
  int steps = 1;
  /** steps(n, end) jumps after each step; jump-none holds both ends. */
  bool jumpNone = false;
  float x1 = 0, y1 = 0, x2 = 1, y2 = 1;
};

/** A hold's moment: the values that jump in `atMs` into its cycle (their
 * `at` unused). */
struct HoldMoment {
  double atMs = 0;
  Keyframe values;
};

/** One kit animation, whole (tokens.ts AnimationRecord): a tween's frames,
 * or a hold's moments round a repeating cycle of `durationMs`. */
struct Animation {
  std::vector<Keyframe> frames;
  std::vector<HoldMoment> holds;
  double durationMs = 0;
  /** A tempo of the token document's, which gives the duration instead. */
  std::string tempo;
  Easing easing;
  bool infinite = false;
  bool alternate = false;
  double delayMs = 0;
  bool fillForwards = false;
  bool fillBackwards = false;
  /** The moment shown under reduced motion, when not its end or rest. */
  std::optional<double> stillAtMs;
  /** While the pointer, keyboard focus or the pad is on the box. */
  enum class WhileHovered { Run, Stop, Pause } whileHovered = WhileHovered::Run;
};

class Tokens {
 public:
  /** False when the text is not the token document. */
  bool load(std::string_view json);
  bool loaded() const { return loaded_; }

  /** An ink by name (`face`, `db32-black`, `print-ink`, `ring`...) in a
   * chrome; nothing for a name the document lacks. */
  std::optional<Color> ink(std::string_view name, Chrome chrome) const;
  /** How a picture draws a colour: a palette colour solid, a MICRO64 one
   * past the palette as the dither of two (`dithers`), any other as the
   * palette colour nearest it. */
  Dither drawnAs(Color color) const;
  /** A recipe's lines, front to back, in a chrome's inks. */
  std::vector<BevelLine> bevel(std::string_view recipe, Chrome chrome) const;
  const Look* look(std::string_view name) const;
  /** A style in a language; English's for a language the document lacks. */
  const TypeStyle* type(std::string_view style,
                        std::string_view language) const;
  /** The face at a weight, or the family's first face if that weight is absent.
   */
  const FontFace* face(std::string_view family, int weight) const;
  /** The families after the first of a role's stack, which carry what the
   * first lacks (a Latin face's missing CJK). */
  std::vector<std::string> fallbackFamilies(std::string_view language) const;
  const Pattern* pattern(std::string_view name) const;
  const Animation* animation(std::string_view name) const;
  /** A Layer's place in the document's `layers`, from 1 at the bottom; 0
   * for a level the document does not list. */
  int stacking(std::string_view level) const;
  float tempoMs(std::string_view tempo) const;

  struct Effects {
    float focusOffset = -4;
    /** The pad's band: a line `padFocusWidth` wide centred on a backing
     * `padFocusBacking` wide. */
    float padFocusWidth = 3;
    float padFocusBacking = 5;
    std::string padFocusColor = "db32-yellow-bright";
    std::string padFocusBackingColor = "db32-black";
    float stippleSize = 2;
    float ditherInset = 3;
    float attentionWidth = 2;
    float attentionOffset = 1;
    float attentionInset = 2;
    /** A Scroll's bar breadth, in UI pixels. */
    float scrollbar = 18;
    /** An unsized Field: a text field's box and a slider's height. */
    float fieldWidth = 150;
    float fieldHeight = 32;
    float rangeHeight = 33;
    /** The type of words outside any Text or typed box. */
    std::string typeStyle = "ui-14-solid";
  };
  const Effects& effects() const { return effects_; }

  /** Each chrome's focus ring (a dotted line) and emboss. */
  struct ChromeExtras {
    float focusWidth = 1;
    std::string focusColor = "db32-black";
    float embossX = 1;
    float embossY = 1;
    std::string embossColor = "db32-white";
  };
  const ChromeExtras& extras(Chrome chrome) const {
    return chrome == Chrome::Dark ? darkExtras_ : lightExtras_;
  }

 private:
  std::optional<Color> resolve(std::string_view name, Chrome chrome,
                               int depth) const;

  bool loaded_ = false;
  std::map<std::string, Color, std::less<>> palette_;
  /** By the colour they draw, as 0xRRGGBB. */
  std::map<std::uint32_t, Dither> dithers_;
  std::map<std::string, Color, std::less<>> print_;
  std::map<std::string, Color, std::less<>> web_;
  std::map<std::string, Color, std::less<>> chart_;
  std::map<std::string, std::string, std::less<>> lightInks_;
  std::map<std::string, std::string, std::less<>> darkInks_;
  std::map<std::string, std::string, std::less<>> lightBevelInks_;
  std::map<std::string, std::string, std::less<>> darkBevelInks_;
  ChromeExtras lightExtras_;
  ChromeExtras darkExtras_;
  struct RawLine {
    BevelLine::Side side = BevelLine::Side::Ring;
    float width = 0;
    float x = 0;
    float y = 0;
    float spread = 0;
    std::string color;
    std::optional<float> alpha;
  };
  std::map<std::string, std::vector<RawLine>, std::less<>> bevels_;
  std::map<std::string, Look, std::less<>> looks_;
  std::map<std::string, std::map<std::string, TypeStyle, std::less<>>,
           std::less<>>
      typography_;
  std::vector<FontFace> faces_;
  std::map<std::string, std::vector<std::string>, std::less<>> fallbacks_;
  std::map<std::string, Pattern, std::less<>> patterns_;
  std::map<std::string, Animation, std::less<>> animations_;
  std::map<std::string, int, std::less<>> stacking_;
  std::map<std::string, float, std::less<>> tempos_;
  Effects effects_;
};

/** "#rrggbb" or "#rrggbbaa"; nothing for anything else. */
std::optional<Color> parseHex(std::string_view text);

}  // namespace bureau::style
