import { assertEquals } from "@std/assert";
import fixtures from "./format_fixtures.json" with {
  type: "json",
};
import { PluralRules } from "./plural_rules.ts";

for (const fixture of fixtures) {
  Deno.test(`Z5.2 ${fixture.locale} cardinal and ordinal categories match the committed fixtures`, () => {
    const cardinal = new PluralRules(fixture.locale);
    const ordinal = new PluralRules(fixture.locale, { type: "ordinal" });
    assertEquals(
      fixture.plurals.map(({ value }) => cardinal.select(value)),
      fixture.plurals.map(({ expected }) => expected),
    );
    assertEquals(
      fixture.ordinals.map(({ value }) => ordinal.select(value)),
      fixture.ordinals.map(({ expected }) => expected),
    );
  });
}

Deno.test("Polish visible decimals are not whole counts", () => {
  assertEquals(
    new PluralRules("pl", { minimumFractionDigits: 2 }).select(1),
    "other",
  );
  assertEquals(new PluralRules("pl").select(1.0001), "one");
  assertEquals(new PluralRules("pl").select(1.001), "other");
  assertEquals(new PluralRules("pl").select(12), "many");
  assertEquals(new PluralRules("pl").select(22), "few");
});

Deno.test("Finnish visible fractions and ordinals do not use singular", () => {
  assertEquals(new PluralRules("fi").select(1), "one");
  assertEquals(new PluralRules("fi").select(1.5), "other");
  assertEquals(
    new PluralRules("fi", { minimumFractionDigits: 1 }).select(1),
    "other",
  );
  assertEquals(new PluralRules("fi", { type: "ordinal" }).select(1), "other");
});

Deno.test("Portuguese region and French zero retain their CLDR rules", () => {
  assertEquals(new PluralRules("pt").select(0), "one");
  assertEquals(new PluralRules("pt-PT").select(0), "other");
  assertEquals(new PluralRules("pt").select(1.5), "one");
  assertEquals(new PluralRules("fr").select(0), "one");
  assertEquals(new PluralRules("fr").select(1_000_000), "many");
});

Deno.test("large plural operands retain ICU's eighteen integer digits", () => {
  assertEquals(new PluralRules("fr").select(1e18), "one");
  assertEquals(new PluralRules("pt").select(1e30), "one");
  assertEquals(new PluralRules("pl").select(1e30), "many");
});

Deno.test("Cyrillic cardinals distinguish one, few, many and visible fractions", () => {
  assertEquals(new PluralRules("ru").select(21), "one");
  assertEquals(new PluralRules("ru").select(22), "few");
  assertEquals(new PluralRules("ru").select(11), "many");
  assertEquals(new PluralRules("ru").select(14), "many");
  assertEquals(new PluralRules("ru").select(1.5), "other");
  assertEquals(
    new PluralRules("ru", { minimumFractionDigits: 1 }).select(1),
    "other",
  );
  assertEquals(new PluralRules("uk").select(101), "one");
  assertEquals(new PluralRules("uk").select(24), "few");
  assertEquals(new PluralRules("uk").select(111), "many");
  assertEquals(new PluralRules("uk").select(1.5), "other");
  assertEquals(new PluralRules("uk", { type: "ordinal" }).select(3), "few");
  assertEquals(new PluralRules("uk", { type: "ordinal" }).select(13), "other");
  assertEquals(new PluralRules("uk", { type: "ordinal" }).select(23), "few");
  assertEquals(new PluralRules("zh-TW").select(1), "other");
  assertEquals(
    new PluralRules("nl", { minimumFractionDigits: 1 }).select(1),
    "other",
  );
});
