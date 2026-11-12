#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include <jsi/jsi.h>

#include "../src/js/host.h"
#include "../src/tree/tree.h"

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <future>
#include <iterator>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

namespace {

std::vector<uint8_t> read_bytes(const char* path) {
  std::ifstream file(path, std::ios::binary);
  REQUIRE(file.good());
  return {std::istreambuf_iterator<char>{file}, {}};
}

bureau::js::Host::Options literal_options() {
  bureau::js::Host::Options options;
  options.install = [](facebook::jsi::Runtime& runtime) {
    // The reconciler's platform reads startup directives, and the store's
    // achievements (none here), when its bundle loads.
    facebook::jsi::Object native(runtime);
    native.setProperty(runtime, "startupQuery",
        facebook::jsi::Function::createFromHostFunction(runtime,
            facebook::jsi::PropNameID::forAscii(runtime, "startupQuery"), 0,
            [](facebook::jsi::Runtime& runtime, const facebook::jsi::Value&,
                const facebook::jsi::Value*, size_t) -> facebook::jsi::Value {
              return facebook::jsi::String::createFromAscii(runtime, "");
            }));
    native.setProperty(runtime, "storeAchievements",
        facebook::jsi::Function::createFromHostFunction(runtime,
            facebook::jsi::PropNameID::forAscii(runtime, "storeAchievements"),
            0,
            [](facebook::jsi::Runtime&, const facebook::jsi::Value&,
                const facebook::jsi::Value*, size_t) -> facebook::jsi::Value {
              return facebook::jsi::Value::null();
            }));
    runtime.global().setProperty(runtime, "__native", std::move(native));
  };
  return options;
}

}  // namespace

TEST_CASE("a timer commits the literal React tree to Bureau's node table") {
  bureau::js::Host host(read_bytes(BUREAU_LITERAL_BUNDLE), literal_options());
  const auto error = host.take_error();
  INFO(error);
  REQUIRE(error.empty());
  host.advance(0);
  const auto commits = host.take_commits();
  REQUIRE(commits.size() == 1);

  const auto stream = nlohmann::json::parse(commits[0]);
  const auto operations = stream.at("operations").get<std::vector<int32_t>>();
  const auto strings = stream.at("strings").get<std::vector<std::string>>();
  bureau::Tree tree;
  REQUIRE(tree.apply(operations.data(), operations.size(), strings));
  REQUIRE(tree.roots().size() == 1);
  const auto* box = tree.node(tree.roots()[0]);
  REQUIRE(box != nullptr);
  CHECK(box->type == "bureau-box");
  CHECK(box->props.at("id") == "literal");
  REQUIRE(box->children.size() == 1);
  CHECK(tree.node(box->children[0])->text == "Cash");
  CHECK(host.take_error().empty());
}

TEST_CASE("reload runs the same bytecode on a fresh runtime") {
  bureau::js::Host host(read_bytes(BUREAU_LITERAL_BUNDLE), literal_options());
  const auto error = host.take_error();
  INFO(error);
  REQUIRE(error.empty());
  host.advance(0);
  const auto first = host.take_commits();
  REQUIRE(first.size() == 1);
  host.reload();
  host.advance(0);
  CHECK(host.take_commits() == first);
  CHECK(host.take_error().empty());
}

TEST_CASE("a bytecode version mismatch names both versions") {
  auto bundle = read_bytes(BUREAU_LITERAL_BUNDLE);
  const int supported = bundle[8];
  bundle[8] += 1;
  bureau::js::Host host(bundle);
  const std::string error = host.take_error();
  CHECK(error.find("bytecode version " + std::to_string(supported + 1)) !=
        std::string::npos);
  CHECK(error.find("runtime version " + std::to_string(supported)) !=
        std::string::npos);
}

TEST_CASE("lowered let-loop closures keep their own iteration values") {
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE));
  CHECK(host.take_commits() == std::vector<std::string>{"0,1,2"});
  CHECK(host.take_error().empty());
}

TEST_CASE("immediates and their promise jobs run before a due timer") {
  bureau::js::Host host(read_bytes(BUREAU_SCHEDULER_BUNDLE));
  host.advance(0);
  CHECK(host.take_commits() ==
        std::vector<std::string>{"immediate", "microtask", "queued", "timer"});
  host.advance(17);
  CHECK(host.take_commits() ==
        std::vector<std::string>{"frame:17", "interval"});
  host.advance(34);
  CHECK(host.take_commits().empty());
  CHECK(host.take_error().empty());
}

