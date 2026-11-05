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
  using Reader = std::function<std::shared_ptr<const std::vector<uint8_t>>(
      const std::string& path)>;
  explicit ImageStore(Reader read);
  ~ImageStore();

  /** Null when the source cannot be read or decoded, or is an SVG. */
  const Bitmap* get(const std::string& source);
  /** An `.svg` source parsed (vector.h); null for any other, or one that
   * cannot be read or parsed. */
  const VectorPicture* vector(const std::string& source);
  /** Failures belong to the current paint, not an earlier hidden window. */
  void beginPaint() { missing_.clear(); }
  std::vector<std::string> missingImages() const {
    return {missing_.begin(), missing_.end()};
  }

 private:
  Reader read_;
  std::map<std::string, std::unique_ptr<Bitmap>> decoded_;
  std::map<std::string, std::unique_ptr<VectorPicture>> parsed_;
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
