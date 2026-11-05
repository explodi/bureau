#include "atlas.h"

#include <algorithm>
#include <cstring>

namespace bureau {
namespace {

/** A texel of space round every entry, so linear sampling never reads its
 * neighbour. */
constexpr int kGutter = 1;
constexpr int kWhite = 4;

}  // namespace

Atlas::Atlas() { clear(); }

void Atlas::clear() {
  pages_.clear();
  entries_.clear();
  uploads_.clear();
  const std::vector<std::uint8_t> white(kWhite * kWhite * 4, 255);
  const auto entry = add("#white", kWhite, kWhite, white);
  whiteU_ = (static_cast<float>(entry->x) + kWhite / 2.0f) / kAtlasSize;
  whiteV_ = (static_cast<float>(entry->y) + kWhite / 2.0f) / kAtlasSize;
}

const AtlasEntry* Atlas::find(const std::string& key) const {
  const auto found = entries_.find(key);
  return found == entries_.end() ? nullptr : &found->second;
}

bool Atlas::place(Page& page, int width, int height, int& x, int& y) {
  const int needWidth = width + kGutter;
  const int needHeight = height + kGutter;
  int cursorX = page.cursorX;
  int shelfY = page.shelfY;
  int shelfHeight = page.shelfHeight;
  if (cursorX + needWidth > kAtlasSize) {
    shelfY += shelfHeight;
    shelfHeight = 0;
    cursorX = 0;
  }
  // A glyph that needs another page must not consume this page's shelf.
  if (shelfY + needHeight > kAtlasSize) return false;
  x = cursorX;
  y = shelfY;
  page.cursorX = cursorX + needWidth;
  page.shelfY = shelfY;
  page.shelfHeight = std::max(shelfHeight, needHeight);
  return true;
}

std::optional<AtlasEntry> Atlas::add(const std::string& key, int width,
                                     int height,
                                     const std::vector<std::uint8_t>& pixels,
                                     int left, int top) {
  if (const auto* existing = find(key)) return *existing;
  const bool fitsPage = width >= 0 && height >= 0 &&
                        width <= kAtlasSize - kGutter &&
                        height <= kAtlasSize - kGutter;
  if (!fitsPage) return std::nullopt;
  const size_t byteCount = static_cast<size_t>(width) * height * 4;
  if (pixels.size() != byteCount) {
    return std::nullopt;
  }
  AtlasEntry entry;
  entry.width = width;
  entry.height = height;
  entry.left = left;
  entry.top = top;
  bool placed = false;
  for (size_t index = 0; index < pages_.size() && !placed; ++index) {
    if (place(pages_[index], width, height, entry.x, entry.y)) {
      entry.page = static_cast<int>(index);
      placed = true;
    }
  }
  if (!placed) {
    if (pages_.size() >= 255) return std::nullopt;
    pages_.push_back(Page{std::vector<std::uint8_t>(
        static_cast<size_t>(kAtlasSize) * kAtlasSize * 4, 0)});
    entry.page = static_cast<int>(pages_.size() - 1);
    place(pages_.back(), width, height, entry.x, entry.y);
  }
  Page& page = pages_[entry.page];
  for (int row = 0; row < height; ++row) {
    std::memcpy(page.pixels.data() +
                    (static_cast<size_t>(entry.y + row) * kAtlasSize +
                     entry.x) * 4,
                pixels.data() + static_cast<size_t>(row) * width * 4,
                static_cast<size_t>(width) * 4);
  }
  if (width > 0 && height > 0) {
    uploads_.push_back(AtlasUpload{entry.page, entry.x, entry.y, width, height,
                                   pixels});
  }
  entries_.emplace(key, entry);
  return entry;
}

std::vector<AtlasUpload> Atlas::takeUploads() {
  std::vector<AtlasUpload> taken;
  taken.swap(uploads_);
  return taken;
}

std::vector<AtlasUpload> Atlas::everything() const {
  std::vector<AtlasUpload> pages;
  for (size_t index = 0; index < pages_.size(); ++index) {
    pages.push_back(AtlasUpload{static_cast<int>(index), 0, 0, kAtlasSize,
                                kAtlasSize, pages_[index].pixels});
  }
  return pages;
}

}  // namespace bureau
