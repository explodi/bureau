// OpenGL offscreen, where a test can make a context with no window: CGL on a Mac,
// EGL on Linux. Windows needs a window for one, so its GL arm is left to a game.
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "scene.h"

#include "bureau/backends/opengl.h"

#if defined(__APPLE__)
#define GL_SILENCE_DEPRECATION
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl3.h>
#include <dlfcn.h>
#else
#include <EGL/egl.h>
#include <GL/gl.h>
#include <GL/glext.h>
#endif

namespace {

#if defined(__APPLE__)
/** A core 3.2 context, which takes 330 shaders. */
struct Context {
  CGLContextObj context = nullptr;
  Context() {
    const CGLPixelFormatAttribute attributes[] = {
        kCGLPFAOpenGLProfile,
        static_cast<CGLPixelFormatAttribute>(kCGLOGLPVersion_3_2_Core),
        static_cast<CGLPixelFormatAttribute>(0)};
    CGLPixelFormatObj format = nullptr;
    GLint count = 0;
    REQUIRE(CGLChoosePixelFormat(attributes, &format, &count) == kCGLNoError);
    REQUIRE(CGLCreateContext(format, nullptr, &context) == kCGLNoError);
    CGLDestroyPixelFormat(format);
    REQUIRE(CGLSetCurrentContext(context) == kCGLNoError);
  }
  ~Context() {
    CGLSetCurrentContext(nullptr);
    CGLDestroyContext(context);
  }
  static void* load(const char* name) { return dlsym(RTLD_DEFAULT, name); }
};
#else
struct Context {
  EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
  EGLContext context = EGL_NO_CONTEXT;
  Context() {
    REQUIRE(eglInitialize(display, nullptr, nullptr));
    REQUIRE(eglBindAPI(EGL_OPENGL_API));
    const EGLint attributes[] = {EGL_RENDERABLE_TYPE, EGL_OPENGL_BIT, EGL_NONE};
    EGLConfig config = nullptr;
    EGLint count = 0;
    REQUIRE(eglChooseConfig(display, attributes, &config, 1, &count));
    const EGLint version[] = {EGL_CONTEXT_MAJOR_VERSION, 3,
                              EGL_CONTEXT_MINOR_VERSION, 3, EGL_NONE};
    context = eglCreateContext(display, config, EGL_NO_CONTEXT, version);
    REQUIRE(context != EGL_NO_CONTEXT);
    REQUIRE(eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, context));
  }
  ~Context() {
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    eglDestroyContext(display, context);
  }
  static void* load(const char* name) {
    return reinterpret_cast<void*>(eglGetProcAddress(name));
  }
};
#endif

}  // namespace

TEST_CASE("OpenGL draws the scene, and leaves GL's state as it found it") {
  Context context;
  bureau::OpenGlBackend backend(Context::load);

  GLuint target = 0;
  glGenTextures(1, &target);
  glBindTexture(GL_TEXTURE_2D, target);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, scene::kSize, scene::kSize, 0, GL_RGBA,
               GL_UNSIGNED_BYTE, nullptr);
  GLuint framebuffer = 0;
#if defined(__APPLE__)
  glGenFramebuffers(1, &framebuffer);
  glBindFramebuffer(GL_FRAMEBUFFER, framebuffer);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D,
                         target, 0);
  REQUIRE(glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE);
#else
  const auto genFramebuffers = reinterpret_cast<PFNGLGENFRAMEBUFFERSPROC>(
      Context::load("glGenFramebuffers"));
  const auto bindFramebuffer = reinterpret_cast<PFNGLBINDFRAMEBUFFERPROC>(
      Context::load("glBindFramebuffer"));
  const auto framebufferTexture = reinterpret_cast<PFNGLFRAMEBUFFERTEXTURE2DPROC>(
      Context::load("glFramebufferTexture2D"));
  genFramebuffers(1, &framebuffer);
  bindFramebuffer(GL_FRAMEBUFFER, framebuffer);
  framebufferTexture(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, target, 0);
#endif
  glViewport(0, 0, scene::kSize, scene::kSize);
  glClearColor(scene::kClear[0] / 255.0f, scene::kClear[1] / 255.0f,
               scene::kClear[2] / 255.0f, 1.0f);
  glClear(GL_COLOR_BUFFER_BIT);

  glEnable(GL_DEPTH_TEST);
  glViewport(1, 2, 3, 4);
  backend.upload(scene::uploads());
  backend.draw(scene::list(), scene::kSize, scene::kSize);
  REQUIRE(glGetError() == GL_NO_ERROR);

  CHECK(glIsEnabled(GL_DEPTH_TEST) == GL_TRUE);
  CHECK(glIsEnabled(GL_BLEND) == GL_FALSE);
  GLint viewport[4] = {};
  glGetIntegerv(GL_VIEWPORT, viewport);
  CHECK(viewport[0] == 1);
  CHECK(viewport[3] == 4);
  GLint bound = 0;
  glGetIntegerv(GL_TEXTURE_BINDING_2D, &bound);
  CHECK(static_cast<GLuint>(bound) == target);

  std::vector<std::uint8_t> pixels(scene::kSize * scene::kSize * 4);
  glReadPixels(0, 0, scene::kSize, scene::kSize, GL_RGBA, GL_UNSIGNED_BYTE,
               pixels.data());
  scene::check([&](int x, int y) {
    // GL's rows count from the bottom.
    const int row = scene::kSize - 1 - y;
    const std::uint8_t* pixel = &pixels[(row * scene::kSize + x) * 4];
    return scene::Pixel{pixel[0], pixel[1], pixel[2], pixel[3]};
  });
}
