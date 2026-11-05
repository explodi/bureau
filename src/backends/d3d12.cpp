#include "bureau/backends/d3d12.h"

#include <d3dcompiler.h>

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>

#include "bureau/backends/quads.h"
#include "d3d_shader.h"

namespace bureau {

namespace {

template <typename T>
void release(T*& object) {
  if (object != nullptr) object->Release();
  object = nullptr;
}

ID3DBlob* compile(const char* entry, const char* target) {
  ID3DBlob* code = nullptr;
  ID3DBlob* errors = nullptr;
  const HRESULT result = D3DCompile(backends::kHlsl, sizeof backends::kHlsl - 1,
                                    "bureau", nullptr, nullptr, entry, target, 0,
                                    0, &code, &errors);
  if (FAILED(result) && errors != nullptr) {
    std::fprintf(stderr, "Bureau's Direct3D shader: %s\n",
                 static_cast<const char*>(errors->GetBufferPointer()));
  }
  release(errors);
  return code;
}

D3D12_RESOURCE_DESC bufferDescription(UINT64 size) {
  D3D12_RESOURCE_DESC description{};
  description.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
  description.Width = size;
  description.Height = 1;
  description.DepthOrArraySize = 1;
  description.MipLevels = 1;
  description.SampleDesc.Count = 1;
  description.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  return description;
}

/** A buffer the CPU writes and the GPU reads, mapped for its whole life. */
struct HostBuffer {
  ID3D12Resource* resource = nullptr;
  void* mapped = nullptr;
  UINT64 capacity = 0;
};

/** What a slot in flight holds until it comes round again. */
struct Slot {
  HostBuffer vertices;
  std::vector<HostBuffer> staging;
};

struct Page {
  ID3D12Resource* texture = nullptr;
  D3D12_GPU_DESCRIPTOR_HANDLE descriptor{};
  /** Still in the copy state it was created in. */
  bool fresh = true;
};

}  // namespace

struct D3D12Backend::Impl {
  ID3D12Device* device = nullptr;
  ID3D12RootSignature* rootSignature = nullptr;
  ID3D12PipelineState* pipeline = nullptr;
  ID3D12DescriptorHeap* heap = nullptr;
  UINT descriptorSize = 0;
  std::vector<Slot> slots;
  std::vector<Page> pages;

  HostBuffer createBuffer(UINT64 size) const {
    HostBuffer made;
    made.capacity = size;
    D3D12_HEAP_PROPERTIES upload{};
    upload.Type = D3D12_HEAP_TYPE_UPLOAD;
    const D3D12_RESOURCE_DESC description = bufferDescription(size);
    device->CreateCommittedResource(&upload, D3D12_HEAP_FLAG_NONE, &description,
                                    D3D12_RESOURCE_STATE_GENERIC_READ, nullptr,
                                    IID_PPV_ARGS(&made.resource));
    const D3D12_RANGE nothingRead{0, 0};
    made.resource->Map(0, &nothingRead, &made.mapped);
    return made;
  }

  void destroyBuffer(HostBuffer& buffer) const {
    if (buffer.resource == nullptr) return;
    buffer.resource->Unmap(0, nullptr);
    release(buffer.resource);
    buffer = HostBuffer{};
  }

