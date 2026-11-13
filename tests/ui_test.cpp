#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include <jsi/jsi.h>

#include <atomic>
#include <chrono>
#include <fstream>
#include <functional>
#include <future>
#include <iterator>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <thread>

#include "bureau/bridge.h"
#include "bureau/ui.h"
#include "js/pointer_moves.h"
#include "view/view.h"

namespace {

namespace jsi = facebook::jsi;

bureau::PointerEvent moveTo(float x) {
  bureau::PointerEvent event;
  event.x = x;
  return event;
}

std::optional<std::string> readFile(const std::string& path) {
  std::ifstream file(path, std::ios::binary);
  if (!file.good()) return std::nullopt;
  return std::string(std::istreambuf_iterator<char>{file}, {});
}

/** A file whose read waits for the test (Game::slowDisk). */
const std::string kSlowFile = "/keyboards/readings.json";

/** A little game: the hello bundle, with its one function of its own. */
struct Game {
  std::atomic<int> pressed{0};
  /** What the UI's thread said it was doing inside the press's handler, and
   * inside the read of each path. */
  std::string doingInPress;
  std::mutex readsMutex;
  std::map<std::string, std::string> doingInRead;
  /** kSlowFile's read lasts until this is set: a disk taking its time. */
  std::promise<void> slowDisk;
  std::shared_future<void> slowDiskDone = slowDisk.get_future().share();
  std::shared_ptr<const bureau::DisplayList> list;
  std::unique_ptr<bureau::Ui> ui;

  explicit Game(int atlasSize = bureau::kAtlasSize, bool monochromeText = false) {
    bureau::Ui::Options options;
    options.atlasSize = atlasSize;
    options.monochromeText = monochromeText;
    const auto bytecode = readFile(BUREAU_HELLO_BUNDLE);
    REQUIRE(bytecode.has_value());
    options.bytecode.assign(bytecode->begin(), bytecode->end());
    options.tokens = readFile(BUREAU_TOKENS_JSON).value();
    options.readAsset = [this](const std::string& path) {
      if (ui) {
        std::lock_guard lock(readsMutex);
        doingInRead[path] = ui->doing();
      }
      // Bounded, so a read on the UI's thread fails the test, not hangs it.
      if (path == kSlowFile) slowDiskDone.wait_for(std::chrono::seconds(5));
      return readFile(std::string(BUREAU_ASSETS_DIR) + path);
    };
    options.width = 320;
    options.height = 200;
    options.install = [this](jsi::Runtime& js, jsi::Object& native) {
      bureau::bridge::define(
          js, native, "pressed",
          [this](jsi::Runtime&, const jsi::Value&, const jsi::Value* args,
                 size_t count) {
            doingInPress = ui->doing();
            pressed = static_cast<int>(bureau::bridge::numberArg(args, count, 0));
            return jsi::Value::undefined();
          });
    };
    ui = std::make_unique<bureau::Ui>(std::move(options));
    ui->start();
  }

  /** Runs the game's frames until `done`, or fails after a while. */
  void until(const std::function<bool()>& done) {
    const auto started = std::chrono::steady_clock::now();
    while (!done()) {
      const auto elapsed = std::chrono::steady_clock::now() - started;
      REQUIRE(elapsed < std::chrono::seconds(20));
      auto frame = ui->takeFrame();
      if (frame.list) list = std::move(frame.list);
      const double now = std::chrono::duration<double, std::milli>(elapsed).count();
      ui->refresh(now);
      std::this_thread::sleep_for(std::chrono::milliseconds(4));
    }
  }

  bool drew() const { return list && !list->quads.empty(); }

  /** Where a node is, in window points, asked of the UI's thread. */
  bureau::UiRect rectOf(const std::string& id) {
    bureau::UiRect rect;
    ui->invoke([&](jsi::Runtime&) {
      const int node = ui->view().find(id);
      if (const auto found = ui->view().measure(node)) rect = *found;
    });
    return rect;
  }

  void click(const bureau::UiRect& rect) {
    bureau::PointerEvent event;
    event.x = rect.x + rect.width / 2;
    event.y = rect.y + rect.height / 2;
    event.kind = bureau::PointerEvent::Kind::Move;
    ui->pointer(event);
    event.kind = bureau::PointerEvent::Kind::Down;
    ui->pointer(event);
    event.kind = bureau::PointerEvent::Kind::Up;
    ui->pointer(event);
  }
};

}  // namespace

TEST_CASE("a game's TSX draws a display list") {
  Game game;
  game.until([&] { return game.drew(); });
  CHECK(game.list->width == 320);
  CHECK(game.list->height == 200);
  game.ui->stop();
}

