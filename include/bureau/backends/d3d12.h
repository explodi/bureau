// Bureau over a game's Direct3D 12: the UI recorded into the game's command list.
//
//   bureau::D3D12BackendInfo info;
//   info.device = device;
//   info.renderTargetFormat = DXGI_FORMAT_R8G8B8A8_UNORM;
//   bureau::D3D12Backend backend(info);
//
//   // Each frame, with `slot` below info.framesInFlight:
//   backend.upload(commands, slot, frame.uploads);
//   // ...the game sets its render target...
//   backend.draw(commands, slot, *list, width, height);
//
// The render target view should be UNORM, not _SRGB: the UI's colours are
// sRGB-encoded already and blend in that encoding. A slot's work must have
// finished on the GPU before the slot is used again, as any frame-in-flight
// scheme ensures.
#pragma once

#include <d3d12.h>

#include <memory>
#include <vector>

#include "bureau/display.h"

namespace bureau {

struct D3D12BackendInfo {
  ID3D12Device* device = nullptr;
  DXGI_FORMAT renderTargetFormat = DXGI_FORMAT_R8G8B8A8_UNORM;
  UINT sampleCount = 1;
  UINT framesInFlight = 2;
};

class D3D12Backend {
 public:
  explicit D3D12Backend(const D3D12BackendInfo& info);
  /** The GPU must be idle. */
  ~D3D12Backend();
  D3D12Backend(const D3D12Backend&) = delete;
  D3D12Backend& operator=(const D3D12Backend&) = delete;

  /** Records atlas pixels from Ui::Frame. */
  void upload(ID3D12GraphicsCommandList* commands, UINT slot,
              const std::vector<AtlasUpload>& uploads);

  /** Records the list over the bound render target, `width` by `height` pixels.
   * Leaves the pipeline, root signature, viewport, scissor and vertex buffer
   * changed, and its own descriptor heap set: a game with bindless resources sets
   * its heap again afterwards. */
  void draw(ID3D12GraphicsCommandList* commands, UINT slot,
            const DisplayList& list, int width, int height);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bureau
