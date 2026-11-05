// Bureau's view of the UI: the
// node table React commits into, laid out by Yoga, painted into a display
// list, and answering input and the host API.
//
// One thread owns a view: the JavaScript thread, so a measure after a commit
// sees that commit laid out. The main thread draws the display lists it
// publishes.
#pragma once

#include <nlohmann/json.hpp>

#include <array>
#include <cmath>
#include <cstdint>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "atlas.h"
#include "bureau/display.h"
#include "bureau/input.h"
#include "images.h"
#include "paragraph.h"
#include "tokens.h"
#include "tree.h"

namespace bureau {

struct UiRect {
  float x = 0;
  float y = 0;
  float width = 0;
  float height = 0;
  bool contains(float px, float py) const {
    return px >= x && py >= y && px < x + width && py < y + height;
  }
};

/** Calls into JavaScript: a node's handler (`onPress`, `onKey`...) through the
 * reconciler, or, for node 0, the host's own listeners (`__focus`,
 * `__keys`...). Answers what the handler returned. */
using Dispatch = std::function<nlohmann::json(
    int node, std::string_view handler, const nlohmann::json& args)>;

class View {
 public:
  using Reader = std::function<std::shared_ptr<const std::vector<uint8_t>>(
      const std::string& path)>;
  explicit View(Reader read);
  ~View();
  View(const View&) = delete;
  View& operator=(const View&) = delete;

  bool loadTokens(std::string_view json);
  void setDispatch(Dispatch dispatch) { dispatch_ = std::move(dispatch); }
  void setLanguage(const std::string& language);
  /** The window, in points, and its device pixels per point. */
  void setViewport(float width, float height, float screenScale);
  void setInsets(float top, float right, float bottom, float left,
                 float keyboardHeight);
  nlohmann::json safeArea() const;
  /** Atlas pages of `size` texels a side, and how many it holds before a frame
   * bakes afresh. Drops what the atlas holds. */
  void setAtlas(int size, int pageBudget);
  /** Text in one bit of coverage, with its pens on whole pixels. */
  void setMonochromeText(bool monochrome);
  /** The UI scale setting, 0.75 to 2: the UI's pixels per point. */
  void setUiScale(float scale);
  void setInputMode(const std::string& mode);
  void setGamepadConnected(bool connected);
  /** A second key that acts as Escape, as `KeyboardEvent.code` or a side
   * mouse button ("Mouse4"); empty for none. */
  void setCancelKey(const std::string& code) { cancelCode_ = code; }
  /** The player asked the system for less motion: every animation shows
   * one still picture (anim.h stillAnimation) and sprites their first frame. */
  void setReducedMotion(bool reduced) {
    reducedMotion_ = reduced;
    paintDirty_ = true;
  }

  /** One React commit's operations. False when the stream is broken. */
  bool commit(const int32_t* operations, size_t count,
              const std::vector<std::string>& strings);
  /** Forgets the tree: the engine reloaded. */
  void clear();

  /** An event in window points. The host hears `__cursor` in UI pixels, as
   * it lays out; `__surface` keeps window points, the game's own units. */
  void pointer(const PointerEvent& event);
  void key(const KeyEvent& event);
  /** Text typed into the focused field. */
  void typed(const std::string& text);
  nlohmann::json textInput();
  void editText(const nlohmann::json& edit);
  /** A game's event updates bindings without a React commit. */
  void event(const nlohmann::json& frame);
  /** Forgets what the events said: what they described is gone. */
  void clearEvents();

  /** Steps what animates, lays out and paints what changed. True when a
   * new display list was made. */
  bool frame(double nowMs);
  std::shared_ptr<const DisplayList> displayList() const { return list_; }
  std::vector<AtlasUpload> takeUploads() { return atlas_.takeUploads(); }
  /** Every atlas page whole, for a GPU that lost what it held. */
  std::vector<AtlasUpload> atlasPages() const { return atlas_.everything(); }
  /** Something moves by the clock: frames are owed while it does. */
  bool animating() const {
    const bool scrollbarHeld = !press_.scrollPart.empty() &&
                               press_.scrollPart != "thumb";
    const bool isRepaintDue = std::isfinite(repaintAtMs_);
    return isRepaintDue || coast_.node != 0 || scrollbarHeld ||
           press_.undecided();
  }
  /** The pointer is over a box that presses: the cursor a hand. */
  bool pointerOverPress() const { return pointerOverPress_; }
  /** The window's wait cursor: true until declared, or while a visible
   * attached node declares true. This never changes input handling. */
  bool windowBusy() const;

