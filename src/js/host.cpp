#include "host.h"

#include <hermes/hermes.h>
#include <jsi/jsi.h>
#if BUREAU_ENABLE_DEBUGGER
#include <hermes/cdp/CDPAgent.h>
#include <hermes/cdp/CDPDebugAPI.h>
#endif

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <deque>
#include <fstream>
#include <future>
#include <map>
#include <mutex>
#include <system_error>
#include <thread>
#include <utility>

namespace bureau::js {
namespace {

namespace jsi = facebook::jsi;
using facebook::hermes::HermesRuntime;
using facebook::hermes::IHermesRootAPI;

class BytecodeBuffer final : public jsi::Buffer {
 public:
  explicit BytecodeBuffer(std::vector<uint8_t> bytes)
      : bytes_(std::move(bytes)) {}
  size_t size() const override { return bytes_.size(); }
  const uint8_t* data() const override { return bytes_.data(); }

 private:
  std::vector<uint8_t> bytes_;
};

std::string bytecode_error(const std::vector<uint8_t>& bytes,
                           IHermesRootAPI& api) {
  const uint32_t supported = api.getBytecodeVersion();
  if (bytes.size() < 12) return "Hermes bytecode is too short";
  uint32_t supplied = 0;
  std::memcpy(&supplied, bytes.data() + 8, sizeof(supplied));
  if (supplied != supported) {
    return "Hermes bytecode version " + std::to_string(supplied) +
           " does not match runtime version " + std::to_string(supported);
  }
  if (!api.isHermesBytecode(bytes.data(), bytes.size())) {
    return "Hermes rejected bytecode version " + std::to_string(supplied);
  }
  return {};
}

/** Why a call into Hermes's sampling profiler failed, or nothing. Hermes's
 * std exceptions may not match this side's, so anything thrown counts. */
template <typename Call>
std::string profilerFailure(Call&& call) {
  try {
    call();
    return {};
  } catch (const std::exception& caught) {
    return caught.what();
  } catch (...) {
    return "Hermes's sampling profiler failed";
  }
}

// A microtask that throws ends the drain with a JSError: callers guard it,
// or it escapes the engine thread and terminates the program unreported.
void drain(jsi::Runtime& runtime) {
  while (!runtime.drainMicrotasks()) {
  }
}

std::int64_t steady_ns() {
  return std::chrono::duration_cast<std::chrono::nanoseconds>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}

/** A callback's function name, read before the callback runs. */
std::string name_of(jsi::Runtime& runtime, const jsi::Function& callback) {
  try {
    const jsi::Value name = callback.getProperty(runtime, "name");
    const std::string text =
        name.isString() ? name.getString(runtime).utf8(runtime) : "";
    return text.empty() ? "anonymous" : text;
  } catch (const std::exception&) {
    return "anonymous";
  }
}

}  // namespace

struct Host::Impl {
  Impl(std::vector<uint8_t> bytes, Options chosen)
      : bytecode(std::move(bytes)), options(std::move(chosen)) {
    started = std::chrono::steady_clock::now();
    worker = std::thread([this] { run(); });
    invoke([](jsi::Runtime&) {});
  }

  ~Impl() {
    debuggerCommand(R"({"id":0,"method":"Debugger.resume"})");
    {
      std::lock_guard lock(mutex);
      stopping = true;
    }
    wake.notify_one();
    worker.join();
  }

  struct Timer {
    int id;
    double due;
    double interval;
    bool animation_frame;
    jsi::Function callback;
  };

  std::vector<uint8_t> bytecode;
  Options options;
  std::chrono::steady_clock::time_point started;
  std::thread worker;
  std::mutex mutex;
  std::condition_variable wake;
  /** A queued task and the step a stall report names while it runs. */
  struct Queued {
    std::string step;
    std::function<void()> run;
  };
  std::deque<Queued> tasks;
  bool stopping = false;
  bool framePending = false;
  double pendingFrameTime = 0;
  std::unique_ptr<HermesRuntime> runtime;
  IHermesRootAPI* root_api = nullptr;
  std::map<int, Timer> timers;
  /** requestAnimationFrame's callbacks, run by the next display refresh. */
  std::map<int, jsi::Function> frames;
  std::deque<jsi::Function> immediate;
  std::vector<std::string> commits;
  std::string error;
  int next_timer_id = 1;
  int running_timer_id = 0;
  bool cancel_running_timer = false;
  bool reload_requested = false;
  double now_ms = 0;
  mutable std::mutex timingsMutex;
  Host::Timings timings;
  /** When the running turn began on the steady clock, 0 between turns. */
  std::atomic<std::int64_t> turnStartedNs{0};
  bool tickTagged = false;
  mutable std::mutex turnMutex;
  Host::Turn turn;
  /** When the running step began, on turnStartedNs's clock; under turnMutex. */
  std::int64_t stepStartedNs = 0;
  std::mutex debuggerMutex;
  std::mutex debuggerCommandMutex;
  std::vector<std::string> debuggerMessages;
#if BUREAU_ENABLE_DEBUGGER
  std::unique_ptr<facebook::hermes::cdp::CDPDebugAPI> debuggerApi;
  std::unique_ptr<facebook::hermes::cdp::CDPAgent> debuggerAgent;
#endif

