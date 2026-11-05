// Both Direct3D backends on WARP, the software rasterizer every Windows carries, so
// this needs no GPU.
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "scene.h"

#include <d3d11.h>
#include <d3d12.h>
#include <dxgi1_4.h>

#include "bureau/backends/d3d11.h"
#include "bureau/backends/d3d12.h"

namespace {

constexpr DXGI_FORMAT kFormat = DXGI_FORMAT_R8G8B8A8_UNORM;

template <typename T>
void release(T*& object) {
  if (object != nullptr) object->Release();
  object = nullptr;
}

constexpr FLOAT kClearColor[4] = {
    scene::kClear[0] / 255.0f, scene::kClear[1] / 255.0f,
    scene::kClear[2] / 255.0f, 1.0f};

}  // namespace

TEST_CASE("Direct3D 11 draws the scene") {
  ID3D11Device* device = nullptr;
  ID3D11DeviceContext* context = nullptr;
  REQUIRE(SUCCEEDED(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, 0,
                                      nullptr, 0, D3D11_SDK_VERSION, &device,
                                      nullptr, &context)));

  D3D11_TEXTURE2D_DESC description{};
  description.Width = scene::kSize;
  description.Height = scene::kSize;
  description.MipLevels = 1;
  description.ArraySize = 1;
  description.Format = kFormat;
  description.SampleDesc.Count = 1;
  description.Usage = D3D11_USAGE_DEFAULT;
  description.BindFlags = D3D11_BIND_RENDER_TARGET;
  ID3D11Texture2D* target = nullptr;
  REQUIRE(SUCCEEDED(device->CreateTexture2D(&description, nullptr, &target)));
  ID3D11RenderTargetView* view = nullptr;
  REQUIRE(SUCCEEDED(device->CreateRenderTargetView(target, nullptr, &view)));
  description.Usage = D3D11_USAGE_STAGING;
  description.BindFlags = 0;
  description.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
  ID3D11Texture2D* readback = nullptr;
  REQUIRE(SUCCEEDED(device->CreateTexture2D(&description, nullptr, &readback)));

  {
    bureau::D3D11Backend backend(device);
    backend.upload(context, scene::uploads());
    context->ClearRenderTargetView(view, kClearColor);
    context->OMSetRenderTargets(1, &view, nullptr);
    backend.draw(context, scene::list(), scene::kSize, scene::kSize);
    context->CopyResource(readback, target);
    D3D11_MAPPED_SUBRESOURCE mapped{};
    REQUIRE(SUCCEEDED(context->Map(readback, 0, D3D11_MAP_READ, 0, &mapped)));
    const auto* pixels = static_cast<const std::uint8_t*>(mapped.pData);
    scene::check([&](int x, int y) {
      const std::uint8_t* pixel = pixels + y * mapped.RowPitch + x * 4;
      return scene::Pixel{pixel[0], pixel[1], pixel[2], pixel[3]};
    });
    context->Unmap(readback, 0);
  }
  release(readback);
  release(view);
  release(target);
  release(context);
  release(device);
}

