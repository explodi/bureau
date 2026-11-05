#include "font.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <hb-ft.h>
#include <hb-ot.h>
#include FT_OUTLINE_H
#include FT_TRUETYPE_TABLES_H
#include <iterator>
#ifdef __APPLE__
#include <CoreText/CoreText.h>
#endif

namespace bureau {
namespace {

std::shared_ptr<const std::vector<uint8_t>> readFile(const std::string& path) {
  std::ifstream file(path, std::ios::binary);
  if (!file.good()) return nullptr;
  return std::make_shared<const std::vector<uint8_t>>(
      std::istreambuf_iterator<char>{file}, std::istreambuf_iterator<char>{});
}

// System faces remain platform fonts; copy their tables into the same shaping
// path as bundled faces instead of substituting a visibly different UI font.
std::shared_ptr<const std::vector<uint8_t>> systemFace(
    const std::string& family, float size) {
#ifdef __APPLE__
  CTFontRef font = family == "system-ui"
      ? CTFontCreateUIFontForLanguage(kCTFontUIFontSystem, size, nullptr)
      : CTFontCreateWithName(CFSTR("Menlo"), size, nullptr);
  if (font == nullptr) return nullptr;
  CFArrayRef tags = CTFontCopyAvailableTables(font, kCTFontTableOptionNoOptions);
  if (tags == nullptr) { CFRelease(font); return nullptr; }
  struct Table { uint32_t tag; CFDataRef data; };
  std::vector<Table> tables;
  for (CFIndex i = 0; i < CFArrayGetCount(tags); ++i) {
    const auto tag = static_cast<uint32_t>(reinterpret_cast<uintptr_t>(
        CFArrayGetValueAtIndex(tags, i)));
    CFDataRef data = CTFontCopyTable(font, tag, kCTFontTableOptionNoOptions);
    if (data != nullptr) tables.push_back({tag, data});
  }
  CFRelease(tags);
  CFRelease(font);
  std::sort(tables.begin(), tables.end(),
            [](const Table& a, const Table& b) { return a.tag < b.tag; });
  auto bytes = std::make_shared<std::vector<uint8_t>>(12 + tables.size() * 16);
  const auto put = [&](size_t at, uint32_t value, int width) {
    for (int i = width - 1; i >= 0; --i) {
      (*bytes)[at + i] = value & 255;
      value >>= 8;
    }
  };
  const bool cff = std::any_of(tables.begin(), tables.end(),
      [](const Table& table) { return table.tag == 0x43464620; });
  put(0, cff ? 0x4f54544f : 0x00010000, 4);
  put(4, static_cast<uint32_t>(tables.size()), 2);
  for (size_t i = 0; i < tables.size(); ++i) {
    const auto& table = tables[i];
    const size_t offset = bytes->size();
    const auto length = static_cast<size_t>(CFDataGetLength(table.data));
    bytes->insert(bytes->end(), CFDataGetBytePtr(table.data),
                  CFDataGetBytePtr(table.data) + length);
    while (bytes->size() % 4 != 0) bytes->push_back(0);
    uint32_t checksum = 0;
    for (size_t at = offset; at < bytes->size(); at += 4) {
      checksum += uint32_t((*bytes)[at]) << 24 | uint32_t((*bytes)[at + 1]) << 16 |
                  uint32_t((*bytes)[at + 2]) << 8 | (*bytes)[at + 3];
    }
    put(12 + i * 16, table.tag, 4);
    put(16 + i * 16, checksum, 4);
    put(20 + i * 16, static_cast<uint32_t>(offset), 4);
    put(24 + i * 16, static_cast<uint32_t>(length), 4);
    CFRelease(table.data);
  }
  return bytes;
#else
  (void)family;
  (void)size;
  return nullptr;
#endif
}

constexpr FT_Int32 kLoadFlags = FT_LOAD_NO_HINTING | FT_LOAD_NO_BITMAP;
constexpr float kShapeUnitsPerPixel = 65536;

hb_position_t glyphAdvance(hb_font_t* font, void*, hb_codepoint_t glyph, void*) {
  hb_font_t* design = hb_font_get_parent(font);
  const float units = hb_face_get_upem(hb_font_get_face(design));
  const float advance = hb_font_get_glyph_h_advance(design, glyph) *
                        hb_font_get_ptem(font) / units;
  // Advances truncate to 16.16 fixed point after scaling: the precision the
  // native goldens hold.
  return static_cast<hb_position_t>(advance * kShapeUnitsPerPixel);
}

}  // namespace

Font::Font(const std::string& path, float size)
    : bytes_(path.starts_with("system:") ? systemFace(path.substr(7), size)
                                       : readFile(path)), size_(size) {
  open();
}

Font::Font(std::shared_ptr<const std::vector<uint8_t>> bytes, float size)
    : bytes_(std::move(bytes)), size_(size) {
  open();
}

void Font::open() {
  if (bytes_ == nullptr || bytes_->empty()) return;
  if (FT_Init_FreeType(&library_) != 0) return;
  if (FT_New_Memory_Face(library_, bytes_->data(),
                         static_cast<FT_Long>(bytes_->size()), 0,
                         &face_) != 0) {
    face_ = nullptr;
    return;
  }
  // At 72 dots an inch a point is a pixel, so 26.6 points carry fractional
  // pixel sizes, which a UI scale of 1.5 needs.
  const auto size26 = static_cast<FT_F26Dot6>(std::lround(size_ * 64));
  if (FT_Set_Char_Size(face_, 0, size26, 72, 72) != 0) return;
  hb_face_t* face = hb_ft_face_create_referenced(face_);
  hb_font_t* design = hb_font_create(face);
  hb_face_destroy(face);
  hb_ot_font_set_funcs(design);
  hbFont_ = hb_font_create_sub_font(design);
  hb_font_destroy(design);
  const int shapeSize = static_cast<int>(std::lround(size_ * kShapeUnitsPerPixel));
  hb_font_set_scale(hbFont_, shapeSize, shapeSize);
  hb_font_set_ptem(hbFont_, size_);
  hb_font_funcs_t* functions = hb_font_funcs_create();
  hb_font_funcs_set_glyph_h_advance_func(functions, glyphAdvance, nullptr, nullptr);
  hb_font_funcs_make_immutable(functions);
  hb_font_set_funcs(hbFont_, functions, nullptr, nullptr);
  hb_font_funcs_destroy(functions);
}

Font::~Font() {
  if (hbFont_ != nullptr) hb_font_destroy(hbFont_);
  if (face_ != nullptr) FT_Done_Face(face_);
  if (library_ != nullptr) FT_Done_FreeType(library_);
}

std::vector<ShapedGlyph> Font::shape(const std::string& text) const {
  return shape(text, 0, text.size());
}

std::vector<ShapedGlyph> Font::shape(const std::string& text, size_t start,
                                     size_t length) const {
  if (!valid()) return {};
  hb_buffer_t* buffer = hb_buffer_create();
  hb_buffer_add_utf8(buffer, text.c_str(), static_cast<int>(text.size()),
                     static_cast<unsigned int>(start),
                     static_cast<int>(length));
  hb_buffer_guess_segment_properties(buffer);
  hb_shape(hbFont_, buffer, nullptr, 0);
  unsigned int count = 0;
  const hb_glyph_info_t* infos = hb_buffer_get_glyph_infos(buffer, &count);
  const hb_glyph_position_t* positions =
      hb_buffer_get_glyph_positions(buffer, nullptr);
  std::vector<ShapedGlyph> glyphs;
  glyphs.reserve(count);
  for (unsigned int index = 0; index < count; ++index) {
    glyphs.push_back(ShapedGlyph{infos[index].codepoint, infos[index].cluster,
                                 positions[index].x_advance / kShapeUnitsPerPixel,
                                 positions[index].x_offset / kShapeUnitsPerPixel,
                                 positions[index].y_offset / kShapeUnitsPerPixel});
  }
  hb_buffer_destroy(buffer);
  return glyphs;
}

uint32_t Font::glyphFor(char32_t codePoint) const {
  if (!valid()) return 0;
  return FT_Get_Char_Index(face_, codePoint);
}

RasterGlyph Font::raster(uint32_t glyphIndex, float subpixel, bool monochrome) const {
  RasterGlyph glyph{};
  if (!valid()) return glyph;
  if (FT_Load_Glyph(face_, glyphIndex, kLoadFlags) != 0) return glyph;
  if (subpixel != 0 && face_->glyph->format == FT_GLYPH_FORMAT_OUTLINE) {
    FT_Outline_Translate(&face_->glyph->outline,
                         static_cast<FT_Pos>(std::lround(subpixel * 64)), 0);
  }
  const FT_Render_Mode mode = monochrome ? FT_RENDER_MODE_MONO : FT_RENDER_MODE_NORMAL;
  if (FT_Render_Glyph(face_->glyph, mode) != 0) return glyph;
  const FT_Bitmap& bitmap = face_->glyph->bitmap;
  const bool oneBit = bitmap.pixel_mode == FT_PIXEL_MODE_MONO;
  if (!oneBit && bitmap.pixel_mode != FT_PIXEL_MODE_GRAY) return glyph;
  glyph.left = face_->glyph->bitmap_left;
  glyph.top = face_->glyph->bitmap_top;
  glyph.width = static_cast<int>(bitmap.width);
  glyph.height = static_cast<int>(bitmap.rows);
  glyph.coverage.resize(bitmap.width * bitmap.rows);
  for (unsigned int row = 0; row < bitmap.rows; ++row) {
    const int sourceRow = bitmap.pitch >= 0
                              ? static_cast<int>(row)
                              : static_cast<int>(bitmap.rows - 1 - row);
    const unsigned char* source = bitmap.buffer + sourceRow * std::abs(bitmap.pitch);
    std::uint8_t* target = glyph.coverage.data() + row * bitmap.width;
    if (!oneBit) {
      std::memcpy(target, source, bitmap.width);
      continue;
    }
    for (unsigned int column = 0; column < bitmap.width; ++column) {
      const bool set = ((source[column / 8] >> (7 - column % 8)) & 1) != 0;
      target[column] = set ? 255 : 0;
    }
  }
  return glyph;
}

float Font::ascent() const {
  if (!valid()) return 0;
  const auto* hhea = static_cast<TT_HoriHeader*>(FT_Get_Sfnt_Table(face_, ft_sfnt_hhea));
  return static_cast<float>(hhea ? hhea->Ascender : face_->ascender) * size_ /
         face_->units_per_EM;
}

float Font::descent() const {
  if (!valid()) return 0;
  const auto* hhea = static_cast<TT_HoriHeader*>(FT_Get_Sfnt_Table(face_, ft_sfnt_hhea));
  return -static_cast<float>(hhea ? hhea->Descender : face_->descender) * size_ /
         face_->units_per_EM;
}

float Font::xHeight() const {
  if (!valid()) return 0;
  const auto* os2 = static_cast<TT_OS2*>(FT_Get_Sfnt_Table(face_, ft_sfnt_os2));
  if (os2 && os2->version != 0xffff && os2->version >= 2 && os2->sxHeight > 0) {
    return static_cast<float>(os2->sxHeight) * size_ / face_->units_per_EM;
  }
  const auto glyph = glyphFor(U'x');
  if (glyph != 0 && FT_Load_Glyph(face_, glyph, FT_LOAD_NO_SCALE) == 0) {
    return static_cast<float>(face_->glyph->metrics.horiBearingY) * size_ /
           face_->units_per_EM;
  }
  return size_ * 0.5f;
}

}  // namespace bureau
