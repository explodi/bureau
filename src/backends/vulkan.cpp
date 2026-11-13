#include "bureau/backends/vulkan.h"

#include <array>
#include <cstddef>
#include <cstdio>
#include <cstring>

#include "bureau/backends/quads.h"

namespace bureau {

namespace {

#include "vulkan_shaders.inc"

/** A buffer the CPU writes and the GPU reads, mapped for its whole life. */
struct HostBuffer {
  VkBuffer buffer = VK_NULL_HANDLE;
  VkDeviceMemory memory = VK_NULL_HANDLE;
  void* mapped = nullptr;
  VkDeviceSize capacity = 0;
};

/** What a slot in flight holds until it comes round again. */
struct Slot {
  HostBuffer vertices;
  std::vector<HostBuffer> staging;
};

struct Page {
  VkImage image = VK_NULL_HANDLE;
  VkDeviceMemory memory = VK_NULL_HANDLE;
  VkImageView view = VK_NULL_HANDLE;
  VkDescriptorSet set = VK_NULL_HANDLE;
  /** The image has never been written: its old contents do not matter. */
  bool fresh = true;
};

}  // namespace

struct VulkanBackend::Impl {
#define BUREAU_VK_FUNCTIONS(X)     \
  X(vkAllocateDescriptorSets)      \
  X(vkAllocateMemory)              \
  X(vkBindBufferMemory)            \
  X(vkBindImageMemory)             \
  X(vkCmdBindDescriptorSets)       \
  X(vkCmdBindPipeline)             \
  X(vkCmdBindVertexBuffers)        \
  X(vkCmdCopyBufferToImage)        \
  X(vkCmdDraw)                     \
  X(vkCmdPipelineBarrier)          \
  X(vkCmdPushConstants)            \
  X(vkCmdSetScissor)               \
  X(vkCmdSetViewport)              \
  X(vkCreateBuffer)                \
  X(vkCreateDescriptorPool)        \
  X(vkCreateDescriptorSetLayout)   \
  X(vkCreateGraphicsPipelines)     \
  X(vkCreateImage)                 \
  X(vkCreateImageView)             \
  X(vkCreatePipelineLayout)        \
  X(vkCreateSampler)               \
  X(vkCreateShaderModule)          \
  X(vkDestroyBuffer)               \
  X(vkDestroyDescriptorPool)       \
  X(vkDestroyDescriptorSetLayout)  \
  X(vkDestroyImage)                \
  X(vkDestroyImageView)            \
  X(vkDestroyPipeline)             \
  X(vkDestroyPipelineLayout)       \
  X(vkDestroySampler)              \
  X(vkDestroyShaderModule)         \
  X(vkFreeMemory)                  \
  X(vkGetBufferMemoryRequirements) \
  X(vkGetImageMemoryRequirements)  \
  X(vkGetPhysicalDeviceMemoryProperties) \
  X(vkMapMemory)                   \
  X(vkUnmapMemory)                 \
  X(vkUpdateDescriptorSets)
#define BUREAU_VK_MEMBER(name) PFN_##name name = nullptr;
  BUREAU_VK_FUNCTIONS(BUREAU_VK_MEMBER)
#undef BUREAU_VK_MEMBER

  VkDevice device = VK_NULL_HANDLE;
  VkPhysicalDeviceMemoryProperties memoryProperties{};
  VkSampler nearest = VK_NULL_HANDLE;
  VkSampler linear = VK_NULL_HANDLE;
  VkDescriptorSetLayout setLayout = VK_NULL_HANDLE;
  VkDescriptorPool descriptorPool = VK_NULL_HANDLE;
  VkPipelineLayout pipelineLayout = VK_NULL_HANDLE;
  VkPipeline pipeline = VK_NULL_HANDLE;
  std::vector<Slot> slots;
  std::vector<Page> pages;

