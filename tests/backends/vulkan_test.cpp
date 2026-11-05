// Vulkan on whichever implementation BUREAU_VULKAN_LIBRARY names (MoltenVK on a
// Mac), or the system's loader. With neither there is nothing to draw on, and the
// test says so instead of failing.
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "scene.h"

#include <cstdlib>
#include <cstring>
#include <string>

#include "bureau/backends/vulkan.h"

#if defined(_WIN32)
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace {

PFN_vkGetInstanceProcAddr loadVulkan() {
  const char* named = std::getenv("BUREAU_VULKAN_LIBRARY");
#if defined(_WIN32)
  HMODULE library = LoadLibraryA(named ? named : "vulkan-1.dll");
  if (library == nullptr) return nullptr;
  return reinterpret_cast<PFN_vkGetInstanceProcAddr>(
      GetProcAddress(library, "vkGetInstanceProcAddr"));
#elif defined(__APPLE__)
  void* library = dlopen(named ? named : "libvulkan.1.dylib", RTLD_NOW);
  if (library == nullptr) return nullptr;
  return reinterpret_cast<PFN_vkGetInstanceProcAddr>(
      dlsym(library, "vkGetInstanceProcAddr"));
#else
  void* library = dlopen(named ? named : "libvulkan.so.1", RTLD_NOW);
  if (library == nullptr) return nullptr;
  return reinterpret_cast<PFN_vkGetInstanceProcAddr>(
      dlsym(library, "vkGetInstanceProcAddr"));
#endif
}

/** A device, a 64 by 64 target, and what it takes to record and read back. */
struct Gpu {
  PFN_vkGetInstanceProcAddr getProc = nullptr;
  VkInstance instance = VK_NULL_HANDLE;
  VkPhysicalDevice physical = VK_NULL_HANDLE;
  VkDevice device = VK_NULL_HANDLE;
  VkQueue queue = VK_NULL_HANDLE;
  VkCommandPool pool = VK_NULL_HANDLE;
  VkCommandBuffer commands = VK_NULL_HANDLE;
  VkImage target = VK_NULL_HANDLE;
  VkDeviceMemory targetMemory = VK_NULL_HANDLE;
  VkImageView view = VK_NULL_HANDLE;
  VkBuffer readback = VK_NULL_HANDLE;
  VkDeviceMemory readbackMemory = VK_NULL_HANDLE;

  template <typename Function>
  Function load(const char* name) const {
    return reinterpret_cast<Function>(getProc(instance, name));
  }
#define GPU_CALL(name) load<PFN_##name>(#name)

  std::uint32_t memoryType(std::uint32_t allowed, VkMemoryPropertyFlags wanted) const {
    VkPhysicalDeviceMemoryProperties memory{};
    GPU_CALL(vkGetPhysicalDeviceMemoryProperties)(physical, &memory);
    for (std::uint32_t type = 0; type < memory.memoryTypeCount; ++type) {
      if ((allowed & (1u << type)) != 0 &&
          (memory.memoryTypes[type].propertyFlags & wanted) == wanted) {
        return type;
      }
    }
    return 0;
  }

  explicit Gpu(PFN_vkGetInstanceProcAddr found) : getProc(found) {
    VkApplicationInfo application{VK_STRUCTURE_TYPE_APPLICATION_INFO};
    application.apiVersion = VK_API_VERSION_1_3;
    VkInstanceCreateInfo instanceInfo{VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO};
    instanceInfo.pApplicationInfo = &application;
    const auto createInstance = reinterpret_cast<PFN_vkCreateInstance>(
        getProc(VK_NULL_HANDLE, "vkCreateInstance"));
    REQUIRE(createInstance(&instanceInfo, nullptr, &instance) == VK_SUCCESS);

    std::uint32_t count = 1;
    GPU_CALL(vkEnumeratePhysicalDevices)(instance, &count, &physical);
    REQUIRE(count >= 1);

    std::uint32_t extensionCount = 0;
    GPU_CALL(vkEnumerateDeviceExtensionProperties)(physical, nullptr, &extensionCount,
                                                   nullptr);
    std::vector<VkExtensionProperties> extensions(extensionCount);
    GPU_CALL(vkEnumerateDeviceExtensionProperties)(physical, nullptr, &extensionCount,
                                                   extensions.data());
    std::vector<const char*> enabled;
    for (const auto& extension : extensions) {
      if (std::strcmp(extension.extensionName, "VK_KHR_portability_subset") == 0) {
        enabled.push_back("VK_KHR_portability_subset");
      }
    }
    const float priority = 1.0f;
    VkDeviceQueueCreateInfo queueInfo{VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO};
    queueInfo.queueCount = 1;
    queueInfo.pQueuePriorities = &priority;
    VkPhysicalDeviceVulkan13Features modern{
        VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES};
    modern.dynamicRendering = VK_TRUE;
    VkDeviceCreateInfo deviceInfo{VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO};
    deviceInfo.pNext = &modern;
    deviceInfo.queueCreateInfoCount = 1;
    deviceInfo.pQueueCreateInfos = &queueInfo;
    deviceInfo.enabledExtensionCount = static_cast<std::uint32_t>(enabled.size());
    deviceInfo.ppEnabledExtensionNames = enabled.data();
    REQUIRE(GPU_CALL(vkCreateDevice)(physical, &deviceInfo, nullptr, &device) ==
            VK_SUCCESS);
    GPU_CALL(vkGetDeviceQueue)(device, 0, 0, &queue);

    VkCommandPoolCreateInfo poolInfo{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
    GPU_CALL(vkCreateCommandPool)(device, &poolInfo, nullptr, &pool);
    VkCommandBufferAllocateInfo allocate{
        VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
    allocate.commandPool = pool;
    allocate.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    allocate.commandBufferCount = 1;
    GPU_CALL(vkAllocateCommandBuffers)(device, &allocate, &commands);

    VkImageCreateInfo image{VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO};
    image.imageType = VK_IMAGE_TYPE_2D;
    image.format = VK_FORMAT_R8G8B8A8_UNORM;
    image.extent = {scene::kSize, scene::kSize, 1};
    image.mipLevels = 1;
    image.arrayLayers = 1;
    image.samples = VK_SAMPLE_COUNT_1_BIT;
    image.tiling = VK_IMAGE_TILING_OPTIMAL;
    image.usage = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT |
                  VK_IMAGE_USAGE_TRANSFER_SRC_BIT;
    GPU_CALL(vkCreateImage)(device, &image, nullptr, &target);
    VkMemoryRequirements needs{};
    GPU_CALL(vkGetImageMemoryRequirements)(device, target, &needs);
    VkMemoryAllocateInfo memory{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO};
    memory.allocationSize = needs.size;
    memory.memoryTypeIndex =
        memoryType(needs.memoryTypeBits, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);
    GPU_CALL(vkAllocateMemory)(device, &memory, nullptr, &targetMemory);
    GPU_CALL(vkBindImageMemory)(device, target, targetMemory, 0);
    VkImageViewCreateInfo viewInfo{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
    viewInfo.image = target;
    viewInfo.viewType = VK_IMAGE_VIEW_TYPE_2D;
    viewInfo.format = VK_FORMAT_R8G8B8A8_UNORM;
    viewInfo.subresourceRange.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    viewInfo.subresourceRange.levelCount = 1;
    viewInfo.subresourceRange.layerCount = 1;
    GPU_CALL(vkCreateImageView)(device, &viewInfo, nullptr, &view);

    VkBufferCreateInfo buffer{VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO};
    buffer.size = scene::kSize * scene::kSize * 4;
    buffer.usage = VK_BUFFER_USAGE_TRANSFER_DST_BIT;
    GPU_CALL(vkCreateBuffer)(device, &buffer, nullptr, &readback);
    GPU_CALL(vkGetBufferMemoryRequirements)(device, readback, &needs);
    memory.allocationSize = needs.size;
    memory.memoryTypeIndex = memoryType(needs.memoryTypeBits,
                                        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT |
                                            VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);
    GPU_CALL(vkAllocateMemory)(device, &memory, nullptr, &readbackMemory);
    GPU_CALL(vkBindBufferMemory)(device, readback, readbackMemory, 0);
  }

  ~Gpu() {
    GPU_CALL(vkDeviceWaitIdle)(device);
    GPU_CALL(vkDestroyBuffer)(device, readback, nullptr);
    GPU_CALL(vkFreeMemory)(device, readbackMemory, nullptr);
    GPU_CALL(vkDestroyImageView)(device, view, nullptr);
    GPU_CALL(vkDestroyImage)(device, target, nullptr);
    GPU_CALL(vkFreeMemory)(device, targetMemory, nullptr);
    GPU_CALL(vkDestroyCommandPool)(device, pool, nullptr);
    GPU_CALL(vkDestroyDevice)(device, nullptr);
    GPU_CALL(vkDestroyInstance)(instance, nullptr);
  }

  bureau::VulkanBackendInfo backendInfo() const {
    bureau::VulkanBackendInfo info;
    info.instance = instance;
    info.physicalDevice = physical;
    info.device = device;
    info.getInstanceProcAddr = getProc;
    info.framesInFlight = 1;
    return info;
  }

  void begin() const {
    VkCommandBufferBeginInfo info{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
    info.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    GPU_CALL(vkBeginCommandBuffer)(commands, &info);
  }

  VkClearValue clearColor() const {
    VkClearValue clear{};
    clear.color.float32[0] = scene::kClear[0] / 255.0f;
    clear.color.float32[1] = scene::kClear[1] / 255.0f;
    clear.color.float32[2] = scene::kClear[2] / 255.0f;
    clear.color.float32[3] = 1.0f;
    return clear;
  }

  /** Copies the target out, submits, waits, and checks the scene. */
  void finishAndCheck() const {
    VkBufferImageCopy copy{};
    copy.imageSubresource.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    copy.imageSubresource.layerCount = 1;
    copy.imageExtent = {scene::kSize, scene::kSize, 1};
    GPU_CALL(vkCmdCopyImageToBuffer)(commands, target,
                                     VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, readback,
                                     1, &copy);
    GPU_CALL(vkEndCommandBuffer)(commands);
    VkSubmitInfo submit{VK_STRUCTURE_TYPE_SUBMIT_INFO};
    submit.commandBufferCount = 1;
    submit.pCommandBuffers = &commands;
    REQUIRE(GPU_CALL(vkQueueSubmit)(queue, 1, &submit, VK_NULL_HANDLE) == VK_SUCCESS);
    REQUIRE(GPU_CALL(vkQueueWaitIdle)(queue) == VK_SUCCESS);
    void* mapped = nullptr;
    GPU_CALL(vkMapMemory)(device, readbackMemory, 0, VK_WHOLE_SIZE, 0, &mapped);
    const auto* pixels = static_cast<const std::uint8_t*>(mapped);
    scene::check([&](int x, int y) {
      const std::uint8_t* pixel = &pixels[(y * scene::kSize + x) * 4];
      return scene::Pixel{pixel[0], pixel[1], pixel[2], pixel[3]};
    });
    GPU_CALL(vkUnmapMemory)(device, readbackMemory);
  }
};

}  // namespace

TEST_CASE("Vulkan draws the scene in a render pass") {
  const auto found = loadVulkan();
  if (found == nullptr) {
    MESSAGE("No Vulkan here: set BUREAU_VULKAN_LIBRARY to run this");
    return;
  }
  Gpu gpu(found);

  VkAttachmentDescription attachment{};
  attachment.format = VK_FORMAT_R8G8B8A8_UNORM;
  attachment.samples = VK_SAMPLE_COUNT_1_BIT;
  attachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
  attachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
  attachment.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
  attachment.finalLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;
  VkAttachmentReference reference{0, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL};
  VkSubpassDescription subpass{};
  subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
  subpass.colorAttachmentCount = 1;
  subpass.pColorAttachments = &reference;
  VkRenderPassCreateInfo passInfo{VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO};
  passInfo.attachmentCount = 1;
  passInfo.pAttachments = &attachment;
  passInfo.subpassCount = 1;
  passInfo.pSubpasses = &subpass;
  VkRenderPass pass = VK_NULL_HANDLE;
  const auto load = [&](const char* name) { return gpu.getProc(gpu.instance, name); };
  reinterpret_cast<PFN_vkCreateRenderPass>(load("vkCreateRenderPass"))(
      gpu.device, &passInfo, nullptr, &pass);
  VkFramebufferCreateInfo framebufferInfo{VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO};
  framebufferInfo.renderPass = pass;
  framebufferInfo.attachmentCount = 1;
  framebufferInfo.pAttachments = &gpu.view;
  framebufferInfo.width = scene::kSize;
  framebufferInfo.height = scene::kSize;
  framebufferInfo.layers = 1;
  VkFramebuffer framebuffer = VK_NULL_HANDLE;
  reinterpret_cast<PFN_vkCreateFramebuffer>(load("vkCreateFramebuffer"))(
      gpu.device, &framebufferInfo, nullptr, &framebuffer);

  {
    auto info = gpu.backendInfo();
    info.renderPass = pass;
    bureau::VulkanBackend backend(info);
    gpu.begin();
    backend.upload(gpu.commands, 0, scene::uploads());
    const VkClearValue clear = gpu.clearColor();
    VkRenderPassBeginInfo begin{VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO};
    begin.renderPass = pass;
    begin.framebuffer = framebuffer;
    begin.renderArea.extent = {scene::kSize, scene::kSize};
    begin.clearValueCount = 1;
    begin.pClearValues = &clear;
    reinterpret_cast<PFN_vkCmdBeginRenderPass>(load("vkCmdBeginRenderPass"))(
        gpu.commands, &begin, VK_SUBPASS_CONTENTS_INLINE);
    backend.draw(gpu.commands, 0, scene::list(), scene::kSize, scene::kSize);
    reinterpret_cast<PFN_vkCmdEndRenderPass>(load("vkCmdEndRenderPass"))(gpu.commands);
    gpu.finishAndCheck();
    reinterpret_cast<PFN_vkDeviceWaitIdle>(load("vkDeviceWaitIdle"))(gpu.device);
  }
  reinterpret_cast<PFN_vkDestroyFramebuffer>(load("vkDestroyFramebuffer"))(
      gpu.device, framebuffer, nullptr);
  reinterpret_cast<PFN_vkDestroyRenderPass>(load("vkDestroyRenderPass"))(
      gpu.device, pass, nullptr);
}

TEST_CASE("Vulkan draws the scene with dynamic rendering") {
  const auto found = loadVulkan();
  if (found == nullptr) {
    MESSAGE("No Vulkan here: set BUREAU_VULKAN_LIBRARY to run this");
    return;
  }
  Gpu gpu(found);
  const auto load = [&](const char* name) { return gpu.getProc(gpu.instance, name); };
  const auto barrierCall =
      reinterpret_cast<PFN_vkCmdPipelineBarrier>(load("vkCmdPipelineBarrier"));

  auto info = gpu.backendInfo();
  info.colorFormat = VK_FORMAT_R8G8B8A8_UNORM;
  bureau::VulkanBackend backend(info);
  gpu.begin();
  backend.upload(gpu.commands, 0, scene::uploads());

  VkImageMemoryBarrier toAttachment{VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER};
  toAttachment.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;
  toAttachment.oldLayout = VK_IMAGE_LAYOUT_UNDEFINED;
  toAttachment.newLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
  toAttachment.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
  toAttachment.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
  toAttachment.image = gpu.target;
  toAttachment.subresourceRange.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
  toAttachment.subresourceRange.levelCount = 1;
  toAttachment.subresourceRange.layerCount = 1;
  barrierCall(gpu.commands, VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,
              VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT, 0, 0, nullptr, 0,
              nullptr, 1, &toAttachment);

  VkRenderingAttachmentInfo attachment{VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO};
  attachment.imageView = gpu.view;
  attachment.imageLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
  attachment.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
  attachment.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
  attachment.clearValue = gpu.clearColor();
  VkRenderingInfo rendering{VK_STRUCTURE_TYPE_RENDERING_INFO};
  rendering.renderArea.extent = {scene::kSize, scene::kSize};
  rendering.layerCount = 1;
  rendering.colorAttachmentCount = 1;
  rendering.pColorAttachments = &attachment;
  reinterpret_cast<PFN_vkCmdBeginRendering>(load("vkCmdBeginRendering"))(gpu.commands,
                                                                         &rendering);
  backend.draw(gpu.commands, 0, scene::list(), scene::kSize, scene::kSize);
  reinterpret_cast<PFN_vkCmdEndRendering>(load("vkCmdEndRendering"))(gpu.commands);

  VkImageMemoryBarrier toTransfer = toAttachment;
  toTransfer.srcAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;
  toTransfer.dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
  toTransfer.oldLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
  toTransfer.newLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;
  barrierCall(gpu.commands, VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT,
              VK_PIPELINE_STAGE_TRANSFER_BIT, 0, 0, nullptr, 0, nullptr, 1,
              &toTransfer);
  gpu.finishAndCheck();
  reinterpret_cast<PFN_vkDeviceWaitIdle>(load("vkDeviceWaitIdle"))(gpu.device);
}
