#include "view.h"

#include <doctest/doctest.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iterator>
#include <set>
#include <string>

#include "anim.h"
#include "format.h"

namespace {

using Json = nlohmann::json;

std::shared_ptr<const std::vector<uint8_t>> readPublic(
    const std::string& path) {
  const bool isFixture = path.starts_with("/pictures/");
  const std::string root = isFixture ? BUREAU_FIXTURES_DIR : BUREAU_PUBLIC_DIR;
  std::ifstream file(root + path, std::ios::binary);
  if (!file.good()) return nullptr;
  return std::make_shared<const std::vector<uint8_t>>(
      std::istreambuf_iterator<char>{file}, std::istreambuf_iterator<char>{});
}

std::string tokenDocument() {
  std::ifstream file(BUREAU_TOKENS_JSON);
  return {std::istreambuf_iterator<char>{file}, {}};
}

/** A commit written by hand: the operations React's writer emits. */
struct Stream {
  std::vector<int32_t> operations;
  std::vector<std::string> strings;
  int add(const std::string& value) {
    strings.push_back(value);
    return static_cast<int>(strings.size() - 1);
  }
  Stream& create(int id, const char* type, const Json& props = Json::object()) {
    operations.insert(operations.end(), {1, id, add(type)});
    if (!props.empty()) operations.insert(operations.end(), {6, id, add(props.dump())});
    return *this;
  }
  Stream& text(int id, const std::string& value) {
    operations.insert(operations.end(), {2, id, add(value)});
    return *this;
  }
  Stream& append(int parent, int child) {
    operations.insert(operations.end(), {3, parent, child});
    return *this;
  }
  Stream& props(int id, const Json& props) {
    operations.insert(operations.end(), {6, id, add(props.dump())});
    return *this;
  }
};

struct Recorded {
  int node;
  std::string handler;
  Json args;
};

/** A view of a literal tree, 400 by 300 points at one pixel each. */
struct Fixture {
  bureau::View view{readPublic};
  std::vector<Recorded> calls;
  Json answer = nullptr;
  explicit Fixture(float scale = 1) {
    REQUIRE(view.loadTokens(tokenDocument()));
    view.setViewport(400, 300, scale);
    view.setDispatch([this](int node, std::string_view handler, const Json& args) {
      calls.push_back(Recorded{node, std::string(handler), args});
      return answer;
    });
  }
  void commit(const Stream& stream) {
    REQUIRE(view.commit(stream.operations.data(), stream.operations.size(),
                        stream.strings));
  }
  std::vector<Recorded> handled(const std::string& handler) const {
    std::vector<Recorded> found;
    for (const auto& call : calls) {
      if (call.handler == handler) found.push_back(call);
    }
    return found;
  }
  bureau::UiRect rect(int node) {
    const auto measured = view.measure(node);
    REQUIRE(measured.has_value());
    return *measured;
  }
};

TEST_CASE("the window stays busy until the UI declares its state") {
  Fixture fixture;
  CHECK(fixture.view.windowBusy());
  fixture.commit(Stream().create(1, "bureau-box").append(0, 1));
  CHECK(fixture.view.windowBusy());
  fixture.commit(Stream().props(1, {{"windowBusy", false}}));
  CHECK_FALSE(fixture.view.windowBusy());
  fixture.view.clear();
  CHECK(fixture.view.windowBusy());
}

TEST_CASE("a nested wait overrides a ready window until it is removed") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"windowBusy", false}})
                     .create(2, "bureau-box", {{"windowBusy", true}})
                     .create(3, "bureau-box", {{"windowBusy", false}})
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.view.windowBusy());
  Stream removeWait;
  removeWait.operations = {5, 1, 2};
  fixture.commit(removeWait);
  CHECK_FALSE(fixture.view.windowBusy());
  fixture.commit(Stream().props(1, {{"windowBusy", nullptr}}));
  CHECK(fixture.view.windowBusy());
}

TEST_CASE("a wait in another root overrides a ready window") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"windowBusy", false}})
                     .create(2, "bureau-layer", {{"windowBusy", true}})
                     .append(0, 1)
                     .append(0, 2));
  CHECK(fixture.view.windowBusy());
  fixture.commit(Stream().props(2, {{"windowBusy", false}}));
  CHECK_FALSE(fixture.view.windowBusy());
}

TEST_CASE("hidden branches do not hold the window's wait cursor") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"windowBusy", false}})
                     .create(2, "bureau-box", {{"hidden", true}})
                     .create(3, "bureau-box", {{"windowBusy", true}})
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  CHECK_FALSE(fixture.view.windowBusy());
  fixture.commit(Stream().props(2, {{"hidden", false}}));
  CHECK(fixture.view.windowBusy());
  fixture.commit(Stream().props(2, {{"__hidden", true}}));
  CHECK_FALSE(fixture.view.windowBusy());
}

TEST_CASE("detached declarations cannot finish the window's startup wait") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-box", {{"windowBusy", false}}));
  CHECK(fixture.view.windowBusy());
  fixture.commit(Stream().append(0, 1));
  CHECK_FALSE(fixture.view.windowBusy());
}

TEST_CASE("a hidden ready UI cannot finish the window's startup wait") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"__hidden", true}})
                     .create(2, "bureau-box", {{"windowBusy", false}})
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.view.windowBusy());
  fixture.commit(Stream().props(1, {{"__hidden", false}}));
  CHECK_FALSE(fixture.view.windowBusy());
}

TEST_CASE(
    "window busy is boolean and independent of a component's busy state") {
  Fixture fixture;
  fixture.commit(
      Stream()
          .create(1, "bureau-box", {{"busy", false}, {"windowBusy", "false"}})
          .append(0, 1));
  CHECK(fixture.view.windowBusy());
  fixture.commit(Stream().props(1, {{"windowBusy", false}, {"busy", true}}));
  CHECK_FALSE(fixture.view.windowBusy());
}

TEST_CASE("a window's wait cursor does not block its controls") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"windowBusy", true},
                              {"width", 40},
                              {"height", 40},
                              {"onPress", true}})
                     .append(0, 1));
  fixture.view.pointer({bureau::PointerEvent::Kind::Down, 10, 10});
  fixture.view.pointer({bureau::PointerEvent::Kind::Up, 10, 10});
  CHECK(fixture.view.windowBusy());
  REQUIRE(fixture.handled("onPress").size() == 1);
  CHECK(fixture.handled("onPress").front().node == 1);
}

/** A 40-point pressable box at the top-left corner. */
Stream pressableBox() {
  return Stream()
      .create(1, "bureau-box",
              {{"width", 40}, {"height", 40}, {"onPress", true}})
      .append(0, 1);
}

TEST_CASE("a tap on a box tells its press it was a finger") {
  Fixture fixture;
  fixture.commit(pressableBox());
  bureau::PointerEvent down{bureau::PointerEvent::Kind::Down, 10, 10};
  down.touch = true;
  bureau::PointerEvent up{bureau::PointerEvent::Kind::Up, 10, 10};
  up.touch = true;
  fixture.view.pointer(down);
  fixture.view.pointer(up);
  REQUIRE(fixture.handled("onPress").size() == 1);
  CHECK(fixture.handled("onPress").front().args ==
        Json::array({Json{{"touch", true}}}));
}

TEST_CASE("a click on a box tells its press it was no finger") {
  Fixture fixture;
  fixture.commit(pressableBox());
  fixture.view.pointer({bureau::PointerEvent::Kind::Down, 10, 10});
  fixture.view.pointer({bureau::PointerEvent::Kind::Up, 10, 10});
  REQUIRE(fixture.handled("onPress").size() == 1);
  CHECK(fixture.handled("onPress").front().args ==
        Json::array({Json{{"touch", false}}}));
}

TEST_CASE("a box pressed by the host tells its press it was no finger") {
  Fixture fixture;
  fixture.commit(pressableBox());
  fixture.view.press(1);
  REQUIRE(fixture.handled("onPress").size() == 1);
  CHECK(fixture.handled("onPress").front().args ==
        Json::array({Json{{"touch", false}}}));
}

TEST_CASE("an intrinsic flex row keeps a percentage-basis child's content width") {
  Fixture fixture;
  Stream stream;
  stream.create(1, "bureau-box", {{"width", 400}, {"direction", "column"},
                                  {"align", "start"}})
      .create(2, "bureau-box", {{"height", 36}, {"maxWidth", "100%"},
                                {"shrink", 0}})
      .create(3, "bureau-box", {{"height", 36}, {"padding", {4, 16}},
                                {"margin", {0, 1}}, {"gap", 12},
                                {"align", "center"}})
      .create(4, "bureau-box", {{"direction", "column"}, {"grow", 1},
                                {"basis", "0%"}, {"minWidth", 0}})
      .create(5, "bureau-box", {{"width", 100}, {"height", 20}})
      .create(6, "bureau-box", {{"width", 18}, {"height", 12}, {"shrink", 0}})
      .append(1, 2).append(2, 3).append(3, 4)
      .append(4, 5).append(3, 6).append(0, 1);
  fixture.commit(stream);
  CHECK(fixture.rect(2).width == 164);
  CHECK(fixture.rect(3).width == 162);
  CHECK(fixture.rect(4).width == 100);

  Stream constrained;
  constrained.props(1, {{"width", 120}});
  fixture.commit(constrained);
  CHECK(fixture.rect(2).width == 120);
  CHECK(fixture.rect(4).width == 56);

  Stream fixed;
  fixed.props(1, {{"width", 400}})
      .props(2, {{"height", 36}, {"width", 240}, {"maxWidth", "100%"},
                 {"shrink", 0}})
      .props(3, {{"height", 36}, {"padding", {4, 16}}, {"margin", {0, 1}},
                 {"gap", 12}, {"align", "center"}, {"grow", 1}});
  fixture.commit(fixed);
  CHECK(fixture.rect(2).width == 240);
  CHECK(fixture.rect(3).width == 238);
  CHECK(fixture.rect(4).width == 176);
}

TEST_CASE("an automatic flex basis measures content before distributing space") {
  Fixture fixture;
  fixture.commit(Stream()
      .create(1, "bureau-box", {{"width", 120}})
      .create(2, "bureau-box", {{"direction", "column"}, {"padding", 10},
                                {"shrink", 0}})
      .create(3, "bureau-text", {{"typeStyle", "mono-12-solid"}})
      .text(4, "AAAA AAAA AAAA AAAA")
      .append(1, 2).append(2, 3).append(3, 4).append(0, 1));
  CHECK(fixture.rect(2).width == doctest::Approx(156.8125).epsilon(0.001));
  CHECK(fixture.rect(3).width == doctest::Approx(136.8125).epsilon(0.001));

  fixture.commit(Stream().props(2, {{"direction", "column"}, {"padding", 10},
                                   {"shrink", 1}}));
  CHECK(fixture.rect(2).width == doctest::Approx(120));
  CHECK(fixture.rect(3).width == doctest::Approx(100));

  fixture.commit(Stream()
      .props(1, {{"direction", "column"}, {"width", 300}, {"height", 120}})
      .props(2, {{"direction", "column"}, {"padding", 10}, {"shrink", 0}})
      .props(3, {{"typeStyle", "mono-12-solid"}, {"preserveBreaks", true}})
      .text(4, "AAAA\nAAAA\nAAAA\nAAAA\nAAAA\nAAAA\nAAAA\nAAAA\nAAAA\nAAAA"));
  CHECK(fixture.rect(2).height == 140);
  CHECK(fixture.rect(3).height == 120);
}

bureau::PointerEvent pointer(bureau::PointerEvent::Kind kind, float x, float y) {
  bureau::PointerEvent event;
  event.kind = kind;
  event.x = x;
  event.y = y;
  return event;
}

/** Where the quads of one ink lie, in device pixels: a mark's extent. */
struct Extent {
  int quads = 0;
  float x0 = 1e9f, y0 = 1e9f, x1 = -1e9f, y1 = -1e9f;
};

Extent extentOf(const bureau::DisplayList& list, std::uint8_t r,
                std::uint8_t g, std::uint8_t b) {
  Extent extent;
  for (const auto& quad : list.quads) {
    if (quad.r != r || quad.g != g || quad.b != b) continue;
    ++extent.quads;
    extent.x0 = std::min(extent.x0, quad.x0);
    extent.y0 = std::min(extent.y0, quad.y0);
    extent.x1 = std::max(extent.x1, quad.x1);
    extent.y1 = std::max(extent.y1, quad.y1);
  }
  return extent;
}

/** The pad's band is db32-yellow-bright on black. */
Extent bandOf(const bureau::DisplayList& list) {
  return extentOf(list, 0xfb, 0xf2, 0x36);
}

/** Each glyph's colour, as red, green and blue, in paint order. */
std::vector<std::array<std::uint8_t, 3>> glyphColours(
    const bureau::DisplayList& list) {
  std::vector<std::array<std::uint8_t, 3>> colours;
  for (const auto& quad : list.quads) {
    if (quad.mode != bureau::QuadMode::Mask) continue;
    colours.push_back({quad.r, quad.g, quad.b});
  }
  return colours;
}

/** One glyph in a text of its own, `ink` set on the text when given. */
Stream& glyph(Stream& stream, int id, const std::string& ink = "") {
  Json props = {{"typeStyle", "mono-12-solid"}};
  if (!ink.empty()) props["ink"] = ink;
  return stream.create(id, "bureau-text", props)
      .text(id + 1, "8")
      .append(id, id + 1);
}

}  // namespace

TEST_CASE("a Text measures to its runs set in the UI face") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 200}, {"direction", "column"}})
                     .create(2, "bureau-text")
                     .text(3, "A")
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  const auto text = fixture.rect(2);
  // A column stretches its items across, as a block does.
  CHECK(text.width == doctest::Approx(200));
  CHECK(text.height == 21.59375f);
}

TEST_CASE("a plated run's sides and trailing gap take room on its line") {
  Fixture plain;
  plain.commit(Stream()
                   .create(1, "bureau-box", {{"width", 300}})
                   .create(2, "bureau-text")
                   .create(3, "bureau-text")
                   .text(4, "NEWS")
                   .text(5, "A pandemic")
                   .append(3, 4).append(2, 3).append(2, 5)
                   .append(1, 2).append(0, 1));
  Fixture plated;
  plated.commit(Stream()
                    .create(1, "bureau-box", {{"width", 300}})
                    .create(2, "bureau-text")
                    .create(3, "bureau-text",
                            {{"plate", {{"fill", "fill-alert"},
                                        {"padding", {2, 8}},
                                        {"trailing", 8}}}})
                    .text(4, "NEWS")
                    .text(5, "A pandemic")
                    .append(3, 4).append(2, 3).append(2, 5)
                    .append(1, 2).append(0, 1));
  CHECK(plated.rect(2).width == doctest::Approx(plain.rect(2).width + 24));
}

TEST_CASE("a Text in a row shrinks to its line, and wraps at its parent") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 30}})
                     .create(2, "bureau-text")
                     .text(3, "one two")
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  const auto text = fixture.rect(2);
  CHECK(text.width <= 30);
  CHECK(text.height == 43.1875f);
}