  std::uint32_t memoryType(std::uint32_t allowed,
                           VkMemoryPropertyFlags wanted) const {
    for (std::uint32_t type = 0; type < memoryProperties.memoryTypeCount; ++type) {
      const bool isAllowed = (allowed & (1u << type)) != 0;
      const auto flags = memoryProperties.memoryTypes[type].propertyFlags;
      if (isAllowed && (flags & wanted) == wanted) return type;
    }
    return 0;
  }

  HostBuffer createBuffer(VkDeviceSize size, VkBufferUsageFlags usage) const {
    HostBuffer made;
    made.capacity = size;
    VkBufferCreateInfo info{VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO};
    info.size = size;
    info.usage = usage;
    info.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    vkCreateBuffer(device, &info, nullptr, &made.buffer);
    VkMemoryRequirements needs{};
    vkGetBufferMemoryRequirements(device, made.buffer, &needs);
    VkMemoryAllocateInfo allocate{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO};
    allocate.allocationSize = needs.size;
    allocate.memoryTypeIndex =
        memoryType(needs.memoryTypeBits, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT |
                                             VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);
    vkAllocateMemory(device, &allocate, nullptr, &made.memory);
    vkBindBufferMemory(device, made.buffer, made.memory, 0);
    vkMapMemory(device, made.memory, 0, VK_WHOLE_SIZE, 0, &made.mapped);
    return made;
  }

  void destroyBuffer(HostBuffer& buffer) const {
    if (buffer.buffer == VK_NULL_HANDLE) return;
    vkUnmapMemory(device, buffer.memory);
    vkDestroyBuffer(device, buffer.buffer, nullptr);
    vkFreeMemory(device, buffer.memory, nullptr);
    buffer = HostBuffer{};
  }

  VkSampler createSampler(VkFilter filter) const {
    VkSamplerCreateInfo info{VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO};
    info.magFilter = filter;
    info.minFilter = filter;
    info.addressModeU = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    info.addressModeV = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    info.addressModeW = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    VkSampler sampler = VK_NULL_HANDLE;
    vkCreateSampler(device, &info, nullptr, &sampler);
    return sampler;
  }

  VkShaderModule createShader(const std::uint32_t* code, std::size_t bytes) const {
    VkShaderModuleCreateInfo info{VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO};
    info.codeSize = bytes;
    info.pCode = code;
    VkShaderModule module = VK_NULL_HANDLE;
    vkCreateShaderModule(device, &info, nullptr, &module);
    return module;
  }

  void createLayouts() {
    nearest = createSampler(VK_FILTER_NEAREST);
    linear = createSampler(VK_FILTER_LINEAR);
    std::array<VkDescriptorSetLayoutBinding, 3> bindings{};
    bindings[0].binding = 0;
    bindings[0].descriptorType = VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE;
    bindings[0].descriptorCount = 1;
    bindings[0].stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
    bindings[1].binding = 1;
    bindings[1].descriptorType = VK_DESCRIPTOR_TYPE_SAMPLER;
    bindings[1].descriptorCount = 1;
    bindings[1].stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
    bindings[1].pImmutableSamplers = &nearest;
    bindings[2].binding = 2;
    bindings[2].descriptorType = VK_DESCRIPTOR_TYPE_SAMPLER;
    bindings[2].descriptorCount = 1;
    bindings[2].stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT;
    bindings[2].pImmutableSamplers = &linear;
    VkDescriptorSetLayoutCreateInfo setInfo{
        VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO};
    setInfo.bindingCount = static_cast<std::uint32_t>(bindings.size());
    setInfo.pBindings = bindings.data();
    vkCreateDescriptorSetLayout(device, &setInfo, nullptr, &setLayout);

    const std::array<VkDescriptorPoolSize, 2> sizes = {
        VkDescriptorPoolSize{VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE, kAtlasPageBudget},
        VkDescriptorPoolSize{VK_DESCRIPTOR_TYPE_SAMPLER, 2 * kAtlasPageBudget}};
    VkDescriptorPoolCreateInfo poolInfo{
        VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO};
    poolInfo.maxSets = kAtlasPageBudget;
    poolInfo.poolSizeCount = static_cast<std::uint32_t>(sizes.size());
    poolInfo.pPoolSizes = sizes.data();
    vkCreateDescriptorPool(device, &poolInfo, nullptr, &descriptorPool);

    VkPushConstantRange push{};
    push.stageFlags = VK_SHADER_STAGE_VERTEX_BIT;
    push.size = sizeof(float) * 2;
    VkPipelineLayoutCreateInfo layoutInfo{
        VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO};
    layoutInfo.setLayoutCount = 1;
    layoutInfo.pSetLayouts = &setLayout;
    layoutInfo.pushConstantRangeCount = 1;
    layoutInfo.pPushConstantRanges = &push;
    vkCreatePipelineLayout(device, &layoutInfo, nullptr, &pipelineLayout);
  }