  void startDebugger() {
#if BUREAU_ENABLE_DEBUGGER
    if (!options.debugger) return;
    std::lock_guard lock(debuggerCommandMutex);
    debuggerApi = facebook::hermes::cdp::CDPDebugAPI::create(*runtime);
    debuggerAgent = facebook::hermes::cdp::CDPAgent::create(
        Host::executionContextId, *debuggerApi,
        [this, current = runtime.get()](facebook::hermes::debugger::RuntimeTask task) {
          post("debugger", [this, task = std::move(task), current] {
            if (runtime.get() == current) task(*runtime);
          });
        },
        [this](const std::string& message) {
          std::lock_guard messagesLock(debuggerMutex);
          debuggerMessages.push_back(message);
        });
#endif
  }

  void stopDebugger() {
#if BUREAU_ENABLE_DEBUGGER
    std::lock_guard lock(debuggerCommandMutex);
    debuggerAgent.reset();
    debuggerApi.reset();
#endif
  }

  void debuggerCommand(std::string message) {
#if BUREAU_ENABLE_DEBUGGER
    std::lock_guard lock(debuggerCommandMutex);
    if (debuggerAgent) debuggerAgent->handleCommand(std::move(message));
#else
    (void)message;
#endif
  }

  double clock() const {
    if (!options.realClock) return now_ms;
    return std::chrono::duration<double, std::milli>(
               std::chrono::steady_clock::now() - started)
        .count();
  }

  void set_step(std::string step) {
    std::lock_guard lock(turnMutex);
    turn.step = std::move(step);
    turn.callback.clear();
    stepStartedNs = steady_ns();
  }

  void set_callback(const jsi::Function& callback) {
    std::string name = name_of(*runtime, callback);
    std::lock_guard lock(turnMutex);
    turn.callback = std::move(name);
  }

  void report(const std::string& message) {
    error = message;
    if (options.realClock) std::fprintf(stderr, "[js] %s\n", message.c_str());
    if (options.onError) options.onError(message);
  }

  template <typename Body>
  void guarded(Body&& body) {
    try {
      body();
    } catch (const jsi::JSError& caught) {
      report(caught.getMessage() + "\n" + caught.getStack());
    } catch (const std::exception& caught) {
      report(caught.what());
    }
  }

  void post(std::string step, std::function<void()> task) {
    {
      std::lock_guard lock(mutex);
      tasks.push_back({std::move(step), std::move(task)});
    }
    wake.notify_one();
  }

  void invoke(Task action, std::string step = "invoke") {
    std::promise<void> done;
    auto result = done.get_future();
    post(std::move(step), [&] {
      guarded([&] {
        if (runtime) action(*runtime);
      });
      done.set_value();
    });
    result.wait();
  }

  void set_function(const char* name, jsi::HostFunctionType body) {
    jsi::Runtime& js = *runtime;
    js.global().setProperty(
        js, name,
        jsi::Function::createFromHostFunction(
            js, jsi::PropNameID::forAscii(js, name), 0, std::move(body)));
  }

  int add_timer(jsi::Runtime& js, const jsi::Value* args, size_t count,
                bool repeat) {
    if (count == 0 || !args[0].isObject()) return 0;
    const double floor = repeat ? 1.0 : 0.0;
    const double delay =
        count > 1 && args[1].isNumber() ? std::max(floor, args[1].asNumber())
                                        : floor;
    const int id = next_timer_id++;
    timers.emplace(id, Timer{id, clock() + delay, repeat ? delay : 0, false,
                             args[0].asObject(js).asFunction(js)});
    return id;
  }

