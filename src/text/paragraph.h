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
#include <set>
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
  using Bytes = std::shared_ptr<const std::vector<uint8_t>>;
  using Reader = std::function<Bytes(const std::string& path)>;
  /** Takes a file to read away from the library's thread, answering true; it
   * comes back through `arrived`. False leaves it to `Reader`, at once. */
  using Ask = std::function<bool(const std::string& path)>;
  explicit FontLibrary(Reader read, Ask ask = nullptr)
      : read_(std::move(read)), ask_(std::move(ask)) {}

  /** Null when the file cannot be read, is no face, or is still on its way
   * from `Ask`. */
  Font* font(const std::string& source, float size);
  /** A file `Ask` took, or nothing when it could not be read. */
  void arrived(const std::string& source, Bytes bytes);
  /** Whether `Ask` took the file and it has not arrived. */
  bool onItsWay(const std::string& source) const {
    return onItsWay_.contains(source);
  }
  /** The same face at `factor` times the size: what a scaled UI rasterizes
   * with. */
  Font* scaled(const Font* font, float factor);
  /** The file a font was opened from; empty for one this library did not
   * open. */
  std::string sourceOf(const Font* font) const;

 private:
  Bytes file(const std::string& source);

  Reader read_;
  Ask ask_;
  /** Each file read; null for one `Ask` took that could not be read. */
  std::map<std::string, Bytes> bytes_;
  /** Taken by `ask_` and not yet arrived. */
  std::set<std::string> onItsWay_;
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
   * text wraps to. Text that may break anywhere splits between any two
   * characters. */
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
  /** The file and size `primary` opens; no file for a style with no face. */
  std::pair<std::string, float> primaryFace(const style::TypeStyle& type,
                                            float scale) const;
  Paragraph fit(const std::vector<Span>& spans,
                const ParagraphOptions& options);
  /** A run's faces in the order its characters try them: the style's own,
   * then the language's fallbacks, each opened only when a character the
   * faces before it lack needs it. Opening every face up front read the
   * shipped CJK faces, ten megabytes each, before the first Latin label.
   * A face on its way ends the chain until it arrives, so that the faces
   * after it are not read for characters it covers. */
  struct Chain {
    explicit Chain(FontLibrary& library) : library(library) {}
    FontLibrary& library;
    std::vector<Font*> fonts;
    /** Every fallback's file and size, in order; those before `opened` have
     * been opened. */
    std::vector<std::pair<std::string, float>> fallbacks;
    size_t opened = 0;
    bool waiting = false;

    /** The first face, which spaces and characters no face has take. */
    Font* first();
    /** The first face with a glyph for `code`, else `first()`. */
    Font* fontFor(char32_t code);

   private:
    /** The next fallback that opens and is not in `fonts` yet, added to it;
     * null when none is left. */
    Font* openNext();
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