  void createRootSignature() {
    D3D12_DESCRIPTOR_RANGE range{};
    range.RangeType = D3D12_DESCRIPTOR_RANGE_TYPE_SRV;
    range.NumDescriptors = 1;
    range.OffsetInDescriptorsFromTableStart =
        D3D12_DESCRIPTOR_RANGE_OFFSET_APPEND;

    D3D12_ROOT_PARAMETER parameters[2] = {};
    parameters[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
    parameters[0].Constants.Num32BitValues = 2;
    parameters[0].ShaderVisibility = D3D12_SHADER_VISIBILITY_VERTEX;
    parameters[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
    parameters[1].DescriptorTable.NumDescriptorRanges = 1;
    parameters[1].DescriptorTable.pDescriptorRanges = &range;
    parameters[1].ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;

    D3D12_STATIC_SAMPLER_DESC samplers[2] = {};
    for (UINT index = 0; index < 2; ++index) {
      samplers[index].Filter = index == 0 ? D3D12_FILTER_MIN_MAG_MIP_POINT
                                          : D3D12_FILTER_MIN_MAG_MIP_LINEAR;
      samplers[index].AddressU = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
      samplers[index].AddressV = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
      samplers[index].AddressW = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
      samplers[index].ComparisonFunc = D3D12_COMPARISON_FUNC_NEVER;
      samplers[index].MaxLOD = D3D12_FLOAT32_MAX;
      samplers[index].ShaderRegister = index;
      samplers[index].ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
    }

    D3D12_ROOT_SIGNATURE_DESC description{};
    description.NumParameters = 2;
    description.pParameters = parameters;
    description.NumStaticSamplers = 2;
    description.pStaticSamplers = samplers;
    description.Flags =
        D3D12_ROOT_SIGNATURE_FLAG_ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT;
    ID3DBlob* serialized = nullptr;
    ID3DBlob* errors = nullptr;
    const HRESULT result = D3D12SerializeRootSignature(
        &description, D3D_ROOT_SIGNATURE_VERSION_1, &serialized, &errors);
    if (FAILED(result) && errors != nullptr) {
      std::fprintf(stderr, "Bureau's Direct3D 12 root signature: %s\n",
                   static_cast<const char*>(errors->GetBufferPointer()));
    }
    release(errors);
    if (serialized == nullptr) return;
    device->CreateRootSignature(0, serialized->GetBufferPointer(),
                                serialized->GetBufferSize(),
                                IID_PPV_ARGS(&rootSignature));
    release(serialized);
  }

  void createPipeline(const D3D12BackendInfo& info) {
    ID3DBlob* vertex = compile("vs_main", "vs_5_0");
    ID3DBlob* pixel = compile("fs_main", "ps_5_0");
    if (vertex == nullptr || pixel == nullptr || rootSignature == nullptr) {
      release(vertex);
      release(pixel);
      return;
    }
    const D3D12_INPUT_ELEMENT_DESC layout[] = {
        {"POSITION", 0, DXGI_FORMAT_R32G32_FLOAT, 0,
         static_cast<UINT>(offsetof(backends::Vertex, x)),
         D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0},
        {"TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT, 0,
         static_cast<UINT>(offsetof(backends::Vertex, u)),
         D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0},
        {"COLOR", 0, DXGI_FORMAT_R8G8B8A8_UNORM, 0,
         static_cast<UINT>(offsetof(backends::Vertex, r)),
         D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0},
        {"TEXCOORD", 1, DXGI_FORMAT_R32G32B32_FLOAT, 0,
         static_cast<UINT>(offsetof(backends::Vertex, mode)),
         D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0}};
    D3D12_GRAPHICS_PIPELINE_STATE_DESC description{};
    description.pRootSignature = rootSignature;
    description.VS = {vertex->GetBufferPointer(), vertex->GetBufferSize()};
    description.PS = {pixel->GetBufferPointer(), pixel->GetBufferSize()};
    description.InputLayout = {layout, 4};
    description.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
    description.SampleMask = UINT_MAX;
    description.SampleDesc.Count = info.sampleCount;
    description.NumRenderTargets = 1;
    description.RTVFormats[0] = info.renderTargetFormat;
    description.RasterizerState.FillMode = D3D12_FILL_MODE_SOLID;
    description.RasterizerState.CullMode = D3D12_CULL_MODE_NONE;
    description.RasterizerState.DepthClipEnable = TRUE;
    D3D12_RENDER_TARGET_BLEND_DESC& blend = description.BlendState.RenderTarget[0];
    blend.BlendEnable = TRUE;
    blend.SrcBlend = D3D12_BLEND_ONE;
    blend.DestBlend = D3D12_BLEND_INV_SRC_ALPHA;
    blend.BlendOp = D3D12_BLEND_OP_ADD;
    blend.SrcBlendAlpha = D3D12_BLEND_ONE;
    blend.DestBlendAlpha = D3D12_BLEND_INV_SRC_ALPHA;
    blend.BlendOpAlpha = D3D12_BLEND_OP_ADD;
    blend.LogicOp = D3D12_LOGIC_OP_NOOP;
    blend.RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;
    const HRESULT result = device->CreateGraphicsPipelineState(
        &description, IID_PPV_ARGS(&pipeline));
    if (FAILED(result)) {
      std::fprintf(stderr, "Bureau's Direct3D 12 pipeline: 0x%08lx\n",
                   static_cast<unsigned long>(result));
    }
    release(vertex);
    release(pixel);
  }

  void createPage(int size) {
    Page page;
    D3D12_HEAP_PROPERTIES local{};
    local.Type = D3D12_HEAP_TYPE_DEFAULT;
    D3D12_RESOURCE_DESC description{};
    description.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
    description.Width = size;
    description.Height = size;
    description.DepthOrArraySize = 1;
    description.MipLevels = 1;
    description.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    description.SampleDesc.Count = 1;
    device->CreateCommittedResource(&local, D3D12_HEAP_FLAG_NONE, &description,
                                    D3D12_RESOURCE_STATE_COPY_DEST, nullptr,
                                    IID_PPV_ARGS(&page.texture));
    const UINT index = static_cast<UINT>(pages.size());
    D3D12_CPU_DESCRIPTOR_HANDLE cpu = heap->GetCPUDescriptorHandleForHeapStart();
    cpu.ptr += static_cast<SIZE_T>(index) * descriptorSize;
    page.descriptor = heap->GetGPUDescriptorHandleForHeapStart();
    page.descriptor.ptr += static_cast<UINT64>(index) * descriptorSize;
    D3D12_SHADER_RESOURCE_VIEW_DESC view{};
    view.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
    view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
    view.Texture2D.MipLevels = 1;
    device->CreateShaderResourceView(page.texture, &view, cpu);
    pages.push_back(page);
  }
};

D3D12Backend::D3D12Backend(const D3D12BackendInfo& info)
    : impl_(std::make_unique<Impl>()) {
  Impl& d3d = *impl_;
  d3d.device = info.device;
  d3d.device->AddRef();
  d3d.slots.resize(info.framesInFlight);
  D3D12_DESCRIPTOR_HEAP_DESC heap{};
  heap.Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV;
  heap.NumDescriptors = kAtlasPageBudget;
  heap.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
  d3d.device->CreateDescriptorHeap(&heap, IID_PPV_ARGS(&d3d.heap));
  d3d.descriptorSize = d3d.device->GetDescriptorHandleIncrementSize(
      D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
  d3d.createRootSignature();
  d3d.createPipeline(info);
}

D3D12Backend::~D3D12Backend() {
  Impl& d3d = *impl_;
  for (Slot& slot : d3d.slots) {
    d3d.destroyBuffer(slot.vertices);
    for (HostBuffer& staging : slot.staging) d3d.destroyBuffer(staging);
  }
  for (Page& page : d3d.pages) release(page.texture);
  release(d3d.pipeline);
  release(d3d.rootSignature);
  release(d3d.heap);
  release(d3d.device);
}

void D3D12Backend::upload(ID3D12GraphicsCommandList* commands, UINT slot,
                          const std::vector<AtlasUpload>& uploads) {
  Impl& d3d = *impl_;
  // This slot's last uploads have finished by now.
  for (HostBuffer& staging : d3d.slots[slot].staging) d3d.destroyBuffer(staging);
  d3d.slots[slot].staging.clear();
  for (const AtlasUpload& upload : uploads) {
    while (static_cast<int>(d3d.pages.size()) <= upload.page) d3d.createPage(upload.pageSize);
    Page& page = d3d.pages[upload.page];

    const UINT rowBytes = static_cast<UINT>(upload.width) * 4;
    const UINT pitch = (rowBytes + D3D12_TEXTURE_DATA_PITCH_ALIGNMENT - 1) &
                       ~(D3D12_TEXTURE_DATA_PITCH_ALIGNMENT - 1);
    HostBuffer staging =
        d3d.createBuffer(static_cast<UINT64>(pitch) * upload.height);
    auto* into = static_cast<std::uint8_t*>(staging.mapped);
    for (int row = 0; row < upload.height; ++row) {
      std::memcpy(into + static_cast<std::size_t>(row) * pitch,
                  upload.pixels.data() + static_cast<std::size_t>(row) * rowBytes,
                  rowBytes);
    }
    d3d.slots[slot].staging.push_back(staging);

    D3D12_RESOURCE_BARRIER barrier{};
    barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    barrier.Transition.pResource = page.texture;
    barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    if (!page.fresh) {
      barrier.Transition.StateBefore =
          D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE;
      barrier.Transition.StateAfter = D3D12_RESOURCE_STATE_COPY_DEST;
      commands->ResourceBarrier(1, &barrier);
    }
    D3D12_TEXTURE_COPY_LOCATION destination{};
    destination.pResource = page.texture;
    destination.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    D3D12_TEXTURE_COPY_LOCATION source{};
    source.pResource = staging.resource;
    source.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    source.PlacedFootprint.Footprint.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    source.PlacedFootprint.Footprint.Width = static_cast<UINT>(upload.width);
    source.PlacedFootprint.Footprint.Height = static_cast<UINT>(upload.height);
    source.PlacedFootprint.Footprint.Depth = 1;
    source.PlacedFootprint.Footprint.RowPitch = pitch;
    commands->CopyTextureRegion(&destination, static_cast<UINT>(upload.x),
                                static_cast<UINT>(upload.y), 0, &source, nullptr);
    barrier.Transition.StateBefore = D3D12_RESOURCE_STATE_COPY_DEST;
    barrier.Transition.StateAfter = D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE;
    commands->ResourceBarrier(1, &barrier);
    page.fresh = false;
  }
}

void D3D12Backend::draw(ID3D12GraphicsCommandList* commands, UINT slot,
                        const DisplayList& list, int width, int height) {
  Impl& d3d = *impl_;
  if (d3d.pipeline == nullptr || list.quads.empty()) return;
  const auto batches = backends::batchesOf(list, width, height);
  const UINT64 bytes = batches.vertices.size() * sizeof(backends::Vertex);
  HostBuffer& vertices = d3d.slots[slot].vertices;
  if (bytes > vertices.capacity) {
    d3d.destroyBuffer(vertices);
    vertices = d3d.createBuffer(bytes * 2);
  }
  std::memcpy(vertices.mapped, batches.vertices.data(), bytes);

  commands->SetPipelineState(d3d.pipeline);
  commands->SetGraphicsRootSignature(d3d.rootSignature);
  commands->SetDescriptorHeaps(1, &d3d.heap);
  commands->IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
  D3D12_VERTEX_BUFFER_VIEW view{};
  view.BufferLocation = vertices.resource->GetGPUVirtualAddress();
  view.SizeInBytes = static_cast<UINT>(bytes);
  view.StrideInBytes = sizeof(backends::Vertex);
  commands->IASetVertexBuffers(0, 1, &view);
  const float size[2] = {static_cast<float>(list.width),
                         static_cast<float>(list.height)};
  commands->SetGraphicsRoot32BitConstants(0, 2, size, 0);
  const D3D12_VIEWPORT viewport{0,
                                0,
                                static_cast<FLOAT>(width),
                                static_cast<FLOAT>(height),
                                0,
                                1};
  commands->RSSetViewports(1, &viewport);
  for (const backends::Run& run : batches.runs) {
    if (run.page >= static_cast<int>(d3d.pages.size())) continue;
    commands->SetGraphicsRootDescriptorTable(1, d3d.pages[run.page].descriptor);
    const D3D12_RECT scissor{
        static_cast<LONG>(run.scissor.x), static_cast<LONG>(run.scissor.y),
        static_cast<LONG>(run.scissor.x + run.scissor.width),
        static_cast<LONG>(run.scissor.y + run.scissor.height)};
    commands->RSSetScissorRects(1, &scissor);
    commands->DrawInstanced(run.vertexCount, 1, run.firstVertex, 0);
  }
}

}  // namespace bureau
