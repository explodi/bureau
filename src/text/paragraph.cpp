#include "paragraph.h"

#include <algorithm>
#include <cmath>
#include <optional>

#include <linebreak.h>

namespace bureau::text {
namespace {

constexpr float kFitTolerance = 1.0f / 64;
const std::string kObjectReplacement = "\xEF\xBF\xBC";  // U+FFFC
const std::string kEllipsis = "\xE2\x80\xA6";            // U+2026

bool isCollapsible(char byte) {
  return byte == ' ' || byte == '\t' || byte == '\n' || byte == '\r' ||
         byte == '\f';
}

size_t utf8Length(unsigned char lead) {
  if (lead >= 0xf0) return 4;
  if (lead >= 0xe0) return 3;
  if (lead >= 0xc0) return 2;
  return 1;
}

char32_t decodeAt(const std::string& text, size_t at, size_t& length) {
  const auto lead = static_cast<unsigned char>(text[at]);
  length = std::min(utf8Length(lead), text.size() - at);
  if (length == 1) return lead;
  char32_t code = lead & (0xff >> (length + 1));
  for (size_t index = 1; index < length; ++index) {
    code = (code << 6) | (static_cast<unsigned char>(text[at + index]) & 0x3f);
  }
  return code;
}

char32_t upper(char32_t code) {
  if (code >= 'a' && code <= 'z') return code - 32;
  // Latin-1 and Latin Extended-A, which the game's European languages use.
  if (code >= 0xe0 && code <= 0xfe && code != 0xf7) return code - 32;
  if (code >= 0x100 && code <= 0x17f && code % 2 == 1 && code != 0x131) {
    return code - 1;
  }
  if (code == 0x131) return 'I';
  // Cyrillic base letters, the block containing ё/є/і/ї, and Ukrainian ґ.
  if (code >= 0x430 && code <= 0x44f) return code - 0x20;
  if (code >= 0x450 && code <= 0x45f) return code - 0x50;
  if (code == 0x491) return 0x490;
  return code;
}

char32_t lower(char32_t code) {
  if (code >= 'A' && code <= 'Z') return code + 32;
  if (code >= 0xc0 && code <= 0xde && code != 0xd7) return code + 32;
  if (code >= 0x100 && code <= 0x17f && code % 2 == 0 && code != 0x130) {
    return code + 1;
  }
  if (code >= 0x410 && code <= 0x42f) return code + 0x20;
  if (code >= 0x400 && code <= 0x40f) return code + 0x50;
  if (code == 0x490) return 0x491;
  return code;
}

/** A glyph cluster: one or more glyphs over one stretch of the text. */
struct Cluster {
  size_t begin = 0;
  size_t end = 0;
  int span = 0;
  Font* font = nullptr;
  float width = 0;
  bool space = false;
  bool newline = false;
  bool atom = false;
  struct Glyph {
    uint32_t index;
    float x;
    float y;
  };
  std::vector<Glyph> glyphs;
};

/** An inline box's place on its line: its ascent and descent from the
 * baseline. A line takes the largest ascent and the largest descent. */
struct Extent {
  float ascent = 0;
  float descent = 0;
};

Extent textExtent(Font* font, float lineHeight) {
  // Layout positions are in 1/64-pixel units, line heights among them.
  lineHeight = std::round(lineHeight * 64) / 64;
  if (font == nullptr) return {lineHeight, 0};
  // Whole-pixel metrics and a floored half-leading put the baseline on a
  // whole pixel, so glyphs rasterize crisply.
  const float fontAscent = std::round(font->ascent());
  const float fontDescent = std::round(font->descent());
  const float halfLeading = std::floor((lineHeight - fontAscent - fontDescent) / 2);
  const float ascent = halfLeading + fontAscent;
  return {ascent, lineHeight - ascent};
}

}  // namespace

std::u32string decodeUtf8(const std::string& text) {
  std::u32string decoded;
  for (size_t at = 0; at < text.size();) {
    size_t length = 1;
    decoded.push_back(decodeAt(text, at, length));
    at += length;
  }
  return decoded;
}

std::string encodeUtf8(const std::u32string& text) {
  std::string encoded;
  for (const char32_t code : text) {
    if (code < 0x80) {
      encoded.push_back(static_cast<char>(code));
    } else if (code < 0x800) {
      encoded.push_back(static_cast<char>(0xc0 | (code >> 6)));
      encoded.push_back(static_cast<char>(0x80 | (code & 0x3f)));
    } else if (code < 0x10000) {
      encoded.push_back(static_cast<char>(0xe0 | (code >> 12)));
      encoded.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3f)));
      encoded.push_back(static_cast<char>(0x80 | (code & 0x3f)));
    } else {
      encoded.push_back(static_cast<char>(0xf0 | (code >> 18)));
      encoded.push_back(static_cast<char>(0x80 | ((code >> 12) & 0x3f)));
      encoded.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3f)));
      encoded.push_back(static_cast<char>(0x80 | (code & 0x3f)));
    }
  }
  return encoded;
}

