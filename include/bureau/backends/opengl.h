// Bureau over a game's OpenGL 3.3 or OpenGL ES 3.0: the UI drawn into whatever
// framebuffer is bound, on the context that is current.
//
//   bureau::OpenGlBackend backend(
//       [](const char* name) { return SDL_GL_GetProcAddress(name); });
//
//   // Each frame:
//   backend.upload(frame.uploads);
//   backend.draw(*list, width, height);
//
// Every GL object and all the state it changes are put back as they were.
#pragma once

#include <functional>
#include <memory>
#include <vector>

#include "bureau/display.h"

namespace bureau {

class OpenGlBackend {
 public:
  /** `load` finds a GL function by name, as the game's windowing library does.
   * `gles` says the context is OpenGL ES 3.0 rather than OpenGL 3.3. */
  explicit OpenGlBackend(const std::function<void*(const char* name)>& load,
                         bool gles = false);
  ~OpenGlBackend();
  OpenGlBackend(const OpenGlBackend&) = delete;
  OpenGlBackend& operator=(const OpenGlBackend&) = delete;

  /** Atlas pixels from Ui::Frame, before the draw that reads them. */
  void upload(const std::vector<AtlasUpload>& uploads);

  /** Draws over the bound framebuffer, `width` by `height` pixels, with row 0 of
   * the window at its top as the default framebuffer has it. */
  void draw(const DisplayList& list, int width, int height);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bureau
