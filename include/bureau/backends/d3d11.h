// Bureau over a game's Direct3D 11: the UI drawn into the render target bound on
// the game's context.
//
//   bureau::D3D11Backend backend(device);
//
//   // Each frame:
//   backend.upload(context, frame.uploads);
//   backend.draw(context, *list, width, height);
//
// The render target view should be UNORM, not _SRGB: the UI's colours are
// sRGB-encoded already and blend in that encoding.
#pragma once

#include <d3d11.h>

#include <memory>
#include <vector>

#include "bureau/display.h"

namespace bureau {

class D3D11Backend {
 public:
  explicit D3D11Backend(ID3D11Device* device);
  ~D3D11Backend();
  D3D11Backend(const D3D11Backend&) = delete;
  D3D11Backend& operator=(const D3D11Backend&) = delete;

  /** Atlas pixels from Ui::Frame, before the draw that reads them. */
  void upload(ID3D11DeviceContext* context,
              const std::vector<AtlasUpload>& uploads);

  /** Draws over the bound render target, `width` by `height` pixels. Leaves the
   * context's shaders, input layout, blend, rasterizer and depth state changed. */
  void draw(ID3D11DeviceContext* context, const DisplayList& list, int width,
            int height);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bureau
