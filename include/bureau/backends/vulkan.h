// Bureau over a game's Vulkan: the UI drawn into the game's own render pass.
//
//   bureau::VulkanBackendInfo info;
//   info.instance = instance;
//   info.physicalDevice = physicalDevice;
//   info.device = device;
//   info.getInstanceProcAddr = vkGetInstanceProcAddr;
//   info.renderPass = renderPass;  // or colorFormat, for dynamic rendering
//   bureau::VulkanBackend backend(info);
//
//   // Each frame, with `slot` below info.framesInFlight:
//   backend.upload(commands, slot, frame.uploads);  // outside the render pass
//   // ...begin the game's render pass...
//   backend.draw(commands, slot, *list, width, height);
//
// The colour target should be a UNORM view: the UI's colours are sRGB-encoded
// already and blend in that encoding. A slot's work must have finished on the GPU
// before the slot is used again, as any frame-in-flight scheme ensures.
#pragma once

#include <vulkan/vulkan.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "bureau/display.h"

namespace bureau {

struct VulkanBackendInfo {
  VkInstance instance = VK_NULL_HANDLE;
  VkPhysicalDevice physicalDevice = VK_NULL_HANDLE;
  VkDevice device = VK_NULL_HANDLE;
  /** What finds every other function, so no loader is linked. */
  PFN_vkGetInstanceProcAddr getInstanceProcAddr = nullptr;
  /** The pass and subpass draws happen in... */
  VkRenderPass renderPass = VK_NULL_HANDLE;
  std::uint32_t subpass = 0;
  /** ...or, with no pass, the colour format of dynamic rendering (Vulkan 1.3). */
  VkFormat colorFormat = VK_FORMAT_UNDEFINED;
  VkSampleCountFlagBits samples = VK_SAMPLE_COUNT_1_BIT;
  std::uint32_t framesInFlight = 2;
};

class VulkanBackend {
 public:
  explicit VulkanBackend(const VulkanBackendInfo& info);
  /** The device must be idle. */
  ~VulkanBackend();
  VulkanBackend(const VulkanBackend&) = delete;
  VulkanBackend& operator=(const VulkanBackend&) = delete;

  /** Records atlas pixels from Ui::Frame, outside a render pass. */
  void upload(VkCommandBuffer commands, std::uint32_t slot,
              const std::vector<AtlasUpload>& uploads);

  /** Records the list into the open pass, on a target `width` by `height` pixels.
   * Leaves the pipeline, the viewport, the scissor and the bindings changed. */
  void draw(VkCommandBuffer commands, std::uint32_t slot, const DisplayList& list,
            int width, int height);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bureau
