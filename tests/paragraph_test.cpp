#include "paragraph.h"

#include <doctest/doctest.h>
#include <nlohmann/json.hpp>

#include <fstream>
#include <iterator>
#include <string>

#include "goldens.h"

namespace {

std::shared_ptr<const std::vector<uint8_t>> readPublic(
    const std::string& path) {
  std::ifstream file(std::string(BUREAU_PUBLIC_DIR) + path, std::ios::binary);
  if (!file.good()) return nullptr;
  return std::make_shared<const std::vector<uint8_t>>(
      std::istreambuf_iterator<char>{file}, std::istreambuf_iterator<char>{});
}

struct Setting {
  bureau::style::Tokens tokens;
  bureau::text::FontLibrary fonts{readPublic};
  bureau::text::Typesetter typesetter{fonts, tokens};
  Setting() {
    std::ifstream file(BUREAU_TOKENS_JSON);
    const std::string text{std::istreambuf_iterator<char>{file}, {}};
    REQUIRE(tokens.load(text));
  }

  bureau::text::Paragraph set(const std::string& text,
                              bureau::text::ParagraphOptions options = {},
                              const char* style = "text") {
    const auto* type = tokens.type(style, options.language);
    options.strut = type;
    bureau::text::Span span;
    span.text = text;
    span.type = type;
    return typesetter.set({span}, options);
  }
};

/** The text of each line, in code points of the glyphs it placed. */
std::vector<size_t> glyphsPerLine(const bureau::text::Paragraph& paragraph) {
  std::vector<size_t> counts;
  for (const auto& line : paragraph.lines) counts.push_back(line.glyphs.size());
  return counts;
}

void checkBaselines(const std::string& name) {
  Setting setting;
  auto fixture = goldens::read(name);
  REQUIRE(!fixture.empty());
  for (auto& golden : fixture) {
    INFO(golden["language"], ": ", golden["style"]);
    bureau::text::ParagraphOptions options;
    options.language = golden["language"].get<std::string>();
    const std::string style = golden["style"].get<std::string>();
    const auto paragraph = setting.set(golden["text"], options, style.c_str());
    REQUIRE(paragraph.lines.size() == 1);
    CHECK(paragraph.lines[0].baseline ==
          doctest::Approx(golden["baseline"].get<float>()).epsilon(0.001));
    golden["baseline"] = paragraph.lines[0].baseline;
  }
  goldens::record(name, [&](nlohmann::json& recorded) { recorded = fixture; });
}

}  // namespace

TEST_CASE("one line of Jersey 25 at 18px sets its advance and line height") {
  Setting setting;
  const auto paragraph = setting.set("A");
  REQUIRE(paragraph.lines.size() == 1);
  CHECK(paragraph.width == doctest::Approx(8.780487).epsilon(0.001));
  CHECK(paragraph.height == 21.59375f);
  CHECK(paragraph.lines[0].glyphs.size() == 1);
}

TEST_CASE(
    "Sofia size adjustment preserves nominal line height and baseline "
    "placement") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.language = "ru";
  const auto paragraph = setting.set("Я", options);
  REQUIRE(paragraph.lines.size() == 1);
  REQUIRE(paragraph.lines[0].glyphs.size() == 1);
  CHECK(paragraph.lines[0].glyphs[0].font->size() == doctest::Approx(16.92));
  CHECK(paragraph.height == 21.59375f);
  CHECK(paragraph.lines[0].baseline == 15);
  CHECK(setting.typesetter.primary(*setting.tokens.type("ui-14-solid", "ru"))
            ->size() == doctest::Approx(13.16));
  CHECK(setting.typesetter.primary(*setting.tokens.type("text-field", "uk"))
            ->size() == doctest::Approx(15.04));
}

