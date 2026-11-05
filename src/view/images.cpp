#include "images.h"

#include <algorithm>
#include <cmath>

#include "vector.h"

// Static: the game, in the same program, may compile stb_image of its own.
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#include <stb_image.h>
#pragma GCC diagnostic pop

namespace bureau {
namespace {

std::vector<std::uint8_t> decodeBase64(const std::string& text) {
  static const std::string alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::vector<std::uint8_t> bytes;
  int bits = 0;
  int value = 0;
  for (const char character : text) {
    const auto index = alphabet.find(character);
    if (index == std::string::npos) continue;
    value = (value << 6) | static_cast<int>(index);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push_back(static_cast<std::uint8_t>((value >> bits) & 0xff));
    }
  }
  return bytes;
}

std::unique_ptr<Bitmap> decode(const std::uint8_t* bytes, size_t length) {
  int width = 0;
  int height = 0;
  int channels = 0;
  stbi_uc* pixels = stbi_load_from_memory(bytes, static_cast<int>(length),
                                          &width, &height, &channels, 4);
  if (pixels == nullptr) return nullptr;
  auto bitmap = std::make_unique<Bitmap>();
  bitmap->width = width;
  bitmap->height = height;
  bitmap->rgba.assign(pixels, pixels + static_cast<size_t>(width) * height * 4);
  stbi_image_free(pixels);
  return bitmap;
}

/** `source` drawn under `over` at (dx, dy) in one ink: one drop-shadow. */
Bitmap dropShadow(const Bitmap& source, style::Color ink, int dx, int dy) {
  Bitmap result = source;
  for (int y = 0; y < source.height; ++y) {
    for (int x = 0; x < source.width; ++x) {
      const int fromX = x - dx;
      const int fromY = y - dy;
      if (fromX < 0 || fromY < 0 || fromX >= source.width ||
          fromY >= source.height) {
        continue;
      }
      const float shadowAlpha =
          source.rgba[(static_cast<size_t>(fromY) * source.width + fromX) * 4 +
                      3] /
          255.0f * (ink.a / 255.0f);
      auto* pixel = &result.rgba[(static_cast<size_t>(y) * source.width + x) * 4];
      const float overAlpha = pixel[3] / 255.0f;
      const float alpha = overAlpha + shadowAlpha * (1 - overAlpha);
      if (alpha <= 0) continue;
      const std::uint8_t inks[3] = {ink.r, ink.g, ink.b};
      for (int channel = 0; channel < 3; ++channel) {
        const float over = pixel[channel] / 255.0f * overAlpha;
        const float under = inks[channel] / 255.0f * shadowAlpha;
        pixel[channel] = static_cast<std::uint8_t>(
            std::lround((over + under * (1 - overAlpha)) / alpha * 255));
      }
      pixel[3] = static_cast<std::uint8_t>(std::lround(alpha * 255));
    }
  }
  return result;
}

Bitmap padded(const Bitmap& source, int left, int top, int right, int bottom) {
  Bitmap result;
  result.width = source.width + left + right;
  result.height = source.height + top + bottom;
  result.rgba.assign(static_cast<size_t>(result.width) * result.height * 4, 0);
  for (int y = 0; y < source.height; ++y) {
    std::copy_n(&source.rgba[static_cast<size_t>(y) * source.width * 4],
                source.width * 4,
                &result.rgba[(static_cast<size_t>(y + top) * result.width +
                              left) * 4]);
  }
  return result;
}

}  // namespace

ImageStore::ImageStore(Reader read) : read_(std::move(read)) {}

ImageStore::~ImageStore() = default;

const VectorPicture* ImageStore::vector(const std::string& source) {
  if (!source.ends_with(".svg")) return nullptr;
  if (const auto found = parsed_.find(source); found != parsed_.end()) {
    if (!found->second) missing_.insert(source);
    return found->second.get();
  }
  std::unique_ptr<VectorPicture> picture;
  if (const auto bytes = read_(source)) {
    picture = parseVector(std::string(bytes->begin(), bytes->end()));
  }
  const VectorPicture* result = picture.get();
  if (result == nullptr) missing_.insert(source);
  parsed_.emplace(source, std::move(picture));
  return result;
}

const Bitmap* ImageStore::get(const std::string& source) {
  if (source.ends_with(".svg")) return nullptr;
  if (const auto found = decoded_.find(source); found != decoded_.end()) {
    if (!found->second && !source.empty()) missing_.insert(source);
    return found->second.get();
  }
  std::unique_ptr<Bitmap> bitmap;
  const std::string dataPrefix = "data:image/png;base64,";
  if (source.starts_with(dataPrefix)) {
    const auto bytes = decodeBase64(source.substr(dataPrefix.size()));
    bitmap = decode(bytes.data(), bytes.size());
  } else if (const auto bytes = read_(source)) {
    bitmap = decode(bytes->data(), bytes->size());
  }
  const Bitmap* result = bitmap.get();
  if (result == nullptr && !source.empty()) missing_.insert(source);
  decoded_.emplace(source, std::move(bitmap));
  return result;
}