TEST_CASE(
    "fitted segment labels keep equal keys and restore their size on resize") {
  Fixture fixture;
  fixture.view.setLanguage("de");
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 320}, {"padding", 2}})
                     .create(2, "bureau-box",
                             {{"grow", 1},
                              {"shrink", 1},
                              {"basis", "0%"},
                              {"align", "center"},
                              {"justify", "center"},
                              {"minWidth", 36},
                              {"minHeight", 36},
                              {"padding", {6, 8}}})
                     .create(3, "bureau-text",
                             {{"typeStyle", "ui-13-segment-solid"},
                              {"ink", "db32-white"},
                              {"fit", {{"minSize", 10}}}})
                     .text(4, "Umweltverschmutzung")
                     .create(5, "bureau-box",
                             {{"grow", 1},
                              {"shrink", 1},
                              {"basis", "0%"},
                              {"align", "center"},
                              {"justify", "center"},
                              {"minWidth", 36},
                              {"minHeight", 36},
                              {"padding", {6, 8}}})
                     .create(6, "bureau-text",
                             {{"typeStyle", "ui-13-segment-solid"},
                              {"ink", "db32-yellow-bright"},
                              {"fit", {{"minSize", 10}}}})
                     .text(7, "Hitze")
                     .append(3, 4)
                     .append(2, 3)
                     .append(6, 7)
                     .append(5, 6)
                     .append(1, 2)
                     .append(1, 5)
                     .append(0, 1));
  CHECK(fixture.rect(2).width == 158);
  CHECK(fixture.rect(5).width == 158);
  CHECK(fixture.rect(3).height >= 10);
  CHECK(fixture.rect(3).height < 13);
  CHECK(fixture.rect(6).height == 13);
  fixture.view.frame(0);
  const Extent fitted = extentOf(*fixture.view.displayList(), 255, 255, 255);
  CHECK(fitted.quads == 19);
  CHECK(fitted.x0 >= 10);
  CHECK(fitted.x1 <= 152);

  fixture.commit(Stream().props(1, {{"width", 400}, {"padding", 2}}));
  CHECK(fixture.rect(2).width == 198);
  CHECK(fixture.rect(5).width == 198);
  CHECK(fixture.rect(3).height == 13);
  CHECK(fixture.rect(6).height == 13);
  fixture.view.frame(1);
  const Extent restored = extentOf(*fixture.view.displayList(), 255, 255, 255);
  CHECK(restored.quads == 19);
  CHECK(restored.x0 >= 10);
  CHECK(restored.x1 <= 192);
}

TEST_CASE("a fitted label leaves room for fixed hint and mark siblings") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"width", 150},
                              {"padding", {6, 8}},
                              {"gap", 4},
                              {"align", "center"},
                              {"justify", "center"}})
                     .create(2, "bureau-box",
                             {{"width", 16}, {"height", 16}, {"shrink", 0}})
                     .create(3, "bureau-text",
                             {{"typeStyle", "ui-13-segment-solid"},
                              {"ink", "db32-white"},
                              {"fit", {{"minSize", 10}}}})
                     .text(4, "Umweltverschmutzung")
                     .create(5, "bureau-box",
                             {{"width", 14}, {"height", 14}, {"shrink", 0}})
                     .append(3, 4)
                     .append(1, 2)
                     .append(1, 3)
                     .append(1, 5)
                     .append(0, 1));
  CHECK(fixture.rect(2).x == 8);
  CHECK(fixture.rect(2).width == 16);
  CHECK(fixture.rect(3).x == 28);
  CHECK(fixture.rect(3).width == 96);
  CHECK(fixture.rect(3).height == 10);
  CHECK(fixture.rect(5).x == 128);
  CHECK(fixture.rect(5).width == 14);
  fixture.view.frame(0);
  const Extent fitted = extentOf(*fixture.view.displayList(), 255, 255, 255);
  CHECK(fitted.quads > 1);
  CHECK(fitted.quads < 19);
  CHECK(fitted.x0 >= 28);
  CHECK(fitted.x1 <= 124);
}

TEST_CASE("a padded row places its fixed cells a gap apart") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 200}, {"height", 60},
                                               {"padding", 10}, {"gap", 8}})
                     .create(2, "bureau-box", {{"width", 40}, {"height", 20}})
                     .create(3, "bureau-box", {{"width", 50}, {"height", 30}})
                     .append(1, 2)
                     .append(1, 3)
                     .append(0, 1));
  CHECK(fixture.rect(1).x == 0);
  CHECK(fixture.rect(1).y == 0);
  CHECK(fixture.rect(1).width == 200);
  CHECK(fixture.rect(1).height == 60);
  CHECK(fixture.rect(2).x == 10);
  CHECK(fixture.rect(2).y == 10);
  CHECK(fixture.rect(2).width == 40);
  CHECK(fixture.rect(2).height == 20);
  CHECK(fixture.rect(3).x == 58);
  CHECK(fixture.rect(3).y == 10);
  CHECK(fixture.rect(3).width == 50);
  CHECK(fixture.rect(3).height == 30);
}

TEST_CASE("a wide flex child shrinks below its declared width") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 70}, {"height", 20}})
                     .create(2, "bureau-box", {{"width", 100}, {"height", 20}})
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.rect(2).width == 70);
  CHECK(fixture.rect(2).height == 20);
}

TEST_CASE("percentage and absolute boxes place against their parent") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 200}, {"height", 100}})
                     .create(2, "bureau-box", {{"width", "50%"}, {"height", 10}})
                     .create(3, "bureau-box",
                             {{"position", "absolute"},
                              {"inset", {{"right", 10}, {"top", 5}}},
                              {"width", 20},
                              {"height", 20}})
                     .append(1, 2)
                     .append(1, 3)
                     .append(0, 1));
  CHECK(fixture.rect(2).width == doctest::Approx(100));
  CHECK(fixture.rect(3).x == doctest::Approx(170));
  CHECK(fixture.rect(3).y == doctest::Approx(5));
}

TEST_CASE("a fractional box snaps its painted bounds before display density") {
  Fixture fixture(2);
  fixture.commit(Stream().create(1, "bureau-box", {
    {"width", 100}, {"height", 27.59375}, {"fill", "face"},
    {"surface", "print-line"}}).append(0, 1));
  fixture.view.frame(0);
  const auto& rule = fixture.view.displayList()->quads.back();
  CHECK(rule.x0 == 0);
  CHECK(rule.x1 == 200);
  CHECK(rule.y0 == 54);
  CHECK(rule.y1 == 56);
}

TEST_CASE("a plot wider than an atlas page draws in tiles, edge to edge") {
  Fixture fixture(3);
  fixture.view.setViewport(1000, 300, 3);
  const Json rect = {{"kind", "rect"}, {"x", 0}, {"y", 0}, {"width", 1000},
                     {"height", 100}, {"ink", "db32-black"}};
  fixture.commit(Stream()
                     .create(1, "bureau-plot",
                             {{"width", 1000}, {"height", 100},
                              {"commands", Json::array({rect})}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  const auto& quads = fixture.view.displayList()->quads;
  REQUIRE(quads.size() == 3);
  CHECK(quads[0].x0 == 0);
  CHECK(quads[0].x1 == 1024);
  CHECK(quads[1].x0 == 1024);
  CHECK(quads[2].x1 == 3000);
  CHECK(quads[2].y1 == 300);
}

TEST_CASE("a plot's figure aligned to its end finishes at its x") {
  Fixture fixture;
  const Json figure = {{"kind", "text"}, {"x", 100}, {"y", 20},
                       {"text", "1,250"}, {"ink", "ink"},
                       {"typeStyle", "mono-10-axis"}, {"align", "end"}};
  fixture.commit(Stream()
                     .create(1, "bureau-plot",
                             {{"width", 200}, {"height", 40},
                              {"commands", Json::array({figure})}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  float right = 0;
  float left = 200;
  for (const auto& quad : fixture.view.displayList()->quads) {
    if (quad.mode != bureau::QuadMode::Mask) continue;
    right = std::max(right, quad.x1);
    left = std::min(left, quad.x0);
  }
  CHECK(right <= 100);
  CHECK(right > 95);
  CHECK(left > 60);
}

TEST_CASE("a picture with no size takes its pixels, times its scale") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box")
                     .create(2, "bureau-image",
                             {{"source", "/icons/controller-xbox-a.png"},
                              {"pixelScale", 2}})
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.rect(2).width == doctest::Approx(24));
  CHECK(fixture.rect(2).height == doctest::Approx(28));
}

TEST_CASE("pixel art drawn wider than an atlas page still draws") {
  // 280 points at 8x is 2240 device pixels: nine times the art's 256 would
  // bake 2304, past the page's 2048.
  Fixture fixture(8);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/wide.png"},
                              {"width", 280},
                              {"height", 157.5}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  const auto& quads = fixture.view.displayList()->quads;
  REQUIRE(quads.size() == 1);
  CHECK(quads[0].x1 - quads[0].x0 == doctest::Approx(2240));
}

TEST_CASE("a layer sized to its content wraps a box's text at its width") {
  // The map keys' hints: a plate capped at 374, a sentence too long for it.
  Fixture fixture(2);
  fixture.commit(Stream()
      .create(1, "bureau-layer")
      .create(2, "bureau-box", {{"direction", "column"}, {"maxWidth", 374},
                                {"typeStyle", "ui-15-loose"}})
      .create(3, "bureau-box")
      .text(4, "Zeigt, welche Gebäude von Fahrern nicht erreicht werden und warum.")
      .append(3, 4).append(2, 3).append(1, 2).append(0, 1));
  CHECK(fixture.rect(3).width == doctest::Approx(374));
  CHECK(fixture.rect(3).height == doctest::Approx(45));
}

TEST_CASE("a screen-anchored layer stands its distance from the edges") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"id", "ui-root"},
                              {"position", "absolute"},
                              {"inset", {{"top", 0}, {"right", 0}, {"bottom", 0},
                                         {"left", 0}}}})
                     .create(2, "bureau-layer",
                             {{"anchor", {{"kind", "screen"}, {"right", 20},
                                          {"bottom", 20}}}})
                     .create(3, "bureau-box", {{"width", 50}, {"height", 30}})
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.rect(3).x == doctest::Approx(330));
  CHECK(fixture.rect(3).y == doctest::Approx(250));
}

TEST_CASE("a raised key draws its face, then its bevel, its ring in front") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"surface", "raised"}, {"width", 36}, {"height", 36}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  const auto list = fixture.view.displayList();
  REQUIRE(list->quads.size() == 9);
  // The face, gray-light.
  CHECK(list->quads[0].r == 0x9b);
  CHECK(list->quads[0].x1 == 36);
  // The top-left highlight, then the bottom-right shadow, then the ring.
  CHECK(list->quads[1].r == 0xcb);
  CHECK(list->quads[1].y1 == 3);
  CHECK(list->quads[3].r == 0x69);
  CHECK(list->quads[5].r == 0);
  CHECK(list->quads[5].y1 == 1);
}

TEST_CASE("a print rule draws its ink without a chrome face behind it") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-box",
                                {{"surface", "print-line"},
                                 {"width", 100}, {"height", 40}}).append(0, 1));
  fixture.view.frame(0);
  const auto list = fixture.view.displayList();
  REQUIRE(list->quads.size() == 1);
  CHECK(list->quads[0].y0 == 39);
  CHECK(list->quads[0].y1 == 40);
}

TEST_CASE("a half-transparent fill carries its alpha to the GPU") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"fill", "db32-black"}, {"opacity", 0.5},
                              {"width", 10}, {"height", 10}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  const auto& quad = fixture.view.displayList()->quads.at(0);
  CHECK(quad.a == 128);
}

TEST_CASE("an animated opacity replaces the box's own") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"fill", "db32-black"},
                              {"opacity", 0},
                              {"animation", "bureau-city-reveal"},
                              {"width", 10},
                              {"height", 10}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  CHECK(fixture.view.displayList()->quads.at(0).a == 255);
  fixture.view.frame(2000);
  CHECK(fixture.view.displayList()->quads.empty());
}

TEST_CASE("placement controls paint and receive presses above the tutorial") {
  Fixture fixture;
  fixture.commit(Stream()
      .create(1, "bureau-layer", {{"stacking", "attention"}})
      .create(2, "bureau-box", {{"width", 44}, {"height", 44},
                               {"fill", "db32-green"}, {"onPress", true}})
      .create(3, "bureau-layer", {{"stacking", "tutor"}})
      .create(4, "bureau-box", {{"width", 100}, {"height", 100},
                               {"fill", "db32-white"}, {"onPress", true}})
      .append(1, 2).append(3, 4).append(0, 1).append(0, 3));
  REQUIRE(fixture.view.frame(0));
  const auto list = fixture.view.displayList();
  REQUIRE(list->quads.size() == 2);
  CHECK(list->quads[0].r == 255);
  CHECK(list->quads[1].r != 255);
  fixture.view.pointer({bureau::PointerEvent::Kind::Down, 20, 20});
  fixture.view.pointer({bureau::PointerEvent::Kind::Up, 20, 20});
  const auto presses = fixture.handled("onPress");
  REQUIRE(presses.size() == 1);
  CHECK(presses[0].node == 2);
}

TEST_CASE(
    "the title curtain fades across the full window underneath its menu") {
  Fixture fixture;
  fixture.view.setInsets(0, 30, 15, 30, 0);
  fixture.commit(
      Stream()
          .create(1, "bureau-box",
                  {{"id", "ui-root"}, {"width", "100%"}, {"height", "100%"}})
          .create(2, "bureau-layer", {{"cover", true}})
          .create(3, "bureau-box",
                  {{"position", "absolute"},
                   {"inset", {{"top", 0}, {"right", 0}, {"bottom", 0}, {"left", 0}}},
                   {"fill", "db32-black"},
                   {"opacity", 0},
                   {"animation", "bureau-city-reveal"}})
          .create(4, "bureau-box",
                  {{"width", 100}, {"height", 40}, {"fill", "db32-white"}})
          .append(2, 3)
          .append(1, 2)
          .append(2, 4)
          .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  const auto first = fixture.view.displayList();
  REQUIRE(first->quads.size() == 2);
  CHECK(first->quads[0].x0 == 0);
  CHECK(first->quads[0].y0 == 0);
  CHECK(first->quads[0].x1 == 400);
  CHECK(first->quads[0].y1 == 300);
  CHECK(first->quads[0].a == 255);
  const auto& curtainClip = first->clips[first->quads[0].clip];
  CHECK(curtainClip.x == 0);
  CHECK(curtainClip.y == 0);
  CHECK(curtainClip.width == 400);
  CHECK(curtainClip.height == 300);
  CHECK(first->quads[1].r == 255);
  CHECK(first->quads[1].x0 == 30);
  REQUIRE(fixture.view.frame(900));
  const auto middle = fixture.view.displayList();
  REQUIRE(middle->quads.size() == 2);
  CHECK(middle->quads[0].a > 0);
  CHECK(middle->quads[0].a < 255);
  CHECK(middle->quads[1].a == 255);
  REQUIRE(fixture.view.frame(2000));
  const auto last = fixture.view.displayList();
  REQUIRE(last->quads.size() == 1);
  CHECK(last->quads[0].r == 255);
  CHECK(last->quads[0].a == 255);
  fixture.commit(Stream().props(3, {{"opacity", 1},
                                    {"animation", "bureau-curtain-darken"}}));
  REQUIRE(fixture.view.frame(2100));
  REQUIRE(fixture.view.frame(2300));
  const auto dark = fixture.view.displayList();
  REQUIRE(dark->quads.size() == 2);
  CHECK(dark->quads[0].x0 == 0);
  CHECK(dark->quads[0].y0 == 0);
  CHECK(dark->quads[0].x1 == 400);
  CHECK(dark->quads[0].y1 == 300);
  CHECK(dark->quads[0].a == 255);
  CHECK(dark->quads[1].r == 255);
}

TEST_CASE("an animation's ink colours the text inside its box") {
  // bureau-rainbow starts on db32-red-pink.
  Fixture fixture;
  Stream stream;
  stream.create(1, "bureau-box", {{"direction", "row"}})
      .create(2, "bureau-box", {{"animation", "bureau-rainbow"}});
  glyph(stream, 10);
  glyph(stream, 20, "db32-red-pink");
  fixture.commit(stream.append(2, 10).append(1, 2).append(1, 20).append(0, 1));

  REQUIRE(fixture.view.frame(0));

  const auto colours = glyphColours(*fixture.view.displayList());
  REQUIRE(colours.size() == 2);
  CHECK(colours[0] == colours[1]);
}

TEST_CASE("a box's animated ink keeps the box's delay") {
  // At 420 ms bureau-rainbow has moved on from db32-red-pink, but a box
  // delayed by 420 ms has only just started on it.
  Fixture fixture;
  Stream stream;
  stream.create(1, "bureau-box", {{"direction", "row"}})
      .create(2, "bureau-box", {{"animation", "bureau-rainbow"}})
      .create(3, "bureau-box",
              {{"animation", "bureau-rainbow"}, {"animationDelayMs", 420}});
  glyph(stream, 10);
  glyph(stream, 20);
  glyph(stream, 30, "db32-red-pink");
  fixture.commit(stream.append(2, 10)
                     .append(3, 20)
                     .append(1, 2)
                     .append(1, 3)
                     .append(1, 30)
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));

  REQUIRE(fixture.view.frame(420));

  const auto colours = glyphColours(*fixture.view.displayList());
  REQUIRE(colours.size() == 3);
  CHECK(colours[0] != colours[2]);
  CHECK(colours[1] == colours[2]);
}