  void createPipeline(const VulkanBackendInfo& info) {
    const VkShaderModule vertex =
        createShader(kVertexShader, sizeof kVertexShader);
    const VkShaderModule fragment =
        createShader(kFragmentShader, sizeof kFragmentShader);
    std::array<VkPipelineShaderStageCreateInfo, 2> stages{};
    stages[0].sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    stages[0].stage = VK_SHADER_STAGE_VERTEX_BIT;
    stages[0].module = vertex;
    stages[0].pName = "main";
    stages[1].sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    stages[1].stage = VK_SHADER_STAGE_FRAGMENT_BIT;
    stages[1].module = fragment;
    stages[1].pName = "main";

    VkVertexInputBindingDescription binding{};
    binding.stride = sizeof(backends::Vertex);
    binding.inputRate = VK_VERTEX_INPUT_RATE_VERTEX;
    const std::array<VkVertexInputAttributeDescription, 4> attributes = {
        VkVertexInputAttributeDescription{
            0, 0, VK_FORMAT_R32G32_SFLOAT,
            static_cast<std::uint32_t>(offsetof(backends::Vertex, x))},
        VkVertexInputAttributeDescription{
            1, 0, VK_FORMAT_R32G32_SFLOAT,
            static_cast<std::uint32_t>(offsetof(backends::Vertex, u))},
        VkVertexInputAttributeDescription{
            2, 0, VK_FORMAT_R8G8B8A8_UNORM,
            static_cast<std::uint32_t>(offsetof(backends::Vertex, r))},
        VkVertexInputAttributeDescription{
            3, 0, VK_FORMAT_R32G32B32_SFLOAT,
            static_cast<std::uint32_t>(offsetof(backends::Vertex, mode))}};
    VkPipelineVertexInputStateCreateInfo vertexInput{
        VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO};
    vertexInput.vertexBindingDescriptionCount = 1;
    vertexInput.pVertexBindingDescriptions = &binding;
    vertexInput.vertexAttributeDescriptionCount =
        static_cast<std::uint32_t>(attributes.size());
    vertexInput.pVertexAttributeDescriptions = attributes.data();

    VkPipelineInputAssemblyStateCreateInfo assembly{
        VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO};
    assembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    VkPipelineViewportStateCreateInfo viewport{
        VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO};
    viewport.viewportCount = 1;
    viewport.scissorCount = 1;
    VkPipelineRasterizationStateCreateInfo raster{
        VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO};
    raster.polygonMode = VK_POLYGON_MODE_FILL;
    raster.cullMode = VK_CULL_MODE_NONE;
    raster.lineWidth = 1.0f;
    VkPipelineMultisampleStateCreateInfo multisample{
        VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO};
    multisample.rasterizationSamples = info.samples;
    VkPipelineDepthStencilStateCreateInfo depth{
        VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO};
    VkPipelineColorBlendAttachmentState blend{};
    blend.blendEnable = VK_TRUE;
    blend.srcColorBlendFactor = VK_BLEND_FACTOR_ONE;
    blend.dstColorBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;
    blend.colorBlendOp = VK_BLEND_OP_ADD;
    blend.srcAlphaBlendFactor = VK_BLEND_FACTOR_ONE;
    blend.dstAlphaBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;
    blend.alphaBlendOp = VK_BLEND_OP_ADD;
    blend.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
                           VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;
    VkPipelineColorBlendStateCreateInfo colorBlend{
        VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO};
    colorBlend.attachmentCount = 1;
    colorBlend.pAttachments = &blend;
    const std::array<VkDynamicState, 2> dynamics = {VK_DYNAMIC_STATE_VIEWPORT,
                                                    VK_DYNAMIC_STATE_SCISSOR};
    VkPipelineDynamicStateCreateInfo dynamic{
        VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO};
    dynamic.dynamicStateCount = static_cast<std::uint32_t>(dynamics.size());
    dynamic.pDynamicStates = dynamics.data();

    VkPipelineRenderingCreateInfo rendering{
        VK_STRUCTURE_TYPE_PIPELINE_RENDERING_CREATE_INFO};
    rendering.colorAttachmentCount = 1;
    rendering.pColorAttachmentFormats = &info.colorFormat;

    VkGraphicsPipelineCreateInfo pipelineInfo{
        VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO};
    const bool isDynamicRendering = info.renderPass == VK_NULL_HANDLE;
    pipelineInfo.pNext = isDynamicRendering ? &rendering : nullptr;
    pipelineInfo.stageCount = static_cast<std::uint32_t>(stages.size());
    pipelineInfo.pStages = stages.data();
    pipelineInfo.pVertexInputState = &vertexInput;
    pipelineInfo.pInputAssemblyState = &assembly;
    pipelineInfo.pViewportState = &viewport;
    pipelineInfo.pRasterizationState = &raster;
    pipelineInfo.pMultisampleState = &multisample;
    pipelineInfo.pDepthStencilState = &depth;
    pipelineInfo.pColorBlendState = &colorBlend;
    pipelineInfo.pDynamicState = &dynamic;
    pipelineInfo.layout = pipelineLayout;
    pipelineInfo.renderPass = info.renderPass;
    pipelineInfo.subpass = info.subpass;
    const VkResult made = vkCreateGraphicsPipelines(
        device, VK_NULL_HANDLE, 1, &pipelineInfo, nullptr, &pipeline);
    if (made != VK_SUCCESS) {
      std::fprintf(stderr, "Bureau's Vulkan pipeline: VkResult %d\n", made);
    }
    vkDestroyShaderModule(device, vertex, nullptr);
    vkDestroyShaderModule(device, fragment, nullptr);
  }

