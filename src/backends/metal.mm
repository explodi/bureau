#include "bureau/backends/metal.h"

#import <Metal/Metal.h>

#include <cstdio>

#include "bureau/backends/quads.h"

namespace bureau {

namespace {

// The same picture on every backend: textured quads from an atlas page, in device
// pixels, premultiplied over the frame. Colours stay sRGB-encoded and blend in
// that encoding, so a palette and its translucent mixes come out as written.
NSString* const kShader = @R"(
#include <metal_stdlib>
using namespace metal;

struct Vertex {
  packed_float2 position;
  packed_float2 uv;
  packed_uchar4 color;
  // x: the mode (0 fill, 1 mask, 2 picture); y: the stipple's cell in device
  // pixels, 0 for none; z: 1 to sample linearly.
  packed_float3 params;
  float unused;
};

struct VertexOut {
  float4 position [[position]];
  float2 uv;
  float4 color;
  float3 params;
};

vertex VertexOut vs_main(uint index [[vertex_id]],
                         const device Vertex* vertices [[buffer(0)]],
                         constant float2& viewport [[buffer(1)]]) {
  const device Vertex& input = vertices[index];
  VertexOut output;
  output.position = float4(input.position.x / viewport.x * 2.0 - 1.0,
                           1.0 - input.position.y / viewport.y * 2.0, 0.0, 1.0);
  output.uv = input.uv;
  output.color = float4(uchar4(input.color)) / 255.0;
  output.params = input.params;
  return output;
}

fragment float4 fs_main(VertexOut input [[stage_in]],
                        texture2d<float> atlas [[texture(0)]]) {
  constexpr sampler nearestSampler(filter::nearest, address::clamp_to_edge);
  constexpr sampler linearSampler(filter::linear, address::clamp_to_edge);
  float4 texel = input.params.z > 0.5
      ? atlas.sample(linearSampler, input.uv, level(0.0))
      : atlas.sample(nearestSampler, input.uv, level(0.0));
  float4 color = float4(input.color.rgb * input.color.a, input.color.a);
  if (input.params.x > 1.5) {
    color = texel * input.color.a;
  } else if (input.params.x > 0.5) {
    float alpha = input.color.a * texel.a;
    color = float4(input.color.rgb * alpha, alpha);
  }
  // The register's checkerboard: the cells whose column and row differ in
  // parity keep their pixels.
  if (input.params.y > 0.5) {
    uint2 cell = uint2(floor(input.position.xy / input.params.y));
    if ((cell.x + cell.y) % 2u == 0u) color = float4(0.0);
  }
  return color;
}
)";

}  // namespace

struct MetalBackend::Impl {
  id<MTLDevice> device;
  id<MTLRenderPipelineState> pipeline;
  NSMutableArray<id<MTLTexture>>* pages = [NSMutableArray array];
};

MetalBackend::MetalBackend(void* device, unsigned long pixelFormat)
    : impl_(std::make_unique<Impl>()) {
  impl_->device = (__bridge id<MTLDevice>)device;
  NSError* error = nil;
  id<MTLLibrary> library = [impl_->device newLibraryWithSource:kShader
                                                       options:nil
                                                         error:&error];
  if (library == nil) {
    std::fprintf(stderr, "Bureau's Metal shader: %s\n",
                 error.localizedDescription.UTF8String);
    return;
  }
  MTLRenderPipelineDescriptor* descriptor = [MTLRenderPipelineDescriptor new];
  descriptor.label = @"bureau ui";
  descriptor.vertexFunction = [library newFunctionWithName:@"vs_main"];
  descriptor.fragmentFunction = [library newFunctionWithName:@"fs_main"];
  MTLRenderPipelineColorAttachmentDescriptor* color =
      descriptor.colorAttachments[0];
  color.pixelFormat = static_cast<MTLPixelFormat>(pixelFormat);
  color.blendingEnabled = YES;
  color.rgbBlendOperation = MTLBlendOperationAdd;
  color.alphaBlendOperation = MTLBlendOperationAdd;
  color.sourceRGBBlendFactor = MTLBlendFactorOne;
  color.sourceAlphaBlendFactor = MTLBlendFactorOne;
  color.destinationRGBBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
  color.destinationAlphaBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
  impl_->pipeline = [impl_->device newRenderPipelineStateWithDescriptor:descriptor
                                                                  error:&error];
  if (impl_->pipeline == nil) {
    std::fprintf(stderr, "Bureau's Metal pipeline: %s\n",
                 error.localizedDescription.UTF8String);
  }
}

MetalBackend::~MetalBackend() = default;

void MetalBackend::upload(const std::vector<AtlasUpload>& uploads) {
  for (const AtlasUpload& upload : uploads) {
    while (static_cast<int>(impl_->pages.count) <= upload.page) {
      MTLTextureDescriptor* texture = [MTLTextureDescriptor
          texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA8Unorm
                                       width:upload.pageSize
                                      height:upload.pageSize
                                   mipmapped:NO];
      texture.usage = MTLTextureUsageShaderRead;
      [impl_->pages addObject:[impl_->device newTextureWithDescriptor:texture]];
    }
    [impl_->pages[upload.page]
        replaceRegion:MTLRegionMake2D(upload.x, upload.y, upload.width,
                                      upload.height)
          mipmapLevel:0
            withBytes:upload.pixels.data()
          bytesPerRow:static_cast<NSUInteger>(upload.width) * 4];
  }
}

void MetalBackend::draw(const DisplayList& list, void* encoder, int width,
                        int height) {
  if (impl_->pipeline == nil || list.quads.empty()) return;
  id<MTLRenderCommandEncoder> pass = (__bridge id<MTLRenderCommandEncoder>)encoder;
  const auto batches = backends::batchesOf(list, width, height);
  if (batches.vertices.empty()) return;
  id<MTLBuffer> vertices = [impl_->device
      newBufferWithBytes:batches.vertices.data()
                  length:batches.vertices.size() * sizeof(backends::Vertex)
                 options:MTLResourceStorageModeShared];
  const float viewport[2] = {static_cast<float>(list.width),
                             static_cast<float>(list.height)};
  [pass setRenderPipelineState:impl_->pipeline];
  [pass setVertexBuffer:vertices offset:0 atIndex:0];
  [pass setVertexBytes:viewport length:sizeof viewport atIndex:1];
  for (const backends::Run& run : batches.runs) {
    if (run.page >= static_cast<int>(impl_->pages.count)) continue;
    [pass setFragmentTexture:impl_->pages[run.page] atIndex:0];
    [pass setScissorRect:MTLScissorRect{run.scissor.x, run.scissor.y,
                                        run.scissor.width, run.scissor.height}];
    [pass drawPrimitives:MTLPrimitiveTypeTriangle
             vertexStart:run.firstVertex
             vertexCount:run.vertexCount];
  }
}

}  // namespace bureau
