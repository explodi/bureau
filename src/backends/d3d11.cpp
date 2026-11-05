#include "bureau/backends/d3d11.h"

#include <d3dcompiler.h>

#include <cstddef>
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

struct Page {
  ID3D11Texture2D* texture = nullptr;
  ID3D11ShaderResourceView* view = nullptr;
};

}  // namespace

struct D3D11Backend::Impl {
  ID3D11Device* device = nullptr;
  ID3D11VertexShader* vertexShader = nullptr;
  ID3D11PixelShader* pixelShader = nullptr;
  ID3D11InputLayout* inputLayout = nullptr;
  ID3D11Buffer* constants = nullptr;
  ID3D11Buffer* vertices = nullptr;
  UINT vertexCapacity = 0;
  ID3D11BlendState* blend = nullptr;
  ID3D11RasterizerState* rasterizer = nullptr;
  ID3D11DepthStencilState* depth = nullptr;
  ID3D11SamplerState* nearest = nullptr;
  ID3D11SamplerState* linear = nullptr;
  std::vector<Page> pages;

  ID3D11SamplerState* createSampler(D3D11_FILTER filter) const {
    D3D11_SAMPLER_DESC description{};
    description.Filter = filter;
    description.AddressU = D3D11_TEXTURE_ADDRESS_CLAMP;
    description.AddressV = D3D11_TEXTURE_ADDRESS_CLAMP;
    description.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
    description.ComparisonFunc = D3D11_COMPARISON_NEVER;
    description.MaxLOD = D3D11_FLOAT32_MAX;
    ID3D11SamplerState* sampler = nullptr;
    device->CreateSamplerState(&description, &sampler);
    return sampler;
  }

  void createPage() {
    D3D11_TEXTURE2D_DESC description{};
    description.Width = kAtlasSize;
    description.Height = kAtlasSize;
    description.MipLevels = 1;
    description.ArraySize = 1;
    description.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    description.SampleDesc.Count = 1;
    description.Usage = D3D11_USAGE_DEFAULT;
    description.BindFlags = D3D11_BIND_SHADER_RESOURCE;
    Page page;
    device->CreateTexture2D(&description, nullptr, &page.texture);
    device->CreateShaderResourceView(page.texture, nullptr, &page.view);
    pages.push_back(page);
  }
};

D3D11Backend::D3D11Backend(ID3D11Device* device)
    : impl_(std::make_unique<Impl>()) {
  Impl& d3d = *impl_;
  d3d.device = device;
  d3d.device->AddRef();

  ID3DBlob* vertex = compile("vs_main", "vs_5_0");
  ID3DBlob* pixel = compile("fs_main", "ps_5_0");
  if (vertex == nullptr || pixel == nullptr) {
    release(vertex);
    release(pixel);
    return;
  }
  device->CreateVertexShader(vertex->GetBufferPointer(), vertex->GetBufferSize(),
                             nullptr, &d3d.vertexShader);
  device->CreatePixelShader(pixel->GetBufferPointer(), pixel->GetBufferSize(),
                            nullptr, &d3d.pixelShader);
  const D3D11_INPUT_ELEMENT_DESC layout[] = {
      {"POSITION", 0, DXGI_FORMAT_R32G32_FLOAT, 0,
       static_cast<UINT>(offsetof(backends::Vertex, x)),
       D3D11_INPUT_PER_VERTEX_DATA, 0},
      {"TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT, 0,
       static_cast<UINT>(offsetof(backends::Vertex, u)),
       D3D11_INPUT_PER_VERTEX_DATA, 0},
      {"COLOR", 0, DXGI_FORMAT_R8G8B8A8_UNORM, 0,
       static_cast<UINT>(offsetof(backends::Vertex, r)),
       D3D11_INPUT_PER_VERTEX_DATA, 0},
      {"TEXCOORD", 1, DXGI_FORMAT_R32G32B32_FLOAT, 0,
       static_cast<UINT>(offsetof(backends::Vertex, mode)),
       D3D11_INPUT_PER_VERTEX_DATA, 0}};
  device->CreateInputLayout(layout, 4, vertex->GetBufferPointer(),
                            vertex->GetBufferSize(), &d3d.inputLayout);
  release(vertex);
  release(pixel);

  D3D11_BUFFER_DESC constants{};
  constants.ByteWidth = 16;
  constants.Usage = D3D11_USAGE_DYNAMIC;
  constants.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
  constants.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
  device->CreateBuffer(&constants, nullptr, &d3d.constants);

  D3D11_BLEND_DESC blend{};
  blend.RenderTarget[0].BlendEnable = TRUE;
  blend.RenderTarget[0].SrcBlend = D3D11_BLEND_ONE;
  blend.RenderTarget[0].DestBlend = D3D11_BLEND_INV_SRC_ALPHA;
  blend.RenderTarget[0].BlendOp = D3D11_BLEND_OP_ADD;
  blend.RenderTarget[0].SrcBlendAlpha = D3D11_BLEND_ONE;
  blend.RenderTarget[0].DestBlendAlpha = D3D11_BLEND_INV_SRC_ALPHA;
  blend.RenderTarget[0].BlendOpAlpha = D3D11_BLEND_OP_ADD;
  blend.RenderTarget[0].RenderTargetWriteMask = D3D11_COLOR_WRITE_ENABLE_ALL;
  device->CreateBlendState(&blend, &d3d.blend);

  D3D11_RASTERIZER_DESC rasterizer{};
  rasterizer.FillMode = D3D11_FILL_SOLID;
  rasterizer.CullMode = D3D11_CULL_NONE;
  rasterizer.ScissorEnable = TRUE;
  rasterizer.DepthClipEnable = TRUE;
  device->CreateRasterizerState(&rasterizer, &d3d.rasterizer);

  D3D11_DEPTH_STENCIL_DESC depth{};
  depth.DepthEnable = FALSE;
  depth.StencilEnable = FALSE;
  device->CreateDepthStencilState(&depth, &d3d.depth);

  d3d.nearest = d3d.createSampler(D3D11_FILTER_MIN_MAG_MIP_POINT);
  d3d.linear = d3d.createSampler(D3D11_FILTER_MIN_MAG_MIP_LINEAR);
}