  // The host API (primitives/host.ts), in UI pixels.
  std::optional<UiRect> measure(int node);
  /** UI pixels on the screen per pixel the node lays out in: 1 unless a box
   * that scales what it holds down (`scaleBelow`) holds it. */
  float scaleOf(int node);
  std::vector<int> focusables(int root, bool visibleOnly);
  std::vector<int> navigable(const std::string& grid, bool sequential);
  bool isNavigable(int node) const;
  void focus(int node, bool preventScroll);
  void blur(int node);
  int focused() const { return focused_; }
  bool contains(int root, int node) const;
  bool connected(int node) const;
  int toolbar(int node) const;
  void scrollIntoView(int node);
  void scrollBy(int node, float x, float y);
  int horizontalScroller(int root, int from);
  nlohmann::json control(int node) const;
  void press(int node);
  void setControlValue(int node, const std::string& value);
  void selectText(int node);
  float measureText(const std::string& style, const std::string& text);
  UiRect viewport() const;
  /** In the node's own pixels. */
  nlohmann::json contentExtent(int node);
  void markNavigable(int node, const std::string& grid, bool on);
  int find(const std::string& id) const;
  void placeLayer(int node, float x, float y);
  float uiScale() const { return uiScale_; }
  /** The game's own surface: pointer input over it goes to the game rather
   * than the UI (`__surface`). */
  void setSurface(int node) { surface_ = node; }
  void setProjection(const std::array<double, 16>& matrix);

  /** What a point in window points hits, with its placed ancestors: each id,
   * type, rectangle and props. The harness's eyes. */
  nlohmann::json probe(float x, float y);

  /** Where the pointer is, in UI pixels. */
  float pointerX() const { return pointerX_; }
  float pointerY() const { return pointerY_; }

 private:
  struct Place;
  struct Live;
  struct Context;
  struct PaintState;

  void deliverKey(KeyEvent event);

  // Tree and inheritance (view.cpp). The placement tree is the committed
  // tree with each Layer moved under its target, the UI root by default:
  // where it lays out, paints and takes input.
  const Node* node(int id) const { return tree_.node(id); }
  void ensurePlacementTree() const;
  int placedParent(int id) const;
  std::vector<int> placedChildren(int id) const;
  std::vector<int> layers() const;
  std::vector<int> stickyChildren(int context) const;
  bool isLayer(int id) const;
  bool boxHasPress(const Node& box) const;
  /** The box's onPress, told whether a finger made it: only a finger leaves
   *  the player without a hover to read a tooltip. */
  void callPress(int id, const Node& box, bool touch);
  bool canFocus(int id) const;
  bool disabledWithin(int id) const;
  style::Chrome chromeOf(int id) const;
  std::string typeStyleNameOf(int id) const;
  const style::TypeStyle* typeOf(int id) const;
  std::optional<style::Color> inkOf(int id) const;
  struct BoxState {
    bool hover = false;
    bool focused = false;
    bool focusWithin = false;
    bool selected = false;
    bool pressed = false;
    bool latched = false;
    bool disabled = false;
  };
  BoxState stateOf(int id) const;
  style::LookState lookStateOf(int id) const;
  /** How a node shows its own focus: not at all, the keyboard's dotted ring,
   * or the pad's band. */
  enum class FocusMark { None, Dotted, Band };
  FocusMark focusMarkOf(int id) const;

  // Layout (view_layout.cpp).
  void ensureLayout();
  void layoutTree();
  /** A Text's runs: all its children's, or `only` those of them. */
  void collectSpans(int text, std::vector<text::Span>& spans,
                    std::vector<int>& atoms,
                    const std::vector<int>* only = nullptr) const;
  /** A Text holding a block (a Box not set `inline`) lays out as a column,
   * as a div inside a span splits it into blocks. */
  bool holdsBlocks(int text) const;
  text::ParagraphOptions paragraphOptions(int text) const;

  // Paint (view_paint.cpp).
  void paint();
  void paintNode(int id, PaintState& state);
  void paintChild(int id, PaintState& state);
  void paintContext(int id, PaintState state);
  void paintBox(int id, const UiRect& rect, PaintState& state);
  void paintText(int id, const UiRect& rect, PaintState& state);
  void paintImage(int id, const UiRect& rect, PaintState& state);
  void paintField(int id, const UiRect& rect, PaintState& state);
  void paintPlot(int id, const UiRect& rect, PaintState& state);
  void paintScrollbars(int id, const UiRect& rect, PaintState& state);
  void paintFocusMark(int id, const UiRect& rect, PaintState& state);

  // Input (view_input.cpp).
  int hitTest(float x, float y) const;
  void updateHover(int target);
  bool dispatchKeyChain(int from, const KeyEvent& event);
  void editField(int id, const KeyEvent& event);
  void setFocus(int id, bool visible);
  int scrollTarget(int from, float dx, float dy) const;
  void scrollTo(int id, float x, float y, bool notify);
  void coastScroll(double elapsedMs);
  struct Scrollbar;
  Scrollbar scrollbar(int id, bool horizontal) const;
  bool beginScrollbar(int from, float x, float y);
  void moveScrollbar(float x, float y);
  void repeatScrollbar();
  /** onHoverMove for each box in React's chain that listens, in its pixels. */
  void callHoverMove(float x, float y);
  void focusUnder(int target);
  /** A finger inside a Scroll proved it is no scroll: it rested or lifted
   *  without travelling. It now does what any other pointer does on landing. */
  void settleFinger();
  void settleRestingFinger();

  nlohmann::json call(int nodeId, std::string_view handler,
                      const nlohmann::json& args = nlohmann::json::array());

