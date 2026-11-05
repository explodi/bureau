#include "anim.h"

#include <algorithm>
#include <cmath>
#include <utility>
#include <vector>

namespace bureau {
namespace {

using style::Easing;

float bezierAt(float t, float a, float b) {
  const float u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

float ease(const Easing& easing, float t) {
  if (easing.kind == Easing::Kind::Linear) return t;
  if (easing.kind == Easing::Kind::Steps) {
    if (easing.jumpNone) {
      if (easing.steps <= 1) return t >= 1 ? 1.0f : 0.0f;
      return std::min(1.0f, std::floor(t * easing.steps) /
                                static_cast<float>(easing.steps - 1));
    }
    return std::floor(t * easing.steps) / static_cast<float>(easing.steps);
  }
  // The curve's x for t by bisection, then its y there.
  float low = 0;
  float high = 1;
  float guess = t;
  for (int step = 0; step < 24; ++step) {
    const float x = bezierAt(guess, easing.x1, easing.x2);
    if (std::abs(x - t) < 1e-4f) break;
    if (x < t) {
      low = guess;
    } else {
      high = guess;
    }
    guess = (low + high) / 2;
  }
  return bezierAt(guess, easing.y1, easing.y2);
}

/** One property's value at `progress` from the frames that set it; the
 * box's own value where no frame stands at 0% or 100%. */
template <typename Read>
std::optional<float> interpolate(const std::vector<style::Keyframe>& frames,
                                 float progress, const Easing& easing,
                                 float rest, Read read) {
  struct Stop {
    float at;
    float value;
  };
  std::vector<Stop> stops;
  for (const auto& frame : frames) {
    const std::optional<float> value = read(frame);
    if (!value) continue;
    for (const float at : frame.at) stops.push_back(Stop{at / 100, *value});
  }
  if (stops.empty()) return std::nullopt;
  std::sort(stops.begin(), stops.end(),
            [](const Stop& a, const Stop& b) { return a.at < b.at; });
  if (stops.front().at > 0) stops.insert(stops.begin(), Stop{0, rest});
  if (stops.back().at < 1) stops.push_back(Stop{1, rest});
  for (size_t index = 0; index + 1 < stops.size(); ++index) {
    const Stop& from = stops[index];
    const Stop& to = stops[index + 1];
    if (progress > to.at && index + 2 < stops.size()) continue;
    const float span = to.at - from.at;
    const float local =
        span <= 0 ? 1 : std::clamp((progress - from.at) / span, 0.0f, 1.0f);
    return from.value + (to.value - from.value) * ease(easing, local);
  }
  return stops.back().value;
}

/** Where in a cycle (0 to 1) what an animation draws changes. */
struct Changes {
  /** Moments a value jumps: every frame, and each step of stepped easing. */
  std::vector<double> points;
  /** Spans in which a value moves smoothly: frames are owed throughout. */
  std::vector<std::pair<double, double>> moving;
};

Changes changesOf(const std::vector<style::Keyframe>& frames,
                  const Easing& easing) {
  using Read = std::optional<float> (*)(const style::Keyframe&);
  struct Property {
    Read read;
    float rest;
  };
  // What sampleAnimation interpolates, with the rest value interpolate uses.
  // rotateDeg is left out: nothing native draws it.
  static const Property kInterpolated[] = {
      {[](const style::Keyframe& f) { return f.translateX; }, 0},
      {[](const style::Keyframe& f) { return f.translateY; }, 0},
      {[](const style::Keyframe& f) { return f.translateXPercent; }, 0},
      {[](const style::Keyframe& f) { return f.translateYPercent; }, 0},
      {[](const style::Keyframe& f) { return f.scale; }, 1},
      {[](const style::Keyframe& f) { return f.scaleX; }, 1},
      {[](const style::Keyframe& f) { return f.opacity; }, 1},
      {[](const style::Keyframe& f) { return f.widthPercent; }, 100},
  };
  const bool isStepped = easing.kind == Easing::Kind::Steps;

  Changes changes;
  changes.points = {0, 1};
  for (const auto& frame : frames) {
    for (const float at : frame.at) changes.points.push_back(at / 100.0);
  }
  for (const Property& property : kInterpolated) {
    std::vector<std::pair<double, float>> stops;
    for (const auto& frame : frames) {
      const std::optional<float> value = property.read(frame);
      if (!value) continue;
      for (const float at : frame.at) stops.emplace_back(at / 100.0, *value);
    }
    if (stops.empty()) continue;
    std::sort(stops.begin(), stops.end());
    if (stops.front().first > 0) stops.insert(stops.begin(), {0, property.rest});
    if (stops.back().first < 1) stops.emplace_back(1, property.rest);
    for (size_t index = 0; index + 1 < stops.size(); ++index) {
      const auto& [from, fromValue] = stops[index];
      const auto& [to, toValue] = stops[index + 1];
      // Between equal values an eased value holds still.
      if (fromValue == toValue) continue;
      if (!isStepped) {
        changes.moving.emplace_back(from, to);
        continue;
      }
      for (int step = 1; step < easing.steps; ++step) {
        changes.points.push_back(from + (to - from) * step / easing.steps);
      }
    }
  }
  return changes;
}

/** From `phase`, the cycle's fraction until what is drawn next changes: 0
 * inside a moving span. A reversed (alternate) cycle meets it from the end. */
double untilNextChange(const Changes& changes, double phase, bool reversed) {
  const auto met = [reversed](double at) { return reversed ? 1 - at : at; };
  double next = 1;
  for (const auto& [from, to] : changes.moving) {
    const double start = std::min(met(from), met(to));
    const double end = std::max(met(from), met(to));
    if (start <= phase && phase < end) return 0;
    if (start > phase) next = std::min(next, start);
  }
  // A step landing a hair after `phase` is the step just taken.
  constexpr double kSameMoment = 1e-9;
  for (const double point : changes.points) {
    if (met(point) > phase + kSameMoment) next = std::min(next, met(point));
  }
  return next - phase;
}

/** A hold at `active` ms after it started: each value the latest moment's
 * at or before its place in the cycle, held until the next. */
AnimationSample sampleHold(const style::Animation& hold, double cycleMs,
                           double active) {
  AnimationSample sample;
  if (active < 0) {
    sample.untilChangeMs = -active;
    return sample;
  }
  const double phase = cycleMs > 0 ? std::fmod(active, cycleMs) : 0;
  double nextMs = cycleMs;
  for (const style::HoldMoment& moment : hold.holds) {
    if (moment.atMs > phase) {
      nextMs = std::min(nextMs, moment.atMs);
      continue;
    }
    const style::Keyframe& v = moment.values;
    if (v.translateX) sample.translateX = *v.translateX;
    if (v.translateY) sample.translateY = *v.translateY;
    if (v.translateXPercent) sample.translateXPercent = *v.translateXPercent;
    if (v.translateYPercent) sample.translateYPercent = *v.translateYPercent;
    if (v.scale) sample.scale = *v.scale;
    if (v.scaleX) sample.scaleX = *v.scaleX;
    if (v.opacity) sample.opacity = *v.opacity;
    if (v.widthPercent) sample.widthPercent = *v.widthPercent;
    if (v.hidden || v.shown) {
      sample.hidden = v.hidden.value_or(false) || !v.shown.value_or(true);
    }
    if (v.fill) sample.fill = v.fill;
    if (v.ink) sample.ink = v.ink;
    if (v.outlineColor) sample.outlineColor = v.outlineColor;
    if (v.ringColor) sample.ringColor = v.ringColor;
    if (v.ringOver) sample.ringOver = v.ringOver;
  }
  sample.untilChangeMs = nextMs - phase;
  return sample;
}

}  // namespace

std::optional<AnimationSample> sampleAnimation(const style::Tokens& tokens,
                                               const std::string& name,
                                               double elapsedMs,
                                               std::optional<double> delayMs,
                                               std::optional<double> durationMs) {
  const style::Animation* timing = tokens.animation(name);
  if (timing == nullptr) return std::nullopt;
  const auto* frames = &timing->frames;
  double duration = timing->tempo.empty() ? timing->durationMs
                                          : tokens.tempoMs(timing->tempo);
  if (durationMs) duration = *durationMs;
  const double delay = delayMs.value_or(timing->delayMs);
  if (!timing->holds.empty()) {
    return sampleHold(*timing, duration, elapsedMs - delay);
  }

  const Changes changes = changesOf(*frames, timing->easing);
  const auto untilChangeMs = [&](double phase, bool reversed) {
    return untilNextChange(changes, phase, reversed) * duration;
  };

  AnimationSample sample;
  const double active = elapsedMs - delay;
  float progress = 0;
  if (active < 0) {
    sample.untilChangeMs = -active;
    if (!timing->fillBackwards) return sample;
    progress = 0;
  } else if (duration <= 0) {
    if (!timing->fillForwards) return AnimationSample{};
    progress = 1;
  } else if (timing->infinite) {
    const double cycles = active / duration;
    const double cyclePhase = cycles - std::floor(cycles);
    const bool reversed =
        timing->alternate && static_cast<long>(std::floor(cycles)) % 2 == 1;
    progress = static_cast<float>(reversed ? 1 - cyclePhase : cyclePhase);
    sample.untilChangeMs = untilChangeMs(cyclePhase, reversed);
  } else if (active >= duration) {
    if (!timing->fillForwards) return AnimationSample{};
    progress = 1;
  } else {
    const double phase = active / duration;
    progress = static_cast<float>(phase);
    sample.untilChangeMs = untilChangeMs(phase, false);
  }

  const Easing& easing = timing->easing;
  using Frame = style::Keyframe;
  sample.translateX =
      interpolate(*frames, progress, easing, 0,
                  [](const Frame& f) { return f.translateX; })
          .value_or(0);
  sample.translateY =
      interpolate(*frames, progress, easing, 0,
                  [](const Frame& f) { return f.translateY; })
          .value_or(0);
  sample.translateXPercent =
      interpolate(*frames, progress, easing, 0,
                  [](const Frame& f) { return f.translateXPercent; })
          .value_or(0);
  sample.translateYPercent =
      interpolate(*frames, progress, easing, 0,
                  [](const Frame& f) { return f.translateYPercent; })
          .value_or(0);
  sample.scale = interpolate(*frames, progress, easing, 1,
                             [](const Frame& f) { return f.scale; })
                     .value_or(1);
  sample.scaleX = interpolate(*frames, progress, easing, 1,
                              [](const Frame& f) { return f.scaleX; })
                      .value_or(1);
  sample.opacity = interpolate(*frames, progress, easing, 1,
                               [](const Frame& f) { return f.opacity; });
  sample.widthPercent =
      interpolate(*frames, progress, easing, 100,
                  [](const Frame& f) -> std::optional<float> {
                    return f.widthPercent;
                  });
  // Discrete properties take the last frame at or before the progress.
  float shownAt = -1;
  for (const auto& frame : *frames) {
    for (const float at : frame.at) {
      if (at / 100 > progress + 1e-6f || at / 100 < shownAt) continue;
      if (frame.hidden || frame.shown) {
        sample.hidden =
            frame.hidden.value_or(false) || !frame.shown.value_or(true);
        shownAt = at / 100;
      }
      if (frame.fill) sample.fill = frame.fill;
      if (frame.ink) sample.ink = frame.ink;
      if (frame.outlineColor) sample.outlineColor = frame.outlineColor;
      if (frame.ringColor) sample.ringColor = frame.ringColor;
      if (frame.ringOver) sample.ringOver = frame.ringOver;
    }
  }
  return sample;
}

std::optional<AnimationSample> stillAnimation(const style::Tokens& tokens,
                                             const std::string& name) {
  const style::Animation* record = tokens.animation(name);
  if (record == nullptr) return std::nullopt;
  std::optional<AnimationSample> still;
  if (record->stillAtMs) {
    still = sampleAnimation(tokens, name, *record->stillAtMs, 0.0,
                            std::nullopt);
  } else if (record->fillForwards && !record->infinite) {
    // Long past its end: the frame it fills forwards with.
    still = sampleAnimation(tokens, name, 1e9, 0.0, std::nullopt);
  }
  if (still) still->untilChangeMs = std::numeric_limits<double>::infinity();
  return still;
}

}  // namespace bureau
