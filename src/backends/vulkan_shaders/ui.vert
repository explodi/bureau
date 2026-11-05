#version 450
// The same picture on every backend: textured quads from an atlas page, in device
// pixels. Vulkan's clip space points down, so y needs no flip.
layout(location = 0) in vec2 position;
layout(location = 1) in vec2 uv;
layout(location = 2) in vec4 color;
// x: the mode (0 fill, 1 mask, 2 picture); y: the stipple's cell in device
// pixels, 0 for none; z: 1 to sample linearly.
layout(location = 3) in vec3 params;
layout(push_constant) uniform Frame { vec2 viewport; } frame;
layout(location = 0) out vec2 vertexUv;
layout(location = 1) out vec4 vertexColor;
layout(location = 2) out vec3 vertexParams;
void main() {
  gl_Position = vec4(position.x / frame.viewport.x * 2.0 - 1.0,
                     position.y / frame.viewport.y * 2.0 - 1.0, 0.0, 1.0);
  vertexUv = uv;
  vertexColor = color;
  vertexParams = params;
}
