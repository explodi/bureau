#version 450
// Premultiplied over the frame. Colours stay sRGB-encoded and blend in that
// encoding, so a palette and its translucent mixes come out as written.
layout(set = 0, binding = 0) uniform texture2D atlas;
layout(set = 0, binding = 1) uniform sampler nearestSampler;
layout(set = 0, binding = 2) uniform sampler linearSampler;
layout(location = 0) in vec2 vertexUv;
layout(location = 1) in vec4 vertexColor;
layout(location = 2) in vec3 vertexParams;
layout(location = 0) out vec4 fragment;
void main() {
  vec4 texel = vertexParams.z > 0.5
      ? texture(sampler2D(atlas, linearSampler), vertexUv)
      : texture(sampler2D(atlas, nearestSampler), vertexUv);
  vec4 color = vec4(vertexColor.rgb * vertexColor.a, vertexColor.a);
  if (vertexParams.x > 1.5) {
    color = texel * vertexColor.a;
  } else if (vertexParams.x > 0.5) {
    float alpha = vertexColor.a * texel.a;
    color = vec4(vertexColor.rgb * alpha, alpha);
  }
  // The register's checkerboard: the cells whose column and row differ in
  // parity keep their pixels.
  if (vertexParams.y > 0.5) {
    uvec2 cell = uvec2(floor(gl_FragCoord.xy / vertexParams.y));
    if ((cell.x + cell.y) % 2u == 0u) color = vec4(0.0);
  }
  fragment = color;
}
