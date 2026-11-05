// The kit's animations: each is a record of the token
// document's, its frames and how it plays them, sampled here.
#pragma once

#include <limits>
#include <optional>
#include <string>

#include "tokens.h"

namespace bureau {

/** What an animation does to its box at one moment. */
struct AnimationSample {
  float translateX = 0;
  float translateY = 0;
  /** Percentages of the box's own size. */
  float translateXPercent = 0;
  float translateYPercent = 0;
  float scale = 1;
  float scaleX = 1;
  /** Set while a frame animates it; it then replaces the box's own opacity. */
  std::optional<float> opacity;
  bool hidden = false;
  std::optional<std::string> fill;
  std::optional<std::string> ink;
  std::optional<float> widthPercent;
  /** The attention ring (tokens.h Keyframe). */
  std::optional<std::string> outlineColor;
  std::optional<std::string> ringColor;
  std::optional<std::string> ringOver;
  /** How long until what it draws next changes: 0 while it moves smoothly,
   * a step's remaining time while it holds one, infinity once it rests.
   * A stepped blink owes two paints a second, not sixty. */
  double untilChangeMs = std::numeric_limits<double>::infinity();
};

/** The animation `name` `elapsedMs` after it started, with the caller's
 * delay and duration where set (Box's animationDelayMs, animationDurationMs).
 * Nothing for a name the token document does not hold. */
std::optional<AnimationSample> sampleAnimation(const style::Tokens& tokens,
                                               const std::string& name,
                                               double elapsedMs,
                                               std::optional<double> delayMs,
                                               std::optional<double> durationMs);

/** The animation `name` held still, for reduced motion: its `stillAtMs`
 * moment if the record names one, the end of a play-once animation that
 * fills forwards, else nothing (the box at rest). It never repaints. */
std::optional<AnimationSample> stillAnimation(const style::Tokens& tokens,
                                             const std::string& name);

}  // namespace bureau
