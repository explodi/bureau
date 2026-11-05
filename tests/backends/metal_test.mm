#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "scene.h"

#import <Metal/Metal.h>

#include "bureau/backends/metal.h"

TEST_CASE("Metal draws the scene") {
  id<MTLDevice> device = MTLCreateSystemDefaultDevice();
  const bool hasDevice = device != nil;
  REQUIRE(hasDevice);
  MTLTextureDescriptor* descriptor = [MTLTextureDescriptor
      texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA8Unorm
                                   width:scene::kSize
                                  height:scene::kSize
                               mipmapped:NO];
  descriptor.usage = MTLTextureUsageRenderTarget;
  descriptor.storageMode = MTLStorageModeShared;
  id<MTLTexture> target = [device newTextureWithDescriptor:descriptor];

  bureau::MetalBackend backend((__bridge void*)device, MTLPixelFormatRGBA8Unorm);
  backend.upload(scene::uploads());

  id<MTLCommandQueue> queue = [device newCommandQueue];
  id<MTLCommandBuffer> commands = [queue commandBuffer];
  MTLRenderPassDescriptor* pass = [MTLRenderPassDescriptor renderPassDescriptor];
  pass.colorAttachments[0].texture = target;
  pass.colorAttachments[0].loadAction = MTLLoadActionClear;
  pass.colorAttachments[0].storeAction = MTLStoreActionStore;
  pass.colorAttachments[0].clearColor =
      MTLClearColorMake(scene::kClear[0] / 255.0, scene::kClear[1] / 255.0,
                        scene::kClear[2] / 255.0, 1.0);
  id<MTLRenderCommandEncoder> encoder =
      [commands renderCommandEncoderWithDescriptor:pass];
  backend.draw(scene::list(), (__bridge void*)encoder, scene::kSize, scene::kSize);
  [encoder endEncoding];
  [commands commit];
  [commands waitUntilCompleted];
  const bool completed = commands.status == MTLCommandBufferStatusCompleted;
  REQUIRE(completed);

  std::vector<std::uint8_t> pixels(scene::kSize * scene::kSize * 4);
  [target getBytes:pixels.data()
       bytesPerRow:scene::kSize * 4
        fromRegion:MTLRegionMake2D(0, 0, scene::kSize, scene::kSize)
       mipmapLevel:0];
  scene::check([&](int x, int y) {
    const std::uint8_t* pixel = &pixels[(y * scene::kSize + x) * 4];
    return scene::Pixel{pixel[0], pixel[1], pixel[2], pixel[3]};
  });
}