TEST_CASE("an animation that leaves opacity alone keeps the box's own") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"fill", "db32-black"},
                              {"opacity", 0.5},
                              {"animation", "bureau-centre-x"},
                              {"width", 10},
                              {"height", 10}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  CHECK(fixture.view.displayList()->quads.at(0).a == 128);
}

TEST_CASE("at 1.5, a one-pixel line is two device pixels, and neighbours meet") {
  Fixture fixture(1.5f);
  fixture.commit(Stream()
                     .create(1, "bureau-box")
                     .create(2, "bureau-box",
                             {{"surface", "well"}, {"width", 11}, {"height", 11}})
                     .create(3, "bureau-box",
                             {{"fill", "db32-black"}, {"width", 11}, {"height", 11}})
                     .append(1, 2)
                     .append(1, 3)
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  const auto list = fixture.view.displayList();
  // The well's top-left line, drawn last of its two.
  const auto& top = list->quads[3];
  CHECK(top.y1 - top.y0 == 2);
  // The well ends at the device pixel the black box starts on.
  const auto& face = list->quads[0];
  const auto& next = list->quads.back();
  CHECK(next.x0 == doctest::Approx(face.x1));
}

TEST_CASE("the pointer over a box hovers it, and its hover look shows") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"look", "key"}, {"width", 36}, {"height", 36},
                              {"onHoverChange", true}})
                     .append(0, 1));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 10, 10));
  const auto hovers = fixture.handled("onHoverChange");
  REQUIRE(hovers.size() == 1);
  CHECK(hovers[0].node == 1);
  CHECK(hovers[0].args == Json::array({true}));
  REQUIRE(fixture.view.frame(0));
  // face-hover, gray-light in the light chrome: the same ink as the face.
  CHECK(fixture.view.displayList()->quads[0].r == 0x9b);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 100, 100));
  CHECK(fixture.handled("onHoverChange").back().args == Json::array({false}));
}

TEST_CASE("a press in a compact key's slop presses it; pass-through lets it by") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 200}, {"height", 100}})
                     .create(2, "bureau-box",
                             {{"position", "absolute"},
                              {"inset", {{"left", 50}, {"top", 50}}},
                              {"width", 28}, {"height", 28}, {"hitSlop", 4},
                              {"onPress", true}})
                     .create(3, "bureau-box",
                             {{"position", "absolute"},
                              {"inset", {{"left", 0}, {"top", 0}}},
                              {"width", 200}, {"height", 100},
                              {"passThrough", true}})
                     .append(1, 2)
                     .append(1, 3)
                     .append(0, 1));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 47, 47));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 47, 47));
  const auto presses = fixture.handled("onPress");
  REQUIRE(presses.size() == 1);
  CHECK(presses[0].node == 2);
  // A press that ends off the key is no press.
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 55, 55));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 150, 90));
  CHECK(fixture.handled("onPress").size() == 1);
}

TEST_CASE("the pad's walk gets the same focusables and navigables natively") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"direction", "column"}})
                     .create(2, "bureau-box",
                             {{"width", 36}, {"height", 36}, {"onPress", true},
                              {"navigable", true}, {"navigationGrid", "dock"}})
                     .create(3, "bureau-box",
                             {{"width", 36}, {"height", 36}, {"onPress", true},
                              {"disabled", true}})
                     .create(4, "bureau-box",
                             {{"width", 36}, {"height", 36}, {"onPress", true},
                              {"tabStop", false}, {"navigable", true}})
                     .create(5, "bureau-field", {{"value", "Marina"}})
                     .append(1, 2)
                     .append(1, 3)
                     .append(1, 4)
                     .append(1, 5)
                     .append(0, 1));
  CHECK(fixture.view.focusables(1, false) == std::vector<int>{2, 5});
  CHECK(fixture.view.navigable("", false) == std::vector<int>{2, 4});
  CHECK(fixture.view.navigable("", true) == std::vector<int>{2});
  CHECK(fixture.view.navigable("dock", false) == std::vector<int>{2});
  fixture.view.focus(2, true);
  CHECK(fixture.view.focused() == 2);
  CHECK(fixture.handled("__focus").back().args == Json::array({2}));
}

TEST_CASE("with a pad connected, the focused key alone wears the band inside its edge") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"padding", 10}, {"gap", 10}})
                     .create(2, "bureau-box",
                             {{"surface", "raised"}, {"width", 36},
                              {"height", 36}, {"onPress", true}})
                     .create(3, "bureau-box",
                             {{"surface", "raised"}, {"width", 36},
                              {"height", 36}, {"onPress", true}})
                     .append(1, 2)
                     .append(1, 3)
                     .append(0, 1));
  fixture.view.setGamepadConnected(true);
  fixture.view.focus(3, true);
  REQUIRE(fixture.view.frame(0));
  const Extent band = bandOf(*fixture.view.displayList());
  // The second key spans 56 to 92: its band's line runs 1 to 4 inside.
  CHECK(band.x0 == 57);
  CHECK(band.y0 == 11);
  CHECK(band.x1 == 91);
  CHECK(band.y1 == 45);
}

TEST_CASE("a slider paints its full 33px field at Retina density") {
  Fixture fixture(2);
  fixture.commit(
      Stream()
          .create(1, "bureau-box", {{"padding", 10}})
          .create(2, "bureau-field",
                  {{"kind", "range"}, {"value", "0"}, {"width", 200}})
          .append(1, 2)
          .append(0, 1));
  CHECK(fixture.rect(2).height == 33);
  REQUIRE(fixture.view.frame(0));
  const auto& list = *fixture.view.displayList();
  REQUIRE_FALSE(list.quads.empty());
  const auto& track = list.quads.front();
  CHECK(track.y0 == 20);
  CHECK(track.y1 == 86);
  const Extent thumb = extentOf(list, 0, 0, 0);
  CHECK(thumb.y0 == 24);
  CHECK(thumb.y1 == 82);
}

TEST_CASE("with a pad connected, a focused slider wears the band round its track") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"padding", 10}})
                     .create(2, "bureau-field",
                             {{"kind", "range"}, {"value", "0"}, {"min", 0},
                              {"max", 100}, {"width", 200}})
                     .append(1, 2)
                     .append(0, 1));
  fixture.view.setGamepadConnected(true);
  fixture.view.focus(2, true);
  REQUIRE(fixture.view.frame(0));
  const Extent band = bandOf(*fixture.view.displayList());
  // The track paints from 10 to 210 and 10 to 43; the band's line runs 1 to 4
  // outside it, clear of the thumb.
  CHECK(band.x0 == 6);
  CHECK(band.y0 == 6);
  CHECK(band.x1 == 214);
  CHECK(band.y1 == 47);
}

TEST_CASE("with a pad connected, a focused text field wears the band like a key") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"padding", 10}})
                     .create(2, "bureau-field",
                             {{"value", "Marina"}, {"width", 200},
                              {"height", 32}})
                     .append(1, 2)
                     .append(0, 1));
  fixture.view.setGamepadConnected(true);
  fixture.view.focus(2, true);
  REQUIRE(fixture.view.frame(0));
  const Extent band = bandOf(*fixture.view.displayList());
  CHECK(band.x0 == 11);
  CHECK(band.y0 == 11);
  CHECK(band.x1 == 209);
  CHECK(band.y1 == 41);
}

TEST_CASE("without a pad, a focused slider's dotted ring sits clear of its track") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"padding", 10}})
                     .create(2, "bureau-field",
                             {{"kind", "range"}, {"value", "0"}, {"min", 0},
                              {"max", 100}, {"width", 200}})
                     .append(1, 2)
                     .append(0, 1));
  fixture.view.focus(2, true);
  REQUIRE(fixture.view.frame(0));
  const auto& list = *fixture.view.displayList();
  CHECK(bandOf(list).quads == 0);
  // The ring is the outermost black: a pixel off the track, a pixel wide.
  const Extent black = extentOf(list, 0, 0, 0);
  CHECK(black.x0 == 8);
  CHECK(black.y0 == 8);
  CHECK(black.x1 == 212);
  CHECK(black.y1 == 45);
}

TEST_CASE("a focused window wears no band: its mark is left to what it holds") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"look", "window"}, {"width", 100},
                              {"height", 100}, {"focusable", true}})
                     .append(0, 1));
  fixture.view.setGamepadConnected(true);
  fixture.view.focus(1, true);
  REQUIRE(fixture.view.frame(0));
  CHECK(bandOf(*fixture.view.displayList()).quads == 0);
}

TEST_CASE("a look's ring is dotted, and the pad's band while a pad is connected") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"look", "pad-cursor"}, {"width", 36},
                              {"height", 36}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  CHECK(bandOf(*fixture.view.displayList()).quads == 0);
  const Extent dotted = extentOf(*fixture.view.displayList(), 0, 0, 0);
  CHECK(dotted.x0 == 3);
  CHECK(dotted.x1 == 33);
  fixture.view.setGamepadConnected(true);
  REQUIRE(fixture.view.frame(0));
  const Extent band = bandOf(*fixture.view.displayList());
  CHECK(band.x0 == 1);
  CHECK(band.x1 == 35);
}

TEST_CASE("Enter presses the focused key; Space presses as it comes up") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"width", 36}, {"height", 36}, {"onPress", true}})
                     .append(0, 1));
  fixture.view.focus(1, true);
  bureau::KeyEvent enter;
  enter.key = "Enter";
  fixture.view.key(enter);
  CHECK(fixture.handled("onPress").size() == 1);
  bureau::KeyEvent space;
  space.key = " ";
  fixture.view.key(space);
  CHECK(fixture.handled("onPress").size() == 1);
  space.down = false;
  fixture.view.key(space);
  CHECK(fixture.handled("onPress").size() == 2);
}

TEST_CASE("the cancel key reaches every listener as Escape") {
  Fixture fixture;
  fixture.view.setCancelKey("KeyX");
  bureau::KeyEvent x;
  x.key = "x";
  x.code = "KeyX";
  fixture.view.key(x);
  const auto heard = fixture.handled("__observeKeys");
  REQUIRE(heard.size() == 1);
  CHECK(heard[0].args[0]["key"] == "Escape");
  CHECK(heard[0].args[0]["code"] == "Escape");
}

TEST_CASE("the cancel key types its letter in a field") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-field", {{"width", 100}}).append(0, 1));
  fixture.view.focus(1, true);
  fixture.view.setCancelKey("KeyX");
  bureau::KeyEvent x;
  x.key = "x";
  x.code = "KeyX";
  fixture.view.key(x);
  const auto heard = fixture.handled("__observeKeys");
  REQUIRE(heard.size() == 1);
  CHECK(heard[0].args[0]["code"] == "KeyX");
}

TEST_CASE("a side mouse button is a key, pressed and released") {
  Fixture fixture;
  auto press = pointer(bureau::PointerEvent::Kind::Down, 10, 10);
  press.button = 3;
  fixture.view.pointer(press);
  auto release = pointer(bureau::PointerEvent::Kind::Up, 10, 10);
  release.button = 4;
  fixture.view.pointer(release);
  const auto heard = fixture.handled("__observeKeys");
  REQUIRE(heard.size() == 2);
  CHECK(heard[0].args[0]["code"] == "Mouse4");
  CHECK(heard[0].args[0]["phase"] == "down");
  CHECK(heard[1].args[0]["code"] == "Mouse5");
  CHECK(heard[1].args[0]["phase"] == "up");
  CHECK(fixture.handled("__pointerDown").empty());
}

TEST_CASE("a side mouse button bound to cancel is Escape") {
  Fixture fixture;
  fixture.view.setCancelKey("Mouse4");
  auto press = pointer(bureau::PointerEvent::Kind::Down, 10, 10);
  press.button = 3;
  fixture.view.pointer(press);
  const auto heard = fixture.handled("__observeKeys");
  REQUIRE(heard.size() == 1);
  CHECK(heard[0].args[0]["key"] == "Escape");
}

TEST_CASE("an inline box's percentage width is of its line, as an inline-block's") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 200}, {"direction", "column"}})
                     .create(2, "bureau-text")
                     .create(3, "bureau-box",
                             {{"inline", {{"align", "middle"}}},
                              {"width", "100%"},
                              {"height", 20}})
                     .create(4, "bureau-text")
                     .create(5, "bureau-box",
                             {{"inline", {{"align", "middle"}}},
                              {"width", "100%"},
                              {"maxWidth", 140},
                              {"height", 20}})
                     .append(2, 3)
                     .append(4, 5)
                     .append(1, 2)
                     .append(1, 4)
                     .append(0, 1));
  CHECK(fixture.rect(3).width == doctest::Approx(200));
  CHECK(fixture.rect(5).width == doctest::Approx(140));
}

TEST_CASE("an inline box's margins hold it apart on its line") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-text")
                     .create(2, "bureau-box",
                             {{"inline", {{"align", "middle"}}},
                              {"width", 20},
                              {"height", 20}})
                     .create(3, "bureau-box",
                             {{"inline", {{"align", "middle"}}},
                              {"margin", {0, 0, 0, 8}},
                              {"width", 20},
                              {"height", 20}})
                     .append(1, 2)
                     .append(1, 3)
                     .append(0, 1));
  CHECK(fixture.rect(3).x - fixture.rect(2).x == doctest::Approx(28));
  CHECK(fixture.rect(3).width == doctest::Approx(20));
}

TEST_CASE("an empty end-aligned field draws its caret at its end") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-field",
                             {{"value", ""}, {"bare", true}, {"align", "end"},
                              {"width", 100}, {"height", 32}})
                     .append(0, 1));
  fixture.view.focus(1, true);
  REQUIRE(fixture.view.frame(0));
  const auto& caret = fixture.view.displayList()->quads.back();
  // Eight points of inset either side leave an 84-point line.
  CHECK(caret.x0 == 92);
  CHECK(caret.x1 == 93);
}

TEST_CASE("an end-aligned field draws its caret after its text, at its end") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-field",
                             {{"value", "22"}, {"bare", true}, {"align", "end"},
                              {"width", 100}, {"height", 32}})
                     .append(0, 1));
  fixture.view.focus(1, true);
  REQUIRE(fixture.view.frame(0));
  const auto& caret = fixture.view.displayList()->quads.back();
  CHECK(caret.x0 == 92);
}

TEST_CASE("the caret goes to the end when React commits other text than was typed") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-field",
                                {{"value", "2"}, {"kind", "number"},
                                 {"onChange", true}}).append(0, 1));
  fixture.view.focus(1, true);
  bureau::KeyEvent backspace;
  backspace.key = "Backspace";
  fixture.view.key(backspace);
  REQUIRE(fixture.handled("onChange").back().args == Json::array({""}));
  // A number field answers an emptied value with zero.
  fixture.commit(Stream().props(1, {{"value", "0"}}));
  CHECK(fixture.view.textInput()["selectionEnd"] == 1);
  fixture.view.typed("15");
  CHECK(fixture.handled("onChange").back().args == Json::array({"015"}));
}

TEST_CASE("a field types at its caret and submits on Enter") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-field",
                             {{"value", "Mar"}, {"onChange", true},
                              {"onSubmit", true}})
                     .append(0, 1));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 10, 10));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 10, 10));
  REQUIRE(fixture.view.focused() == 1);
  fixture.view.typed("ina");
  CHECK(fixture.handled("onChange").back().args == Json::array({"Marina"}));
  bureau::KeyEvent enter;
  enter.key = "Enter";
  fixture.view.key(enter);
  CHECK(fixture.handled("onSubmit").back().args == Json::array({"Mar"}));
}