  void createPage(int size) {
    Page page;
    VkImageCreateInfo image{VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO};
    image.imageType = VK_IMAGE_TYPE_2D;
    image.format = VK_FORMAT_R8G8B8A8_UNORM;
    image.extent = {static_cast<std::uint32_t>(size),
                    static_cast<std::uint32_t>(size), 1};
    image.mipLevels = 1;
    image.arrayLayers = 1;
    image.samples = VK_SAMPLE_COUNT_1_BIT;
    image.tiling = VK_IMAGE_TILING_OPTIMAL;
    image.usage = VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
    image.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    vkCreateImage(device, &image, nullptr, &page.image);
    VkMemoryRequirements needs{};
    vkGetImageMemoryRequirements(device, page.image, &needs);
    VkMemoryAllocateInfo allocate{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO};
    allocate.allocationSize = needs.size;
    allocate.memoryTypeIndex = memoryType(needs.memoryTypeBits,
                                          VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);
    vkAllocateMemory(device, &allocate, nullptr, &page.memory);
    vkBindImageMemory(device, page.image, page.memory, 0);

    VkImageViewCreateInfo view{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
    view.image = page.image;
    view.viewType = VK_IMAGE_VIEW_TYPE_2D;
    view.format = VK_FORMAT_R8G8B8A8_UNORM;
    view.subresourceRange.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    view.subresourceRange.levelCount = 1;
    view.subresourceRange.layerCount = 1;
    vkCreateImageView(device, &view, nullptr, &page.view);

    VkDescriptorSetAllocateInfo setInfo{
        VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO};
    setInfo.descriptorPool = descriptorPool;
    setInfo.descriptorSetCount = 1;
    setInfo.pSetLayouts = &setLayout;
    vkAllocateDescriptorSets(device, &setInfo, &page.set);
    VkDescriptorImageInfo imageInfo{};
    imageInfo.imageView = page.view;
    imageInfo.imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
    VkWriteDescriptorSet write{VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET};
    write.dstSet = page.set;
    write.dstBinding = 0;
    write.descriptorCount = 1;
    write.descriptorType = VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE;
    write.pImageInfo = &imageInfo;
    vkUpdateDescriptorSets(device, 1, &write, 0, nullptr);
    pages.push_back(page);
  }

  void transition(VkCommandBuffer commands, const Page& page, VkImageLayout from,
                  VkImageLayout to, VkAccessFlags sourceAccess,
                  VkAccessFlags destinationAccess,
                  VkPipelineStageFlags sourceStage,
                  VkPipelineStageFlags destinationStage) const {
    VkImageMemoryBarrier barrier{VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER};
    barrier.srcAccessMask = sourceAccess;
    barrier.dstAccessMask = destinationAccess;
    barrier.oldLayout = from;
    barrier.newLayout = to;
    barrier.srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    barrier.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    barrier.image = page.image;
    barrier.subresourceRange.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    barrier.subresourceRange.levelCount = 1;
    barrier.subresourceRange.layerCount = 1;
    vkCmdPipelineBarrier(commands, sourceStage, destinationStage, 0, 0, nullptr, 0,
                         nullptr, 1, &barrier);
  }
};

VulkanBackend::VulkanBackend(const VulkanBackendInfo& info)
    : impl_(std::make_unique<Impl>()) {
  Impl& vk = *impl_;
  vk.device = info.device;
#define BUREAU_VK_LOAD(name)                                      \
  vk.name = reinterpret_cast<PFN_##name>(                         \
      info.getInstanceProcAddr(info.instance, #name));
  BUREAU_VK_FUNCTIONS(BUREAU_VK_LOAD)
#undef BUREAU_VK_LOAD
  vk.vkGetPhysicalDeviceMemoryProperties(info.physicalDevice,
                                         &vk.memoryProperties);
  vk.slots.resize(info.framesInFlight);
  vk.createLayouts();
  vk.createPipeline(info);
}

VulkanBackend::~VulkanBackend() {
  Impl& vk = *impl_;
  for (Slot& slot : vk.slots) {
    vk.destroyBuffer(slot.vertices);
    for (HostBuffer& staging : slot.staging) vk.destroyBuffer(staging);
  }
  for (const Page& page : vk.pages) {
    vk.vkDestroyImageView(vk.device, page.view, nullptr);
    vk.vkDestroyImage(vk.device, page.image, nullptr);
    vk.vkFreeMemory(vk.device, page.memory, nullptr);
  }
  vk.vkDestroyPipeline(vk.device, vk.pipeline, nullptr);
  vk.vkDestroyPipelineLayout(vk.device, vk.pipelineLayout, nullptr);
  vk.vkDestroyDescriptorPool(vk.device, vk.descriptorPool, nullptr);
  vk.vkDestroyDescriptorSetLayout(vk.device, vk.setLayout, nullptr);
  vk.vkDestroySampler(vk.device, vk.nearest, nullptr);
  vk.vkDestroySampler(vk.device, vk.linear, nullptr);
}

void VulkanBackend::upload(VkCommandBuffer commands, std::uint32_t slot,
                           const std::vector<AtlasUpload>& uploads) {
  Impl& vk = *impl_;
  // This slot's last uploads have finished by now.
  for (HostBuffer& staging : vk.slots[slot].staging) vk.destroyBuffer(staging);
  vk.slots[slot].staging.clear();
  for (const AtlasUpload& upload : uploads) {
    while (static_cast<int>(vk.pages.size()) <= upload.page) vk.createPage(upload.pageSize);
    Page& page = vk.pages[upload.page];
    HostBuffer staging =
        vk.createBuffer(upload.pixels.size(), VK_BUFFER_USAGE_TRANSFER_SRC_BIT);
    std::memcpy(staging.mapped, upload.pixels.data(), upload.pixels.size());
    vk.slots[slot].staging.push_back(staging);

    const VkImageLayout from = page.fresh
                                   ? VK_IMAGE_LAYOUT_UNDEFINED
                                   : VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
    vk.transition(commands, page, from, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
                  page.fresh ? 0 : VK_ACCESS_SHADER_READ_BIT,
                  VK_ACCESS_TRANSFER_WRITE_BIT,
                  page.fresh ? VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT
                             : VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT,
                  VK_PIPELINE_STAGE_TRANSFER_BIT);
    VkBufferImageCopy copy{};
    copy.imageSubresource.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    copy.imageSubresource.layerCount = 1;
    copy.imageOffset = {upload.x, upload.y, 0};
    copy.imageExtent = {static_cast<std::uint32_t>(upload.width),
                        static_cast<std::uint32_t>(upload.height), 1};
    vk.vkCmdCopyBufferToImage(commands, staging.buffer, page.image,
                              VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, &copy);
    vk.transition(commands, page, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
                  VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
                  VK_ACCESS_TRANSFER_WRITE_BIT, VK_ACCESS_SHADER_READ_BIT,
                  VK_PIPELINE_STAGE_TRANSFER_BIT,
                  VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT);
    page.fresh = false;
  }
}

void VulkanBackend::draw(VkCommandBuffer commands, std::uint32_t slot,
                         const DisplayList& list, int width, int height) {
  Impl& vk = *impl_;
  if (vk.pipeline == VK_NULL_HANDLE || list.quads.empty()) return;
  const auto batches = backends::batchesOf(list, width, height);
  if (batches.vertices.empty()) return;
  const VkDeviceSize bytes = batches.vertices.size() * sizeof(backends::Vertex);
  HostBuffer& vertices = vk.slots[slot].vertices;
  if (bytes > vertices.capacity) {
    const VkDeviceSize size =
        backends::vertexBufferBytes(bytes, vertices.capacity);
    vk.destroyBuffer(vertices);
    vertices = vk.createBuffer(size, VK_BUFFER_USAGE_VERTEX_BUFFER_BIT);
  }
  std::memcpy(vertices.mapped, batches.vertices.data(), bytes);

  vk.vkCmdBindPipeline(commands, VK_PIPELINE_BIND_POINT_GRAPHICS, vk.pipeline);
  const VkViewport viewport{0, 0, static_cast<float>(width),
                            static_cast<float>(height), 0, 1};
  vk.vkCmdSetViewport(commands, 0, 1, &viewport);
  const float size[2] = {static_cast<float>(list.width),
                         static_cast<float>(list.height)};
  vk.vkCmdPushConstants(commands, vk.pipelineLayout, VK_SHADER_STAGE_VERTEX_BIT, 0,
                        sizeof size, size);
  const VkDeviceSize offset = 0;
  vk.vkCmdBindVertexBuffers(commands, 0, 1, &vertices.buffer, &offset);
  for (const backends::Run& run : batches.runs) {
    if (run.page >= static_cast<int>(vk.pages.size())) continue;
    vk.vkCmdBindDescriptorSets(commands, VK_PIPELINE_BIND_POINT_GRAPHICS,
                               vk.pipelineLayout, 0, 1, &vk.pages[run.page].set,
                               0, nullptr);
    const VkRect2D scissor{
        {static_cast<std::int32_t>(run.scissor.x),
         static_cast<std::int32_t>(run.scissor.y)},
        {run.scissor.width, run.scissor.height}};
    vk.vkCmdSetScissor(commands, 0, 1, &scissor);
    vk.vkCmdDraw(commands, run.vertexCount, 1, run.firstVertex, 0);
  }
}

}  // namespace bureau
