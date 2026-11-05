#include "tokens.h"

#include <doctest/doctest.h>

#include <fstream>
#include <iterator>
#include <string>

#include "plot.h"

namespace {

const bureau::style::Tokens& tokens() {
  static const bureau::style::Tokens loaded = [] {
    std::ifstream file(BUREAU_TOKENS_JSON);
    const std::string text{std::istreambuf_iterator<char>{file}, {}};
    bureau::style::Tokens parsed;
    REQUIRE(parsed.load(text));
    return parsed;
  }();
  return loaded;
}

using bureau::style::BevelLine;
using bureau::style::Chrome;
using bureau::style::Color;

}  // namespace

TEST_CASE("a role ink follows the chrome; a palette ink is the same in both") {
  CHECK(tokens().ink("face", Chrome::Light) == Color{0x9b, 0xad, 0xb7, 255});
  CHECK(tokens().ink("face", Chrome::Dark) == Color{0x32, 0x3c, 0x39, 255});
  CHECK(tokens().ink("db32-black", Chrome::Dark) == Color{0, 0, 0, 255});
  CHECK_FALSE(tokens().ink("no-such-ink", Chrome::Light).has_value());
}

TEST_CASE("a role ink naming another role ink reads that one") {
  // meter-track is `face`.
  CHECK(tokens().ink("meter-track", Chrome::Light) ==
        tokens().ink("face", Chrome::Light));
}

TEST_CASE("dark engraving keeps the shadow inside and the light below it") {
  const nlohmann::json commands = nlohmann::json::array({{
      {"kind", "engraving"},
      {"paths", {{{4, 4}, {12, 4}, {12, 12}, {4, 12}}}},
      {"shadow", "engraving-shadow"},
      {"floor", "engraving-floor"},
      {"lit", "engraving-lit"},
  }});
  const auto raster = bureau::rasterizePlot(
      commands, 16, 16, 1,
      [](const std::string& name) { return tokens().ink(name, Chrome::Dark); });
  const auto pixel = [&](int x, int y) {
    const auto at = static_cast<std::size_t>(y * raster.width + x) * 4;
    return Color{raster.rgba[at], raster.rgba[at + 1], raster.rgba[at + 2],
                 raster.rgba[at + 3]};
  };
  CHECK(pixel(4, 8) == Color{0, 0, 0, 255});
  CHECK(pixel(8, 8) == Color{0x9b, 0xad, 0xb7, 255});
  CHECK(pixel(12, 8) == Color{0xcb, 0xdb, 0xfc, 255});
}

TEST_CASE("danger keys resolve white engraving and reverse their red bevels") {
  const auto* danger = tokens().look("key-danger");
  REQUIRE(danger != nullptr);
  REQUIRE(danger->rest.surface.has_value());
  REQUIRE(danger->pressed.has_value());
  REQUIRE(danger->pressed->surface.has_value());
  CHECK(tokens().ink("engraving-danger-floor", Chrome::Light) ==
        Color{255, 255, 255, 255});
  CHECK(tokens().ink("engraving-danger-floor", Chrome::Dark) ==
        Color{255, 255, 255, 255});
  CHECK(tokens().ink("engraving-danger-shadow", Chrome::Dark) ==
        Color{0x88, 0, 0, 255});
  CHECK(tokens().ink("engraving-danger-lit", Chrome::Dark) ==
        Color{255, 0x80, 0x80, 255});

  const auto raised = tokens().bevel(*danger->rest.surface, Chrome::Dark);
  const auto pressed = tokens().bevel(*danger->pressed->surface, Chrome::Dark);
  REQUIRE(raised.size() == 3);
  REQUIRE(pressed.size() == 3);
  CHECK(raised[0].color == Color{0, 0, 0, 255});
  CHECK(raised[1].side == BevelLine::Side::BottomRight);
  CHECK(raised[1].color == Color{0x88, 0, 0, 255});
  CHECK(raised[2].side == BevelLine::Side::TopLeft);
  CHECK(raised[2].color == Color{255, 0x80, 0x80, 255});
  CHECK(pressed[0].color == raised[0].color);
  CHECK(pressed[1].side == raised[1].side);
  CHECK(pressed[1].color == raised[2].color);
  CHECK(pressed[2].side == raised[2].side);
  CHECK(pressed[2].color == raised[1].color);
}

