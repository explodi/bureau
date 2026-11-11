#pragma once

#include <deque>
#include <mutex>

#include "bureau/input.h"

namespace bureau::js {

/**
 * The mouse's moves on their way to the UI's thread. One waits at a time and
 * a later move takes its place, so a thread that fell behind hears where the
 * pointer is, not everywhere it has been: every move it replayed would lay
 * the tree out again. Other input ends the wait, so nothing is heard out of
 * the order the player did it in.
 */
class PointerMoves {
 public:
  /** Keeps `move`: true when none was waiting, so a task must come take it. */
  bool hold(const PointerEvent& move) {
    std::lock_guard lock(mutex_);
    if (open_) {
      waiting_.back() = move;
      return false;
    }
    waiting_.push_back(move);
    open_ = true;
    return true;
  }

  /** The move for the task posted for it: they leave in the order held. */
  PointerEvent take() {
    std::lock_guard lock(mutex_);
    const PointerEvent move = waiting_.front();
    waiting_.pop_front();
    if (waiting_.empty()) open_ = false;
    return move;
  }

  /** Other input was posted: the next move waits behind it. */
  void seal() {
    std::lock_guard lock(mutex_);
    open_ = false;
  }

 private:
  std::mutex mutex_;
  std::deque<PointerEvent> waiting_;
  /** A later move may still take the last waiting one's place. */
  bool open_ = false;
};

}  // namespace bureau::js