TEST_CASE("native text input preserves UTF-16 selection and composition results") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-field",
                                {{"value", "東京😀"}, {"onChange", true},
                                 {"onSubmit", true}}).append(0, 1));
  fixture.view.focus(1, true);
  CHECK(fixture.view.textInput()["selectionEnd"] == 4);
  fixture.view.editText({{"value", "東京😀湾"}, {"selectionStart", 2},
                         {"selectionEnd", 4}});
  CHECK(fixture.handled("onChange").back().args == Json::array({"東京😀湾"}));
  fixture.commit(Stream().props(1, {{"value", "東京😀湾"}}));
  CHECK(fixture.view.textInput()["selectionStart"] == 2);
  CHECK(fixture.view.textInput()["selectionEnd"] == 4);
  fixture.view.editText({{"submit", true}});
  CHECK(fixture.handled("onSubmit").back().args == Json::array({"東京😀湾"}));
  fixture.view.blur(1);
  CHECK(fixture.view.textInput() == Json{{"focused", 0}});
}

TEST_CASE("native field length counts UTF-16 units without cutting a character") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-field",
                                {{"value", ""}, {"onChange", true},
                                 {"maxLength", 3}}).append(0, 1));
  fixture.view.focus(1, true);
  fixture.view.editText({{"value", "A😀B"}, {"selectionStart", 4}});
  CHECK(fixture.handled("onChange").back().args == Json::array({"A😀"}));
  fixture.view.editText({{"value", "東京😀"}, {"selectionStart", 4}});
  CHECK(fixture.handled("onChange").back().args == Json::array({"東京"}));
}

TEST_CASE("native text acknowledges an edit only after React commits its value") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-field",
                                {{"value", "A"}, {"onChange", true}}).append(0, 1));
  fixture.view.focus(1, true);
  fixture.view.editText({{"value", "AB"}, {"sequence", 1}});
  CHECK(fixture.view.textInput()["sequence"] == 0);
  fixture.view.editText({{"value", "ABC"}, {"sequence", 2}});
  fixture.commit(Stream().props(1, {{"value", "AB"}}));
  CHECK(fixture.view.textInput()["sequence"] == 0);
  fixture.commit(Stream().props(1, {{"value", "ABC"}}));
  CHECK(fixture.view.textInput()["sequence"] == 2);
  CHECK(fixture.view.textInput()["value"] == "ABC");
}

TEST_CASE("native text takes the value a filtering field commits instead of the edit") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-field",
                                {{"value", "a"}, {"onChange", true}}).append(0, 1));
  fixture.view.focus(1, true);
  fixture.view.editText({{"value", "a1"}, {"sequence", 1}});
  fixture.view.editText({{"value", "a1b"}, {"sequence", 2}});
  fixture.commit(Stream().props(1, {{"value", "ab"}}));
  CHECK(fixture.view.textInput()["sequence"] == 2);
  CHECK(fixture.view.textInput()["value"] == "ab");
}

TEST_CASE("safe edges and the keyboard leave the drawing buffer intact") {
  Fixture fixture(2);
  fixture.view.setInsets(20, 10, 15, 5, 100);
  fixture.commit(Stream().create(1, "bureau-box",
                                {{"width", "100%"}, {"height", "100%"}})
                     .append(0, 1));
  CHECK(fixture.rect(1).x == 5);
  CHECK(fixture.rect(1).y == 20);
  CHECK(fixture.rect(1).width == 385);
  CHECK(fixture.rect(1).height == 180);
  fixture.view.frame(0);
  CHECK(fixture.view.displayList()->width == 800);
  CHECK(fixture.view.displayList()->height == 600);
  fixture.view.setInsets(20, 10, 15, 5, 0);
  CHECK(fixture.rect(1).height == 265);
}

TEST_CASE("a box filling a cover layer reaches the window's edges past the safe area") {
  Fixture fixture;
  fixture.view.setInsets(20, 10, 15, 5, 0);
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"id", "ui-root"}, {"width", "100%"}, {"height", "100%"}})
                     .create(2, "bureau-layer", {{"cover", true}, {"stacking", "modal"}})
                     .create(3, "bureau-box",
                             {{"width", "100%"}, {"height", "100%"},
                              {"align", "center"}, {"justify", "center"}})
                     .create(4, "bureau-box", {{"width", 51}, {"height", 31}})
                     .append(3, 4)
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.rect(3).x == 0);
  CHECK(fixture.rect(3).y == 0);
  CHECK(fixture.rect(3).width == 400);
  CHECK(fixture.rect(3).height == 300);
  // What it holds centres in the safe area: 5 + (385 - 51) / 2, 20 + (265 - 31) / 2.
  CHECK(fixture.rect(4).x == 172);
  CHECK(fixture.rect(4).y == 137);
}

TEST_CASE("a modal's scrim darkens the strip under the home indicator") {
  Fixture fixture(2);
  fixture.view.setInsets(0, 0, 20, 0, 0);
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"id", "ui-root"}, {"width", "100%"}, {"height", "100%"}})
                     .create(2, "bureau-layer", {{"cover", true}, {"stacking", "modal"}})
                     .create(3, "bureau-box",
                             {{"look", "scrim"}, {"width", "100%"}, {"height", "100%"}})
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  const auto list = fixture.view.displayList();
  REQUIRE(list->quads.size() == 1);
  const auto& scrim = list->quads[0];
  CHECK(scrim.y1 == 600);
  CHECK(list->clips[scrim.clip].height == 600);
}

TEST_CASE("a modal's scrim takes a tap under the home indicator") {
  Fixture fixture;
  fixture.view.setInsets(0, 0, 20, 0, 0);
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"id", "ui-root"}, {"width", "100%"}, {"height", "100%"}})
                     .create(2, "bureau-layer", {{"cover", true}, {"stacking", "modal"}})
                     .create(3, "bureau-box",
                             {{"width", "100%"}, {"height", "100%"}, {"onPress", true}})
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 200, 290));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 200, 290));
  REQUIRE(fixture.handled("onPress").size() == 1);
  CHECK(fixture.handled("onPress").front().node == 3);
}

TEST_CASE("a bar along a cover layer's top reaches the window's top and sides") {
  Fixture fixture;
  fixture.view.setInsets(20, 10, 15, 5, 0);
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"id", "ui-root"}, {"width", "100%"}, {"height", "100%"}})
                     .create(2, "bureau-layer", {{"cover", true}, {"stacking", "top-bar"}})
                     .create(3, "bureau-box",
                             {{"position", "absolute"},
                              {"inset", {{"top", 0}, {"left", 0}, {"right", 0}}},
                              {"height", 44}})
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.rect(3).x == 0);
  CHECK(fixture.rect(3).y == 0);
  CHECK(fixture.rect(3).width == 400);
  CHECK(fixture.rect(3).height == 64);
}

TEST_CASE("what a bar on a cover layer holds stays in the safe area") {
  Fixture fixture;
  fixture.view.setInsets(20, 10, 15, 5, 0);
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"id", "ui-root"}, {"width", "100%"}, {"height", "100%"}})
                     .create(2, "bureau-layer", {{"cover", true}, {"stacking", "top-bar"}})
                     .create(3, "bureau-box",
                             {{"position", "absolute"},
                              {"inset", {{"top", 0}, {"left", 0}, {"right", 0}}},
                              {"height", 44}})
                     .create(4, "bureau-box", {{"width", "100%"}, {"height", 44}})
                     .append(3, 4)
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.rect(4).x == 5);
  CHECK(fixture.rect(4).y == 20);
  CHECK(fixture.rect(4).width == 385);
}

TEST_CASE("a box on one edge of a cover layer keeps to the safe area") {
  Fixture fixture;
  fixture.view.setInsets(0, 0, 20, 5, 0);
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"id", "ui-root"}, {"width", "100%"}, {"height", "100%"}})
                     .create(2, "bureau-layer", {{"cover", true}, {"stacking", "dock"}})
                     .create(3, "bureau-box",
                             {{"position", "absolute"},
                              {"inset", {{"left", 0}, {"bottom", 0}}},
                              {"width", 100},
                              {"height", 40}})
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.rect(3).x == 5);
  CHECK(fixture.rect(3).y == 240);
  CHECK(fixture.rect(3).height == 40);
}

TEST_CASE("a bar clear of the screen's bottom keeps its bottom in the safe area") {
  Fixture fixture;
  fixture.view.setInsets(0, 0, 20, 0, 0);
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"id", "ui-root"}, {"width", "100%"}, {"height", "100%"}})
                     .create(2, "bureau-layer", {{"cover", true}, {"stacking", "modal"}})
                     .create(3, "bureau-box",
                             {{"position", "absolute"},
                              {"inset", {{"left", 0}, {"right", 0}, {"bottom", 14}}},
                              {"height", 40}})
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.rect(3).y == 226);
  CHECK(fixture.rect(3).height == 40);
}

TEST_CASE("two city touches keep their identities and never synthesize a mouse") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-box",
                                {{"width", 400}, {"height", 300}})
                     .append(0, 1));
  fixture.view.setSurface(1);
  auto first = pointer(bureau::PointerEvent::Kind::Down, 30, 40);
  first.touch = true;
  first.id = 7;
  fixture.view.pointer(first);
  auto second = pointer(bureau::PointerEvent::Kind::Down, 70, 90);
  second.touch = true;
  second.id = 12;
  fixture.view.pointer(second);
  CHECK(fixture.handled("__surface").back().args == Json::array({
    "touchStart", {{"timeStamp", 0}, {"touches", Json::array({
      {{"identifier", 7}, {"clientX", 30}, {"clientY", 40}},
      {{"identifier", 12}, {"clientX", 70}, {"clientY", 90}}})}}}));
  first.kind = bureau::PointerEvent::Kind::Up;
  fixture.view.pointer(first);
  CHECK(fixture.handled("__surface").back().args == Json::array({
    "touchEnd", {{"timeStamp", 0}, {"touches", Json::array({
      {{"identifier", 12}, {"clientX", 70}, {"clientY", 90}}})}}}));
  second.kind = bureau::PointerEvent::Kind::Cancel;
  fixture.view.pointer(second);
  CHECK(fixture.handled("__surface").back().args[0] == "touchCancel");
  CHECK(fixture.handled("__surface").size() == 4);
}

TEST_CASE("a slider's control carries its drawn ends and a number field only its own") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-field", {{"kind", "range"}, {"value", "4"}})
                     .create(2, "bureau-field", {{"kind", "number"}, {"value", "2"},
                                                 {"min", 1}, {"step", 0.5}})
                     .append(0, 1)
                     .append(0, 2));
  CHECK(fixture.view.control(1) == Json{{"kind", "range"}, {"disabled", false},
                                        {"value", "4"}, {"min", 0}, {"max", 100},
                                        {"step", 1}});
  CHECK(fixture.view.control(2) == Json{{"kind", "number"}, {"disabled", false},
                                        {"value", "2"}, {"min", 1}, {"step", 0.5}});
}

TEST_CASE("a slider's control carries its decimal step and ends exactly") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-field", {{"kind", "range"}, {"value", "0.1"},
                                                 {"max", 0.3}, {"step", 0.1}})
                     .append(0, 1));
  CHECK(fixture.view.control(1) == Json{{"kind", "range"}, {"disabled", false},
                                        {"value", "0.1"}, {"min", 0}, {"max", 0.3},
                                        {"step", 0.1}});
}

TEST_CASE("the cursor reaches the host in UI pixels and the city in window points") {
  Fixture fixture;
  fixture.view.setUiScale(1.5f);
  fixture.commit(Stream().create(1, "bureau-box",
                                {{"width", 400}, {"height", 300}})
                     .append(0, 1));
  fixture.view.setSurface(1);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 300, 150));
  CHECK(fixture.handled("__cursor").back().args ==
        Json::array({{{"x", 200}, {"y", 100}}}));
  CHECK(fixture.view.pointerX() == 200);
  CHECK(fixture.view.pointerY() == 100);
  CHECK(fixture.handled("__surface").back().args[1]["x"] == 300);
}

TEST_CASE(
    "a reload forgets the city surface before its node ids become UI "
    "controls") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 200}, {"height", 100}})
                     .append(0, 1));
  fixture.view.setSurface(1);
  fixture.view.clear();
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 200}, {"height", 100}})
                     .create(2, "bureau-box",
                             {{"width", 40}, {"height", 40}, {"onPress", true}})
                     .append(1, 2)
                     .append(0, 1));
  auto touch = pointer(bureau::PointerEvent::Kind::Down, 10, 10);
  touch.touch = true;
  touch.id = 8;
  fixture.view.pointer(touch);
  touch.kind = bureau::PointerEvent::Kind::Up;
  fixture.view.pointer(touch);
  REQUIRE(fixture.handled("onPress").size() == 1);
  CHECK(fixture.handled("onPress")[0].node == 2);
  CHECK(fixture.handled("__surface").empty());
}

TEST_CASE("a game's event changes bound text without another commit") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-text",
                                {{"binding", {{"field", "stats.cash"},
                                               {"format", {{"money", true}}}}}})
                     .append(0, 1));
  fixture.view.event({{"event", "stats"}, {"data", {{"cash", 1234.5}}}});
  fixture.view.frame(0);
  CHECK(fixture.view.probe(1, 1)[0]["text"] == "$1,235");
  fixture.view.event({{"event", "stats"}, {"data", {{"cash", -0.5}}}});
  fixture.view.frame(1);
  CHECK(fixture.view.probe(1, 1)[0]["text"] == "-$0.50");
}

TEST_CASE("a slow blink's state at literal times") {
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto at = [&](double ms) {
    return bureau::sampleAnimation(tokens, "bureau-lamp-blink", ms,
                                   std::nullopt, std::nullopt)
        ->opacity.value();
  };
  CHECK(at(100) == doctest::Approx(1));
  CHECK(at(300) == doctest::Approx(0.3));
  CHECK(at(600) == doctest::Approx(0.3));
  CHECK(at(800) == doctest::Approx(1));
  CHECK(at(1300) == doctest::Approx(0.3));
}

TEST_CASE("a slow blink owes its next paint at its next step, not the next frame") {
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto untilChange = [&](double ms) {
    return bureau::sampleAnimation(tokens, "bureau-lamp-blink", ms,
                                   std::nullopt, std::nullopt)
        ->untilChangeMs;
  };
  CHECK(untilChange(100) == doctest::Approx(150));
  CHECK(untilChange(300) == doctest::Approx(450));
  CHECK(untilChange(800) == doctest::Approx(200));
}

TEST_CASE("a hold keeps each value from its moment to the next") {
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto sample = [&](const char* name, double ms) {
    return *bureau::sampleAnimation(tokens, name, ms, std::nullopt,
                                    std::nullopt);
  };
  CHECK(sample("bureau-incident-roll", 10).scale == doctest::Approx(1));
  CHECK(sample("bureau-incident-roll", 30).scale == doctest::Approx(1.05));
  CHECK(sample("bureau-incident-roll", 30).untilChangeMs ==
        doctest::Approx(45));
  CHECK(sample("bureau-incident-roll", 130).scale == doctest::Approx(1.05));
  CHECK(sample("bureau-glitch-jitter", 1160).translateX ==
        doctest::Approx(0.5));
  CHECK(sample("bureau-steam-rest", 500).hidden);
  CHECK_FALSE(sample("bureau-steam-rest", 1300).hidden);
  CHECK(sample("bureau-keycap-blink", 250).fill == "goal");
}

TEST_CASE("the pause lamp owes a paint each half second") {
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto untilChange = [&](double ms) {
    return bureau::sampleAnimation(tokens, "bureau-pause-blink", ms,
                                   std::nullopt, std::nullopt)
        ->untilChangeMs;
  };
  CHECK(untilChange(100) == doctest::Approx(400));
  CHECK(untilChange(600) == doctest::Approx(400));
  CHECK(untilChange(1100) == doctest::Approx(400));
}

TEST_CASE("the gift's shake owes frames only while it shakes") {
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto untilChange = [&](double ms) {
    return bureau::sampleAnimation(tokens, "bureau-gift-shake", ms,
                                   std::nullopt, std::nullopt)
        ->untilChangeMs;
  };
  CHECK(untilChange(1000) == doctest::Approx(27200));
  CHECK(untilChange(28500) == 0);
  CHECK(untilChange(31000) == doctest::Approx(27200));
}

