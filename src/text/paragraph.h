// A Text primitive's runs set into lines:
// whitespace collapsed, faces picked per character down the language's
// fallback chain, shaped by HarfBuzz, broken where UAX #14 allows, clamped
// with an ellipsis, aligned. Everything is in UI pixels.
#pragma once

#include <cstdint>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "font.h"
#include "tokens.h"

namespace bureau::text {

/** Face files by their path under public/ (`/fonts/Jersey25-Regular.ttf`),
 * each opened once per size. */
class FontLibrary {
 public:
  using Reader = std::function<std::shared_ptr<const std::vector<uint8_t>>(
      const std::string& path)>;
  explicit FontLibrary(Reader read) : read_(std::move(read)) {}

  /** Null when the file cannot be read or is no face. */
  Font* font(const std::string& source, float size);
  /** The same face at `factor` times the size: what a scaled UI rasterizes
   * with. */
  Font* scaled(const Font* font, float factor);
  /** The file a font was opened from; empty for one this library did not
   * open. */
  std::string sourceOf(const Font* font) const;

 private:
  Reader read_;
  std::map<std::string, std::shared_ptr<const std::vector<uint8_t>>> bytes_;
  std::map<std::pair<std::string, long>, std::unique_ptr<Font>> fonts_;
  std::map<const Font*, std::string> sources_;
};

/** One styled piece of a paragraph: a run of text, or a box set in the line
 * (an inline Image or Box). */
struct Span {
  std::string text;
  const style::TypeStyle* type = nullptr;
  /** The Text's `scale`: size and line height times this. */
  float scale = 1;
  /** Who the span came from, for its colour and its events. */
  int node = 0;
  bool atom = false;
  float atomWidth = 0;
  float atomHeight = 0;
  /** Its middle on the line's middle, or its bottom this far above the
   * baseline. */
  bool atomMiddle = true;
  float atomRaise = 0;
  float atomTrailing = 0;
  /** A run on a plate: its own line box grown by this much above and below,
   * its middle on the line's middle, as an inline-block is. Negative: none. */
  float platePadding = -1;
};

struct ParagraphOptions {
  float maxWidth = std::numeric_limits<float>::infinity();
  /** 0: as many as it takes. */
  int maxLines = 0;
  bool ellipsis = false;
  bool nowrap = false;
  bool preserveBreaks = false;
  bool breakAnywhere = false;
  enum class Align { Start, Center, End, Justify } align = Align::Start;
  std::string language = "en";
  /** The Text's own style: the line's strut, even with no text of its own. */
  const style::TypeStyle* strut = nullptr;
  float strutScale = 1;
  /** Positive: fit one line down to this rendered strut size, then ellipsize.
   * Inline text keeps its size relative to the strut. */
  float fitMinSize = 0;
};

struct PlacedGlyph {
  Font* font = nullptr;
  uint32_t glyph = 0;
  float x = 0;
  float baseline = 0;
  int span = 0;
};

struct PlacedAtom {
  int span = 0;
  float x = 0;
  float y = 0;
  float width = 0;
  float height = 0;
};

struct Line {
  float x = 0;
  float top = 0;
  float width = 0;
  float height = 0;
  float baseline = 0;
  std::vector<PlacedGlyph> glyphs;
  std::vector<PlacedAtom> atoms;
  /** Each span's stretch of the line, for underlines and plates: across
   * from x, and down from top, its own line box (the line's, unless plated). */
  struct Stretch {
    int span = 0;
    float x = 0;
    float width = 0;
    float top = 0;
    float height = 0;
  };
  std::vector<Stretch> stretches;
};

struct Paragraph {
  std::vector<Line> lines;
  float width = 0;
  float height = 0;
  /** The widest stretch no break opportunity splits: the narrowest the
   * text wraps to. */
  float minContentWidth = 0;
  /** Lines or characters were dropped to fit. */
  bool truncated = false;
};

class Typesetter {
 public:
  Typesetter(FontLibrary& fonts, const style::Tokens& tokens)
      : fonts_(fonts), tokens_(tokens) {}

  Paragraph set(const std::vector<Span>& spans,
                const ParagraphOptions& options);

  /** The primary font a style draws with, at its size times `scale`. */
  Font* primary(const style::TypeStyle& type, float scale = 1);

 private:
  Paragraph fit(const std::vector<Span>& spans,
                const ParagraphOptions& options);
  struct Chain {
    std::vector<Font*> fonts;
  };
  Chain chain(const style::TypeStyle& type, float scale,
              const std::string& language);

  FontLibrary& fonts_;
  const style::Tokens& tokens_;
};

/** UTF-8 to code points, and back. */
std::u32string decodeUtf8(const std::string& text);
std::string encodeUtf8(const std::u32string& text);

/** A type style's case on a run. */
std::string transformCase(const std::string& text,
                          style::TypeStyle::Case textCase, bool& wordStart);

}  // namespace bureau::text