TEST_CASE("a real clock stamps frames with performance.now()'s time") {
  bureau::js::Host::Options options;
  options.realClock = true;
  bureau::js::Host host(read_bytes(BUREAU_SCHEDULER_BUNDLE), options);
  // A shell's display clock, which started long before the host's.
  host.frame(1'000'000);
  const auto commits = host.take_commits();
  const auto frame = std::find_if(commits.begin(), commits.end(),
      [](const std::string& commit) { return commit.starts_with("frame:"); });
  REQUIRE(frame != commits.end());
  CHECK(std::stod(frame->substr(6)) < 10'000);
  CHECK(host.take_error().empty());
}

TEST_CASE("Unicode case mapping normalization and the committed collation "
          "lists and formatting fixtures") {
  bureau::js::Host host(read_bytes(BUREAU_UNICODE_BUNDLE));
  REQUIRE(host.take_error().empty());
  const auto commits = host.take_commits();
  REQUIRE(commits.size() == 1);
  const auto result = nlohmann::json::parse(commits[0]);
  CHECK(result.at("upper") == nlohmann::json::array({"Ä", "Ł", "SS", "İ"}));
  CHECK(result.at("lower") ==
        nlohmann::json::array({"ä", "ł", "ß", "i\u0307"}));
  CHECK(result.at("normalized") ==
        nlohmann::json::array({"e\u0301", "ABC123", "fi"}));
  CHECK(result.at("collation") == result.at("expectedCollation"));
  CHECK(result.at("formatting") == result.at("expectedFormatting"));
}

TEST_CASE("a held turn names the posted task's tag to another thread") {
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE));
  std::promise<void> entered;
  std::promise<void> release;
  auto ready = entered.get_future();
  auto held = release.get_future();
  host.post([&](facebook::jsi::Runtime&) {
    entered.set_value();
    held.wait();
  }, "tickEvents");
  ready.wait();
  const auto turn = host.turn();
  release.set_value();
  CHECK(turn.step == "tickEvents");
  CHECK(turn.tasks == 1);
  CHECK(turn.tasksRun == 0);
  CHECK(host.take_error().empty());
}

TEST_CASE("a held turn names an invoked task's tag to another thread") {
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE));
  std::promise<void> entered;
  std::promise<void> release;
  auto ready = entered.get_future();
  auto held = release.get_future();
  auto invoked = std::async(std::launch::async, [&] {
    host.invoke([&](facebook::jsi::Runtime&) {
      entered.set_value();
      held.wait();
    }, "suspend");
  });
  ready.wait();
  const auto turn = host.turn();
  release.set_value();
  invoked.wait();
  CHECK(turn.step == "suspend");
}

TEST_CASE("a held turn names a post without a tag an untagged task") {
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE));
  std::promise<void> entered;
  std::promise<void> release;
  auto ready = entered.get_future();
  auto held = release.get_future();
  host.post([&](facebook::jsi::Runtime&) {
    entered.set_value();
    held.wait();
  });
  ready.wait();
  const auto turn = host.turn();
  release.set_value();
  CHECK(turn.step == "untagged task");
  CHECK(host.take_error().empty());
}

TEST_CASE("a held timer names its callback to another thread") {
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE));
  std::promise<void> entered;
  std::promise<void> release;
  auto ready = entered.get_future();
  auto held = release.get_future();
  host.invoke([&](facebook::jsi::Runtime& runtime) {
    auto refreshClock = facebook::jsi::Function::createFromHostFunction(
        runtime, facebook::jsi::PropNameID::forAscii(runtime, "refreshClock"),
        0,
        [&](facebook::jsi::Runtime&, const facebook::jsi::Value&,
            const facebook::jsi::Value*, size_t) {
          entered.set_value();
          held.wait();
          return facebook::jsi::Value::undefined();
        });
    runtime.global()
        .getPropertyAsFunction(runtime, "setTimeout")
        .call(runtime, refreshClock, 0);
  });
  auto advanced = std::async(std::launch::async, [&] { host.advance(0); });
  ready.wait();
  const auto turn = host.turn();
  release.set_value();
  advanced.wait();
  CHECK(turn.step == "timers");
  CHECK(turn.callback == "refreshClock");
  CHECK(host.take_error().empty());
}

TEST_CASE("a held frame names its callback's microtasks apart from it") {
  bureau::js::Host::Options options;
  options.realClock = true;
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE), options);
  std::promise<void> entered;
  std::promise<void> release;
  auto ready = entered.get_future();
  auto held = release.get_future();
  host.invoke([&](facebook::jsi::Runtime& runtime) {
    runtime.global().setProperty(
        runtime, "render",
        facebook::jsi::Function::createFromHostFunction(
            runtime, facebook::jsi::PropNameID::forAscii(runtime, "render"),
            0,
            [&](facebook::jsi::Runtime&, const facebook::jsi::Value&,
                const facebook::jsi::Value*, size_t) {
              entered.set_value();
              held.wait();
              return facebook::jsi::Value::undefined();
            }));
    auto drawCity = facebook::jsi::Function::createFromHostFunction(
        runtime, facebook::jsi::PropNameID::forAscii(runtime, "drawCity"), 1,
        [](facebook::jsi::Runtime& runtime, const facebook::jsi::Value&,
           const facebook::jsi::Value*, size_t) {
          runtime.queueMicrotask(
              runtime.global().getPropertyAsFunction(runtime, "render"));
          return facebook::jsi::Value::undefined();
        });
    runtime.global()
        .getPropertyAsFunction(runtime, "requestAnimationFrame")
        .call(runtime, drawCity);
  });
  host.frame(0);
  ready.wait();
  const auto turn = host.turn();
  release.set_value();
  CHECK(turn.step == "animation frames");
  CHECK(turn.callback == "drawCity > microtasks");
  CHECK(host.take_error().empty());
}

