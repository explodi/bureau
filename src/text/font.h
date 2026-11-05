#ifndef BUREAU_TEXT_FONT_H
#define BUREAU_TEXT_FONT_H

#include <cstdint>
#include <ft2build.h>
#include <memory>
#include <string>
#include <vector>
#include FT_FREETYPE_H
#include <hb.h>

namespace bureau {

struct ShapedGlyph {
  uint32_t index;
  uint32_t cluster;
  float xAdvance;
  float xOffset;
  float yOffset;
};

struct RasterGlyph {
  int left;
  int top;
  int width;
  int height;
  std::vector<uint8_t> coverage;
};

/** One face file at one size, unhinted, so a pixel face keeps its drawn
 * shapes at UI sizes.
 * Sizes are pixels and may be fractional (a scaled UI's text). */
class Font {
 public:
  Font(const std::string& path, float size);
  /** From the bytes of a face file, which the font shares. */
  Font(std::shared_ptr<const std::vector<uint8_t>> bytes, float size);
  ~Font();
  Font(const Font&) = delete;
  Font& operator=(const Font&) = delete;

  bool valid() const { return face_ != nullptr && hbFont_ != nullptr; }
  /** Shapes UTF-8 `text[start, start + length)` in its context. */
  std::vector<ShapedGlyph> shape(const std::string& text) const;
  std::vector<ShapedGlyph> shape(const std::string& text, size_t start,
                                 size_t length) const;
  /** The glyph for a code point, 0 where the face has none. */
  uint32_t glyphFor(char32_t codePoint) const;
  /** Coverage at the font's size, its pen at x = `subpixel` of a pixel. When
   * `monochrome`, each pixel is all or nothing. */
  RasterGlyph raster(uint32_t glyphIndex, float subpixel = 0,
                     bool monochrome = false) const;
  /** The face's hhea ascent and descent, in pixels: what line boxes use. */
  float ascent() const;
  float descent() const;
  /** The face's x-height in pixels, before layout quantization. */
  float xHeight() const;
  float size() const { return size_; }

 private:
  void open();

  std::shared_ptr<const std::vector<uint8_t>> bytes_;
  FT_Library library_ = nullptr;
  FT_Face face_ = nullptr;
  hb_font_t* hbFont_ = nullptr;
  float size_ = 0;
};

}  // namespace bureau

#endif