Bitmap scaleNearest(const Bitmap& source, int factor) {
  if (factor <= 1) return source;
  Bitmap result;
  result.width = source.width * factor;
  result.height = source.height * factor;
  result.rgba.resize(static_cast<size_t>(result.width) * result.height * 4);
  for (int y = 0; y < result.height; ++y) {
    for (int x = 0; x < result.width; ++x) {
      std::copy_n(&source.rgba[(static_cast<size_t>(y / factor) * source.width +
                                x / factor) * 4],
                  4, &result.rgba[(static_cast<size_t>(y) * result.width + x) * 4]);
    }
  }
  return result;
}

Bitmap imageMip(const Bitmap& source, int level) {
  if (level <= 0) return source;
  Bitmap current{source.width, source.height, premultiplied(source)};
  while (level-- > 0 && (current.width > 1 || current.height > 1)) {
    Bitmap next{std::max(1, current.width / 2), std::max(1, current.height / 2), {}};
    next.rgba.resize(static_cast<size_t>(next.width) * next.height * 4);
    const int columns = current.width == 1 ? 1 : 2 + current.width % 2;
    const int rows = current.height == 1 ? 1 : 2 + current.height % 2;
    const int weightX = columns == 3 ? 4 : columns;
    const int weightY = rows == 3 ? 4 : rows;
    for (int y = 0; y < next.height; ++y) {
      for (int x = 0; x < next.width; ++x) {
        for (int channel = 0; channel < 4; ++channel) {
          int sum = 0;
          for (int row = 0; row < rows; ++row) {
            for (int column = 0; column < columns; ++column) {
              const int weight = (rows == 3 && row == 1 ? 2 : 1) *
                                 (columns == 3 && column == 1 ? 2 : 1);
              const size_t from = (static_cast<size_t>(y * 2 + row) * current.width + x * 2 + column) * 4;
              sum += current.rgba[from + channel] * weight;
            }
          }
          next.rgba[(static_cast<size_t>(y) * next.width + x) * 4 + channel] =
              static_cast<uint8_t>(sum / (weightX * weightY));
        }
      }
    }
    current = std::move(next);
  }
  // Unpremultiplication keeps Bitmap's contract; atlas packing reverses it.
  for (size_t at = 0; at < current.rgba.size(); at += 4) {
    const int alpha = current.rgba[at + 3];
    if (alpha == 0) continue;
    for (int channel = 0; channel < 3; ++channel) {
      current.rgba[at + channel] = static_cast<uint8_t>(
          (current.rgba[at + channel] * 255 + alpha / 2) / alpha);
    }
  }
  return current;
}

Bitmap applyFilters(const Bitmap& source, const ImageFilters& filters,
                    int unit, int& padLeft, int& padTop) {
  Bitmap result = source;
  for (size_t index = 0; index < result.rgba.size(); index += 4) {
    auto* pixel = &result.rgba[index];
    if (filters.washedOut) {
      for (int channel = 0; channel < 3; ++channel) {
        pixel[channel] = static_cast<std::uint8_t>(
            std::lround((pixel[channel] - 127.5f) * 0.3f + 127.5f));
      }
    }
    if (filters.grayscale) {
      const float luma = 0.2126f * pixel[0] + 0.7152f * pixel[1] +
                         0.0722f * pixel[2];
      const auto gray = static_cast<std::uint8_t>(std::lround(luma));
      pixel[0] = pixel[1] = pixel[2] = gray;
    }
    if (filters.silhouetteGrey) pixel[0] = pixel[1] = pixel[2] = 105;
    if (filters.silhouetteBlack) pixel[0] = pixel[1] = pixel[2] = 0;
  }
  padLeft = 0;
  padTop = 0;
  if (filters.rim) {
    const int reach = 2 * unit;
    result = padded(result, reach, 0, reach, reach);
    padLeft += reach;
    result = dropShadow(result, *filters.rim, reach, 0);
    result = dropShadow(result, *filters.rim, -reach, 0);
    result = dropShadow(result, *filters.rim, 0, reach);
  }
  if (filters.outline) {
    result = padded(result, unit, unit, unit, unit);
    padLeft += unit;
    padTop += unit;
    for (const auto& [dx, dy] : {std::pair{1, 1}, std::pair{1, -1},
                                std::pair{-1, 1}, std::pair{-1, -1}}) {
      result = dropShadow(result, *filters.outline, dx * unit, dy * unit);
    }
  }
  if (filters.shadow) {
    const int offset = std::max(1, static_cast<int>(std::lround(
                                       filters.shadowOffset * unit)));
    result = padded(result, 0, 0, offset, offset);
    result = dropShadow(result, *filters.shadow, offset, offset);
  }
  return result;
}

std::vector<std::uint8_t> premultiplied(const Bitmap& bitmap) {
  std::vector<std::uint8_t> pixels(bitmap.rgba.size());
  for (size_t index = 0; index < pixels.size(); index += 4) {
    const unsigned alpha = bitmap.rgba[index + 3];
    for (int channel = 0; channel < 3; ++channel) {
      pixels[index + channel] =
          static_cast<std::uint8_t>((bitmap.rgba[index + channel] * alpha +
                                     127) / 255);
    }
    pixels[index + 3] = static_cast<std::uint8_t>(alpha);
  }
  return pixels;
}

}  // namespace bureau