  std::optional<std::array<double, 16>> projection_;
  Tree tree_;
  mutable std::uint64_t windowBusyRevision_ = 0;
  mutable bool windowBusy_ = true;
  mutable bool placementDirty_ = true;
  mutable std::set<std::string> boundEvents_;
  mutable std::unordered_map<std::string, int> namedNodes_;
  mutable std::unordered_map<int, int> placedParents_;
  mutable std::unordered_map<int, std::vector<int>> placedChildren_;
  mutable std::vector<int> layers_;
  mutable std::unordered_map<int, std::vector<int>> stickyContexts_;
  style::Tokens tokens_;
  text::FontLibrary fonts_;
  text::Typesetter typesetter_;
  ImageStore images_;
  Atlas atlas_;
  /** Pages past which paint() starts the atlas over. */
  int atlasPageBudget_ = kAtlasPageBudget;
  /** The least that budget is: a frame that bakes a lot only raises it. */
  int atlasPageFloor_ = kAtlasPageBudget;
  bool monochromeText_ = false;
  Dispatch dispatch_;
  std::string language_ = "en";

  float windowWidth_ = 1280;
  float windowHeight_ = 800;
  float screenScale_ = 1;
  float uiScale_ = 1;
  float insetTop_ = 0;
  float insetRight_ = 0;
  float insetBottom_ = 0;
  float insetLeft_ = 0;
  float keyboardHeight_ = 0;
  std::unordered_map<std::string, nlohmann::json> events_;
  std::map<int, PointerEvent> surfaceTouches_;
  std::optional<int> uiTouch_;
  /** While a pad is connected, whatever has focus wears the pad's band,
   * however the focus got there. */
  bool gamepadConnected_ = false;
  bool reducedMotion_ = false;
  std::string inputMode_ = "mouse";
  std::string cancelCode_;

  std::unordered_map<int, std::unique_ptr<Place>> places_;
  /** How far the last paint drew a node from its place (an animation's
   * translation, a pressed box's travel): its clip by its parent's shift,
   * its box by its own. Hit testing reads it so the pointer meets what it
   * sees. Unshifted nodes are absent. */
  struct PaintedShift {
    float clipDx = 0, clipDy = 0;
    float dx = 0, dy = 0;
  };
  std::unordered_map<int, PaintedShift> paintedShifts_;
  PaintedShift paintedShiftOf(int id) const;
  mutable std::unordered_map<int, Live> live_;
  /** Navigable marks the host set (markNavigable), by node: their grids. */
  std::unordered_map<int, std::set<std::string>> marks_;
  std::unordered_map<int, std::pair<float, float>> placedLayers_;
  bool layoutDirty_ = true;
  /** The last layout had a layer anchored in the world or along a street:
   * only then does a new projection move anything. */
  bool worldAnchored_ = false;
  bool paintDirty_ = true;
  /** When an animation, the caret or a sprite next changes what is drawn;
   * infinity while nothing on the clock does. */
  double repaintAtMs_ = std::numeric_limits<double>::infinity();
  double nowMs_ = 0;
  std::shared_ptr<const DisplayList> list_;
  std::uint64_t listVersion_ = 0;

  int focused_ = 0;
  /** Focus shows the dotted ring: after a key, or a click into a text field. */
  bool focusVisible_ = false;
  /** The last input was a key, not a pointer: a focus by script then shows
   * its ring. */
  bool keyboardLast_ = true;
  int hovered_ = 0;
  /** Whose hover looks show: the target and its placed ancestors. */
  std::vector<int> hoverChain_;
  /** Who hears onHoverChange: the target and its React ancestors. */
  std::vector<int> reactHoverChain_;
  /** A Text counts between two figures (TextProps.count): layout follows
   * the clock while it does. */
  mutable bool counting_ = false;
  bool selectAll_ = false;
  float pointerX_ = 0;
  float pointerY_ = 0;
  float presenceX_ = 0;
  float presenceY_ = 0;
  bool pointerOverPress_ = false;
  struct Press {
    int node = 0;
    int drag = 0;
    float startX = 0;
    float startY = 0;
    bool moved = false;
    bool touch = false;
    int scroll = 0;
    float scrollStartX = 0;
    float scrollStartY = 0;
    float scrollSampleX = 0;
    float scrollSampleY = 0;
    double scrollSampleMs = 0;
    float velocityX = 0;
    float velocityY = 0;
    std::string scrollPart;
    bool scrollHorizontal = false;
    double scrollRepeatMs = 0;
    double startMs = 0;
    bool settled = false;
    /** A finger inside a Scroll that may yet be starting a scroll. */
    bool undecided() const { return touch && scroll != 0 && !moved && !settled; }
  } press_;
  struct ScrollCoast {
    int node = 0;
    float velocityX = 0;
    float velocityY = 0;
  } coast_;
  int surface_ = 0;
  bool keyboardPress_ = false;
  /** When the caret last moved: it shows for half a second after. */
  double caretMovedMs_ = 0;
};

}  // namespace bureau
