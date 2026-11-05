#include "bureau/backends/opengl.h"

#include <cstddef>
#include <cstdio>
#include <string>

#include "bureau/backends/quads.h"

// The few GL names this file uses, so a game's own loader and headers never meet
// a second copy of them.
#if defined(_WIN32)
#define BUREAU_GL_CALL __stdcall
#else
#define BUREAU_GL_CALL
#endif

namespace bureau {

namespace {

using GLenum = unsigned int;
using GLuint = unsigned int;
using GLint = int;
using GLsizei = int;
using GLboolean = unsigned char;
using GLchar = char;
using GLsizeiptr = std::ptrdiff_t;

constexpr GLenum GL_TEXTURE_2D = 0x0DE1;
constexpr GLenum GL_TEXTURE0 = 0x84C0;
constexpr GLenum GL_RGBA = 0x1908;
constexpr GLenum GL_RGBA8 = 0x8058;
constexpr GLenum GL_UNSIGNED_BYTE = 0x1401;
constexpr GLenum GL_FLOAT = 0x1406;
constexpr GLenum GL_TRIANGLES = 0x0004;
constexpr GLenum GL_BLEND = 0x0BE2;
constexpr GLenum GL_SCISSOR_TEST = 0x0C11;
constexpr GLenum GL_DEPTH_TEST = 0x0B71;
constexpr GLenum GL_STENCIL_TEST = 0x0B90;
constexpr GLenum GL_CULL_FACE = 0x0B44;
constexpr GLenum GL_FRAMEBUFFER_SRGB = 0x8DB9;
constexpr GLenum GL_ONE = 1;
constexpr GLenum GL_ONE_MINUS_SRC_ALPHA = 0x0303;
constexpr GLenum GL_FUNC_ADD = 0x8006;
constexpr GLenum GL_ARRAY_BUFFER = 0x8892;
constexpr GLenum GL_STREAM_DRAW = 0x88E0;
constexpr GLenum GL_VERTEX_SHADER = 0x8B31;
constexpr GLenum GL_FRAGMENT_SHADER = 0x8B30;
constexpr GLenum GL_COMPILE_STATUS = 0x8B81;
constexpr GLenum GL_LINK_STATUS = 0x8B82;
constexpr GLenum GL_NEAREST = 0x2600;
constexpr GLenum GL_LINEAR = 0x2601;
constexpr GLenum GL_TEXTURE_MIN_FILTER = 0x2801;
constexpr GLenum GL_TEXTURE_MAG_FILTER = 0x2800;
constexpr GLenum GL_TEXTURE_WRAP_S = 0x2802;
constexpr GLenum GL_TEXTURE_WRAP_T = 0x2803;
constexpr GLenum GL_CLAMP_TO_EDGE = 0x812F;
constexpr GLenum GL_UNPACK_ALIGNMENT = 0x0CF5;
constexpr GLenum GL_UNPACK_ROW_LENGTH = 0x0CF2;
constexpr GLenum GL_UNPACK_SKIP_ROWS = 0x0CF3;
constexpr GLenum GL_UNPACK_SKIP_PIXELS = 0x0CF4;
constexpr GLenum GL_PIXEL_UNPACK_BUFFER = 0x88EC;
constexpr GLenum GL_CURRENT_PROGRAM = 0x8B8D;
constexpr GLenum GL_VERTEX_ARRAY_BINDING = 0x85B5;
constexpr GLenum GL_ARRAY_BUFFER_BINDING = 0x8894;
constexpr GLenum GL_ACTIVE_TEXTURE = 0x84E0;
constexpr GLenum GL_TEXTURE_BINDING_2D = 0x8069;
constexpr GLenum GL_SAMPLER_BINDING = 0x8919;
constexpr GLenum GL_VIEWPORT = 0x0BA2;
constexpr GLenum GL_SCISSOR_BOX = 0x0C10;
constexpr GLenum GL_BLEND_SRC_RGB = 0x80C9;
constexpr GLenum GL_BLEND_DST_RGB = 0x80C8;
constexpr GLenum GL_BLEND_SRC_ALPHA = 0x80CB;
constexpr GLenum GL_BLEND_DST_ALPHA = 0x80CA;
constexpr GLenum GL_BLEND_EQUATION_RGB = 0x8009;
constexpr GLenum GL_BLEND_EQUATION_ALPHA = 0x883D;
constexpr GLenum GL_PIXEL_UNPACK_BUFFER_BINDING = 0x88EF;

// The same picture on every backend: textured quads from an atlas page, in device
// pixels, premultiplied over the frame. Colours stay sRGB-encoded and blend in
// that encoding, so a palette and its translucent mixes come out as written.
const char* const kVertexShader = R"(
layout(location = 0) in vec2 position;
layout(location = 1) in vec2 uv;
layout(location = 2) in vec4 color;
// x: the mode (0 fill, 1 mask, 2 picture); y: the stipple's cell in device
// pixels, 0 for none; z: 1 to sample linearly.
layout(location = 3) in vec3 params;
uniform vec2 viewport;
out vec2 vertexUv;
out vec4 vertexColor;
out vec3 vertexParams;
void main() {
  gl_Position = vec4(position.x / viewport.x * 2.0 - 1.0,
                     1.0 - position.y / viewport.y * 2.0, 0.0, 1.0);
  vertexUv = uv;
  vertexColor = color;
  vertexParams = params;
}
)";

const char* const kFragmentShader = R"(
in vec2 vertexUv;
in vec4 vertexColor;
in vec3 vertexParams;
uniform sampler2D nearestAtlas;
uniform sampler2D linearAtlas;
uniform float targetHeight;
out vec4 fragment;
void main() {
  vec4 texel = vertexParams.z > 0.5 ? texture(linearAtlas, vertexUv)
                                    : texture(nearestAtlas, vertexUv);
  vec4 color = vec4(vertexColor.rgb * vertexColor.a, vertexColor.a);
  if (vertexParams.x > 1.5) {
    color = texel * vertexColor.a;
  } else if (vertexParams.x > 0.5) {
    float alpha = vertexColor.a * texel.a;
    color = vec4(vertexColor.rgb * alpha, alpha);
  }
  // The register's checkerboard, counted from the window's top: the cells whose
  // column and row differ in parity keep their pixels.
  if (vertexParams.y > 0.5) {
    vec2 fromTop = vec2(gl_FragCoord.x, targetHeight - gl_FragCoord.y);
    uvec2 cell = uvec2(floor(fromTop / vertexParams.y));
    if ((cell.x + cell.y) % 2u == 0u) color = vec4(0.0);
  }
  fragment = color;
}
)";

}  // namespace