TEST_CASE("font adjustment leaves the other Cyrillic type roles unchanged") {
  Setting setting;
  CHECK(setting.typesetter.primary(*setting.tokens.type("serif-8", "ru"))
            ->size() == 8);
  CHECK(setting.typesetter
            .primary(*setting.tokens.type("bold-pixels-ui-16", "uk"))
            ->size() == 16);
  CHECK(setting.typesetter.primary(*setting.tokens.type("world-badge", "ru"))
            ->size() == 11);
}

TEST_CASE("UI and density scaling apply after a face adjustment exactly once") {
  Setting setting;
  const auto* type = setting.tokens.type("text", "ru");
  REQUIRE(type != nullptr);
  auto* font = setting.typesetter.primary(*type);
  REQUIRE(font != nullptr);
  auto* scaled = setting.fonts.scaled(font, 3);
  REQUIRE(scaled != nullptr);
  CHECK(scaled->size() == doctest::Approx(50.76));
  auto* spanScaled = setting.typesetter.primary(*type, 1.5f);
  REQUIRE(spanScaled != nullptr);
  CHECK(spanScaled->size() == doctest::Approx(25.38));
}

TEST_CASE("fallback glyphs use their own face adjustment") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.language = "ru";
  const auto russian = setting.set("Я字", options);
  REQUIRE(russian.lines.size() == 1);
  const auto& glyphs = russian.lines[0].glyphs;
  REQUIRE(glyphs.size() == 2);
  CHECK(setting.fonts.sourceOf(glyphs[0].font) ==
        "/fonts/SofiaSans-SemiBold.ttf");
  CHECK(glyphs[0].font->size() == doctest::Approx(16.92));
  CHECK(setting.fonts.sourceOf(glyphs[1].font) ==
        "/fonts/WDXLLubrifontSC-Regular.ttf");
  CHECK(glyphs[1].font->size() == 18);

  const auto english = setting.set("Aﬀ");
  REQUIRE(english.lines.size() == 1);
  REQUIRE(english.lines[0].glyphs.size() == 2);
  CHECK(english.lines[0].glyphs[0].font->size() == 18);
  CHECK(setting.fonts.sourceOf(english.lines[0].glyphs[1].font) ==
        "/fonts/SofiaSans-SemiBold.ttf");
  CHECK(english.lines[0].glyphs[1].font->size() == doctest::Approx(16.92));
}

TEST_CASE("a centered line offsets its glyphs once, by the line") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.maxWidth = 100;
  options.align = bureau::text::ParagraphOptions::Align::Center;
  const auto paragraph = setting.set("A", options);
  REQUIRE(paragraph.lines.size() == 1);
  CHECK(paragraph.lines[0].x == doctest::Approx(45.609375));
  CHECK(paragraph.lines[0].glyphs[0].x == 0);
}

TEST_CASE("fitted labels keep short text at its original size") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.maxWidth = 100;
  options.fitMinSize = 10;
  const auto paragraph = setting.set("Hitze", options, "ui-13-segment-solid");
  REQUIRE(paragraph.lines.size() == 1);
  REQUIRE(paragraph.lines[0].glyphs.size() == 5);
  CHECK(paragraph.lines[0].glyphs[0].font->size() == 13);
  CHECK_FALSE(paragraph.truncated);
}

TEST_CASE("fitted labels preserve a German compound at a smaller whole size") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.language = "de";
  options.maxWidth = 130;
  options.fitMinSize = 10;
  const auto paragraph =
      setting.set("Umweltverschmutzung", options, "ui-13-segment-solid");
  REQUIRE(paragraph.lines.size() == 1);
  REQUIRE(paragraph.lines[0].glyphs.size() == 19);
  CHECK(paragraph.width <= 130);
  CHECK(paragraph.lines[0].glyphs[0].font->size() == 11);
  CHECK(paragraph.height == 11);
  CHECK_FALSE(paragraph.truncated);
}

