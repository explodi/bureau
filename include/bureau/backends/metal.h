// Bureau over a game's Metal: the UI drawn into the game's own render pass.
//
//   bureau::MetalBackend backend((__bridge void*)device, pixelFormat);
//
//   // Each frame:
//   backend.upload(std::move(frame.uploads));
//   backend.draw(*list, (__bridge void*)encoder, width, height);
//
// The pass's colour target should be a non-sRGB format: the UI's colours are
// sRGB-encoded already and blend in that encoding.
#pragma once

#include <memory>
#include <vector>

#include "bureau/display.h"

namespace bureau {

class MetalBackend {
 public:
  /** `device` is an id<MTLDevice>, `pixelFormat` the MTLPixelFormat of the
   * colour target the passes draw into. */
  MetalBackend(void* device, unsigned long pixelFormat);
  ~MetalBackend();
  MetalBackend(const MetalBackend&) = delete;
  MetalBackend& operator=(const MetalBackend&) = delete;

  /** Atlas pixels from Ui::Frame, before the draw that reads them. */
  void upload(const std::vector<AtlasUpload>& uploads);

  /** Draws into an open pass: `encoder` is an id<MTLRenderCommandEncoder>, the
   * target `width` by `height` pixels. Leaves the encoder's pipeline, scissor
   * and bindings changed. */
  void draw(const DisplayList& list, void* encoder, int width, int height);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bureau