TEST_CASE("a new control's ring paints an outline outside and a band inside") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"width", 100}, {"height", 100}, {"padding", 10}})
                     .create(2, "bureau-box",
                             {{"width", 40},
                              {"height", 20},
                              {"animation", "bureau-attention-rainbow-framed"}})
                     .append(1, 2)
                     .append(0, 1));
  fixture.view.frame(0);
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto inkOf = [&](const char* name) {
    return *tokens.ink(name, bureau::style::Chrome::Light);
  };
  const auto quadAt = [&](float x0, float y0, float x1, float y1) {
    for (const auto& quad : fixture.view.displayList()->quads) {
      if (quad.x0 == x0 && quad.y0 == y0 && quad.x1 == x1 && quad.y1 == y1) {
        return std::optional(quad);
      }
    }
    return std::optional<bureau::Quad>();
  };
  const auto outlineTop = quadAt(7, 7, 53, 9);
  REQUIRE(outlineTop.has_value());
  CHECK(outlineTop->r == inkOf("db32-orange-burnt").r);
  CHECK(outlineTop->g == inkOf("db32-orange-burnt").g);
  const auto ringTop = quadAt(10, 10, 50, 12);
  REQUIRE(ringTop.has_value());
  CHECK(ringTop->r == inkOf("db32-red-pink").r);
  CHECK(ringTop->g == inkOf("db32-red-pink").g);
  fixture.view.frame(200);
  const auto nextOutline = quadAt(7, 7, 53, 9);
  REQUIRE(nextOutline.has_value());
  CHECK(nextOutline->g == inkOf("db32-yellow-bright").g);
}

TEST_CASE("the attention shake holds still under the pointer and resumes after") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"width", 100},
                              {"height", 40},
                              {"fill", "paper"},
                              {"onPress", true},
                              {"animation", "bureau-attention-shake"}})
                     .append(0, 1));
  const auto left = [&]() {
    return fixture.view.displayList()->quads.at(0).x0;
  };
  fixture.view.frame(0);
  fixture.view.frame(2128);
  CHECK(left() == -2);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 50, 20));
  fixture.view.frame(2129);
  fixture.view.frame(2240);
  CHECK(left() == -2);
  CHECK_FALSE(fixture.view.frame(2256));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 300, 250));
  fixture.view.frame(2300);
  CHECK(left() == -2);
  fixture.view.frame(2412);
  CHECK(left() == 2);
}

TEST_CASE("the gift's shake stops under the pointer and starts over after") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"width", 100},
                              {"height", 40},
                              {"fill", "paper"},
                              {"onPress", true},
                              {"animation", "bureau-gift-shake"}})
                     .append(0, 1));
  const auto left = [&]() {
    return fixture.view.displayList()->quads.at(0).x0;
  };
  fixture.view.frame(0);
  fixture.view.frame(28500);
  CHECK(left() == -2);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 50, 20));
  fixture.view.frame(28516);
  CHECK(left() == 0);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 300, 250));
  fixture.view.frame(29000);
  fixture.view.frame(29000 + 28500);
  CHECK(left() == -2);
}

TEST_CASE("the pointer hits a box where its animation draws it") {
  Fixture fixture;
  // Laid out at 200..300, drawn at 150..250: centred on its left edge.
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"position", "absolute"},
                              {"inset", {{"left", 200}, {"top", 0}}},
                              {"width", 100},
                              {"height", 40},
                              {"onHoverChange", true},
                              {"animation", "bureau-centre-x"}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 160, 20));
  const auto hovers = fixture.handled("onHoverChange");
  REQUIRE(hovers.size() == 1);
  CHECK(hovers[0].node == 1);
  CHECK(hovers[0].args == Json::array({true}));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 280, 20));
  CHECK(fixture.handled("onHoverChange").back().args == Json::array({false}));
}

TEST_CASE("a click lands on a box where its animation draws it") {
  Fixture fixture;
  // Laid out at 200..300, drawn at 150..250: centred on its left edge.
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"position", "absolute"},
                              {"inset", {{"left", 200}, {"top", 0}}},
                              {"width", 100},
                              {"height", 40},
                              {"onPress", true},
                              {"animation", "bureau-centre-x"}})
                     .append(0, 1));
  REQUIRE(fixture.view.frame(0));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 160, 20));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 160, 20));
  CHECK(fixture.handled("onPress").size() == 1);
}

TEST_CASE("under reduced motion an animation shows one still picture") {
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto still = [&](const char* name) {
    return bureau::stillAnimation(tokens, name);
  };
  CHECK_FALSE(still("bureau-pause-blink").has_value());
  CHECK_FALSE(still("bureau-attention-shake").has_value());
  REQUIRE(still("bureau-dock-hide").has_value());
  CHECK(still("bureau-dock-hide")->hidden);
  CHECK(still("bureau-curtain-darken")->opacity.value() == doctest::Approx(1));
  REQUIRE(still("bureau-flip-sixth").has_value());
  CHECK(still("bureau-flip-sixth")->hidden);
  CHECK_FALSE(still("bureau-flip-sixth-lead").has_value());
  CHECK(std::isinf(still("bureau-dock-hide")->untilChangeMs));
}

TEST_CASE("under reduced motion a blinking box never repaints for its blink") {
  Fixture fixture;
  fixture.view.setReducedMotion(true);
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"width", 10},
                              {"height", 10},
                              {"fill", "paper"},
                              {"animation", "bureau-pause-blink"}})
                     .append(0, 1));
  CHECK(fixture.view.frame(0));
  CHECK_FALSE(fixture.view.animating());
  CHECK_FALSE(fixture.view.frame(500));
  CHECK(fixture.view.displayList()->quads.at(0).a == 255);
}

TEST_CASE("a held pose shifts its box from the first frame and never repaints") {
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto sample = bureau::sampleAnimation(tokens, "bureau-centre-x", 0,
                                              std::nullopt, std::nullopt);
  REQUIRE(sample.has_value());
  CHECK(sample->translateXPercent == doctest::Approx(-50));
  CHECK(std::isinf(sample->untilChangeMs));
}

TEST_CASE("the saving bar runs back on every other cycle") {
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto at = [&](double ms) {
    return bureau::sampleAnimation(tokens, "bureau-saving-pending", ms,
                                   std::nullopt, std::nullopt)
        ->translateXPercent;
  };
  CHECK(at(600) == doctest::Approx(92.5));
  CHECK(at(1199) == doctest::Approx(185).epsilon(0.01));
  CHECK(at(1800) == doctest::Approx(92.5));
  CHECK(at(2399) == doctest::Approx(0).epsilon(0.01));
}

TEST_CASE("a smooth slide owes every frame until it rests") {
  bureau::style::Tokens tokens;
  REQUIRE(tokens.load(tokenDocument()));
  const auto sample = [&](double ms) {
    return bureau::sampleAnimation(tokens, "bureau-float-up", ms,
                                   std::nullopt, std::nullopt);
  };
  CHECK(sample(600)->untilChangeMs == 0);
  CHECK(std::isinf(sample(1300)->untilChangeMs));
}

TEST_CASE("a blinking box repaints at the blink's steps alone") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"width", 10}, {"height", 10},
                              {"animation", "bureau-pause-blink"}})
                     .append(0, 1));
  CHECK(fixture.view.frame(0));
  CHECK(fixture.view.animating());
  CHECK_FALSE(fixture.view.frame(16));
  CHECK_FALSE(fixture.view.frame(496));
  CHECK(fixture.view.frame(512));
  CHECK_FALSE(fixture.view.frame(528));
  CHECK_FALSE(fixture.view.frame(992));
  CHECK(fixture.view.frame(1008));
}

TEST_CASE("a counted figure reads its value at the frame's moment") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-text",
                             {{"count", {{"from", 0},
                                         {"to", 1000},
                                         {"durationMs", 1000},
                                         {"format", {{"money", true}}}}}})
                     .append(0, 1));
  fixture.view.frame(0);
  fixture.view.frame(500);
  CHECK(bureau::formatFigure(1234.5, {{"money", true}}) == "$1,235");
  CHECK(bureau::formatFigure(-0.5, {{"money", true}}) == "-$0.50");
  CHECK(bureau::formatFigure(7452541, {{"money", true}, {"compact", true}}) ==
        "$7.45m");
  CHECK(bureau::formatFigure(12345, {{"grouped", true}}) == "12,345");
  CHECK(fixture.view.animating() == false);
}

TEST_CASE("native number formatting matches decimal tables and JavaScript fixed digits") {
  CHECK(bureau::formatFigure(1.005, {{"grouped", true}, {"decimals", 2}}) == "1.01");
  CHECK(bureau::formatFigure(1.005, {{"decimals", 2}}) == "1.00");
  CHECK(bureau::formatFigure(2.5, {{"decimals", 0}}) == "3");
  CHECK(bureau::formatFigure(-2.5, {{"decimals", 0}}) == "-3");
  CHECK(bureau::formatFigure(0.1, {{"decimals", 20}}) == "0.10000000000000000555");
  CHECK(bureau::formatFigure(1000000, {}) == "1000000");
  CHECK(bureau::formatFigure(0.000001, {}) == "0.000001");
  CHECK(bureau::formatFigure(0.0000001, {}) == "1e-7");
  CHECK(bureau::formatFigure(1e21, {}) == "1e+21");
  CHECK(bureau::formatFigure(-0.0, {}) == "0");
  CHECK(bureau::formatFigure(12, {{"prefix", "<"}, {"suffix", ">"}}) == "<12>");
}

TEST_CASE("a box inside a Text is a block: its text wraps at the Text's width") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-box", {{"width", 60}, {"direction", "column"}})
                     .create(2, "bureau-text")
                     .create(3, "bureau-box", {{"direction", "column"}})
                     .create(4, "bureau-text")
                     .text(5, "one two six ten")
                     .append(4, 5)
                     .append(3, 4)
                     .append(2, 3)
                     .append(1, 2)
                     .append(0, 1));
  CHECK(fixture.rect(3).width == doctest::Approx(60));
  CHECK(fixture.rect(4).width <= 60);
  CHECK(fixture.rect(4).height > 21.6f);
}

TEST_CASE("portal targets are cached per commit and cannot create an ancestry cycle") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"id", "ui-root"}, {"width", 100}, {"height", 100}})
    .create(2, "bureau-layer")
    .create(3, "bureau-box", {{"id", "inside"}, {"width", 20}, {"height", 20}})
    .append(2, 3).append(1, 2).append(0, 1));
  CHECK(fixture.view.find("inside") == 3);
  CHECK(fixture.view.contains(1, 3));
  fixture.commit(Stream().props(2, {{"rootId", "inside"}}));
  CHECK_FALSE(fixture.view.contains(1, 3));
  CHECK(fixture.view.frame(0));
  fixture.commit(Stream().props(2, {{"rootId", "ui-root"}}));
  CHECK(fixture.view.contains(1, 3));
  CHECK(fixture.view.frame(1));
}

TEST_CASE("a scroll gutter preserves padding inherited from all four edges") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100}, {"direction", "column"},
                                {"padding", 16}, {"scrollbar", "always"}})
    .create(2, "bureau-box", {{"height", 200}}).append(1, 2).append(0, 1));
  CHECK(fixture.rect(2).x == 16);
  CHECK(fixture.rect(2).width == 50);
}

TEST_CASE("sticky boxes follow their scrollport but stay inside their parent") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100},
      {"direction", "column"}, {"scrollbar", "hidden"}, {"offset", {{"y", 0}}}})
    .create(2, "bureau-box", {{"direction", "column"}, {"height", 200}, {"shrink", 0}})
    .create(3, "bureau-box", {{"position", "sticky"}, {"height", 20},
      {"shrink", 0}, {"inset", {{"top", 5}}}, {"onPress", true}})
    .create(4, "bureau-box", {{"width", 8}, {"height", 8}})
    .create(5, "bureau-box", {{"height", 160}, {"shrink", 0}})
    .create(6, "bureau-box", {{"position", "sticky"}, {"height", 20},
      {"shrink", 0}, {"inset", {{"bottom", 7}}}, {"onPress", true}})
    .create(7, "bureau-box", {{"height", 200}, {"shrink", 0}})
    .append(3, 4).append(2, 3).append(2, 5).append(2, 6)
    .append(1, 2).append(1, 7).append(0, 1));
  CHECK(fixture.rect(3).y == 5);
  CHECK(fixture.rect(4).y == 5);
  CHECK(fixture.rect(6).y == 73);
  fixture.view.scrollBy(1, 0, 60);
  CHECK(fixture.rect(3).y == 5);
  CHECK(fixture.rect(4).y == 5);
  CHECK(fixture.rect(6).y == 73);
  CHECK(fixture.rect(7).y == 140);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 50, 10));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 50, 10));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 50, 80));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 50, 80));
  REQUIRE(fixture.handled("onPress").size() == 2);
  CHECK(fixture.handled("onPress")[0].node == 3);
  CHECK(fixture.handled("onPress")[1].node == 6);
  fixture.view.scrollBy(1, 0, 130);
  CHECK(fixture.rect(3).y == -10);
  CHECK(fixture.rect(4).y == -10);
  CHECK(fixture.rect(6).y == -10);
  fixture.view.scrollBy(1, 0, 60);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 50, 5));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 50, 5));
  CHECK(fixture.handled("onPress").size() == 2);

  fixture.commit(Stream()
    .props(1, {{"width", 100}, {"height", 100}, {"direction", "row"}, {"axis", "horizontal"},
      {"scrollbar", "hidden"}, {"offset", {{"x", 60}}}})
    .props(2, {{"direction", "row"}, {"width", 200}, {"height", nullptr}, {"shrink", 0}})
    .props(3, {{"position", "sticky"}, {"width", 20}, {"height", 20},
      {"shrink", 0}, {"inset", {{"left", 5}}}})
    .props(5, {{"width", 160}, {"height", 20}, {"shrink", 0}})
    .props(6, {{"position", "sticky"}, {"width", 20}, {"height", 20},
      {"shrink", 0}, {"inset", {{"right", 7}}}})
    .props(7, {{"width", 200}, {"height", 20}, {"shrink", 0}}));
  CHECK(fixture.rect(3).x == 5);
  CHECK(fixture.rect(4).x == 5);
  CHECK(fixture.rect(6).x == 73);
  fixture.view.scrollBy(1, 130, 0);
  CHECK(fixture.rect(3).x == -10);
  CHECK(fixture.rect(4).x == -10);
  CHECK(fixture.rect(6).x == -10);
}