TEST_CASE("fitted labels ellipsize at the readable floor") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.maxWidth = 60;
  options.fitMinSize = 10;
  const auto paragraph =
      setting.set("Umweltverschmutzung", options, "ui-13-segment-solid");
  REQUIRE(paragraph.lines.size() == 1);
  REQUIRE_FALSE(paragraph.lines[0].glyphs.empty());
  const auto& last = paragraph.lines[0].glyphs.back();
  CHECK(last.font->size() == 10);
  CHECK(last.glyph == last.font->glyphFor(U'…'));
  CHECK(paragraph.width <= 60);
  CHECK(paragraph.truncated);
}

TEST_CASE(
    "fitting preserves intentional inline sizes under an unadjusted strut") {
  Setting setting;
  const auto* type = setting.tokens.type("text-field", "en");
  REQUIRE(type != nullptr);
  REQUIRE(type->size == 16);
  bureau::text::Span small{"B", type, 0.5f};
  bureau::text::Span large{"AAAAAAAAAAAAAAAAAAAA", type};
  bureau::text::ParagraphOptions options;
  options.strut = type;
  options.maxWidth = 40;
  options.fitMinSize = 10;
  const auto paragraph = setting.typesetter.set({small, large}, options);
  REQUIRE(paragraph.lines.size() == 1);
  REQUIRE_FALSE(paragraph.lines[0].glyphs.empty());
  CHECK(paragraph.lines[0].glyphs.front().font->size() == 5);
  CHECK(paragraph.lines[0].glyphs.back().font->size() == 10);
  CHECK(paragraph.width <= 40);
  CHECK(paragraph.truncated);
}

TEST_CASE(
    "fitted Cyrillic labels stop at the adjusted face's actual readable "
    "floor") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.language = "ru";
  options.maxWidth = 40;
  options.fitMinSize = 10;
  const auto paragraph =
      setting.set("Окружающая среда", options, "ui-13-segment-solid");
  REQUIRE(paragraph.lines.size() == 1);
  REQUIRE_FALSE(paragraph.lines[0].glyphs.empty());
  CHECK(paragraph.lines[0].glyphs.front().font->size() == doctest::Approx(10));
  CHECK(paragraph.lines[0].glyphs.back().font->size() == doctest::Approx(10));
  CHECK(paragraph.width <= 40);
  CHECK(paragraph.truncated);
}

TEST_CASE("fitted fallback glyphs stop at their actual readable floor") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.maxWidth = 40;
  options.fitMinSize = 10;
  const auto paragraph =
      setting.set("ﬀﬀﬀﬀﬀﬀﬀﬀﬀﬀ", options, "ui-13-segment-solid");
  REQUIRE(paragraph.lines.size() == 1);
  REQUIRE_FALSE(paragraph.lines[0].glyphs.empty());
  const auto& first = paragraph.lines[0].glyphs.front();
  CHECK(setting.fonts.sourceOf(first.font) == "/fonts/SofiaSans-SemiBold.ttf");
  CHECK(first.font->size() == doctest::Approx(10));
  CHECK(paragraph.lines[0].glyphs.back().font->size() >= 10);
  CHECK(paragraph.width <= 40);
  CHECK(paragraph.truncated);
}

TEST_CASE(
    "fitting leaves an already smaller adjusted font at its original size") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.language = "uk";
  options.maxWidth = 20;
  options.fitMinSize = 10;
  const auto paragraph =
      setting.set("Довгий заголовок", options, "ui-9.6-solid");
  REQUIRE(paragraph.lines.size() == 1);
  REQUIRE_FALSE(paragraph.lines[0].glyphs.empty());
  CHECK(paragraph.lines[0].glyphs.front().font->size() ==
        doctest::Approx(9.024));
  CHECK(paragraph.width <= 20);
  CHECK(paragraph.truncated);
}

TEST_CASE("fitted labels leave an impossibly narrow slot empty") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.maxWidth = 0;
  options.fitMinSize = 10;
  const auto paragraph =
      setting.set("Umweltverschmutzung", options, "ui-13-segment-solid");
  REQUIRE(paragraph.lines.size() == 1);
  CHECK(paragraph.lines[0].glyphs.empty());
  CHECK(paragraph.width == doctest::Approx(0));
  CHECK(paragraph.truncated);
}