TEST_CASE("a held turn times its step apart from the steps before it") {
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE));
  std::promise<void> blocking;
  std::promise<void> unblock;
  std::promise<void> entered;
  std::promise<void> release;
  auto blocked = blocking.get_future();
  auto unblocked = unblock.get_future();
  auto ready = entered.get_future();
  auto held = release.get_future();
  host.post([&](facebook::jsi::Runtime&) {
    blocking.set_value();
    unblocked.wait();
  });
  blocked.wait();
  // Queued behind the blocking turn, both run in the next one.
  host.post([](facebook::jsi::Runtime&) {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }, "worldLoaded");
  host.post([&](facebook::jsi::Runtime&) {
    entered.set_value();
    held.wait();
  }, "tickEvents");
  unblock.set_value();
  ready.wait();
  const auto turn = host.turn();
  const double busyMs = host.busyMs();
  release.set_value();
  REQUIRE(turn.tasks == 2);
  CHECK(turn.step == "tickEvents");
  CHECK(turn.callback.empty());
  CHECK(busyMs - turn.stepMs >= 50);
  CHECK(turn.slowestStep == "worldLoaded");
  CHECK(turn.slowestStepMs >= 50);
  CHECK(host.take_error().empty());
}

TEST_CASE("a profile stopped into a folder that exists writes a trace") {
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE));
  const auto path =
      std::filesystem::temp_directory_path() / "bureau-js-profile.json";
  host.start_profile();
  host.stop_profile(path.string());
  CHECK(std::filesystem::file_size(path) > 0);
  std::filesystem::remove(path);
}

TEST_CASE("a profile stopped into a missing folder answers why") {
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE));
  host.start_profile();
  CHECK_FALSE(host.stop_profile("/no-such-folder/profile.json").empty());
}

#if BUREAU_ENABLE_DEBUGGER
TEST_CASE("a busy VM coalesces missed display refreshes") {
  bureau::js::Host::Options options;
  options.realClock = true;
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE), options);
  host.take_commits();
  host.invoke([](facebook::jsi::Runtime& runtime) {
    runtime.evaluateJavaScript(std::make_shared<facebook::jsi::StringBuffer>(
        "function draw() { __bureauCommit('frame'); requestAnimationFrame(draw); }"
        "requestAnimationFrame(draw);"), "frames.js");
  });
  std::promise<void> entered;
  std::promise<void> release;
  auto ready = entered.get_future();
  auto held = release.get_future();
  host.post([&](facebook::jsi::Runtime&) {
    entered.set_value();
    held.wait();
  });
  ready.wait();
  host.frame(10);
  host.frame(20);
  host.frame(30);
  release.set_value();
  CHECK(host.take_commits() == std::vector<std::string>{"frame"});
  host.frame(40);
  CHECK(host.take_commits() == std::vector<std::string>{"frame"});
  CHECK(host.take_error().empty());
}

TEST_CASE("the developer VM compiles source for native evaluation") {
  bureau::js::Host::Options options;
  options.debugger = true;
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE), options);
  double answer = 0;
  host.invoke([&](facebook::jsi::Runtime& runtime) {
    answer = runtime.evaluateJavaScript(
        std::make_shared<facebook::jsi::StringBuffer>("6 * 7"), "eval.js").asNumber();
  });
  CHECK(answer == 42);
  CHECK(host.take_error().empty());
}

// native.eval's wrapper runs its code so, statements and all.
TEST_CASE("the developer VM's indirect eval answers the last statement") {
  bureau::js::Host::Options options;
  options.debugger = true;
  bureau::js::Host host(read_bytes(BUREAU_CLOSURE_BUNDLE), options);
  double answer = 0;
  host.invoke([&](facebook::jsi::Runtime& runtime) {
    answer = runtime.evaluateJavaScript(
        std::make_shared<facebook::jsi::StringBuffer>(
            "(0, eval)('const six = 6; six * 7')"), "eval.js").asNumber();
  });
  CHECK(answer == 42);
}
#endif