TEST_CASE("sticky bounds use padding, margins and the nearest scroll container") {
  Fixture direct;
  direct.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100}, {"padding", 10},
      {"direction", "column"}, {"scrollbar", "hidden"}, {"offset", {{"y", 150}}}})
    .create(2, "bureau-box", {{"position", "sticky"}, {"height", 20},
      {"inset", {{"top", 5}}}, {"margin", {3, 0, 4, 0}}})
    .create(3, "bureau-box", {{"height", 300}})
    .create(4, "bureau-box", {{"position", "sticky"}, {"height", 20},
      {"inset", {{"bottom", 7}}}})
    .append(1, 2).append(1, 3).append(1, 4).append(0, 1));
  CHECK(direct.rect(2).y == 15);
  CHECK(direct.rect(4).y == 63);

  Fixture padded;
  padded.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100},
      {"direction", "column"}, {"scrollbar", "hidden"}, {"offset", {{"y", 100}}}})
    .create(2, "bureau-box", {{"height", 120}, {"padding", 10},
      {"direction", "column"}, {"shrink", 0}})
    .create(3, "bureau-box", {{"position", "sticky"}, {"height", 20}, {"shrink", 0},
      {"inset", {{"top", 5}}}, {"margin", {3, 0, 4, 0}}})
    .create(4, "bureau-box", {{"height", 50}, {"shrink", 0}})
    .create(5, "bureau-box", {{"position", "sticky"}, {"height", 20},
      {"inset", {{"bottom", 7}}}, {"shrink", 0}})
    .create(6, "bureau-box", {{"height", 200}})
    .append(2, 3).append(2, 4).append(2, 5).append(1, 2).append(1, 6).append(0, 1));
  CHECK(padded.rect(3).y == -14);
  CHECK(padded.rect(5).y == -13);

  Fixture nested;
  nested.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 60},
      {"direction", "column"}, {"scrollbar", "hidden"}, {"offset", {{"y", 30}}}})
    .create(2, "bureau-box", {{"height", 50}})
    .create(3, "bureau-scroll", {{"width", 100}, {"height", 100},
      {"direction", "column"}, {"scrollbar", "hidden"}, {"offset", {{"y", 60}}}})
    .create(4, "bureau-box", {{"height", 200}, {"direction", "column"}, {"shrink", 0}})
    .create(5, "bureau-box", {{"position", "sticky"}, {"height", 20},
      {"inset", {{"top", 5}}}, {"shrink", 0}})
    .create(6, "bureau-box", {{"height", 160}, {"shrink", 0}})
    .create(7, "bureau-box", {{"position", "sticky"}, {"height", 20},
      {"inset", {{"bottom", 7}}}, {"shrink", 0}})
    .create(8, "bureau-box", {{"height", 200}})
    .append(4, 5).append(4, 6).append(4, 7).append(3, 4)
    .append(1, 2).append(1, 3).append(1, 8).append(0, 1));
  CHECK(nested.rect(5).y == 25);
  CHECK(nested.rect(7).y == 93);

  Fixture oversized;
  oversized.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100},
      {"direction", "column"}, {"scrollbar", "hidden"}, {"offset", {{"y", 60}}}})
    .create(2, "bureau-box", {{"height", 300}, {"direction", "column"}, {"shrink", 0}})
    .create(3, "bureau-box", {{"position", "sticky"}, {"height", 150},
      {"inset", {{"top", 5}, {"bottom", 7}}}, {"shrink", 0}})
    .create(4, "bureau-box", {{"height", 150}, {"shrink", 0}})
    .append(2, 3).append(2, 4).append(1, 2).append(0, 1));
  CHECK(oversized.rect(3).y == 5);

  Fixture hidden;
  hidden.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100},
      {"direction", "column"}, {"scrollbar", "hidden"}, {"offset", {{"y", 60}}}})
    .create(2, "bureau-box", {{"height", 200}, {"direction", "column"},
      {"padding", 10}, {"overflow", "hidden"}, {"shrink", 0}})
    .create(3, "bureau-box", {{"position", "sticky"}, {"height", 20},
      {"inset", {{"top", 5}}}, {"shrink", 0}})
    .create(4, "bureau-box", {{"height", 160}, {"shrink", 0}})
    .append(2, 3).append(2, 4).append(1, 2).append(0, 1));
  CHECK(hidden.rect(3).y == -45);
}

TEST_CASE("sticky contexts paint and receive input above ordinary descendants") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 100}, {"height", 80}, {"direction", "column"}})
    .create(2, "bureau-box", {{"height", 40}, {"shrink", 0}})
    .create(3, "bureau-box", {{"position", "sticky"}, {"width", 40},
      {"height", 40}, {"fill", "paper"}, {"onPress", true}})
    .create(4, "bureau-box", {{"position", "sticky"}, {"width", 20},
      {"height", 20}, {"fill", "ink"}, {"onPress", true}})
    .create(5, "bureau-box", {{"width", 40}, {"height", 40}, {"shrink", 0},
      {"margin", {-40, 0, 0, 0}}, {"fill", "ink"}, {"onPress", true}})
    .create(6, "bureau-box", {{"position", "sticky"}, {"width", 10},
      {"height", 10}, {"shrink", 0}, {"margin", {-40, 0, 0, 0}},
      {"fill", "face"}, {"onPress", true}})
    .append(3, 4).append(2, 3).append(1, 2).append(1, 5).append(1, 6).append(0, 1));
  fixture.view.frame(0);
  const auto& quads = fixture.view.displayList()->quads;
  REQUIRE(quads.size() == 4);
  CHECK(quads[0].x1 == 40);
  CHECK(quads[0].r == 0);
  CHECK(quads[1].x1 == 40);
  CHECK(quads[1].r == 255);
  CHECK(quads[2].x1 == 20);
  CHECK(quads[2].r == 0);
  CHECK(quads[3].x1 == 10);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 5, 5));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 5, 5));
  REQUIRE(fixture.handled("onPress").size() == 1);
  CHECK(fixture.handled("onPress")[0].node == 6);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 15, 15));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 15, 15));
  REQUIRE(fixture.handled("onPress").size() == 2);
  CHECK(fixture.handled("onPress")[1].node == 4);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 30, 30));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 30, 30));
  REQUIRE(fixture.handled("onPress").size() == 3);
  CHECK(fixture.handled("onPress")[2].node == 3);
  fixture.commit(Stream().props(2, {{"opacity", 0.5}}));
  fixture.view.frame(1);
  const auto& isolated = fixture.view.displayList()->quads;
  REQUIRE(isolated.size() == 4);
  CHECK(isolated[0].r == 255);
  CHECK(isolated[0].a == 128);
  CHECK(isolated[1].x1 == 20);
  CHECK(isolated[2].x1 == 40);
  CHECK(isolated[2].a == 255);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 15, 15));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 15, 15));
  REQUIRE(fixture.handled("onPress").size() == 4);
  CHECK(fixture.handled("onPress")[3].node == 5);
}

TEST_CASE("nested Text inherits its enclosing Text or Box typography") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"typeStyle", "ui-14-solid"}, {"direction", "column"}})
    .create(2, "bureau-text")
    .create(3, "bureau-text", {{"ink", "ink-good"}})
    .text(4, "Ag").append(3, 4).append(2, 3).append(1, 2).append(0, 1));
  CHECK(fixture.rect(2).height == 14);
  fixture.commit(Stream().props(2, {{"typeStyle", "mono-12-solid"}}));
  CHECK(fixture.rect(2).height == 12);
}

TEST_CASE("scrollbars draw their engraved arrows and grip picture inside the thumb bevel") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100}, {"direction", "column"}})
    .create(2, "bureau-box", {{"height", 207}}).append(1, 2).append(0, 1));
  fixture.view.frame(0);
  std::vector<bureau::Quad> pictures;
  for (const auto& quad : fixture.view.displayList()->quads) {
    if (quad.mode == bureau::QuadMode::Picture) pictures.push_back(quad);
  }
  REQUIRE(pictures.size() == 3);
  CHECK(pictures[0].x0 == 87);
  CHECK(pictures[0].y0 == 7);
  // The arrow's 9 x 5 art, and 2px down-right for its lit wall.
  CHECK(pictures[0].x1 == 98);
  CHECK(pictures[0].y1 == 14);
  CHECK(pictures[1].y0 == 89);
  CHECK(pictures[2].x0 == 86);
  CHECK(pictures[2].y0 == 29);
}

TEST_CASE("scrollbar pictures snap before a doubled display density") {
  Fixture fixture(2);
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100}, {"direction", "column"}})
    .create(2, "bureau-box", {{"height", 207}}).append(1, 2).append(0, 1));
  fixture.view.frame(0);
  std::vector<bureau::Quad> pictures;
  for (const auto& quad : fixture.view.displayList()->quads) {
    if (quad.mode == bureau::QuadMode::Picture) pictures.push_back(quad);
  }
  REQUIRE(pictures.size() == 3);
  CHECK(pictures[0].x0 == 174);
  CHECK(pictures[0].y0 == 14);
  CHECK(pictures[0].x1 == 196);
  CHECK(pictures[0].y1 == 28);
  CHECK(pictures[2].y0 == 58);
}

TEST_CASE("a smooth picture snaps its painted bounds and uses a minified atlas entry") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-image", {
    {"source", "/pictures/solid.png"}, {"height", 64}, {"smooth", true}}).append(0, 1));
  CHECK(fixture.rect(1).width == 74.78125f);
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.at(0);
  CHECK(quad.x1 - quad.x0 == 75);
  CHECK((quad.u1 - quad.u0) * bureau::kAtlasSize == 78);
  CHECK((quad.v1 - quad.v0) * bureau::kAtlasSize == 66);
}

TEST_CASE("a touch scroll coasts by the native frame clock and a new touch stops it") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100},
                                {"direction", "column"}, {"onScroll", true}})
    .create(2, "bureau-box", {{"height", 1000}})
    .append(1, 2).append(0, 1));
  fixture.view.frame(0);
  auto touch = pointer(bureau::PointerEvent::Kind::Down, 30, 80);
  touch.touch = true;
  fixture.view.pointer(touch);
  fixture.view.frame(16);
  touch.kind = bureau::PointerEvent::Kind::Move;
  touch.y = 60;
  fixture.view.pointer(touch);
  CHECK(fixture.rect(2).y == -20);
  touch.kind = bureau::PointerEvent::Kind::Up;
  fixture.view.pointer(touch);
  CHECK(fixture.view.animating());
  fixture.view.frame(32);
  const float first = -fixture.rect(2).y;
  CHECK(first > 38);
  CHECK(first < 40);
  fixture.view.frame(48);
  const float second = -fixture.rect(2).y;
  CHECK(second > first);
  CHECK(second - first < first - 20);
  CHECK(fixture.handled("onScroll").back().args[0]["y"] == second);
  touch.kind = bureau::PointerEvent::Kind::Down;
  fixture.view.pointer(touch);
  fixture.view.frame(64);
  CHECK(-fixture.rect(2).y == second);
  CHECK_FALSE(fixture.view.animating());
}

TEST_CASE("a touch scroll starting on a Key coasts without activating the Key") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100},
                                {"direction", "column"}})
    .create(2, "bureau-box", {{"height", 1000}, {"onPress", true},
                             {"onHoldChange", true}})
    .append(1, 2).append(0, 1));
  fixture.view.frame(0);
  auto touch = pointer(bureau::PointerEvent::Kind::Down, 30, 80);
  touch.touch = true;
  fixture.view.pointer(touch);
  fixture.view.frame(16);
  touch.kind = bureau::PointerEvent::Kind::Move;
  touch.y = 60;
  fixture.view.pointer(touch);
  touch.kind = bureau::PointerEvent::Kind::Up;
  fixture.view.pointer(touch);
  CHECK(fixture.handled("onPress").empty());
  CHECK(fixture.handled("onHoldChange").back().args == Json::array({false, false}));
  fixture.view.frame(32);
  CHECK(fixture.rect(2).y < -38);
  const float beforeSuspending = fixture.rect(2).y;
  fixture.view.frame(1000);
  CHECK(fixture.rect(2).y == beforeSuspending);
  CHECK_FALSE(fixture.view.animating());
}

/** A 100-point list scrolling five 40-point rows: 2 at y 0, 3 at 40, 4 at 80. */
Stream listOfRows() {
  const Json row = {{"height", 40}, {"shrink", 0}, {"focusable", true},
                    {"onHoverChange", true}, {"onHoverMove", true},
                    {"onFocusChange", true}, {"onPress", true}};
  return Stream()
      .create(1, "bureau-scroll", {{"width", 100}, {"height", 100},
                                   {"direction", "column"}})
      .create(2, "bureau-box", row).create(3, "bureau-box", row)
      .create(4, "bureau-box", row).create(5, "bureau-box", row)
      .create(6, "bureau-box", row)
      .append(1, 2).append(1, 3).append(1, 4).append(1, 5).append(1, 6)
      .append(0, 1);
}

bureau::PointerEvent finger(bureau::PointerEvent::Kind kind, float y) {
  bureau::PointerEvent event{kind, 30, y};
  event.touch = true;
  return event;
}

TEST_CASE("a finger scrolling a list hovers and focuses none of its rows") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 90));
  fixture.view.frame(16);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Move, 50));
  fixture.view.frame(32);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Move, 10));
  CHECK(fixture.rect(2).y == -80);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 10));
  CHECK(fixture.handled("onHoverChange").empty());
  CHECK(fixture.handled("onHoverMove").empty());
  CHECK(fixture.handled("onFocusChange").empty());
}

TEST_CASE("a finger lifted where it landed hovers and focuses its row") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 50));
  CHECK(fixture.handled("onHoverChange").empty());
  CHECK(fixture.handled("onFocusChange").empty());
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 50));
  REQUIRE(fixture.handled("onHoverChange").size() == 1);
  CHECK(fixture.handled("onHoverChange").front().node == 3);
  CHECK(fixture.handled("onHoverChange").front().args == Json::array({true}));
  REQUIRE(fixture.handled("onFocusChange").size() == 1);
  CHECK(fixture.handled("onFocusChange").front().node == 3);
  CHECK(fixture.handled("onPress").size() == 1);
}

TEST_CASE("a finger lifted where it landed reads what is under it") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 50));
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 50));
  REQUIRE(fixture.handled("onHoverMove").size() == 1);
  CHECK(fixture.handled("onHoverMove").front().args[0] ==
        Json{{"x", 30}, {"y", 10}});
}

TEST_CASE("a finger resting on a list hovers its row once the rest is long enough") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(1000);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 50));
  CHECK(fixture.view.animating());
  fixture.view.frame(1249);
  CHECK(fixture.handled("onHoverChange").empty());
  fixture.view.frame(1250);
  REQUIRE(fixture.handled("onHoverChange").size() == 1);
  CHECK(fixture.handled("onHoverChange").front().node == 3);
  CHECK_FALSE(fixture.view.animating());
}

TEST_CASE("a resting finger that sets off still scrolls, and drops its hover") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 50));
  fixture.view.frame(250);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Move, 10));
  CHECK(fixture.rect(2).y == -40);
  CHECK(fixture.handled("onHoverChange").back().args == Json::array({false}));
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 10));
  CHECK(fixture.handled("onHoverChange").size() == 2);
}

TEST_CASE("a finger's small tremble while it lands is still a touch") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 50));
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Move, 47));
  CHECK(fixture.handled("onHoverChange").empty());
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 47));
  CHECK(fixture.handled("onHoverChange").size() == 1);
  CHECK(fixture.handled("onPress").size() == 1);
}

TEST_CASE("a finger stopping a coasting list taps and hovers nothing") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 90));
  fixture.view.frame(16);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Move, 60));
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 60));
  fixture.view.frame(32);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 50));
  fixture.view.frame(600);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 50));
  CHECK(fixture.handled("onHoverChange").empty());
  CHECK(fixture.handled("onPress").empty());
}

TEST_CASE("a finger landing outside a coasting list still presses") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 100}})
    .create(2, "bureau-box", {{"height", 1000}, {"shrink", 0}})
    .create(3, "bureau-box", {{"width", 40}, {"height", 40}, {"onPress", true}})
    .append(1, 2).append(0, 1).append(0, 3));
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 90));
  fixture.view.frame(16);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Move, 60));
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 60));
  fixture.view.frame(32);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 110));
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 110));
  CHECK(fixture.handled("onPress").size() == 1);
}

TEST_CASE("a cancelled finger hovers and focuses nothing") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 50));
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Cancel, 50));
  CHECK(fixture.handled("onHoverChange").empty());
  CHECK(fixture.handled("onFocusChange").empty());
}

TEST_CASE("the last tap's hover outlasts a new finger until that finger travels") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 50));
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Up, 50));
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 50));
  CHECK(fixture.handled("onHoverChange").size() == 1);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Move, 20));
  CHECK(fixture.handled("onHoverChange").back().args == Json::array({false}));
}

TEST_CASE("a mouse hovers and focuses a list's rows as it arrives") {
  Fixture fixture;
  fixture.commit(listOfRows());
  fixture.view.frame(0);
  fixture.view.pointer({bureau::PointerEvent::Kind::Move, 30, 50});
  CHECK(fixture.handled("onHoverChange").front().node == 3);
  fixture.view.pointer({bureau::PointerEvent::Kind::Down, 30, 50});
  CHECK(fixture.handled("onFocusChange").front().node == 3);
}

TEST_CASE("a finger outside any Scroll hovers as it lands and as it slides") {
  const Json row = {{"width", 40}, {"height", 40}, {"onHoverChange", true}};
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", row).create(2, "bureau-box", row)
    .append(0, 1).append(0, 2));
  fixture.view.frame(0);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Down, 10));
  CHECK(fixture.handled("onHoverChange").back().node == 1);
  fixture.view.pointer(finger(bureau::PointerEvent::Kind::Move, 50));
  CHECK(fixture.handled("onHoverChange").back().node == 2);
}