TEST_CASE("fitted labels collapse explicit breaks into a single line") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.maxWidth = 130;
  options.fitMinSize = 10;
  options.preserveBreaks = true;
  const auto paragraph =
      setting.set("Air\nquality", options, "ui-13-segment-solid");
  REQUIRE(paragraph.lines.size() == 1);
  CHECK_FALSE(paragraph.truncated);
}

TEST_CASE("intrinsic widths and alignment round the complete shaped line" *
          doctest::test_suite("goldens")) {
  Setting setting;
  auto fixture = goldens::read("advances.json");
  for (auto& golden : fixture["cases"]) {
    INFO(golden["family"], ": ", golden["text"]);
    bureau::style::TypeStyle type;
    type.face = golden["family"].get<std::string>();
    type.size = golden["size"].get<float>();
    type.lineHeight = type.size;
    bureau::text::Span span;
    span.type = &type;
    span.text = golden["text"].get<std::string>();
    bureau::text::ParagraphOptions options;
    options.strut = &type;
    options.maxWidth = 600;
    const auto paragraph = setting.typesetter.set({span}, options);
    REQUIRE(paragraph.lines.size() == 1);
    CHECK(paragraph.width == golden["layout"].get<float>());
    options.align = bureau::text::ParagraphOptions::Align::Center;
    const auto centered = setting.typesetter.set({span}, options);
    CHECK(centered.lines[0].x == golden["center"].get<float>());
    options.align = bureau::text::ParagraphOptions::Align::End;
    const auto end = setting.typesetter.set({span}, options);
    CHECK(end.lines[0].x == golden["end"].get<float>());
    golden["layout"] = paragraph.width;
    golden["center"] = centered.lines[0].x;
    golden["end"] = end.lines[0].x;
  }
  goldens::record("advances.json", [&](nlohmann::json& recorded) {
    for (size_t index = 0; index < fixture["cases"].size(); ++index) {
      for (const char* field : {"layout", "center", "end"}) {
        recorded["cases"][index][field] = fixture["cases"][index][field];
      }
    }
  });
}

TEST_CASE("a middle-aligned image follows the parent font's x-height") {
  Setting setting;
  const auto* type = setting.tokens.type("ui-14-solid", "en");
  REQUIRE(type != nullptr);
  bureau::text::ParagraphOptions options;
  options.strut = type;
  bureau::text::Span text;
  text.text = "x";
  text.type = type;
  bureau::text::Span image;
  image.atom = true;
  image.atomWidth = 20;
  image.atomHeight = 14;
  const auto paragraph = setting.typesetter.set({text, image}, options);
  REQUIRE(paragraph.lines.size() == 1);
  REQUIRE(paragraph.lines[0].atoms.size() == 1);
  CHECK(paragraph.height == 14.75f);
  CHECK(paragraph.lines[0].baseline == 11);
  CHECK(paragraph.lines[0].atoms[0].y == 0.75f);
}

TEST_CASE("a plated run stands in its own box, middle on the line's middle") {
  // A breaking-news clipping: the 16px stamp on its plate before a 22px
  // headline, the plate a box of its own centred on the line.
  Setting setting;
  const auto* headline = setting.tokens.type("ui-22-compact", "en");
  const auto* stamp = setting.tokens.type("ui-16-stamp", "en");
  REQUIRE(headline != nullptr);
  REQUIRE(stamp != nullptr);
  bureau::text::ParagraphOptions options;
  options.strut = headline;
  bureau::text::Span plated;
  plated.text = "BREAKING";
  plated.type = stamp;
  plated.platePadding = 2;
  bureau::text::Span words;
  words.text = " Polls";
  words.type = headline;
  const auto paragraph = setting.typesetter.set({plated, words}, options);
  REQUIRE(paragraph.lines.size() == 1);
  const auto& line = paragraph.lines[0];
  REQUIRE(line.stretches.size() == 2);
  // The stamp's box is its own 18px line, centred on the headline's middle,
  // and its baseline rides up with it.
  CHECK(line.baseline == 20);
  CHECK(line.stretches[0].top == doctest::Approx(5.90625));
  CHECK(line.stretches[0].height == 18);
  CHECK(line.glyphs.front().baseline == doctest::Approx(19.90625));
  CHECK(line.glyphs.back().baseline == 20);
  // With its 2px padding, the plate leaves the 10px capitals 6px either side.
  auto* font = line.glyphs.front().font;
  const float capitals = font->raster(font->glyphFor(U'B')).height;
  const float plateTop = line.stretches[0].top - 2;
  const float plateBottom =
      line.stretches[0].top + line.stretches[0].height + 2;
  const float stampBaseline = line.glyphs.front().baseline;
  CHECK(stampBaseline - capitals - plateTop == doctest::Approx(6));
  CHECK(plateBottom - stampBaseline == doctest::Approx(6));
}

