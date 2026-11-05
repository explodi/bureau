// The same picture on every backend: textured quads from an atlas page, in device
// pixels, premultiplied over the frame. Colours stay sRGB-encoded and blend in
// that encoding, so a palette and its translucent mixes come out as written.
#pragma once

namespace bureau::backends {

inline constexpr char kHlsl[] = R"(
cbuffer Frame : register(b0) {
  float2 viewport;
};
Texture2D atlas : register(t0);
SamplerState nearestSampler : register(s0);
SamplerState linearSampler : register(s1);

struct VertexIn {
  float2 position : POSITION;
  float2 uv : TEXCOORD0;
  float4 color : COLOR0;
  // x: the mode (0 fill, 1 mask, 2 picture); y: the stipple's cell in device
  // pixels, 0 for none; z: 1 to sample linearly.
  float3 params : TEXCOORD1;
};

struct VertexOut {
  float4 position : SV_Position;
  float2 uv : TEXCOORD0;
  float4 color : COLOR0;
  float3 params : TEXCOORD1;
};

VertexOut vs_main(VertexIn input) {
  VertexOut output;
  output.position = float4(input.position.x / viewport.x * 2.0 - 1.0,
                           1.0 - input.position.y / viewport.y * 2.0, 0.0, 1.0);
  output.uv = input.uv;
  output.color = input.color;
  output.params = input.params;
  return output;
}

float4 fs_main(VertexOut input) : SV_Target {
  float4 nearest = atlas.SampleLevel(nearestSampler, input.uv, 0.0);
  float4 filtered = atlas.SampleLevel(linearSampler, input.uv, 0.0);
  float4 texel = input.params.z > 0.5 ? filtered : nearest;
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
    if ((cell.x + cell.y) % 2u == 0u) color = float4(0.0, 0.0, 0.0, 0.0);
  }
  return color;
}
)";

}  // namespace bureau::backends