TEST_CASE("a vertical scrollbar thumb maps its travel to the content range") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 200},
                                {"direction", "column"}})
    .create(2, "bureau-box", {{"height", 1000}, {"onPress", true}})
    .append(1, 2).append(0, 1));
  fixture.view.frame(0);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 91, 30));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 91, 95.6f));
  CHECK(fixture.rect(2).y == doctest::Approx(-400));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 91, 95.6f));
  CHECK(fixture.handled("onPress").empty());
  fixture.view.frame(16);
  CHECK_FALSE(fixture.view.animating());
}

TEST_CASE("scrollbar arrows repeat on the native clock and the track pages") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 100}, {"height", 200},
                                {"direction", "column"}})
    .create(2, "bureau-box", {{"height", 1000}})
    .append(1, 2).append(0, 1));
  fixture.view.frame(0);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 91, 190));
  CHECK(fixture.rect(2).y == -40);
  CHECK(fixture.view.animating());
  fixture.view.frame(399);
  CHECK(fixture.rect(2).y == -40);
  fixture.view.frame(400);
  CHECK(fixture.rect(2).y == -80);
  fixture.view.frame(450);
  CHECK(fixture.rect(2).y == -120);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 91, 190));
  fixture.view.frame(1000);
  CHECK(fixture.rect(2).y == -120);
  CHECK_FALSE(fixture.view.animating());
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 91, 150));
  CHECK(fixture.rect(2).y == -300);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 91, 150));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 91, 9));
  CHECK(fixture.rect(2).y == -260);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 91, 9));
}

TEST_CASE("a horizontal scrollbar thumb uses the horizontal content range") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-scroll", {{"width", 200}, {"height", 100},
                                {"axis", "horizontal"}})
    .create(2, "bureau-box", {{"width", 1000}, {"height", 80}})
    .append(1, 2).append(0, 1));
  fixture.view.frame(0);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 30, 91));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 95.6f, 91));
  CHECK(fixture.rect(2).x == doctest::Approx(-400));
  CHECK(fixture.rect(2).y == 0);
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 95.6f, 91));
}

TEST_CASE("a known icon occupies its literal atlas rectangle and keeps its pixels") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-image", {{"source", "/icons/controller-xbox-a.png"}}).append(0, 1));
  fixture.view.frame(0);
  const auto list = fixture.view.displayList();
  REQUIRE(list->quads.size() == 1);
  const auto& quad = list->quads[0];
  CHECK(quad.mode == bureau::QuadMode::Picture);
  CHECK(quad.page == 0);
  CHECK(quad.u0 == doctest::Approx(5.0 / bureau::kAtlasSize));
  CHECK(quad.v0 == 0);
  CHECK(quad.u1 == doctest::Approx(17.0 / bureau::kAtlasSize));
  CHECK(quad.v1 == doctest::Approx(14.0 / bureau::kAtlasSize));
  bureau::ImageStore images(readPublic);
  const auto* icon = images.get("/icons/controller-xbox-a.png");
  REQUIRE(icon != nullptr);
  const auto pages = fixture.view.atlasPages();
  const auto expected = bureau::premultiplied(*icon);
  std::vector<uint8_t> packed;
  for (int y = 0; y < 14; ++y) {
    const auto begin = pages[0].pixels.begin() + (y * bureau::kAtlasSize + 5) * 4;
    packed.insert(packed.end(), begin, begin + 12 * 4);
  }
  CHECK(packed == expected);
  fixture.commit(Stream().props(1, {{"source", "/bureau/not-a-real-picture.png"}}));
  fixture.view.frame(1);
  CHECK(fixture.view.displayList()->quads.empty());
  CHECK(fixture.view.displayList()->missingImages ==
        std::vector<std::string>{"/bureau/not-a-real-picture.png"});
}

TEST_CASE("image capture failures describe the current visible frame") {
  Fixture fixture;
  fixture.commit(
      Stream()
          .create(1, "bureau-image",
                  {{"source", "/missing.png"}, {"width", 20}, {"height", 20}})
          .create(2, "bureau-image",
                  {{"source", "data:image/png;base64,bm90LWFuLWltYWdl"},
                   {"width", 20},
                   {"height", 20}})
          .append(0, 1)
          .append(0, 2));
  fixture.view.frame(0);
  CHECK(fixture.view.displayList()->missingImages ==
        std::vector<std::string>{"/missing.png",
                                 "data:image/png;base64,bm90LWFuLWltYWdl"});
  fixture.commit(Stream().props(2, {{"__hidden", true}}));
  fixture.view.frame(1);
  CHECK(fixture.view.displayList()->missingImages ==
        std::vector<std::string>{"/missing.png"});
  fixture.commit(Stream().props(1, {{"source", "/icons/controller-xbox-a.png"}}));
  fixture.view.frame(2);
  CHECK(fixture.view.displayList()->missingImages.empty());
}

TEST_CASE("world Layers follow the camera's projection and declutter without a commit") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"id", "ui-root"}, {"width", 400}, {"height", 300}})
    .create(2, "bureau-layer", {{"anchor", {{"kind", "world"}, {"x", 0}, {"y", 0}, {"z", 0.5},
                                           {"centered", true}, {"crowdGroup", "badge"}}}})
    .create(3, "bureau-box", {{"width", 20}, {"height", 10}, {"fill", "ink"}})
    .create(4, "bureau-layer", {{"anchor", {{"kind", "world"}, {"x", 0}, {"y", 0}, {"z", 0.5},
                                           {"centered", true}, {"crowdGroup", "badge"}}}})
    .create(5, "bureau-box", {{"width", 20}, {"height", 10}, {"fill", "ink"}})
    .append(2, 3).append(4, 5).append(1, 2).append(1, 4).append(0, 1));
  CHECK_FALSE(fixture.view.measure(2).has_value());
  std::array<double, 16> camera{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  fixture.view.setProjection(camera);
  CHECK(fixture.rect(2).x == 190);
  CHECK(fixture.rect(2).y == 145);
  CHECK_FALSE(fixture.view.measure(4).has_value());
  camera[12] = 0.5;
  fixture.view.setProjection(camera);
  CHECK(fixture.rect(2).x == 290);
  camera[12] = 2;
  fixture.view.setProjection(camera);
  CHECK_FALSE(fixture.view.measure(2).has_value());
}

TEST_CASE("a camera move with nothing anchored in the world lays nothing out") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 400}, {"height", 300}})
    .append(0, 1));
  fixture.view.frame(1);
  const auto laidOut = fixture.handled("__layout").size();
  std::array<double, 16> camera{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  fixture.view.setProjection(camera);
  camera[12] = 0.5;
  fixture.view.setProjection(camera);
  fixture.view.frame(2);
  CHECK_EQ(fixture.handled("__layout").size(), laidOut);
}

TEST_CASE("unrelated events leave a bound text frame unchanged") {
  Fixture fixture;
  fixture.commit(Stream().create(1, "bureau-text", {{"binding", {{"field", "title.name"},
    {"format", {{"prefix", "["}, {"suffix", "]"}}}}}}).append(0, 1));
  fixture.view.event({{"event", "title"}, {"data", {{"name", "Marina"}}}});
  fixture.view.frame(0);
  CHECK(fixture.view.probe(1, 1)[0]["text"] == "[Marina]");
  const auto version = fixture.view.displayList()->version;
  fixture.view.event({{"event", "traffic"}, {"data", {{"vehicles", 123}}}});
  CHECK_FALSE(fixture.view.frame(1));
  CHECK(fixture.view.displayList()->version == version);
}

TEST_CASE("street Layers repeat and rotate their laid-out ink without a commit") {
  Fixture fixture;
  fixture.view.setViewport(1200, 300, 1);
  const Json points = Json::array({{{"x", -1}, {"y", 0}, {"z", 0.5}},
                                   {{"x", 1}, {"y", 0}, {"z", 0.5}}});
  fixture.commit(Stream()
    .create(1, "bureau-layer", {{"stacking", "world"}, {"passThrough", true},
      {"anchor", {{"kind", "street"}, {"run", 0}, {"size", "regular"}, {"points", points}}}})
    .create(2, "bureau-box", {{"width", 60}, {"height", 14}, {"fill", "ink"}})
    .create(3, "bureau-layer", {{"stacking", "world"}, {"passThrough", true},
      {"anchor", {{"kind", "street"}, {"run", 0}, {"size", "small"}, {"points", points}}}})
    .create(4, "bureau-box", {{"width", 40}, {"height", 11}, {"fill", "ink"}})
    .append(1, 2).append(3, 4).append(0, 1).append(0, 3));
  const std::array<double, 16> horizontal{1, 0, 0, 0, 0, 1, 0, 0,
                                          0, 0, 1, 0, 0, 0, 0, 1};
  fixture.view.setProjection(horizontal);
  fixture.view.frame(0);
  auto list = fixture.view.displayList();
  REQUIRE(list->quads.size() == 2);
  CHECK(list->quads[0].x0 == doctest::Approx(270));
  CHECK(list->quads[1].x0 == doctest::Approx(870));
  CHECK(list->quads[0].angle == 0);
  const std::array<double, 16> vertical{0, 1, 0, 0, -1, 0, 0, 0,
                                        0, 0, 1, 0, 0, 0, 0, 1};
  fixture.view.setProjection(vertical);
  fixture.view.frame(1);
  list = fixture.view.displayList();
  REQUIRE(list->quads.size() == 1);
  CHECK(list->quads[0].angle == doctest::Approx(-1.5707963268));
  CHECK(list->quads[0].originX == doctest::Approx(600));
  CHECK(list->quads[0].originY == doctest::Approx(150));
}

TEST_CASE("street-name type paints four halo glyphs behind its ink") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-text", {{"typeStyle", "street-name"}, {"ink", "db32-black"}})
    .text(2, "A").append(1, 2).append(0, 1));
  fixture.view.frame(0);
  const auto list = fixture.view.displayList();
  REQUIRE(list->quads.size() == 5);
  CHECK(list->quads[0].x0 + 1 == list->quads[4].x0);
  CHECK(list->quads[1].x0 - 1 == list->quads[4].x0);
  CHECK(list->quads[2].y0 + 1 == list->quads[4].y0);
  CHECK(list->quads[3].y0 - 1 == list->quads[4].y0);
  CHECK(list->quads[0].r != list->quads[4].r);
}

TEST_CASE("a pixelated picture at a fractional ratio is baked up and sampled smoothly") {
  Fixture fixture(1.5f);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/icons/controller-xbox-a.png"},
                              {"width", 12},
                              {"height", 14}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(quad.smooth);
  CHECK(quad.u1 - quad.u0 == doctest::Approx(24.0 / bureau::kAtlasSize));
}

TEST_CASE("a pixelated picture at a whole ratio samples nearest") {
  Fixture fixture(2);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/icons/controller-xbox-a.png"},
                              {"width", 12},
                              {"height", 14}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK_FALSE(quad.smooth);
  CHECK(quad.u1 - quad.u0 == doctest::Approx(24.0 / bureau::kAtlasSize));
}

TEST_CASE("pixel art kept at four times its size shrinks smoothly between whole art pixels") {
  Fixture fixture(1.25f);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/art.png"},
                              {"artScale", 4},
                              {"width", 32},
                              {"height", 32}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(quad.smooth);
  CHECK(quad.u1 - quad.u0 == doctest::Approx(64.0 / bureau::kAtlasSize));
}

TEST_CASE("pixel art kept at four times its size samples nearest on whole art pixels") {
  Fixture fixture(1);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/art.png"},
                              {"artScale", 4},
                              {"width", 32},
                              {"height", 32}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK_FALSE(quad.smooth);
  CHECK(quad.u1 - quad.u0 == doctest::Approx(128.0 / bureau::kAtlasSize));
}

TEST_CASE(
    "integer pixel art keeps its layout slot at combined display and UI "
    "scales") {
  Fixture fixture(2);
  fixture.view.setUiScale(1.25f);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/icon.png"},
                              {"width", 20},
                              {"height", 20},
                              {"integerScale", true}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(fixture.rect(1).width == 20);
  CHECK(fixture.rect(1).height == 20);
  CHECK(quad.x0 == 5);
  CHECK(quad.y0 == 5);
  CHECK(quad.x1 == 45);
  CHECK(quad.y1 == 45);
  CHECK_FALSE(quad.smooth);
}

TEST_CASE(
    "integer pixel art centres on device pixels rather than rounded UI "
    "pixels") {
  Fixture fixture(1.25f);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/icon.png"},
                              {"width", 20},
                              {"height", 20},
                              {"integerScale", true}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(quad.x0 == 3);
  CHECK(quad.y0 == 3);
  CHECK(quad.x1 == 23);
  CHECK(quad.y1 == 23);
  CHECK_FALSE(quad.smooth);
}

TEST_CASE("integer pixel art fits a 20px icon in a 32px toolbar slot") {
  Fixture fixture(2);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/icon.png"},
                              {"width", 32},
                              {"height", 32},
                              {"integerScale", true}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(fixture.rect(1).width == 32);
  CHECK(fixture.rect(1).height == 32);
  CHECK(quad.x0 == 2);
  CHECK(quad.y0 == 2);
  CHECK(quad.x1 == 62);
  CHECK(quad.y1 == 62);
  CHECK_FALSE(quad.smooth);
}

TEST_CASE(
    "integer pixel art retains its art grid with a double-resolution source") {
  Fixture fixture(2);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/bureau/scroll-grip-light.png"},
                              {"source2x", "/bureau/scroll-grip-light@2x.png"},
                              {"width", 16},
                              {"height", 16},
                              {"integerScale", true}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(quad.x0 == 1);
  CHECK(quad.y0 == 1);
  CHECK(quad.x1 == 31);
  CHECK(quad.y1 == 31);
  CHECK_FALSE(quad.smooth);
}

TEST_CASE("integer pixel art counts art pixels in an enlarged source") {
  Fixture fixture(1.5f);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/art.png"},
                              {"artScale", 4},
                              {"width", 32},
                              {"height", 32},
                              {"integerScale", true}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(quad.x0 == 8);
  CHECK(quad.y0 == 8);
  CHECK(quad.x1 == 40);
  CHECK(quad.y1 == 40);
  CHECK_FALSE(quad.smooth);
}

TEST_CASE("integer pixel art fills a toolbar slot at twice its art size") {
  Fixture fixture(2);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/art.png"},
                              {"artScale", 4},
                              {"width", 32},
                              {"height", 32},
                              {"integerScale", true}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(quad.x0 == 0);
  CHECK(quad.y0 == 0);
  CHECK(quad.x1 == 64);
  CHECK(quad.y1 == 64);
  CHECK_FALSE(quad.smooth);
}

TEST_CASE(
    "integer pixel art samples nearest at a fractional source-pixel ratio") {
  Fixture fixture(2);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/art.png"},
                              {"artScale", 4},
                              {"width", 96},
                              {"height", 96},
                              {"integerScale", true}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(quad.x0 == 0);
  CHECK(quad.y0 == 0);
  CHECK(quad.x1 == 192);
  CHECK(quad.y1 == 192);
  CHECK_FALSE(quad.smooth);
}

