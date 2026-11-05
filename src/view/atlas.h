// The glyphs and pictures the UI draws, packed into pages of kAtlasSize
// texels a side, premultiplied RGBA. Each page keeps its pixels, so a lost
// device's pages are written again whole; what changed since the last frame
// goes out as uploads.
#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include "bureau/display.h"

namespace bureau {

struct AtlasEntry {
  int page = 0;
  int x = 0;
  int y = 0;
  int width = 0;
  int height = 0;
  /** A glyph's bearing from its pen, in device pixels. */
  int left = 0;
  int top = 0;
};

class Atlas {
 public:
  Atlas();

  const AtlasEntry* find(const std::string& key) const;
  /** Packs `width` x `height` premultiplied RGBA under `key`; an existing
   * key reuses its entry. Invalid dimensions, byte counts or a full atlas
   * return nothing. */
  std::optional<AtlasEntry> add(const std::string& key, int width, int height,
                                const std::vector<std::uint8_t>& pixels,
                                int left = 0, int top = 0);
  /** The white texel's centre, in page 0's normalized coordinates. */
  float whiteU() const { return whiteU_; }
  float whiteV() const { return whiteV_; }

  /** What changed since the last take. */
  std::vector<AtlasUpload> takeUploads();
  /** Every page whole: after a lost device, or for a new mirror. */
  std::vector<AtlasUpload> everything() const;
  int pages() const { return static_cast<int>(pages_.size()); }
  /** Drops every entry: the UI scale or the language changed what is drawn,
   * or the pages outgrew the view's budget. */
  void clear();

 private:
  struct Page {
    std::vector<std::uint8_t> pixels;
    int shelfY = 0;
    int shelfHeight = 0;
    int cursorX = 0;
  };
  bool place(Page& page, int width, int height, int& x, int& y);

  std::vector<Page> pages_;
  std::map<std::string, AtlasEntry> entries_;
  std::vector<AtlasUpload> uploads_;
  float whiteU_ = 0;
  float whiteV_ = 0;
};

}  // namespace bureau