  void install_globals() {
    set_function("__bureauNow", [this](jsi::Runtime&, const jsi::Value&,
                                       const jsi::Value*, size_t) {
      return jsi::Value(clock());
    });
    set_function("__bureauCommit", [this](jsi::Runtime& js, const jsi::Value&,
                                          const jsi::Value* args, size_t count) {
      if (count > 0) commits.push_back(args[0].toString(js).utf8(js));
      return jsi::Value::undefined();
    });
    set_function("setImmediate", [this](jsi::Runtime& js, const jsi::Value&,
                                        const jsi::Value* args, size_t count) {
      if (count > 0 && args[0].isObject()) {
        immediate.push_back(args[0].asObject(js).asFunction(js));
      }
      return jsi::Value::undefined();
    });
    set_function("setTimeout", [this](jsi::Runtime& js, const jsi::Value&,
                                      const jsi::Value* args, size_t count) {
      return jsi::Value(add_timer(js, args, count, false));
    });
    set_function("setInterval", [this](jsi::Runtime& js, const jsi::Value&,
                                       const jsi::Value* args, size_t count) {
      return jsi::Value(add_timer(js, args, count, true));
    });
    const auto clear = [this](jsi::Runtime&, const jsi::Value&,
                              const jsi::Value* args, size_t count) {
      if (count > 0 && args[0].isNumber()) {
        const int id = static_cast<int>(args[0].asNumber());
        timers.erase(id);
        if (id == running_timer_id) cancel_running_timer = true;
      }
      return jsi::Value::undefined();
    };
    set_function("clearTimeout", clear);
    set_function("clearInterval", clear);
    set_function("requestAnimationFrame",
                 [this](jsi::Runtime& js, const jsi::Value&,
                        const jsi::Value* args, size_t count) {
                   if (count == 0 || !args[0].isObject()) return jsi::Value(0);
                   const int id = next_timer_id++;
                   auto callback = args[0].asObject(js).asFunction(js);
                   if (options.realClock) {
                     frames.emplace(id, std::move(callback));
                   } else {
                     timers.emplace(id, Timer{id, now_ms + 0.001, 0, true,
                                              std::move(callback)});
                   }
                   return jsi::Value(id);
                 });
    set_function("cancelAnimationFrame",
                 [this](jsi::Runtime&, const jsi::Value&,
                        const jsi::Value* args, size_t count) {
                   if (count > 0 && args[0].isNumber()) {
                     const int id = static_cast<int>(args[0].asNumber());
                     timers.erase(id);
                     frames.erase(id);
                   }
                   return jsi::Value::undefined();
                 });
    // The player VM has no compiler: install globals through JSI.
    auto& js = *runtime;
    jsi::Object performance(js);
    performance.setProperty(js, "now",
                            js.global().getProperty(js, "__bureauNow"));
    js.global().setProperty(js, "performance", std::move(performance));
    set_function("queueMicrotask", [](jsi::Runtime& js, const jsi::Value&,
                                      const jsi::Value* args, size_t count) {
      if (count > 0) js.queueMicrotask(args[0].asObject(js).asFunction(js));
      return jsi::Value::undefined();
    });
    jsi::Object console(js);
    for (const char* name : {"log", "warn", "error", "info", "debug"}) {
      console.setProperty(
          js, name,
          jsi::Function::createFromHostFunction(
              js, jsi::PropNameID::forAscii(js, name), 0,
              [](jsi::Runtime&, const jsi::Value&, const jsi::Value*, size_t) {
                return jsi::Value::undefined();
              }));
    }
    js.global().setProperty(js, "console", std::move(console));
    if (options.install) options.install(*runtime);
  }

  void teardown() {
    stopDebugger();
    if (runtime && options.uninstall) {
      guarded([&] { options.uninstall(*runtime); });
    }
    timers.clear();
    frames.clear();
    immediate.clear();
    runtime.reset();
  }

  void boot() {
    teardown();
    timers.clear();
    frames.clear();
    immediate.clear();
    commits.clear();
    error = bytecode_error(bytecode, *root_api);
    if (!options.realClock) now_ms = 0;
    next_timer_id = 1;
    if (!error.empty()) {
      report(error);
      return;
    }
    auto config = hermes::vm::RuntimeConfig::Builder()
                      .withMicrotaskQueue(true)
                      .build();
    runtime = facebook::hermes::makeHermesRuntime(config);
    startDebugger();
    install_globals();
    runtime->evaluateJavaScript(std::make_shared<BytecodeBuffer>(bytecode),
                                options.sourceUrl);
    drain(*runtime);
  }