TEST_CASE("the raised recipe is a ring over its two bevels, in the chrome's") {
  const auto lines = tokens().bevel("raised", Chrome::Light);
  REQUIRE(lines.size() == 3);
  CHECK(lines[0].side == BevelLine::Side::Ring);
  CHECK(lines[0].width == 1);
  CHECK(lines[0].color == Color{0, 0, 0, 255});
  CHECK(lines[1].side == BevelLine::Side::BottomRight);
  CHECK(lines[1].width == 3);
  CHECK(lines[2].side == BevelLine::Side::TopLeft);
  // The field reads the well's lines.
  CHECK(tokens().bevel("field", Chrome::Light).size() ==
        tokens().bevel("well", Chrome::Light).size());
}

TEST_CASE("a look names what each state changes") {
  const auto* selectable = tokens().look("selectable");
  REQUIRE(selectable != nullptr);
  REQUIRE(selectable->selected.has_value());
  CHECK(selectable->selected->fill == "row-selected");
  CHECK(selectable->selected->ink == "knockout-selected");
  CHECK_FALSE(selectable->hover.has_value());
}

TEST_CASE("a type style resolves its face for the language") {
  const auto* english = tokens().type("text", "en");
  REQUIRE(english != nullptr);
  CHECK(english->face == "Jersey25");
  CHECK(english->size == 18);
  CHECK(english->lineHeight == doctest::Approx(21.6));
  CHECK(tokens().type("text", "ja")->face == "WDXLLubrifont JPN");
  const auto* jersey = tokens().face("Jersey25", 400);
  REQUIRE(jersey != nullptr);
  CHECK(jersey->source == "/fonts/Jersey25-Regular.ttf");
  CHECK(jersey->sizeAdjust == 1);
  const auto* serif = tokens().face("IBM Plex Serif", 700);
  REQUIRE(serif != nullptr);
  CHECK(serif->source == "/fonts/IBMPlexSerif-Bold.ttf");
  CHECK(serif->sizeAdjust == 1);
}

TEST_CASE(
    "font size adjustment follows the resolved face and weight fallback") {
  const auto* sofia = tokens().face("Sofia Sans", 600);
  REQUIRE(sofia != nullptr);
  CHECK(sofia->source == "/fonts/SofiaSans-SemiBold.ttf");
  CHECK(sofia->sizeAdjust == doctest::Approx(0.94));
  CHECK(tokens().face("Sofia Sans", 400) == sofia);
  CHECK(tokens().face("no-such-face", 400) == nullptr);
}

TEST_CASE("a layer stacks by its place in the document's list") {
  CHECK(tokens().stacking("world") == 1);
  CHECK(tokens().stacking("top-bar") < tokens().stacking("modal"));
  CHECK(tokens().stacking("modal") < tokens().stacking("popup"));
  CHECK(tokens().stacking("curtain") == 13);
  CHECK(tokens().stacking("none-such") == 0);
}

TEST_CASE("a print ink and a tempo read as the document writes them") {
  CHECK(tokens().ink("print-blue-500", Chrome::Light) ==
        Color{0x30, 0x60, 0x82, 255});
  CHECK(tokens().tempoMs("snap") == 120);
  CHECK(tokens().tempoMs("fill") == 240);
}

TEST_CASE("a picture draws a palette colour solid and a MICRO64 one as its dither") {
  const auto red = tokens().drawnAs(Color{0xac, 0x32, 0x32, 255});
  CHECK(red.first == Color{0xac, 0x32, 0x32, 255});
  CHECK(red.level == 0);
  // gray slate: blue navy with half its cells gray dark.
  const auto slate = tokens().drawnAs(Color{0x43, 0x4d, 0x61, 255});
  CHECK(slate.first == Color{0x3f, 0x3f, 0x74, 255});
  CHECK(slate.second == Color{0x59, 0x56, 0x52, 255});
  CHECK(slate.level == 8);
}

TEST_CASE("a picture draws a colour past MICRO64 as the palette colour nearest it") {
  const auto nearRed = tokens().drawnAs(Color{0xad, 0x30, 0x33, 255});
  CHECK(nearRed.first == Color{0xac, 0x32, 0x32, 255});
  CHECK(nearRed.level == 0);
}

TEST_CASE("a picture draws a census tone as the pattern it names") {
  // census-light: blue navy with two sixteenths blue violet.
  const auto light = tokens().drawnAs(Color{0x43, 0x47, 0x88, 255});
  CHECK(light.first == Color{0x3f, 0x3f, 0x74, 255});
  CHECK(light.second == Color{0x5b, 0x6e, 0xe1, 255});
  CHECK(light.level == 2);
}