TEST_CASE(
    "integer pixel art keeps an undersized image visible without smoothing") {
  Fixture fixture(0.75f);
  fixture.commit(Stream()
                     .create(1, "bureau-image",
                             {{"source", "/pictures/art.png"},
                              {"artScale", 4},
                              {"width", 20},
                              {"height", 20},
                              {"integerScale", true}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.back();
  CHECK(fixture.rect(1).width == 20);
  CHECK(quad.x0 == 0);
  CHECK(quad.y0 == 0);
  CHECK(quad.x1 == 15);
  CHECK(quad.y1 == 15);
  CHECK_FALSE(quad.smooth);
}

TEST_CASE("a slanted box paints as one picture the size of its device pixels") {
  Fixture fixture(1.25f);
  fixture.commit(Stream()
                     .create(1, "bureau-box",
                             {{"width", 100},
                              {"height", 36},
                              {"slant", 10},
                              {"fill", "face"},
                              {"surface", "tab-top"}})
                     .append(0, 1));
  fixture.view.frame(0);
  const auto& quads = fixture.view.displayList()->quads;
  REQUIRE(quads.size() == 1);
  CHECK(quads[0].mode == bureau::QuadMode::Picture);
  CHECK(quads[0].x1 - quads[0].x0 == 125);
  CHECK(quads[0].y1 - quads[0].y0 == 45);
}

/** A ledger's twelve months as dots, one set of figures per month. */
Json ledger(int month) {
  Json dots = Json::array();
  for (int point = 0; point < 12; ++point) {
    dots.push_back({{"kind", "rect"}, {"x", point * 60},
                    {"y", 100 + (point * 7 + month * 13) % 90}, {"width", 8},
                    {"height", 8}, {"ink", "db32-black"}});
  }
  return {{"width", 760}, {"height", 260}, {"commands", dots}};
}

TEST_CASE("an atlas of another size gives coordinates in its own texels") {
  Fixture fixture;
  fixture.view.setAtlas(256, bureau::kAtlasPageBudget);
  fixture.commit(Stream().create(1, "bureau-image", {{"source", "/icons/controller-xbox-a.png"}}).append(0, 1));
  fixture.view.frame(0);
  const auto list = fixture.view.displayList();
  REQUIRE(list->quads.size() == 1);
  CHECK(list->quads[0].u0 == doctest::Approx(5.0 / 256));
  CHECK(list->quads[0].u1 == doctest::Approx(17.0 / 256));
  CHECK(list->quads[0].v1 == doctest::Approx(14.0 / 256));
}

/** The pages the atlas ends on after a chart is given new figures 100 times. */
size_t pagesAfterNewFigures(Fixture& fixture) {
  fixture.view.setViewport(1280, 800, 2);
  fixture.commit(Stream().create(1, "bureau-plot", ledger(0)).append(0, 1));
  REQUIRE(fixture.view.frame(0));
  for (int month = 1; month < 100; ++month) {
    fixture.commit(Stream().props(1, ledger(month)));
    REQUIRE(fixture.view.frame(0));
  }
  return fixture.view.atlasPages().size();
}

TEST_CASE("a smaller page budget starts the atlas over sooner") {
  Fixture usual(2);
  CHECK(pagesAfterNewFigures(usual) > 2);
  Fixture frugal(2);
  frugal.view.setAtlas(bureau::kAtlasSize, 1);
  CHECK(pagesAfterNewFigures(frugal) <= 2);
}

TEST_CASE("text bakes a glyph for each fraction of a pixel its pen falls on") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-text")
                     .text(2, "AAAA")
                     .append(1, 2)
                     .append(0, 1));
  fixture.view.frame(0);
  CHECK(fixture.view.takeUploads().size() == 5);  // the white texel and four A's
}

TEST_CASE("monochrome text bakes a glyph once, in one bit, wherever its pen falls") {
  Fixture fixture;
  fixture.view.setMonochromeText(true);
  fixture.commit(Stream()
                     .create(1, "bureau-text")
                     .text(2, "AAAA")
                     .append(1, 2)
                     .append(0, 1));
  fixture.view.frame(0);
  const auto uploads = fixture.view.takeUploads();
  REQUIRE(uploads.size() == 2);  // the white texel and one A
  const std::set<std::uint8_t> levels(uploads[1].pixels.begin(), uploads[1].pixels.end());
  CHECK(levels == std::set<std::uint8_t>{0, 255});
  CHECK(fixture.view.displayList()->quads.size() == 4);
}

TEST_CASE("a chart given new figures all session keeps the atlas in budget") {
  Fixture fixture(2);
  fixture.view.setViewport(1280, 800, 2);
  fixture.commit(Stream().create(1, "bureau-plot", ledger(0)).append(0, 1));
  REQUIRE(fixture.view.frame(0));
  for (int month = 1; month < 100; ++month) {
    fixture.commit(Stream().props(1, ledger(month)));
    REQUIRE(fixture.view.frame(0));
  }
  CHECK(fixture.view.atlasPages().size() <= bureau::kAtlasPageBudget + 1);
  // 1520 by 520 device pixels: two tiles, still drawn after starting over.
  CHECK(fixture.view.displayList()->quads.size() == 2);
}

TEST_CASE("a frame that bakes past the budget keeps its bakes the next frame") {
  // Three plots of 4000 device pixels a side: about four pages each.
  Fixture fixture(2);
  fixture.view.setViewport(2000, 6000, 2);
  // Each plot is solid, and a little shorter than the last, so none share.
  const auto square = [](int shorter) {
    const Json rect = {{"kind", "rect"}, {"x", 0}, {"y", 0}, {"width", 2000},
                       {"height", 2000 - shorter}, {"ink", "db32-black"}};
    return Json{{"width", 2000}, {"height", 2000},
                {"commands", Json::array({rect})}};
  };
  fixture.commit(Stream()
                     .create(1, "bureau-plot", square(0))
                     .create(2, "bureau-plot", square(20))
                     .create(3, "bureau-plot", square(40))
                     .append(0, 1)
                     .append(0, 2)
                     .append(0, 3));
  REQUIRE(fixture.view.frame(0));
  REQUIRE(fixture.view.atlasPages().size() > bureau::kAtlasPageBudget);
  // Over the budget, the next frame starts over once and bakes the same.
  fixture.commit(Stream().create(4, "bureau-box").append(0, 4));
  REQUIRE(fixture.view.frame(0));
  const auto baked = fixture.view.atlasPages().size();
  fixture.view.takeUploads();
  fixture.commit(Stream().create(5, "bureau-box").append(0, 5));
  REQUIRE(fixture.view.frame(0));
  CHECK(fixture.view.takeUploads().empty());
  CHECK(fixture.view.atlasPages().size() == baked);
}

TEST_CASE("a box below its design size lays out what it holds at that size, drawn smaller") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 200}, {"height", 150},
                             {"scaleBelow", {{"height", 300}}}})
    .create(2, "bureau-box", {{"width", 100}, {"height", 60}})
    .append(1, 2).append(0, 1));
  CHECK(fixture.rect(2).width == 50);
  CHECK(fixture.rect(2).height == 30);
  CHECK(fixture.view.scaleOf(2) == 0.5f);
  CHECK(fixture.view.scaleOf(1) == 1);
}

TEST_CASE("past its tighter side, scaled content takes the room the scale gives it") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 300}, {"height", 150},
                             {"scaleBelow", {{"height", 300}}}})
    .create(2, "bureau-box", {{"width", "100%"}, {"height", "100%"}})
    .append(1, 2).append(0, 1));
  CHECK(fixture.rect(2).width == 300);
  CHECK(fixture.rect(2).height == 150);
}

TEST_CASE("a box never scales what it holds up") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 200}, {"height", 150},
                             {"scaleBelow", {{"height", 100}}}})
    .create(2, "bureau-box", {{"height", "100%"}})
    .append(1, 2).append(0, 1));
  CHECK(fixture.rect(2).height == 150);
  CHECK(fixture.view.scaleOf(2) == 1);
}

TEST_CASE("a scaled box keeps its own padding, and its content starts inside it") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 200}, {"height", 170}, {"padding", 10},
                             {"scaleBelow", {{"height", 300}}}})
    .create(2, "bureau-box", {{"width", 100}, {"height", 100}})
    .append(1, 2).append(0, 1));
  CHECK(fixture.rect(2).x == 10);
  CHECK(fixture.rect(2).y == 10);
  CHECK(fixture.rect(2).width == 50);
}

TEST_CASE("a scaled box arranges what it holds by its own direction and alignment") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 200}, {"height", 150}, {"direction", "column"},
                             {"align", "center"}, {"scaleBelow", {{"height", 300}}}})
    .create(2, "bureau-box", {{"width", 100}, {"height", 100}})
    .create(3, "bureau-box", {{"width", 100}, {"height", 100}})
    .append(1, 2).append(1, 3).append(0, 1));
  CHECK(fixture.rect(2).x == 75);
  CHECK(fixture.rect(3).y == 50);
}

TEST_CASE("scaled content paints at its size on the screen") {
  Fixture fixture(2);
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 200}, {"height", 150},
                             {"scaleBelow", {{"height", 300}}}})
    .create(2, "bureau-box", {{"width", 100}, {"height", 100}, {"margin", 20},
                             {"fill", "db32-black"}})
    .append(1, 2).append(0, 1));
  fixture.view.frame(0);
  const auto& quads = fixture.view.displayList()->quads;
  REQUIRE(quads.size() == 1);
  CHECK(quads[0].x0 == 20);
  CHECK(quads[0].y0 == 20);
  CHECK(quads[0].x1 == 120);
  CHECK(quads[0].y1 == 120);
}

TEST_CASE("text a box draws at half size sets as large as the same text at half the density") {
  Fixture scaled(2);
  scaled.commit(Stream()
    .create(1, "bureau-box", {{"width", 200}, {"height", 150},
                             {"scaleBelow", {{"height", 300}}}})
    .create(2, "bureau-text", {{"typeStyle", "mono-12-solid"}})
    .text(3, "H")
    .append(2, 3).append(1, 2).append(0, 1));
  scaled.view.frame(0);
  Fixture plain(1);
  plain.commit(Stream()
    .create(2, "bureau-text", {{"typeStyle", "mono-12-solid"}})
    .text(3, "H")
    .append(2, 3).append(0, 2));
  plain.view.frame(0);
  const auto& scaledGlyph = scaled.view.displayList()->quads.at(0);
  const auto& plainGlyph = plain.view.displayList()->quads.at(0);
  CHECK(scaledGlyph.x1 - scaledGlyph.x0 == plainGlyph.x1 - plainGlyph.x0);
  CHECK(scaledGlyph.y1 - scaledGlyph.y0 == plainGlyph.y1 - plainGlyph.y0);
}

TEST_CASE("a press inside a scaled box answers where the box is drawn") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 200}, {"height", 150},
                             {"scaleBelow", {{"height", 300}}}})
    .create(2, "bureau-box", {{"width", 50}, {"height", 50}, {"onPress", true},
                             {"margin", {100, 0, 0, 100}}})
    .append(1, 2).append(0, 1));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 80, 80));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 80, 80));
  CHECK(fixture.handled("onPress").empty());
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 60, 60));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 60, 60));
  CHECK(fixture.handled("onPress").size() == 1);
}

TEST_CASE("the pointer over a scaled box reads in the box's own pixels") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 200}, {"height", 150},
                             {"scaleBelow", {{"height", 300}}}})
    .create(2, "bureau-box", {{"width", 400}, {"height", 300}, {"onHoverMove", true}})
    .append(1, 2).append(0, 1));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 50, 20));
  CHECK(fixture.handled("onHoverMove").back().args[0] == Json{{"x", 100}, {"y", 40}});
}

TEST_CASE("the wheel scrolls a Scroll inside a scaled box by the distance it travels on screen") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-box", {{"width", 200}, {"height", 150},
                             {"scaleBelow", {{"height", 300}}}})
    .create(2, "bureau-scroll", {{"width", "100%"}, {"height", "100%"},
                                {"direction", "column"}})
    .create(3, "bureau-box", {{"height", 1000}})
    .append(2, 3).append(1, 2).append(0, 1));
  auto wheel = pointer(bureau::PointerEvent::Kind::Wheel, 50, 50);
  wheel.deltaY = 40;
  fixture.view.pointer(wheel);
  CHECK(fixture.rect(3).y == -40);
  CHECK(fixture.view.contentExtent(2)["contentHeight"] == 1000);
}

TEST_CASE("an SVG picture lays out at its own size and draws at its device pixels") {
  Fixture fixture(2);
  fixture.commit(Stream()
    .create(1, "bureau-image", {{"source", "/pictures/figures.svg"}})
    .append(0, 1));
  CHECK(fixture.rect(1).width == 171);
  CHECK(fixture.rect(1).height == 169);
  fixture.view.frame(0);
  const auto& quad = fixture.view.displayList()->quads.at(0);
  CHECK(quad.x1 - quad.x0 == 342);
  CHECK(quad.y1 - quad.y0 == 338);
  CHECK_FALSE(quad.smooth);
  CHECK(fixture.view.displayList()->missingImages.empty());
}

TEST_CASE("an SVG picture that cannot be read is reported missing") {
  Fixture fixture;
  fixture.commit(Stream()
    .create(1, "bureau-image", {{"source", "/img/no-such-picture.svg"},
                               {"width", 10}, {"height", 10}})
    .append(0, 1));
  fixture.view.frame(0);
  CHECK(fixture.view.displayList()->missingImages ==
        std::vector<std::string>{"/img/no-such-picture.svg"});
}

TEST_CASE("a disabled slider refuses mouse, touch and host value changes") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-field",
                             {{"kind", "range"},
                              {"value", "50"},
                              {"width", 200},
                              {"disabled", true},
                              {"onChange", true}})
                     .append(0, 1));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 100, 16));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 170, 16));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 170, 16));
  CHECK(fixture.handled("onChange").empty());
  CHECK(fixture.view.focused() == 0);

  auto touch = pointer(bureau::PointerEvent::Kind::Down, 100, 16);
  touch.touch = true;
  touch.id = 7;
  fixture.view.pointer(touch);
  touch.kind = bureau::PointerEvent::Kind::Move;
  touch.x = 170;
  fixture.view.pointer(touch);
  touch.kind = bureau::PointerEvent::Kind::Up;
  fixture.view.pointer(touch);
  fixture.view.setControlValue(1, "100");
  CHECK(fixture.handled("onChange").empty());
  CHECK(fixture.view.control(1)["value"] == "50");
}

TEST_CASE(
    "a read-only slider refuses pointer, keyboard and host value changes") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-field",
                             {{"kind", "range"},
                              {"value", "50"},
                              {"width", 200},
                              {"readOnly", true},
                              {"onChange", true}})
                     .append(0, 1));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 100, 16));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 170, 16));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 170, 16));
  CHECK(fixture.view.focused() == 1);
  bureau::KeyEvent right;
  right.key = "ArrowRight";
  fixture.view.key(right);
  fixture.view.setControlValue(1, "100");
  CHECK(fixture.handled("onChange").empty());
  CHECK(fixture.view.control(1)["value"] == "50");
}

TEST_CASE("a slider disabled during a drag stops changing until enabled") {
  Fixture fixture;
  fixture.commit(Stream()
                     .create(1, "bureau-field",
                             {{"kind", "range"},
                              {"value", "50"},
                              {"width", 200},
                              {"onChange", true}})
                     .append(0, 1));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 30, 16));
  REQUIRE(fixture.handled("onChange").size() == 1);
  CHECK(fixture.handled("onChange").back().args == Json::array({"0"}));
  fixture.commit(Stream().props(1, {{"disabled", true}}));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Move, 170, 16));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 170, 16));
  bureau::KeyEvent right;
  right.key = "ArrowRight";
  fixture.view.key(right);
  fixture.view.setControlValue(1, "100");
  CHECK(fixture.handled("onChange").size() == 1);

  fixture.commit(Stream().props(1, {{"disabled", false}}));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Down, 170, 16));
  fixture.view.pointer(pointer(bureau::PointerEvent::Kind::Up, 170, 16));
  REQUIRE(fixture.handled("onChange").size() == 2);
  CHECK(fixture.handled("onChange").back().args == Json::array({"100"}));
}

TEST_CASE(
    "a disabled slider stipples its channel and thumb at Retina density") {
  Fixture fixture(2);
  fixture.commit(Stream()
                     .create(1, "bureau-field",
                             {{"kind", "range"},
                              {"value", "50"},
                              {"width", 200},
                              {"disabled", true}})
                     .append(0, 1));
  CHECK(fixture.rect(1).height == 33);
  REQUIRE(fixture.view.frame(0));
  const auto disabled = fixture.view.displayList();
  CHECK(std::count_if(
            disabled->quads.begin(), disabled->quads.end(),
            [](const bureau::Quad& quad) { return quad.stipple == 2; }) == 2);

  fixture.commit(Stream().props(1, {{"disabled", false}}));
  REQUIRE(fixture.view.frame(1));
  const auto enabled = fixture.view.displayList();
  CHECK(std::count_if(
            enabled->quads.begin(), enabled->quads.end(),
            [](const bureau::Quad& quad) { return quad.stipple != 0; }) == 0);
  CHECK(fixture.rect(1).height == 33);
}