struct OpenGlBackend::Impl {
#define BUREAU_GL_FUNCTION(returns, name, ...)         \
  using name##_t = returns(BUREAU_GL_CALL*)(__VA_ARGS__); \
  name##_t name = nullptr;
  BUREAU_GL_FUNCTION(void, glActiveTexture, GLenum)
  BUREAU_GL_FUNCTION(void, glAttachShader, GLuint, GLuint)
  BUREAU_GL_FUNCTION(void, glBindBuffer, GLenum, GLuint)
  BUREAU_GL_FUNCTION(void, glBindSampler, GLuint, GLuint)
  BUREAU_GL_FUNCTION(void, glBindTexture, GLenum, GLuint)
  BUREAU_GL_FUNCTION(void, glBindVertexArray, GLuint)
  BUREAU_GL_FUNCTION(void, glBlendEquationSeparate, GLenum, GLenum)
  BUREAU_GL_FUNCTION(void, glBlendFuncSeparate, GLenum, GLenum, GLenum, GLenum)
  BUREAU_GL_FUNCTION(void, glBufferData, GLenum, GLsizeiptr, const void*, GLenum)
  BUREAU_GL_FUNCTION(void, glCompileShader, GLuint)
  BUREAU_GL_FUNCTION(GLuint, glCreateProgram, void)
  BUREAU_GL_FUNCTION(GLuint, glCreateShader, GLenum)
  BUREAU_GL_FUNCTION(void, glDeleteBuffers, GLsizei, const GLuint*)
  BUREAU_GL_FUNCTION(void, glDeleteProgram, GLuint)
  BUREAU_GL_FUNCTION(void, glDeleteSamplers, GLsizei, const GLuint*)
  BUREAU_GL_FUNCTION(void, glDeleteShader, GLuint)
  BUREAU_GL_FUNCTION(void, glDeleteTextures, GLsizei, const GLuint*)
  BUREAU_GL_FUNCTION(void, glDeleteVertexArrays, GLsizei, const GLuint*)
  BUREAU_GL_FUNCTION(void, glDisable, GLenum)
  BUREAU_GL_FUNCTION(void, glDrawArrays, GLenum, GLint, GLsizei)
  BUREAU_GL_FUNCTION(void, glEnable, GLenum)
  BUREAU_GL_FUNCTION(void, glEnableVertexAttribArray, GLuint)
  BUREAU_GL_FUNCTION(void, glGenBuffers, GLsizei, GLuint*)
  BUREAU_GL_FUNCTION(void, glGenSamplers, GLsizei, GLuint*)
  BUREAU_GL_FUNCTION(void, glGenTextures, GLsizei, GLuint*)
  BUREAU_GL_FUNCTION(void, glGenVertexArrays, GLsizei, GLuint*)
  BUREAU_GL_FUNCTION(void, glGetIntegerv, GLenum, GLint*)
  BUREAU_GL_FUNCTION(void, glGetProgramInfoLog, GLuint, GLsizei, GLsizei*, GLchar*)
  BUREAU_GL_FUNCTION(void, glGetProgramiv, GLuint, GLenum, GLint*)
  BUREAU_GL_FUNCTION(void, glGetShaderInfoLog, GLuint, GLsizei, GLsizei*, GLchar*)
  BUREAU_GL_FUNCTION(void, glGetShaderiv, GLuint, GLenum, GLint*)
  BUREAU_GL_FUNCTION(GLint, glGetUniformLocation, GLuint, const GLchar*)
  BUREAU_GL_FUNCTION(GLboolean, glIsEnabled, GLenum)
  BUREAU_GL_FUNCTION(void, glLinkProgram, GLuint)
  BUREAU_GL_FUNCTION(void, glPixelStorei, GLenum, GLint)
  BUREAU_GL_FUNCTION(void, glSamplerParameteri, GLuint, GLenum, GLint)
  BUREAU_GL_FUNCTION(void, glScissor, GLint, GLint, GLsizei, GLsizei)
  BUREAU_GL_FUNCTION(void, glShaderSource, GLuint, GLsizei, const GLchar* const*,
                     const GLint*)
  BUREAU_GL_FUNCTION(void, glTexImage2D, GLenum, GLint, GLint, GLsizei, GLsizei,
                     GLint, GLenum, GLenum, const void*)
  BUREAU_GL_FUNCTION(void, glTexParameteri, GLenum, GLenum, GLint)
  BUREAU_GL_FUNCTION(void, glTexSubImage2D, GLenum, GLint, GLint, GLint, GLsizei,
                     GLsizei, GLenum, GLenum, const void*)
  BUREAU_GL_FUNCTION(void, glUniform1f, GLint, float)
  BUREAU_GL_FUNCTION(void, glUniform1i, GLint, GLint)
  BUREAU_GL_FUNCTION(void, glUniform2f, GLint, float, float)
  BUREAU_GL_FUNCTION(void, glUseProgram, GLuint)
  BUREAU_GL_FUNCTION(void, glVertexAttribPointer, GLuint, GLint, GLenum,
                     GLboolean, GLsizei, const void*)
  BUREAU_GL_FUNCTION(void, glViewport, GLint, GLint, GLsizei, GLsizei)
#undef BUREAU_GL_FUNCTION

