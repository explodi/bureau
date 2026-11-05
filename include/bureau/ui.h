// A React and TypeScript UI inside a C++ game.
//
// The UI runs on a thread of its own, in Hermes: React commits into a view,
// which lays out and paints into display lists. The game's render thread takes
// the newest one each frame and draws it with a backend (bureau/backends/) over
// whatever it drew. The game feeds input in and adds its own functions to
// `__native`, the object its TypeScript calls C++ through.
//
//   bureau::Ui::Options options;
//   options.bytecode = read("ui/bundle.hbc");
//   options.tokens = read("ui/tokens.json");
//   options.readAsset = [](const std::string& path) { return read(path); };
//   bureau::Ui ui(std::move(options));
//   ui.start();
//
//   // Each frame, on the render thread:
//   auto frame = ui.takeFrame();
//   backend.upload(std::move(frame.uploads));
//   if (frame.list) list = std::move(frame.list);
//   if (list) backend.draw(*list, ...);
//   ui.refresh(nowMs);
#pragma once

#include <nlohmann/json.hpp>

#include <array>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "bureau/display.h"
#include "bureau/input.h"

namespace facebook::jsi {
class Object;
class Runtime;
}  // namespace facebook::jsi

namespace bureau {

class View;
namespace js {
class Host;
}

class Ui {
 public:
  using Task = std::function<void(facebook::jsi::Runtime&)>;

  struct Options {
    /** The UI's Hermes bytecode (tools/bundle.ts). */
    std::vector<std::uint8_t> bytecode;
    /** The looks, as JSON (tools/tokens.ts). */
    std::string tokens;
    /** A file the UI asks for by its path under the game's assets (`/fonts/…`,
     * pictures); nothing when there is none. On the UI's thread. */
    std::function<std::optional<std::string>(const std::string& path)> readAsset;
    /** The window, in points, and its device pixels per point. */
    float width = 1280;
    float height = 720;
    float scale = 1;
    /** A BCP 47 tag; the type styles and the line breaking follow its language. */
    std::string language = "en";
    /** The atlas's pages, in texels a side, and how many it holds before a frame
     * bakes afresh. A renderer with little texture memory lowers them. The Vulkan
     * and Direct3D 12 backends hold kAtlasPageBudget pages at most. */
    int atlasSize = kAtlasSize;
    int atlasPageBudget = kAtlasPageBudget;
    /** Text in one bit of coverage with its pens on whole pixels, for a renderer
     * that cannot blend a glyph's edge. Clearest in a pixel font at its own size. */
    bool monochromeText = false;
    /** Adds the game's own functions to `__native`, before the bundle runs and
     * again after every reload. */
    std::function<void(facebook::jsi::Runtime&, facebook::jsi::Object& native)>
        install;
    /** Lets go of what `install` kept of the runtime, while it still exists. */
    Task uninstall;
    /** After each turn of the UI's thread, before it paints. */
    std::function<void(facebook::jsi::Runtime&, double nowMs)> afterTurn;
    /** An exception nothing caught, on the UI's thread. */
    std::function<void(const std::string& message)> onError;
    /** `console.error` and its like: what TypeScript wants a person to hear. */
    std::function<void(const std::string& category, const std::string& message)>
        onReport;
    /** Where a developer build's bundle sits, beside its source and map: with
     * BUREAU_INSPECT_PORT set, Chrome DevTools debugs the TSX. Empty for none. */
    std::string debugBundle;
    /** Holds animation time still, for tests and recorded benches. */
    std::optional<double> frozenClock;
  };

  explicit Ui(Options options);
  /** Stops the UI's thread, if `stop` has not. */
  ~Ui();
  Ui(const Ui&) = delete;
  Ui& operator=(const Ui&) = delete;

  /** Runs the bundle. Tasks posted before it wait for it. */
  void start();
  /** Runs what is queued, then ends the UI's thread; later posts are dropped. */
  void stop();

  /** Runs `task` on the UI's thread, soon; from any thread. `tag` names it when
   * a stalled thread is reported. */
  void post(Task task, std::string tag = {});
  /** Runs `task` on the UI's thread and waits for it. */
  void invoke(Task task, std::string tag = "invoke");

  /** What the UI's thread made since the last take. */
  struct Frame {
    /** Null when nothing changed: draw the last one again. */
    std::shared_ptr<const DisplayList> list;
    /** Atlas pixels to give the backend before it draws. */
    std::vector<AtlasUpload> uploads;
    /** The pointer is over something that presses. */
    bool pressable = false;
    /** The UI says it is still loading. */
    bool busy = true;
    /** The focused field's state, as JSON: where a platform's text input goes. */
    std::string textInput;
  };
  /** On the render thread, once a frame. */
  Frame takeFrame();
  /** A display refresh: runs the UI's animation frames. */
  void refresh(double nowMs);
  /** The GPU lost the atlas (a new device): every page comes again. */
  void resendAtlas();

  /** All of these take effect on the UI's thread, in order, from any thread. */
  void pointer(const PointerEvent& event);
  void key(const KeyEvent& event);
  /** Text the keyboard typed into the focused field. */
  void typed(std::string text);
  /** A platform text input's edit: {value,selectionStart,selectionEnd,submit?},
   * selections in UTF-16 units. */
  void edit(nlohmann::json edit);
  /** The window's new size, in points, and its device pixels per point. */
  void resize(float width, float height, float scale);
  /** Safe screen edges and keyboard overlap, in window points. */
  void setInsets(float top, float right, float bottom, float left,
                 float keyboardHeight);
  void setReducedMotion(bool reduced);
  /** Every controller's state, as JSON (kit/input/pad_types.ts GamepadSnapshot):
   * what the kit's useGamepad reads. */
  void gamepads(std::string json);
  /** The camera's column-major view-projection, for labels anchored in the
   * game's world. */
  void setProjection(const std::array<double, 16>& matrix);
  /** A frozen clock's time, or null to run. Waits for the frame it makes, at
   * `nowMs` when running. */
  void setClock(std::optional<double> ms, double nowMs);

  /** The engine again, on new bytecode and looks. Tokens are kept when empty. */
  void reload(std::vector<std::uint8_t> bytecode, std::string tokens = {});

  /** The view and the engine, for what the above does not cover. The view is
   * the UI's thread's alone. The engine is null but from `start` to `stop`,
   * and while the bundle's first run is still starting it up. */
  View& view();
  js::Host* host() const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bureau