std::string transformCase(const std::string& text,
                          style::TypeStyle::Case textCase, bool& wordStart) {
  using Case = style::TypeStyle::Case;
  if (textCase == Case::None) {
    if (!text.empty()) wordStart = isCollapsible(text.back());
    return text;
  }
  std::u32string codes = decodeUtf8(text);
  for (char32_t& code : codes) {
    const bool letter = !(code == ' ' || code == '\t' || code == '\n' ||
                          code == '-' || code == '/');
    if (textCase == Case::Upper) code = upper(code);
    if (textCase == Case::Lower) code = lower(code);
    if (textCase == Case::Capitalize && wordStart && letter) code = upper(code);
    wordStart = !letter;
  }
  return encodeUtf8(codes);
}

Font* FontLibrary::font(const std::string& source, float size) {
  const auto key = std::make_pair(source, std::lround(size * 64));
  if (const auto found = fonts_.find(key); found != fonts_.end()) {
    return found->second.get();
  }
  std::unique_ptr<Font> font;
  if (source.starts_with("system:")) {
    font = std::make_unique<Font>(source, size);
  } else {
    auto& bytes = bytes_[source];
    if (bytes == nullptr) bytes = read_(source);
    if (bytes == nullptr) return nullptr;
    font = std::make_unique<Font>(bytes, size);
  }
  if (!font->valid()) return nullptr;
  Font* opened = font.get();
  sources_.emplace(opened, source);
  fonts_.emplace(key, std::move(font));
  return opened;
}

Font* FontLibrary::scaled(const Font* font, float factor) {
  const auto source = sources_.find(font);
  if (source == sources_.end()) return nullptr;
  return this->font(source->second, font->size() * factor);
}

std::string FontLibrary::sourceOf(const Font* font) const {
  const auto source = sources_.find(font);
  return source == sources_.end() ? std::string() : source->second;
}

Font* Typesetter::primary(const style::TypeStyle& type, float scale) {
  std::string family = type.face;
#if defined(__linux__)
  // The desktop's faces vary by distribution and by runtime: the system styles
  // draw with bundled faces that have every
  // glyph they show, the tick and ™ among them.
  if (family == "system-ui") family = "IBM Plex Sans";
  if (family == "monospace") family = "Diffusion Bold";
#else
  const bool system = family == "system-ui" || family == "monospace";
  if (system) return fonts_.font("system:" + family, type.size * scale);
#endif
  const auto* face = tokens_.face(family, type.weight);
  if (face == nullptr) return nullptr;
  return fonts_.font(face->source, type.size * scale * face->sizeAdjust);
}

Typesetter::Chain Typesetter::chain(const style::TypeStyle& type, float scale,
                                    const std::string& language) {
  Chain chain(fonts_);
  if (Font* first = primary(type, scale)) chain.fonts.push_back(first);
  for (const auto& family : tokens_.fallbackFamilies(language)) {
    const auto* face = tokens_.face(family, type.weight);
    if (face == nullptr || face->source.empty()) continue;
    chain.fallbacks.emplace_back(face->source,
                                 type.size * scale * face->sizeAdjust);
  }
  return chain;
}