  bool gles = false;
  GLuint program = 0;
  GLint viewport = -1;
  GLint targetHeight = -1;
  GLuint vertexArray = 0;
  GLuint vertices = 0;
  GLuint nearest = 0;
  GLuint linear = 0;
  std::vector<GLuint> pages;

  GLuint compile(GLenum stage, const char* body) const {
    const std::string version =
        gles ? "#version 300 es\nprecision highp float;\nprecision highp int;\n"
             : "#version 330 core\n";
    const std::string source = version + body;
    const char* text = source.c_str();
    const GLuint shader = glCreateShader(stage);
    glShaderSource(shader, 1, &text, nullptr);
    glCompileShader(shader);
    GLint compiled = 0;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &compiled);
    if (!compiled) {
      char log[1024] = {};
      glGetShaderInfoLog(shader, sizeof log, nullptr, log);
      std::fprintf(stderr, "Bureau's OpenGL shader: %s\n", log);
    }
    return shader;
  }

  void createProgram() {
    const GLuint vertex = compile(GL_VERTEX_SHADER, kVertexShader);
    const GLuint fragment = compile(GL_FRAGMENT_SHADER, kFragmentShader);
    program = glCreateProgram();
    glAttachShader(program, vertex);
    glAttachShader(program, fragment);
    glLinkProgram(program);
    GLint linked = 0;
    glGetProgramiv(program, GL_LINK_STATUS, &linked);
    if (!linked) {
      char log[1024] = {};
      glGetProgramInfoLog(program, sizeof log, nullptr, log);
      std::fprintf(stderr, "Bureau's OpenGL program: %s\n", log);
    }
    glDeleteShader(vertex);
    glDeleteShader(fragment);
    viewport = glGetUniformLocation(program, "viewport");
    targetHeight = glGetUniformLocation(program, "targetHeight");
  }

  GLuint createSampler(GLenum filter) const {
    GLuint sampler = 0;
    glGenSamplers(1, &sampler);
    glSamplerParameteri(sampler, GL_TEXTURE_MIN_FILTER, filter);
    glSamplerParameteri(sampler, GL_TEXTURE_MAG_FILTER, filter);
    glSamplerParameteri(sampler, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glSamplerParameteri(sampler, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    return sampler;
  }

  /** A switch of GL state, put back when it goes out of scope. */
  struct Toggle {
    const Impl& gl;
    GLenum what;
    bool was;
    Toggle(const Impl& impl, GLenum state, bool wanted)
        : gl(impl), what(state), was(impl.glIsEnabled(state) != 0) {
      if (wanted) gl.glEnable(what);
      else gl.glDisable(what);
    }
    ~Toggle() {
      if (was) gl.glEnable(what);
      else gl.glDisable(what);
    }
  };
};

OpenGlBackend::OpenGlBackend(const std::function<void*(const char*)>& load,
                             bool gles)
    : impl_(std::make_unique<Impl>()) {
  Impl& gl = *impl_;
#define BUREAU_GL_LOAD(name) gl.name = reinterpret_cast<Impl::name##_t>(load(#name));
  BUREAU_GL_LOAD(glActiveTexture)
  BUREAU_GL_LOAD(glAttachShader)
  BUREAU_GL_LOAD(glBindBuffer)
  BUREAU_GL_LOAD(glBindSampler)
  BUREAU_GL_LOAD(glBindTexture)
  BUREAU_GL_LOAD(glBindVertexArray)
  BUREAU_GL_LOAD(glBlendEquationSeparate)
  BUREAU_GL_LOAD(glBlendFuncSeparate)
  BUREAU_GL_LOAD(glBufferData)
  BUREAU_GL_LOAD(glCompileShader)
  BUREAU_GL_LOAD(glCreateProgram)
  BUREAU_GL_LOAD(glCreateShader)
  BUREAU_GL_LOAD(glDeleteBuffers)
  BUREAU_GL_LOAD(glDeleteProgram)
  BUREAU_GL_LOAD(glDeleteSamplers)
  BUREAU_GL_LOAD(glDeleteShader)
  BUREAU_GL_LOAD(glDeleteTextures)
  BUREAU_GL_LOAD(glDeleteVertexArrays)
  BUREAU_GL_LOAD(glDisable)
  BUREAU_GL_LOAD(glDrawArrays)
  BUREAU_GL_LOAD(glEnable)
  BUREAU_GL_LOAD(glEnableVertexAttribArray)
  BUREAU_GL_LOAD(glGenBuffers)
  BUREAU_GL_LOAD(glGenSamplers)
  BUREAU_GL_LOAD(glGenTextures)
  BUREAU_GL_LOAD(glGenVertexArrays)
  BUREAU_GL_LOAD(glGetIntegerv)
  BUREAU_GL_LOAD(glGetProgramInfoLog)
  BUREAU_GL_LOAD(glGetProgramiv)
  BUREAU_GL_LOAD(glGetShaderInfoLog)
  BUREAU_GL_LOAD(glGetShaderiv)
  BUREAU_GL_LOAD(glGetUniformLocation)
  BUREAU_GL_LOAD(glIsEnabled)
  BUREAU_GL_LOAD(glLinkProgram)
  BUREAU_GL_LOAD(glPixelStorei)
  BUREAU_GL_LOAD(glSamplerParameteri)
  BUREAU_GL_LOAD(glScissor)
  BUREAU_GL_LOAD(glShaderSource)
  BUREAU_GL_LOAD(glTexImage2D)
  BUREAU_GL_LOAD(glTexParameteri)
  BUREAU_GL_LOAD(glTexSubImage2D)
  BUREAU_GL_LOAD(glUniform1f)
  BUREAU_GL_LOAD(glUniform1i)
  BUREAU_GL_LOAD(glUniform2f)
  BUREAU_GL_LOAD(glUseProgram)
  BUREAU_GL_LOAD(glVertexAttribPointer)
  BUREAU_GL_LOAD(glViewport)
#undef BUREAU_GL_LOAD
  gl.gles = gles;
  gl.createProgram();
  gl.nearest = gl.createSampler(GL_NEAREST);
  gl.linear = gl.createSampler(GL_LINEAR);
  gl.glGenBuffers(1, &gl.vertices);
  gl.glGenVertexArrays(1, &gl.vertexArray);

  GLint vertexArray = 0;
  GLint arrayBuffer = 0;
  gl.glGetIntegerv(GL_VERTEX_ARRAY_BINDING, &vertexArray);
  gl.glGetIntegerv(GL_ARRAY_BUFFER_BINDING, &arrayBuffer);
  gl.glBindVertexArray(gl.vertexArray);
  gl.glBindBuffer(GL_ARRAY_BUFFER, gl.vertices);
  const auto stride = static_cast<GLsizei>(sizeof(backends::Vertex));
  const auto at = [](std::size_t offset) {
    return reinterpret_cast<const void*>(offset);
  };
  gl.glEnableVertexAttribArray(0);
  gl.glVertexAttribPointer(0, 2, GL_FLOAT, 0, stride,
                           at(offsetof(backends::Vertex, x)));
  gl.glEnableVertexAttribArray(1);
  gl.glVertexAttribPointer(1, 2, GL_FLOAT, 0, stride,
                           at(offsetof(backends::Vertex, u)));
  gl.glEnableVertexAttribArray(2);
  gl.glVertexAttribPointer(2, 4, GL_UNSIGNED_BYTE, 1, stride,
                           at(offsetof(backends::Vertex, r)));
  gl.glEnableVertexAttribArray(3);
  gl.glVertexAttribPointer(3, 3, GL_FLOAT, 0, stride,
                           at(offsetof(backends::Vertex, mode)));
  gl.glBindVertexArray(static_cast<GLuint>(vertexArray));
  gl.glBindBuffer(GL_ARRAY_BUFFER, static_cast<GLuint>(arrayBuffer));
}

OpenGlBackend::~OpenGlBackend() {
  Impl& gl = *impl_;
  gl.glDeleteProgram(gl.program);
  gl.glDeleteSamplers(1, &gl.nearest);
  gl.glDeleteSamplers(1, &gl.linear);
  gl.glDeleteBuffers(1, &gl.vertices);
  gl.glDeleteVertexArrays(1, &gl.vertexArray);
  if (!gl.pages.empty()) {
    gl.glDeleteTextures(static_cast<GLsizei>(gl.pages.size()), gl.pages.data());
  }
}

void OpenGlBackend::upload(const std::vector<AtlasUpload>& uploads) {
  if (uploads.empty()) return;
  Impl& gl = *impl_;
  GLint texture = 0;
  GLint alignment = 4;
  GLint rowLength = 0;
  GLint skipRows = 0;
  GLint skipPixels = 0;
  GLint unpackBuffer = 0;
  gl.glGetIntegerv(GL_TEXTURE_BINDING_2D, &texture);
  gl.glGetIntegerv(GL_UNPACK_ALIGNMENT, &alignment);
  gl.glGetIntegerv(GL_UNPACK_ROW_LENGTH, &rowLength);
  gl.glGetIntegerv(GL_UNPACK_SKIP_ROWS, &skipRows);
  gl.glGetIntegerv(GL_UNPACK_SKIP_PIXELS, &skipPixels);
  gl.glGetIntegerv(GL_PIXEL_UNPACK_BUFFER_BINDING, &unpackBuffer);
  gl.glBindBuffer(GL_PIXEL_UNPACK_BUFFER, 0);
  gl.glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  gl.glPixelStorei(GL_UNPACK_ROW_LENGTH, 0);
  gl.glPixelStorei(GL_UNPACK_SKIP_ROWS, 0);
  gl.glPixelStorei(GL_UNPACK_SKIP_PIXELS, 0);
  for (const AtlasUpload& upload : uploads) {
    while (static_cast<int>(gl.pages.size()) <= upload.page) {
      GLuint page = 0;
      gl.glGenTextures(1, &page);
      gl.glBindTexture(GL_TEXTURE_2D, page);
      gl.glTexImage2D(GL_TEXTURE_2D, 0, static_cast<GLint>(GL_RGBA8), kAtlasSize,
                      kAtlasSize, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
      gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
      gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
      gl.pages.push_back(page);
    }
    gl.glBindTexture(GL_TEXTURE_2D, gl.pages[upload.page]);
    gl.glTexSubImage2D(GL_TEXTURE_2D, 0, upload.x, upload.y, upload.width,
                       upload.height, GL_RGBA, GL_UNSIGNED_BYTE,
                       upload.pixels.data());
  }
  gl.glBindTexture(GL_TEXTURE_2D, static_cast<GLuint>(texture));
  gl.glPixelStorei(GL_UNPACK_ALIGNMENT, alignment);
  gl.glPixelStorei(GL_UNPACK_ROW_LENGTH, rowLength);
  gl.glPixelStorei(GL_UNPACK_SKIP_ROWS, skipRows);
  gl.glPixelStorei(GL_UNPACK_SKIP_PIXELS, skipPixels);
  gl.glBindBuffer(GL_PIXEL_UNPACK_BUFFER, static_cast<GLuint>(unpackBuffer));
}

void OpenGlBackend::draw(const DisplayList& list, int width, int height) {
  if (list.quads.empty()) return;
  Impl& gl = *impl_;
  const auto batches = backends::batchesOf(list, width, height);

  GLint program = 0, vertexArray = 0, arrayBuffer = 0, activeTexture = 0;
  GLint texture[2] = {}, sampler[2] = {};
  GLint viewport[4] = {}, scissor[4] = {};
  GLint sourceRgb = 0, destinationRgb = 0, sourceAlpha = 0, destinationAlpha = 0;
  GLint equationRgb = 0, equationAlpha = 0;
  gl.glGetIntegerv(GL_CURRENT_PROGRAM, &program);
  gl.glGetIntegerv(GL_VERTEX_ARRAY_BINDING, &vertexArray);
  gl.glGetIntegerv(GL_ARRAY_BUFFER_BINDING, &arrayBuffer);
  gl.glGetIntegerv(GL_ACTIVE_TEXTURE, &activeTexture);
  gl.glGetIntegerv(GL_VIEWPORT, viewport);
  gl.glGetIntegerv(GL_SCISSOR_BOX, scissor);
  gl.glGetIntegerv(GL_BLEND_SRC_RGB, &sourceRgb);
  gl.glGetIntegerv(GL_BLEND_DST_RGB, &destinationRgb);
  gl.glGetIntegerv(GL_BLEND_SRC_ALPHA, &sourceAlpha);
  gl.glGetIntegerv(GL_BLEND_DST_ALPHA, &destinationAlpha);
  gl.glGetIntegerv(GL_BLEND_EQUATION_RGB, &equationRgb);
  gl.glGetIntegerv(GL_BLEND_EQUATION_ALPHA, &equationAlpha);
  for (GLenum unit = 0; unit < 2; ++unit) {
    gl.glActiveTexture(GL_TEXTURE0 + unit);
    gl.glGetIntegerv(GL_TEXTURE_BINDING_2D, &texture[unit]);
    gl.glGetIntegerv(GL_SAMPLER_BINDING, &sampler[unit]);
  }
  {
    const Impl::Toggle blend(gl, GL_BLEND, true);
    const Impl::Toggle scissorTest(gl, GL_SCISSOR_TEST, true);
    const Impl::Toggle depth(gl, GL_DEPTH_TEST, false);
    const Impl::Toggle stencil(gl, GL_STENCIL_TEST, false);
    const Impl::Toggle cull(gl, GL_CULL_FACE, false);
    bool wasSrgb = false;
    if (!gl.gles) {
      wasSrgb = gl.glIsEnabled(GL_FRAMEBUFFER_SRGB) != 0;
      gl.glDisable(GL_FRAMEBUFFER_SRGB);
    }
    gl.glBlendEquationSeparate(GL_FUNC_ADD, GL_FUNC_ADD);
    gl.glBlendFuncSeparate(GL_ONE, GL_ONE_MINUS_SRC_ALPHA, GL_ONE,
                           GL_ONE_MINUS_SRC_ALPHA);
    gl.glViewport(0, 0, width, height);
    gl.glUseProgram(gl.program);
    gl.glUniform2f(gl.viewport, static_cast<float>(list.width),
                   static_cast<float>(list.height));
    gl.glUniform1f(gl.targetHeight, static_cast<float>(height));
    gl.glUniform1i(gl.glGetUniformLocation(gl.program, "nearestAtlas"), 0);
    gl.glUniform1i(gl.glGetUniformLocation(gl.program, "linearAtlas"), 1);
    gl.glBindVertexArray(gl.vertexArray);
    gl.glBindBuffer(GL_ARRAY_BUFFER, gl.vertices);
    gl.glBufferData(GL_ARRAY_BUFFER,
                    static_cast<GLsizeiptr>(batches.vertices.size() *
                                            sizeof(backends::Vertex)),
                    batches.vertices.data(), GL_STREAM_DRAW);
    gl.glActiveTexture(GL_TEXTURE0);
    gl.glBindSampler(0, gl.nearest);
    gl.glActiveTexture(GL_TEXTURE0 + 1);
    gl.glBindSampler(1, gl.linear);
    for (const backends::Run& run : batches.runs) {
      if (run.page >= static_cast<int>(gl.pages.size())) continue;
      for (GLenum unit = 0; unit < 2; ++unit) {
        gl.glActiveTexture(GL_TEXTURE0 + unit);
        gl.glBindTexture(GL_TEXTURE_2D, gl.pages[run.page]);
      }
      // GL counts rows from the bottom.
      gl.glScissor(static_cast<GLint>(run.scissor.x),
                   height - static_cast<GLint>(run.scissor.y + run.scissor.height),
                   static_cast<GLsizei>(run.scissor.width),
                   static_cast<GLsizei>(run.scissor.height));
      gl.glDrawArrays(GL_TRIANGLES, static_cast<GLint>(run.firstVertex),
                      static_cast<GLsizei>(run.vertexCount));
    }
    if (wasSrgb) gl.glEnable(GL_FRAMEBUFFER_SRGB);
  }
  for (GLenum unit = 0; unit < 2; ++unit) {
    gl.glActiveTexture(GL_TEXTURE0 + unit);
    gl.glBindTexture(GL_TEXTURE_2D, static_cast<GLuint>(texture[unit]));
    gl.glBindSampler(unit, static_cast<GLuint>(sampler[unit]));
  }
  gl.glActiveTexture(static_cast<GLenum>(activeTexture));
  gl.glUseProgram(static_cast<GLuint>(program));
  gl.glBindVertexArray(static_cast<GLuint>(vertexArray));
  gl.glBindBuffer(GL_ARRAY_BUFFER, static_cast<GLuint>(arrayBuffer));
  gl.glViewport(viewport[0], viewport[1], viewport[2], viewport[3]);
  gl.glScissor(scissor[0], scissor[1], scissor[2], scissor[3]);
  gl.glBlendFuncSeparate(static_cast<GLenum>(sourceRgb),
                         static_cast<GLenum>(destinationRgb),
                         static_cast<GLenum>(sourceAlpha),
                         static_cast<GLenum>(destinationAlpha));
  gl.glBlendEquationSeparate(static_cast<GLenum>(equationRgb),
                             static_cast<GLenum>(equationAlpha));
}

}  // namespace bureau