TEST_CASE("every bundled type style sits on its golden baseline in the five font stacks" *
          doctest::test_suite("goldens")) {
  checkBaselines("baselines.json");
}

// The goldens are the Mac's system UI font and Menlo, which only Core Text
// supplies (font.cpp's systemFace).
#ifdef __APPLE__
TEST_CASE("every platform type style sits on its golden baseline on Apple" *
          doctest::test_suite("goldens")) {
  checkBaselines("platform_baselines.json");
}
#endif

#if defined(__linux__)
TEST_CASE("Linux draws the system styles' tick, ™ and Latin from bundled faces") {
  Setting setting;
  for (const char* style : {"system-15", "terminal-13"}) {
    const auto paragraph = setting.set("✓ Bureau™", {}, style);
    REQUIRE(paragraph.lines.size() == 1);
    const auto& glyphs = paragraph.lines[0].glyphs;
    CHECK(glyphs.size() == 14);
    for (const auto& glyph : glyphs) {
      CHECK_MESSAGE(glyph.glyph != 0, style);
      CHECK(setting.fonts.sourceOf(glyph.font).starts_with("/fonts/"));
    }
  }
}
#endif

TEST_CASE("runs of spaces collapse to one, and none starts the paragraph") {
  Setting setting;
  const auto tight = setting.set("A A");
  const auto loose = setting.set("  A \n\t A  ");
  CHECK(loose.width == doctest::Approx(tight.width));
  CHECK(glyphsPerLine(loose) == glyphsPerLine(tight));
}

TEST_CASE("English breaks between words, a word too long for its line stays") {
  Setting setting;
  const float one = setting.set("one").width;
  bureau::text::ParagraphOptions options;
  options.maxWidth = one + 1;
  const auto paragraph = setting.set("one two", options);
  CHECK(glyphsPerLine(paragraph) == std::vector<size_t>{3, 3});
  options.maxWidth = 1;
  CHECK(glyphsPerLine(setting.set("Bürgermeister", options)) ==
        std::vector<size_t>{13});
}

TEST_CASE("German breaks after a hyphen") {
  Setting setting;
  const float first = setting.set("Stadt-").width;
  bureau::text::ParagraphOptions options;
  options.language = "de";
  options.maxWidth = first + 1;
  CHECK(glyphsPerLine(setting.set("Stadt-planung", options)) ==
        std::vector<size_t>{6, 7});
}

TEST_CASE("Japanese breaks between characters, never before a full stop") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.language = "ja";
  const float two = setting.set("東京", options).width;
  options.maxWidth = two + 1;
  CHECK(glyphsPerLine(setting.set("東京大阪", options)) ==
        std::vector<size_t>{2, 2});
  // 。 may not start a line: 京 goes down with it.
  CHECK(glyphsPerLine(setting.set("東京。", options)) ==
        std::vector<size_t>{1, 2});
}