Font* Typesetter::Chain::openNext() {
  while (opened < fallbacks.size()) {
    const auto& [source, size] = fallbacks[opened++];
    Font* font = library.font(source, size);
    const bool known =
        std::find(fonts.begin(), fonts.end(), font) != fonts.end();
    if (font == nullptr || known) continue;
    fonts.push_back(font);
    return font;
  }
  return nullptr;
}

Font* Typesetter::Chain::first() {
  if (fonts.empty()) openNext();
  return fonts.empty() ? nullptr : fonts.front();
}

Font* Typesetter::Chain::fontFor(char32_t code) {
  for (Font* font : fonts) {
    if (font->glyphFor(code) != 0) return font;
  }
  while (Font* font = openNext()) {
    if (font->glyphFor(code) != 0) return font;
  }
  return first();
}

Paragraph Typesetter::fit(const std::vector<Span>& spans,
                          const ParagraphOptions& options) {
  ParagraphOptions sized = options;
  sized.fitMinSize = 0;
  sized.nowrap = true;
  sized.maxLines = 1;
  sized.preserveBreaks = false;
  sized.ellipsis = false;
  Paragraph paragraph = set(spans, sized);
  if (paragraph.width <= options.maxWidth) return paragraph;

  std::vector<Span> fitted = spans;
  Font* font = primary(*options.strut, options.strutScale);
  const float strutSize = options.strut->size * options.strutScale;
  float adjustment = font != nullptr ? font->size() / strutSize : 1;
  // Normalize each face so intentional inline sizes retain their proportions.
  for (const Line& line : paragraph.lines) {
    for (const PlacedGlyph& glyph : line.glyphs) {
      const Span& span = spans[glyph.span];
      const float spanSize = span.type->size * span.scale;
      if (spanSize > 0) {
        adjustment = std::min(adjustment, glyph.font->size() / spanSize);
      }
    }
  }
  const float originalSize = strutSize * adjustment;
  const float minimumSize =
      std::min(originalSize, std::max(options.fitMinSize, 1.0f));
  float size = originalSize;
  // Whole-pixel steps bound the font/atlas cache as a control is resized.
  while (size > minimumSize) {
    size = std::max(minimumSize, std::ceil(size) - 1);
    const float factor = size / originalSize;
    sized.strutScale = options.strutScale * factor;
    for (size_t index = 0; index < spans.size(); ++index) {
      fitted[index].scale = spans[index].scale * factor;
    }
    paragraph = set(fitted, sized);
    if (paragraph.width <= options.maxWidth) return paragraph;
  }
  sized.ellipsis = true;
  return set(fitted, sized);
}