TEST_CASE("the first frame hands over the atlas the list reads") {
  Game game;
  size_t uploaded = 0;
  const auto started = std::chrono::steady_clock::now();
  while (uploaded == 0 &&
         std::chrono::steady_clock::now() - started < std::chrono::seconds(20)) {
    uploaded += game.ui->takeFrame().uploads.size();
    game.ui->refresh(0);
    std::this_thread::sleep_for(std::chrono::milliseconds(4));
  }
  CHECK(uploaded > 0);
  game.ui->stop();
}

TEST_CASE("a click reaches TypeScript, and TypeScript the game's own function") {
  Game game;
  game.until([&] { return game.drew(); });
  game.click(game.rectOf("press"));
  game.until([&] { return game.pressed.load() == 1; });
  CHECK(game.pressed.load() == 1);
  game.ui->stop();
}

TEST_CASE("a handler at work is named with the node it is on") {
  Game game;
  game.until([&] { return game.drew(); });
  game.click(game.rectOf("press"));
  game.until([&] { return game.pressed.load() == 1; });
  CHECK(game.doingInPress == "onPress #press");
  game.ui->stop();
}

TEST_CASE("a face being read is named") {
  Game game;
  game.until([&] { return game.drew(); });
  std::lock_guard lock(game.readsMutex);
  CHECK(game.doingInRead["/fonts/Jersey25-Regular.ttf"] ==
        "read /fonts/Jersey25-Regular.ttf");
  game.ui->stop();
}

TEST_CASE("the interface answers while a file TypeScript asked for is read") {
  Game game;
  game.until([&] { return game.drew(); });
  std::mutex answerMutex;
  std::optional<std::string> answer;
  game.ui->invoke([&](jsi::Runtime& js) {
    const auto done = jsi::Function::createFromHostFunction(
        js, jsi::PropNameID::forAscii(js, "done"), 1,
        [&](jsi::Runtime& runtime, const jsi::Value&, const jsi::Value* args,
            size_t) {
          std::lock_guard lock(answerMutex);
          answer = args[0].asString(runtime).utf8(runtime);
          return jsi::Value::undefined();
        });
    js.global()
        .getPropertyAsObject(js, "__native")
        .getPropertyAsFunction(js, "assetText")
        .call(js, kSlowFile, done);
  });

  bool answeredWhileReading = true;
  game.ui->invoke([&](jsi::Runtime&) {
    std::lock_guard lock(answerMutex);
    answeredWhileReading = answer.has_value();
  });
  game.slowDisk.set_value();
  game.until([&] {
    std::lock_guard lock(answerMutex);
    return answer.has_value();
  });

  CHECK_FALSE(answeredWhileReading);
  CHECK(answer->starts_with("{"));
  game.ui->stop();
}

TEST_CASE("a file TypeScript asks for that is not there answers null") {
  Game game;
  game.until([&] { return game.drew(); });
  std::atomic<bool> answeredNull{false};
  game.ui->invoke([&](jsi::Runtime& js) {
    const auto done = jsi::Function::createFromHostFunction(
        js, jsi::PropNameID::forAscii(js, "done"), 1,
        [&](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, size_t) {
          answeredNull = args[0].isNull();
          return jsi::Value::undefined();
        });
    js.global()
        .getPropertyAsObject(js, "__native")
        .getPropertyAsFunction(js, "assetBytes")
        .call(js, "/no-such-file.bin", done);
  });

  game.until([&] { return answeredNull.load(); });

  CHECK(answeredNull);
  game.ui->stop();
}

TEST_CASE("the UI's thread between handlers is doing nothing") {
  Game game;
  game.until([&] { return game.drew(); });
  std::string doing = "unread";
  game.ui->invoke([&](jsi::Runtime&) { doing = game.ui->doing(); });
  CHECK(doing == "");
  game.ui->stop();
}

TEST_CASE("a resize draws the next list at the new size") {
  Game game;
  game.until([&] { return game.drew(); });
  game.ui->resize(640, 400, 2);
  game.until([&] { return game.list->width == 1280; });
  CHECK(game.list->height == 800);
  game.ui->stop();
}

TEST_CASE("a game's atlas size reaches its uploads") {
  Game game(256);
  std::vector<bureau::AtlasUpload> uploads;
  const auto started = std::chrono::steady_clock::now();
  while (uploads.empty() &&
         std::chrono::steady_clock::now() - started < std::chrono::seconds(20)) {
    uploads = game.ui->takeFrame().uploads;
    game.ui->refresh(0);
    std::this_thread::sleep_for(std::chrono::milliseconds(4));
  }
  REQUIRE_FALSE(uploads.empty());
  CHECK(uploads[0].pageSize == 256);
  game.ui->stop();
}

