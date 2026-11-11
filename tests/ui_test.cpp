#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include <jsi/jsi.h>

#include <atomic>
#include <chrono>
#include <fstream>
#include <functional>
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

/** A little game: the hello bundle, with its one function of its own. */
struct Game {
  std::atomic<int> pressed{0};
  /** What the UI's thread said it was doing inside the press's handler, and
   * inside the read of each path. */
  std::string doingInPress;
  std::mutex readsMutex;
  std::map<std::string, std::string> doingInRead;
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

TEST_CASE("a file being read is named") {
  Game game;
  game.until([&] { return game.drew(); });
  game.ui->invoke([](jsi::Runtime& js) {
    js.global()
        .getPropertyAsObject(js, "__native")
        .getPropertyAsFunction(js, "assetText")
        .call(js, "/no-such-file.txt");
  });
  std::lock_guard lock(game.readsMutex);
  CHECK(game.doingInRead["/no-such-file.txt"] == "read /no-such-file.txt");
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