D3D11Backend::~D3D11Backend() {
  Impl& d3d = *impl_;
  for (Page& page : d3d.pages) {
    release(page.view);
    release(page.texture);
  }
  release(d3d.linear);
  release(d3d.nearest);
  release(d3d.depth);
  release(d3d.rasterizer);
  release(d3d.blend);
  release(d3d.vertices);
  release(d3d.constants);
  release(d3d.inputLayout);
  release(d3d.pixelShader);
  release(d3d.vertexShader);
  release(d3d.device);
}

void D3D11Backend::upload(ID3D11DeviceContext* context,
                          const std::vector<AtlasUpload>& uploads) {
  Impl& d3d = *impl_;
  for (const AtlasUpload& upload : uploads) {
    while (static_cast<int>(d3d.pages.size()) <= upload.page) d3d.createPage();
    const D3D11_BOX box{static_cast<UINT>(upload.x),
                        static_cast<UINT>(upload.y),
                        0,
                        static_cast<UINT>(upload.x + upload.width),
                        static_cast<UINT>(upload.y + upload.height),
                        1};
    context->UpdateSubresource(d3d.pages[upload.page].texture, 0, &box,
                               upload.pixels.data(),
                               static_cast<UINT>(upload.width) * 4, 0);
  }
}

void D3D11Backend::draw(ID3D11DeviceContext* context, const DisplayList& list,
                        int width, int height) {
  Impl& d3d = *impl_;
  if (d3d.pixelShader == nullptr || list.quads.empty()) return;
  const auto batches = backends::batchesOf(list, width, height);
  const UINT bytes =
      static_cast<UINT>(batches.vertices.size() * sizeof(backends::Vertex));
  if (bytes > d3d.vertexCapacity) {
    release(d3d.vertices);
    d3d.vertexCapacity = bytes * 2;
    D3D11_BUFFER_DESC description{};
    description.ByteWidth = d3d.vertexCapacity;
    description.Usage = D3D11_USAGE_DYNAMIC;
    description.BindFlags = D3D11_BIND_VERTEX_BUFFER;
    description.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
    d3d.device->CreateBuffer(&description, nullptr, &d3d.vertices);
  }
  D3D11_MAPPED_SUBRESOURCE mapped{};
  context->Map(d3d.vertices, 0, D3D11_MAP_WRITE_DISCARD, 0, &mapped);
  std::memcpy(mapped.pData, batches.vertices.data(), bytes);
  context->Unmap(d3d.vertices, 0);
  context->Map(d3d.constants, 0, D3D11_MAP_WRITE_DISCARD, 0, &mapped);
  const float size[4] = {static_cast<float>(list.width),
                         static_cast<float>(list.height), 0, 0};
  std::memcpy(mapped.pData, size, sizeof size);
  context->Unmap(d3d.constants, 0);

  const UINT stride = sizeof(backends::Vertex);
  const UINT offset = 0;
  context->IASetInputLayout(d3d.inputLayout);
  context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
  context->IASetVertexBuffers(0, 1, &d3d.vertices, &stride, &offset);
  context->VSSetShader(d3d.vertexShader, nullptr, 0);
  context->VSSetConstantBuffers(0, 1, &d3d.constants);
  context->PSSetShader(d3d.pixelShader, nullptr, 0);
  ID3D11SamplerState* const samplers[2] = {d3d.nearest, d3d.linear};
  context->PSSetSamplers(0, 2, samplers);
  const D3D11_VIEWPORT viewport{0,
                                0,
                                static_cast<FLOAT>(width),
                                static_cast<FLOAT>(height),
                                0,
                                1};
  context->RSSetViewports(1, &viewport);
  context->RSSetState(d3d.rasterizer);
  const float blendFactor[4] = {0, 0, 0, 0};
  context->OMSetBlendState(d3d.blend, blendFactor, 0xffffffff);
  context->OMSetDepthStencilState(d3d.depth, 0);
  for (const backends::Run& run : batches.runs) {
    if (run.page >= static_cast<int>(d3d.pages.size())) continue;
    context->PSSetShaderResources(0, 1, &d3d.pages[run.page].view);
    const D3D11_RECT scissor{
        static_cast<LONG>(run.scissor.x), static_cast<LONG>(run.scissor.y),
        static_cast<LONG>(run.scissor.x + run.scissor.width),
        static_cast<LONG>(run.scissor.y + run.scissor.height)};
    context->RSSetScissorRects(1, &scissor);
    context->Draw(run.vertexCount, run.firstVertex);
  }
}

}  // namespace bureau
