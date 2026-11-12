// What a game's window reports, as Bureau reads it.
#pragma once

#include <string>

namespace bureau {

/** A pointer as the window reports it, in window points. */
struct PointerEvent {
  enum class Kind { Move, Down, Up, Cancel, Leave, Wheel };
  Kind kind = Kind::Move;
  float x = 0;
  float y = 0;
  /** 0 the primary button, 1 the middle, 2 the secondary, 3 and 4 the side
   * buttons (back, forward). */
  int button = 0;
  bool shift = false;
  /** The other modifiers, for a host that reads them (an editor's
   * Ctrl-click); a host that does not leaves them false. */
  bool control = false;
  bool alt = false;
  bool meta = false;
  bool touch = false;
  int id = 0;
  /** A wheel's travel, in points. */
  float deltaX = 0;
  float deltaY = 0;
  /** A wheel from a trackpad or another smooth surface rather than a
   * mouse's notches, as far as the host can tell. */
  bool precise = false;
};

/** A key: `key` what it types or does ("a", "Enter", "ArrowLeft"), `code` where
 * it sits on the keyboard ("KeyA"). */
struct KeyEvent {
  std::string key;
  std::string code;
  bool down = true;
  bool repeat = false;
  bool shift = false;
  bool control = false;
  bool alt = false;
  bool meta = false;
};

}  // namespace bureau