TEST_CASE("Chinese and Korean break where UAX 14 allows") {
  Setting setting;
  bureau::text::ParagraphOptions chinese;
  chinese.language = "zh";
  const float two = setting.set("城市", chinese).width;
  chinese.maxWidth = two + 1;
  CHECK(glyphsPerLine(setting.set("城市人口", chinese)) ==
        std::vector<size_t>{2, 2});
  bureau::text::ParagraphOptions korean;
  korean.language = "ko";
  const float word = setting.set("도시", korean).width;
  korean.maxWidth = word + 1;
  CHECK(glyphsPerLine(setting.set("도시 인구", korean)) ==
        std::vector<size_t>{2, 2});
}

TEST_CASE("a line that does not fit ends in an ellipsis inside its width") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.nowrap = true;
  options.ellipsis = true;
  options.maxWidth = setting.set("Budget").width;
  const auto paragraph = setting.set("Budget office", options);
  REQUIRE(paragraph.lines.size() == 1);
  CHECK(paragraph.truncated);
  CHECK(paragraph.width <= options.maxWidth + 0.02f);
  // "Budg" and the ellipsis.
  CHECK(paragraph.lines[0].glyphs.size() == 5);
}

TEST_CASE("a clamp keeps its lines and ellipsizes the last") {
  Setting setting;
  bureau::text::ParagraphOptions options;
  options.maxLines = 2;
  options.maxWidth = setting.set("one").width + 1;
  const auto paragraph = setting.set("one two six ten", options);
  CHECK(paragraph.lines.size() == 2);
  CHECK(paragraph.truncated);
}

TEST_CASE("upper case sets the run in capitals") {
  bool wordStart = true;
  CHECK(bureau::text::transformCase(
            "café", bureau::style::TypeStyle::Case::Upper, wordStart) ==
        "CAFÉ");
  wordStart = true;
  CHECK(bureau::text::transformCase("new city",
                                    bureau::style::TypeStyle::Case::Capitalize,
                                    wordStart) == "New City");
}

TEST_CASE("Russian case transforms cover the full alphabet") {
  using Case = bureau::style::TypeStyle::Case;
  const std::string lowercase = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
  const std::string uppercase = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";
  bool wordStart = true;
  CHECK(bureau::text::transformCase(lowercase, Case::Upper, wordStart) ==
        uppercase);
  CHECK(bureau::text::transformCase(uppercase, Case::Lower, wordStart) ==
        lowercase);
}

TEST_CASE("Ukrainian case transforms cover the full alphabet") {
  using Case = bureau::style::TypeStyle::Case;
  const std::string lowercase = "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя";
  const std::string uppercase = "АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ";
  bool wordStart = true;
  CHECK(bureau::text::transformCase(lowercase, Case::Upper, wordStart) ==
        uppercase);
  CHECK(bureau::text::transformCase(uppercase, Case::Lower, wordStart) ==
        lowercase);
}

TEST_CASE("mixed Latin and Cyrillic text follows one case transform") {
  using Case = bureau::style::TypeStyle::Case;
  bool wordStart = true;
  CHECK(bureau::text::transformCase("Ledger Головна книга — Ёжик Ґанок і їжа",
                                    Case::Upper, wordStart) ==
        "LEDGER ГОЛОВНА КНИГА — ЁЖИК ҐАНОК І ЇЖА");
  CHECK(bureau::text::transformCase("Ledger Головна книга — Ёжик Ґанок і їжа",
                                    Case::Lower, wordStart) ==
        "ledger головна книга — ёжик ґанок і їжа");
}

TEST_CASE("capitalization spans Latin and Cyrillic words and text runs") {
  using Case = bureau::style::TypeStyle::Case;
  bool wordStart = true;
  CHECK(bureau::text::transformCase("new місто/город-їжа єнот ґанок ёжик мі",
                                    Case::Capitalize, wordStart) ==
        "New Місто/Город-Їжа Єнот Ґанок Ёжик Мі");
  CHECK_FALSE(wordStart);
  CHECK(bureau::text::transformCase("сто ledger", Case::Capitalize,
                                    wordStart) == "сто Ledger");
}