TEST_CASE("Direct3D 12 draws the scene") {
  IDXGIFactory4* factory = nullptr;
  REQUIRE(SUCCEEDED(CreateDXGIFactory1(IID_PPV_ARGS(&factory))));
  IDXGIAdapter* warp = nullptr;
  REQUIRE(SUCCEEDED(factory->EnumWarpAdapter(IID_PPV_ARGS(&warp))));
  ID3D12Device* device = nullptr;
  REQUIRE(SUCCEEDED(D3D12CreateDevice(warp, D3D_FEATURE_LEVEL_11_0,
                                      IID_PPV_ARGS(&device))));

  D3D12_COMMAND_QUEUE_DESC queueDescription{};
  queueDescription.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
  ID3D12CommandQueue* queue = nullptr;
  REQUIRE(SUCCEEDED(
      device->CreateCommandQueue(&queueDescription, IID_PPV_ARGS(&queue))));
  ID3D12CommandAllocator* allocator = nullptr;
  REQUIRE(SUCCEEDED(device->CreateCommandAllocator(
      D3D12_COMMAND_LIST_TYPE_DIRECT, IID_PPV_ARGS(&allocator))));
  ID3D12GraphicsCommandList* commands = nullptr;
  REQUIRE(SUCCEEDED(device->CreateCommandList(0, D3D12_COMMAND_LIST_TYPE_DIRECT,
                                              allocator, nullptr,
                                              IID_PPV_ARGS(&commands))));

  D3D12_HEAP_PROPERTIES local{};
  local.Type = D3D12_HEAP_TYPE_DEFAULT;
  D3D12_RESOURCE_DESC description{};
  description.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
  description.Width = scene::kSize;
  description.Height = scene::kSize;
  description.DepthOrArraySize = 1;
  description.MipLevels = 1;
  description.Format = kFormat;
  description.SampleDesc.Count = 1;
  description.Flags = D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET;
  ID3D12Resource* target = nullptr;
  REQUIRE(SUCCEEDED(device->CreateCommittedResource(
      &local, D3D12_HEAP_FLAG_NONE, &description,
      D3D12_RESOURCE_STATE_RENDER_TARGET, nullptr, IID_PPV_ARGS(&target))));

  D3D12_DESCRIPTOR_HEAP_DESC heapDescription{};
  heapDescription.Type = D3D12_DESCRIPTOR_HEAP_TYPE_RTV;
  heapDescription.NumDescriptors = 1;
  ID3D12DescriptorHeap* heap = nullptr;
  REQUIRE(SUCCEEDED(
      device->CreateDescriptorHeap(&heapDescription, IID_PPV_ARGS(&heap))));
  const D3D12_CPU_DESCRIPTOR_HANDLE view =
      heap->GetCPUDescriptorHandleForHeapStart();
  device->CreateRenderTargetView(target, nullptr, view);

  const UINT pitch = (scene::kSize * 4 + D3D12_TEXTURE_DATA_PITCH_ALIGNMENT - 1) &
                     ~(D3D12_TEXTURE_DATA_PITCH_ALIGNMENT - 1);
  D3D12_HEAP_PROPERTIES readable{};
  readable.Type = D3D12_HEAP_TYPE_READBACK;
  D3D12_RESOURCE_DESC buffer{};
  buffer.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
  buffer.Width = static_cast<UINT64>(pitch) * scene::kSize;
  buffer.Height = 1;
  buffer.DepthOrArraySize = 1;
  buffer.MipLevels = 1;
  buffer.SampleDesc.Count = 1;
  buffer.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  ID3D12Resource* readback = nullptr;
  REQUIRE(SUCCEEDED(device->CreateCommittedResource(
      &readable, D3D12_HEAP_FLAG_NONE, &buffer, D3D12_RESOURCE_STATE_COPY_DEST,
      nullptr, IID_PPV_ARGS(&readback))));

  ID3D12Fence* fence = nullptr;
  REQUIRE(SUCCEEDED(
      device->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&fence))));
  HANDLE finished = CreateEventW(nullptr, FALSE, FALSE, nullptr);

  {
    bureau::D3D12BackendInfo info;
    info.device = device;
    info.renderTargetFormat = kFormat;
    info.framesInFlight = 1;
    bureau::D3D12Backend backend(info);
    backend.upload(commands, 0, scene::uploads());
    commands->ClearRenderTargetView(view, kClearColor, 0, nullptr);
    commands->OMSetRenderTargets(1, &view, FALSE, nullptr);
    backend.draw(commands, 0, scene::list(), scene::kSize, scene::kSize);

    D3D12_RESOURCE_BARRIER barrier{};
    barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    barrier.Transition.pResource = target;
    barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    barrier.Transition.StateBefore = D3D12_RESOURCE_STATE_RENDER_TARGET;
    barrier.Transition.StateAfter = D3D12_RESOURCE_STATE_COPY_SOURCE;
    commands->ResourceBarrier(1, &barrier);
    D3D12_TEXTURE_COPY_LOCATION source{};
    source.pResource = target;
    source.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    D3D12_TEXTURE_COPY_LOCATION destination{};
    destination.pResource = readback;
    destination.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    destination.PlacedFootprint.Footprint.Format = kFormat;
    destination.PlacedFootprint.Footprint.Width = scene::kSize;
    destination.PlacedFootprint.Footprint.Height = scene::kSize;
    destination.PlacedFootprint.Footprint.Depth = 1;
    destination.PlacedFootprint.Footprint.RowPitch = pitch;
    commands->CopyTextureRegion(&destination, 0, 0, 0, &source, nullptr);
    REQUIRE(SUCCEEDED(commands->Close()));
    ID3D12CommandList* const lists[] = {commands};
    queue->ExecuteCommandLists(1, lists);
    REQUIRE(SUCCEEDED(queue->Signal(fence, 1)));
    REQUIRE(SUCCEEDED(fence->SetEventOnCompletion(1, finished)));
    WaitForSingleObject(finished, INFINITE);

    void* mapped = nullptr;
    REQUIRE(SUCCEEDED(readback->Map(0, nullptr, &mapped)));
    const auto* pixels = static_cast<const std::uint8_t*>(mapped);
    scene::check([&](int x, int y) {
      const std::uint8_t* pixel = pixels + y * pitch + x * 4;
      return scene::Pixel{pixel[0], pixel[1], pixel[2], pixel[3]};
    });
    readback->Unmap(0, nullptr);
  }
  CloseHandle(finished);
  release(fence);
  release(readback);
  release(heap);
  release(target);
  release(commands);
  release(allocator);
  release(queue);
  release(device);
  release(warp);
  release(factory);
}