  /** Immediates, then each timer due, oldest first, its microtasks after it. */
  void run_due(double time) {
    if (!runtime) return;
    // The immediates queued before this turn; theirs wait for the next, so
    // a scheduler that keeps yielding never holds the loop.
    for (size_t queued = immediate.size(); queued > 0 && !immediate.empty();
         --queued) {
      jsi::Function callback = std::move(immediate.front());
      immediate.pop_front();
      set_callback(callback);
      guarded([&] { callback.call(*runtime); });
      guarded([&] { drain(*runtime); });
    }
    for (;;) {
      auto due = std::min_element(timers.begin(), timers.end(),
                                  [](const auto& left, const auto& right) {
                                    return left.second.due < right.second.due;
                                  });
      if (due == timers.end() || due->second.due > time) break;
      Timer timer = std::move(due->second);
      timers.erase(due);
      running_timer_id = timer.id;
      cancel_running_timer = false;
      set_callback(timer.callback);
      guarded([&] {
        if (timer.animation_frame) {
          timer.callback.call(*runtime, time);
        } else {
          timer.callback.call(*runtime);
        }
      });
      guarded([&] { drain(*runtime); });
      running_timer_id = 0;
      if (timer.interval > 0 && !cancel_running_timer) {
        timer.due = time + timer.interval;
        timers.emplace(timer.id, std::move(timer));
      }
    }
  }

  void run_frames(double time) {
    if (!runtime) return;
    auto due = std::move(frames);
    frames.clear();
    for (auto& [id, callback] : due) {
      set_callback(callback);
      guarded([&] { callback.call(*runtime, time); });
      guarded([&] { drain(*runtime); });
    }
  }

  void after_turn() {
    if (reload_requested) {
      reload_requested = false;
      guarded([&] { boot(); });
    }
    if (options.afterTurn && runtime) {
      guarded([&] { options.afterTurn(*runtime, clock()); });
      guarded([&] { drain(*runtime); });
    }
  }

