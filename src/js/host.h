#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace facebook::jsi {
class Runtime;
}  // namespace facebook::jsi

namespace bureau::js {

// The JavaScript host: pinned Hermes
// through JSI on a thread of its own, with the timers, frames and microtasks
// React and the client schedule on. All engine work stays on that thread;
// other threads post tasks to it.
class Host {
 public:
  static constexpr int executionContextId = 1;
  using Task = std::function<void(facebook::jsi::Runtime&)>;

  struct Options {
    /** Timers follow the steady clock and frames come from `frame`; without
     * it the caller moves the clock with `advance`, as the tests do. */
    bool realClock = false;
    /** Installs the program's own globals before the bundle runs, again
     * after every reload. */
    Task install;
    /** Lets go of what `install` kept of the runtime, while it still exists:
     * before a reload and at the end. */
    Task uninstall;
    /** After each turn of the loop, on the engine's thread: what the host
     * does with what the turn changed (Bureau lays out and paints). */
    std::function<void(facebook::jsi::Runtime&, double nowMs)> afterTurn;
    std::function<void(const std::string&)> onError;
    /** A debug Hermes build serves this source through its inspector. */
    std::string sourceUrl = "bundle.hbc";
    bool debugger = false;
  };

  explicit Host(std::vector<uint8_t> bytecode);
  Host(std::vector<uint8_t> bytecode, Options options);
  ~Host();
  Host(const Host&) = delete;
  Host& operator=(const Host&) = delete;

  /** The virtual clock: runs what is due at `now_ms`, frames included. */
  void advance(double now_ms);
  /** The real clock: a display refresh, which runs the frame callbacks. */
  void frame(double now_ms);
  /** Runs `task` on the engine's thread, soon; from any thread. */
  void post(Task task, std::string tag = {});
  struct Timings {
    std::uint64_t turns = 0;
    double lastTurnMs = 0;
    double meanTurnMs = 0;
    double maxTurnMs = 0;
    std::uint64_t tickTurns = 0;
    double lastTickTurnMs = 0;
  };
  /** Wall time while a turn runs, including its microtasks and UI layout. */
  Timings timings() const;
  /** Runs `task` on the engine's thread and waits for it; `tag` names it as
   * `post`'s does. */
  void invoke(Task task, std::string tag = "invoke");
  /** The engine again, on the same bundle: the client's location.reload. */
  void reload();
  /** Asks for a reload from the engine's own thread, after this turn. */
  void requestReload();
  /** The engine again, soon, on new bytecode that later reloads keep. */
  void reloadBundle(std::vector<uint8_t> bytecode);
  std::vector<std::string> take_commits();
  std::string take_error();
  /** Hermes's sampling profiler, its trace written at `path` in Chrome's
   * format. Each answers why it failed, or nothing; a stop into a file that
   * cannot be opened keeps sampling. */
  std::string start_profile();
  std::string stop_profile(const std::string& path);
  /** CDP transport may call these while the runtime is paused. */
  void debuggerCommand(std::string message);
  std::vector<std::string> takeDebuggerMessages();
  /** The engine's clock, in milliseconds since it started. */
  double now() const;
  /** How long the running turn has taken so far, from any thread; 0 when
   * the engine waits for work. */
  double busyMs() const;
  /** What the running turn is in, from any thread: a posted or invoked
   * task's tag ("untagged task" for a post without one), the host's own
   * ("reload", "take commits", "debugger"...), "animation frames", "timers"
   * or "after turn" (layout and paint); with the tasks it took and how many
   * have run. A stall is one slow step, or a burst of hundreds of tasks. */
  struct Turn {
    std::string step;
    /** The timer, immediate or frame callback the step is in, by its
     * function's name ("anonymous" without one); empty outside them. React's
     * scheduler is "performWorkUntilDeadline". */
    std::string callback;
    std::size_t tasks = 0;
    std::size_t tasksRun = 0;
    /** How long the step has run; the rest of the turn went to the steps
     * before it. */
    double stepMs = 0;
  };
  Turn turn() const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bureau::js