TEST_CASE("a game's monochrome text reaches its uploads") {
  Game game(bureau::kAtlasSize, true);
  std::vector<bureau::AtlasUpload> uploads;
  const auto started = std::chrono::steady_clock::now();
  while (uploads.size() < 2 &&
         std::chrono::steady_clock::now() - started < std::chrono::seconds(20)) {
    const auto frame = game.ui->takeFrame();
    uploads.insert(uploads.end(), frame.uploads.begin(), frame.uploads.end());
    game.ui->refresh(0);
    std::this_thread::sleep_for(std::chrono::milliseconds(4));
  }
  REQUIRE(uploads.size() >= 2);
  // The first is the white texel, and the hello bundle's next is a glyph.
  const std::set<std::uint8_t> levels(uploads[1].pixels.begin(), uploads[1].pixels.end());
  CHECK(levels == std::set<std::uint8_t>{0, 255});
  game.ui->stop();
}

TEST_CASE("the atlas comes again for a GPU that lost it") {
  Game game;
  game.until([&] { return game.drew(); });
  // Let the first uploads go by.
  game.ui->takeFrame();
  game.ui->resendAtlas();
  size_t uploaded = 0;
  const auto started = std::chrono::steady_clock::now();
  while (uploaded == 0 &&
         std::chrono::steady_clock::now() - started < std::chrono::seconds(20)) {
    uploaded += game.ui->takeFrame().uploads.size();
    game.ui->refresh(0);
    std::this_thread::sleep_for(std::chrono::milliseconds(4));
  }
  CHECK(uploaded > 0);
  game.ui->stop();
}

TEST_CASE("a task posted before the start runs after it, and one after the stop never") {
  bureau::Ui::Options options;
  const auto bytecode = readFile(BUREAU_HELLO_BUNDLE);
  options.bytecode.assign(bytecode->begin(), bytecode->end());
  options.tokens = readFile(BUREAU_TOKENS_JSON).value();
  options.install = [](jsi::Runtime& js, jsi::Object& native) {
    bureau::bridge::define(js, native, "pressed",
                           [](jsi::Runtime&, const jsi::Value&,
                              const jsi::Value*, size_t) {
                             return jsi::Value::undefined();
                           });
  };
  bureau::Ui ui(std::move(options));
  std::atomic<int> ran{0};
  ui.post([&](jsi::Runtime&) { ++ran; });
  CHECK(ran.load() == 0);
  ui.start();
  ui.invoke([](jsi::Runtime&) {});
  CHECK(ran.load() == 1);
  ui.stop();
  ui.post([&](jsi::Runtime&) { ++ran; });
  CHECK(ran.load() == 1);
}

TEST_CASE("JSON for JavaScript reads a letter cut in half as a replacement character") {
  const nlohmann::json cut = nlohmann::json::array({"Sevill\xC3"});
  CHECK(bureau::bridge::jsonText(cut) == "[\"Sevill\xEF\xBF\xBD\"]");
}

TEST_CASE("JSON for JavaScript reads a Windows code page letter as a replacement character") {
  // "Jo\xE3o" is João in Windows-1252.
  const nlohmann::json ansi = {{"name", "Jo\xE3o"}};
  CHECK(bureau::bridge::jsonText(ansi) == "{\"name\":\"Jo\xEF\xBF\xBDo\"}");
}

TEST_CASE("a mouse move with none waiting asks for a task") {
  bureau::js::PointerMoves moves;
  CHECK(moves.hold(moveTo(10)));
}

TEST_CASE("a mouse move takes a waiting one's place and asks for no task") {
  bureau::js::PointerMoves moves;
  moves.hold(moveTo(10));
  CHECK_FALSE(moves.hold(moveTo(20)));
  CHECK(moves.take().x == 20);
}

TEST_CASE("a mouse move after other input waits behind it") {
  bureau::js::PointerMoves moves;
  moves.hold(moveTo(10));
  moves.seal();
  CHECK(moves.hold(moveTo(20)));
  CHECK(moves.take().x == 10);
  CHECK(moves.take().x == 20);
}

TEST_CASE("a mouse move after the waiting one was taken asks for a task") {
  bureau::js::PointerMoves moves;
  moves.hold(moveTo(10));
  moves.take();
  CHECK(moves.hold(moveTo(20)));
}