  void run() {
    guarded([&] {
      root_api = jsi::castInterface<IHermesRootAPI>(
          facebook::hermes::makeHermesRootAPI());
      boot();
    });

    for (;;) {
      std::deque<Queued> batch;
      {
        std::unique_lock lock(mutex);
        const auto ready = [this] { return stopping || !tasks.empty(); };
        if (options.realClock && runtime) {
          // Sleep until the next timer is due, or a task arrives.
          double next = -1;
          for (const auto& [id, timer] : timers) {
            if (next < 0 || timer.due < next) next = timer.due;
          }
          if (!immediate.empty()) next = clock();
          if (next >= 0) {
            const auto wait = std::chrono::duration<double, std::milli>(
                std::max(0.0, next - clock()));
            wake.wait_for(lock, wait, ready);
          } else {
            wake.wait(lock, ready);
          }
        } else {
          wake.wait(lock, ready);
        }
        if (stopping && tasks.empty()) break;
        batch.swap(tasks);
      }
      const auto turnStarted = std::chrono::steady_clock::now();
      turnStartedNs = std::chrono::duration_cast<std::chrono::nanoseconds>(
                          turnStarted.time_since_epoch())
                          .count();
      tickTagged = false;
      {
        std::lock_guard lock(turnMutex);
        turn = Host::Turn{
            .step = "", .callback = "", .tasks = batch.size(), .tasksRun = 0};
        stepStartedNs = turnStartedNs;
      }
      for (auto& task : batch) {
        set_step(std::move(task.step));
        guarded([&] { task.run(); });
        if (runtime) guarded([&] { drain(*runtime); });
        std::lock_guard lock(turnMutex);
        ++turn.tasksRun;
      }
      if (options.realClock) {
        set_step("timers");
        guarded([&] { run_due(clock()); });
        set_step("after turn");
        after_turn();
      }
      turnStartedNs = 0;
      const double elapsed = std::chrono::duration<double, std::milli>(
          std::chrono::steady_clock::now() - turnStarted).count();
      {
        std::lock_guard lock(timingsMutex);
        ++timings.turns;
        timings.lastTurnMs = elapsed;
        timings.meanTurnMs += (elapsed - timings.meanTurnMs) / timings.turns;
        timings.maxTurnMs = std::max(timings.maxTurnMs, elapsed);
        if (tickTagged) {
          ++timings.tickTurns;
          timings.lastTickTurnMs = elapsed;
        }
      }
    }
    teardown();
  }
};

Host::Host(std::vector<uint8_t> bytecode) : Host(std::move(bytecode), {}) {}
Host::Host(std::vector<uint8_t> bytecode, Options options)
    : impl_(std::make_unique<Impl>(std::move(bytecode), std::move(options))) {}
Host::~Host() = default;

void Host::debuggerCommand(std::string message) {
  impl_->debuggerCommand(std::move(message));
}

std::vector<std::string> Host::takeDebuggerMessages() {
  std::lock_guard lock(impl_->debuggerMutex);
  std::vector<std::string> messages;
  messages.swap(impl_->debuggerMessages);
  return messages;
}

void Host::advance(double now_ms) {
  impl_->invoke(
      [&](jsi::Runtime&) {
        impl_->now_ms = now_ms;
        impl_->run_due(now_ms);
      },
      "timers");
}

void Host::frame(double now_ms) {
  // The timestamp is on performance.now()'s clock: the client subtracts one
  // from the other to pace frames and time answers.
  const double time = impl_->options.realClock ? impl_->clock() : now_ms;
  {
    std::lock_guard lock(impl_->mutex);
    impl_->pendingFrameTime = time;
    // A busy VM draws the latest refresh; missed refreshes must not pile up.
    if (impl_->framePending) return;
    impl_->framePending = true;
    impl_->tasks.push_back({"animation frames", [this] {
      double latest;
      {
        std::lock_guard lock(impl_->mutex);
        latest = impl_->pendingFrameTime;
        impl_->framePending = false;
      }
      impl_->run_frames(latest);
    }});
  }
  impl_->wake.notify_one();
}

void Host::post(Task task, std::string tag) {
  const bool tick = tag == "tickEvents";
  std::string step = tag.empty() ? "untagged task" : std::move(tag);
  impl_->post(std::move(step), [this, task = std::move(task), tick] {
    if (tick) impl_->tickTagged = true;
    if (impl_->runtime) task(*impl_->runtime);
  });
}

Host::Timings Host::timings() const {
  std::lock_guard lock(impl_->timingsMutex);
  return impl_->timings;
}

void Host::invoke(Task task, std::string tag) {
  impl_->invoke(std::move(task), std::move(tag));
}

void Host::reload() {
  std::promise<void> done;
  auto result = done.get_future();
  impl_->post("reload", [&] {
    impl_->guarded([&] { impl_->boot(); });
    done.set_value();
  });
  result.wait();
}

void Host::requestReload() { impl_->reload_requested = true; }

void Host::reloadBundle(std::vector<uint8_t> bytecode) {
  impl_->post("reload", [this, bytecode = std::move(bytecode)]() mutable {
    impl_->bytecode = std::move(bytecode);
    impl_->guarded([&] { impl_->boot(); });
  });
}

std::vector<std::string> Host::take_commits() {
  std::vector<std::string> result;
  std::promise<void> done;
  auto finished = done.get_future();
  impl_->post("take commits", [&] {
    result.swap(impl_->commits);
    done.set_value();
  });
  finished.wait();
  return result;
}

std::string Host::take_error() {
  std::string result;
  std::promise<void> done;
  auto finished = done.get_future();
  impl_->post("take error", [&] {
    result.swap(impl_->error);
    done.set_value();
  });
  finished.wait();
  return result;
}

std::string Host::start_profile() {
  // invoke runs nothing while no bundle has loaded.
  std::string failure = "No client is running";
  impl_->invoke(
      [this, &failure](jsi::Runtime&) {
        failure = profilerFailure([this] {
          // The profiler samples only the runtimes registered on their
          // thread: without this its trace is an empty file.
          impl_->runtime->registerForProfiling();
          impl_->root_api->enableSamplingProfiler(1000);
        });
      },
      "profile");
  return failure;
}

std::string Host::stop_profile(const std::string& path) {
  std::string failure = "No client is running";
  impl_->invoke([this, &path, &failure](jsi::Runtime&) {
    // Opened here: what Hermes throws for a file it cannot open does not
    // match this side's std::exception.
    std::ofstream trace(path, std::ios::binary);
    if (!trace) {
      // The profiler keeps sampling, for a stop into a path that can be.
      failure = "Cannot write " + path + ": " +
                std::generic_category().message(errno);
      return;
    }
    failure = profilerFailure([this, &trace] {
      impl_->root_api->disableSamplingProfiler();
      impl_->root_api->dumpSampledTraceToStream(trace);
      impl_->runtime->unregisterForProfiling();
    });
  }, "profile");
  return failure;
}

double Host::now() const { return impl_->clock(); }

double Host::busyMs() const {
  const std::int64_t started = impl_->turnStartedNs;
  if (started == 0) return 0;
  return static_cast<double>(steady_ns() - started) / 1e6;
}

Host::Turn Host::turn() const {
  if (impl_->turnStartedNs == 0) return {};
  std::lock_guard lock(impl_->turnMutex);
  Turn turn = impl_->turn;
  turn.stepMs = static_cast<double>(steady_ns() - impl_->stepStartedNs) / 1e6;
  return turn;
}

}  // namespace bureau::js
