#pragma once

#include <cstdint>

namespace bureau::js {

/**
 * Nanoseconds the machine has spent awake, from an arbitrary start: the clock
 * behind performance.now(). It stops while the machine sleeps, so a game can
 * tell a sleep (the wall clock ran on alone) from a thread that stalled.
 * std::chrono::steady_clock runs on through sleep on macOS and Windows.
 */
std::int64_t awakeNanoseconds();

}  // namespace bureau::js
