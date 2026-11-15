// The pictures an Image draws: PNGs (and the catalog's two JPEG photographs)
// by their path under public/ or as data URLs, decoded once, and the
// filters a prop asks for baked into a copy (tint, silhouette, rim...).
#pragma once

#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "tokens.h"

namespace bureau {

struct VectorPicture;

/** Straight-alpha RGBA rows, top first. */
struct Bitmap {
  int width = 0;
  int height = 0;
  std::vector<std::uint8_t> rgba;
};

class ImageStore {
 public:
  using Bytes = std::shared_ptr<const std::vector<uint8_t>>;
  using Reader = std::function<Bytes(const std::string& path)>;
  /** Takes a file to read away from the store's thread, answering true; it
   * comes back through `arrived`. False leaves it to `Reader`, at once. */
  using Ask = std::function<bool(const std::string& path)>;
  explicit ImageStore(Reader read, Ask ask = nullptr);
  ~ImageStore();

  /** Null when the source cannot be read or decoded, is an SVG, or is still
   * on its way from `Ask`. */
  const Bitmap* get(const std::string& source);
  /** An `.svg` source parsed (vector.h); null for any other, one that cannot
   * be read or parsed, or one still on its way. */
  const VectorPicture* vector(const std::string& source);
  /** A file `Ask` took, or nothing when it could not be read. */
  void arrived(const std::string& source, Bytes bytes);
  /** Failures belong to the current paint, not an earlier hidden window. */
  void beginPaint() { missing_.clear(); }
  std::vector<std::string> missingImages() const {
    return {missing_.begin(), missing_.end()};
  }

 private:
  bool onItsWay(const std::string& source);

  Reader read_;
  Ask ask_;
  std::map<std::string, std::unique_ptr<Bitmap>> decoded_;
  std::map<std::string, std::unique_ptr<VectorPicture>> parsed_;
  /** Taken by `ask_` and not yet arrived: neither drawn nor missing. */
  std::set<std::string> onItsWay_;
  std::set<std::string> missing_;
};

/** What an Image's props ask of its pixels. */
struct ImageFilters {
  bool grayscale = false;
  bool washedOut = false;
  bool silhouetteBlack = false;
  bool silhouetteGrey = false;
  std::optional<style::Color> rim;
  std::optional<style::Color> outline;
  std::optional<style::Color> shadow;
  float shadowOffset = 0;
  bool any() const {
    return grayscale || washedOut || silhouetteBlack || silhouetteGrey ||
           rim || outline || shadow;
  }
};

/** Each pixel `factor` pixels a side. */
Bitmap scaleNearest(const Bitmap& source, int factor);

/** Repeated half-size filtering for smooth minification. Even edges average
 * pairs; odd edges use a 1:2:1 kernel so the last source row is retained. */
Bitmap imageMip(const Bitmap& source, int level);

/** The filters, each over the last one's result. `unit` is device pixels
 * per UI pixel; the rim, outline and shadow reach past the picture, so the
 * result grows and `pad` says by how much on the left and the top. */
Bitmap applyFilters(const Bitmap& source, const ImageFilters& filters,
                    int unit, int& padLeft, int& padTop);

std::vector<std::uint8_t> premultiplied(const Bitmap& bitmap);

}  // namespace bureau