Paragraph Typesetter::set(const std::vector<Span>& spans,
                          const ParagraphOptions& options) {
  const bool fits = options.fitMinSize > 0 && options.strut != nullptr &&
                    options.strut->size * options.strutScale >= 1;
  if (fits) return fit(spans, options);
  static const bool initialized = [] {
    init_linebreak();
    return true;
  }();
  (void)initialized;

  // The logical text: each run of whitespace one space unless breaks are
  // preserved, case transformed, each inline box a U+FFFC.
  struct Piece {
    int span;
    size_t begin;
    size_t end;
  };
  std::string all;
  std::vector<Piece> pieces;
  bool afterSpace = true;
  bool wordStart = true;
  for (size_t index = 0; index < spans.size(); ++index) {
    const Span& span = spans[index];
    const size_t begin = all.size();
    if (span.atom) {
      all += kObjectReplacement;
      afterSpace = false;
    } else if (span.type != nullptr) {
      const std::string text =
          transformCase(span.text, span.type->textCase, wordStart);
      for (const char byte : text) {
        if (options.preserveBreaks) {
          all.push_back(byte == '\t' ? ' ' : byte);
          continue;
        }
        if (isCollapsible(byte)) {
          if (!afterSpace) all.push_back(' ');
          afterSpace = true;
        } else {
          all.push_back(byte);
          afterSpace = false;
        }
      }
    }
    if (all.size() > begin) {
      pieces.push_back(Piece{static_cast<int>(index), begin, all.size()});
    }
  }

  std::vector<char> breaks(all.size(), LINEBREAK_NOBREAK);
  if (!all.empty()) {
    set_linebreaks_utf8(reinterpret_cast<const utf8_t*>(all.data()),
                        all.size(), options.language.c_str(), breaks.data());
  }

  // Shaped clusters, each piece split where its face changes.
  std::vector<Cluster> clusters;
  for (const Piece& piece : pieces) {
    const Span& span = spans[piece.span];
    if (span.atom) {
      Cluster atom;
      atom.begin = piece.begin;
      atom.end = piece.end;
      atom.span = piece.span;
      atom.atom = true;
      atom.width = span.atomWidth + span.atomTrailing;
      clusters.push_back(atom);
      continue;
    }
    Chain fonts = chain(*span.type, span.scale, options.language);
    if (fonts.first() == nullptr) continue;
    const auto fontAt = [&](char32_t code) {
      const bool blank = code == ' ' || code == '\n';
      return blank ? fonts.first() : fonts.fontFor(code);
    };
    const float letterSpacing = span.type->letterSpacing * span.scale;
    const float wordSpacing = span.type->wordSpacing * span.scale;
    size_t at = piece.begin;
    while (at < piece.end) {
      size_t length = 1;
      Font* font = fontAt(decodeAt(all, at, length));
      size_t segmentEnd = at + length;
      while (segmentEnd < piece.end) {
        size_t next = 1;
        if (fontAt(decodeAt(all, segmentEnd, next)) != font) break;
        segmentEnd += next;
      }
      const auto glyphs = font->shape(all, at, segmentEnd - at);
      const size_t firstNew = clusters.size();
      for (const ShapedGlyph& shaped : glyphs) {
        const bool fresh = clusters.size() == firstNew ||
                           clusters.back().begin != shaped.cluster;
        if (fresh) {
          Cluster cluster;
          cluster.begin = shaped.cluster;
          cluster.span = piece.span;
          cluster.font = font;
          clusters.push_back(cluster);
        }
        Cluster& cluster = clusters.back();
        cluster.glyphs.push_back(Cluster::Glyph{
            shaped.index, cluster.width + shaped.xOffset, -shaped.yOffset});
        cluster.width += shaped.xAdvance;
      }
      // Each cluster ends where the next begins; its characters take the
      // letter spacing, its spaces the word spacing too.
      for (size_t index = firstNew; index < clusters.size(); ++index) {
        Cluster& cluster = clusters[index];
        cluster.end = index + 1 < clusters.size() ? clusters[index + 1].begin
                                                  : segmentEnd;
        size_t characters = 0;
        bool allSpace = true;
        for (size_t byte = cluster.begin; byte < cluster.end;) {
          size_t step = 1;
          const char32_t code = decodeAt(all, byte, step);
          characters += 1;
          if (code == '\n') cluster.newline = true;
          if (code != ' ') allSpace = false;
          byte += step;
        }
        cluster.space = allSpace;
        cluster.width += letterSpacing * static_cast<float>(characters);
        if (allSpace) cluster.width += wordSpacing;
        if (cluster.newline) cluster.width = 0;
      }
      at = segmentEnd;
    }
  }

  const auto canBreakAfter = [&](const Cluster& cluster) {
    if (cluster.end == 0 || cluster.end > breaks.size()) return false;
    const char status = breaks[cluster.end - 1];
    return status == LINEBREAK_ALLOWBREAK || status == LINEBREAK_MUSTBREAK;
  };

  // Lines, greedily: a line ends at its last break that fits.
  struct Range {
    size_t begin;
    size_t end;
  };
  std::vector<Range> ranges;
  double minContent = 0;
  double unbroken = 0;
  {
    const bool wraps = !options.nowrap;
    size_t lineStart = 0;
    double x = 0;
    std::optional<size_t> lastBreak;
    for (size_t index = 0; index < clusters.size(); ++index) {
      const Cluster& cluster = clusters[index];
      if (!cluster.space) unbroken += cluster.width;
      if (cluster.space || canBreakAfter(cluster)) {
        minContent = std::max(minContent, unbroken);
        unbroken = 0;
      }
      if (cluster.newline) {
        ranges.push_back(Range{lineStart, index + 1});
        lineStart = index + 1;
        x = 0;
        lastBreak.reset();
        continue;
      }
      // A space starting a wrapped line is dropped; one ending it hangs.
      if (x == 0 && cluster.space && !ranges.empty() &&
          !options.preserveBreaks && lineStart == index) {
        lineStart = index + 1;
        continue;
      }
      const bool overflows = wraps && !cluster.space &&
                             x + cluster.width > options.maxWidth +
                                                     kFitTolerance &&
                             index > lineStart;
      if (overflows && lastBreak && *lastBreak >= lineStart) {
        ranges.push_back(Range{lineStart, *lastBreak + 1});
        lineStart = *lastBreak + 1;
        x = 0;
        for (size_t again = lineStart; again <= index; ++again) {
          x += clusters[again].width;
        }
        lastBreak.reset();
        if (canBreakAfter(cluster)) lastBreak = index;
        continue;
      }
      if (overflows && options.breakAnywhere) {
        ranges.push_back(Range{lineStart, index});
        lineStart = index;
        x = cluster.width;
        lastBreak.reset();
        if (canBreakAfter(cluster)) lastBreak = index;
        continue;
      }
      x += cluster.width;
      if (wraps && canBreakAfter(cluster)) lastBreak = index;
    }
    if (lineStart < clusters.size()) {
      ranges.push_back(Range{lineStart, clusters.size()});
    }
    minContent = std::max(minContent, unbroken);
  }

  Paragraph paragraph;
  if (options.maxLines > 0 &&
      ranges.size() > static_cast<size_t>(options.maxLines)) {
    ranges.resize(options.maxLines);
    paragraph.truncated = true;
  }

  Font* strutFont = options.strut != nullptr
                        ? primary(*options.strut, options.strutScale)
                        : nullptr;
  // Middle alignment centres on half the parent's x-height, in 1/64 pixels.
  const float halfXHeight =
      strutFont ? std::round(strutFont->xHeight() / 2 * 64) / 64 : 0;
  const Extent strut =
      options.strut != nullptr
          ? textExtent(strutFont,
                       options.strut->lineHeight * options.strutScale)
          : Extent{};

  float top = 0;
  for (size_t lineIndex = 0; lineIndex < ranges.size(); ++lineIndex) {
    const Range& range = ranges[lineIndex];
    Line line;
    float ascent = strut.ascent;
    float descent = strut.descent;
    size_t end = range.end;
    // Trailing spaces hang past the line's end.
    while (end > range.begin &&
           (clusters[end - 1].space || clusters[end - 1].newline)) {
      --end;
    }
    double x = 0;
    for (size_t index = range.begin; index < end; ++index) {
      x += clusters[index].width;
    }

    std::vector<Cluster> placed(clusters.begin() + range.begin,
                                clusters.begin() + end);
    const bool lastLine = lineIndex + 1 == ranges.size();
    const bool overflowing = x > options.maxWidth + kFitTolerance;
    const bool clamped = paragraph.truncated && lastLine;
    const bool ellipsize = (options.ellipsis || options.maxLines > 1) &&
                           (clamped || (overflowing && options.ellipsis));
    if (ellipsize && !placed.empty()) {
      const Span& span = spans[placed.back().span];
      Font* font = span.type != nullptr ? primary(*span.type, span.scale)
                                        : strutFont;
      if (font != nullptr) {
        const auto dots = font->shape(kEllipsis);
        float dotsWidth = 0;
        for (const auto& glyph : dots) dotsWidth += glyph.xAdvance;
        while (!placed.empty() &&
               (x + dotsWidth > options.maxWidth + kFitTolerance ||
                placed.back().space)) {
          x -= placed.back().width;
          placed.pop_back();
        }
        Cluster ellipsis;
        ellipsis.span = placed.empty() ? 0 : placed.back().span;
        ellipsis.font = font;
        for (const auto& glyph : dots) {
          ellipsis.glyphs.push_back(Cluster::Glyph{
              glyph.index, ellipsis.width + glyph.xOffset, -glyph.yOffset});
          ellipsis.width += glyph.xAdvance;
        }
        if (dotsWidth <= options.maxWidth + kFitTolerance) {
          placed.push_back(ellipsis);
          x += ellipsis.width;
        }
        paragraph.truncated = true;
      }
    }

    for (const Cluster& cluster : placed) {
      const Span& span = spans[cluster.span];
      if (cluster.atom) {
        if (span.atomMiddle) {
          ascent = std::max(ascent, span.atomHeight / 2 + halfXHeight);
          descent = std::max(descent, span.atomHeight / 2 - halfXHeight);
        } else {
          ascent = std::max(ascent, span.atomHeight + span.atomRaise);
          descent = std::max(descent, -span.atomRaise);
        }
        continue;
      }
      if (span.type == nullptr) continue;
      const Extent extent = textExtent(primary(*span.type, span.scale),
                                       span.type->lineHeight * span.scale);
      if (span.platePadding >= 0) {
        const float box =
            extent.ascent + extent.descent + 2 * span.platePadding;
        ascent = std::max(ascent, box / 2 + halfXHeight);
        descent = std::max(descent, box / 2 - halfXHeight);
        continue;
      }
      ascent = std::max(ascent, extent.ascent);
      descent = std::max(descent, extent.descent);
    }
    line.height = ascent + descent;
    line.baseline = top + ascent;
    line.top = top;
    line.width = std::ceil(x * 64) / 64;

    float pen = 0;
    float extraPerSpace = 0;
    if (options.align == ParagraphOptions::Align::Center) {
      pen = std::floor((options.maxWidth - line.width) / 2 * 64) / 64;
    } else if (options.align == ParagraphOptions::Align::End) {
      pen = options.maxWidth - line.width;
    } else if (options.align == ParagraphOptions::Align::Justify &&
               !lastLine && std::isfinite(options.maxWidth)) {
      const auto spaces = std::count_if(
          placed.begin(), placed.end(),
          [](const Cluster& cluster) { return cluster.space; });
      if (spaces > 0) {
        extraPerSpace =
            (options.maxWidth - x) / static_cast<float>(spaces);
      }
    }
    if (!std::isfinite(pen) || pen < 0) pen = 0;
    line.x = pen;
    pen = 0;
    for (const Cluster& cluster : placed) {
      const Span& span = spans[cluster.span];
      const float width = cluster.width + (cluster.space ? extraPerSpace : 0);
      // A plated run's glyphs sit on their own box's baseline, not the line's.
      float rise = 0;
      float ownTop = line.top;
      float ownHeight = line.height;
      const bool plated = !cluster.atom && span.type != nullptr &&
                          span.platePadding >= 0;
      if (plated) {
        const Extent extent = textExtent(primary(*span.type, span.scale),
                                         span.type->lineHeight * span.scale);
        ownHeight = extent.ascent + extent.descent;
        ownTop = line.baseline - halfXHeight - ownHeight / 2;
        rise = ownTop + extent.ascent - line.baseline;
      }
      if (line.stretches.empty() || line.stretches.back().span != cluster.span) {
        line.stretches.push_back(
            Line::Stretch{cluster.span, pen, 0, ownTop, ownHeight});
      }
      line.stretches.back().width = pen + width - line.stretches.back().x;
      if (cluster.atom) {
        const float bottom =
            span.atomMiddle
                ? line.baseline - halfXHeight + span.atomHeight / 2
                : line.baseline - span.atomRaise;
        line.atoms.push_back(PlacedAtom{cluster.span, pen,
                                        bottom - span.atomHeight,
                                        span.atomWidth, span.atomHeight});
      }
      for (const auto& glyph : cluster.glyphs) {
        line.glyphs.push_back(PlacedGlyph{cluster.font, glyph.index,
                                          pen + glyph.x,
                                          line.baseline + rise + glyph.y,
                                          cluster.span});
      }
      pen += width;
    }
    paragraph.width = std::max(paragraph.width, line.width);
    top += line.height;
    paragraph.lines.push_back(std::move(line));
  }
  paragraph.height = top;
  paragraph.minContentWidth = std::ceil(minContent * 64) / 64;
  return paragraph;
}

}  // namespace bureau::text
