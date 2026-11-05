import { assertEquals } from "@std/assert";
import { COLLATION_CASES } from "./collation_cases.ts";
import fixtures from "./format_fixtures.json" with {
  type: "json",
};
import {
  compareText,
  formatDate,
  formatMoney,
  formatNumber,
} from "./format.ts";

for (const fixture of fixtures) {
  Deno.test(`Z5.1 ${fixture.locale} numbers, money and dates match the committed fixtures`, () => {
    assertEquals(formatNumber(1234567.89, fixture.locale), fixture.number);
    assertEquals(formatMoney(-1234.5, fixture.locale), fixture.money);
    assertEquals(
      formatDate(new Date(Date.UTC(2025, 3, 5)), fixture.locale, {
        timeZone: "UTC",
      }),
      fixture.date,
    );
    assertEquals(
      formatDate(new Date(Date.UTC(2025, 3, 5)), fixture.locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
      fixture.fullDate,
    );
    assertEquals(
      formatNumber(0.1534, fixture.locale, {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      fixture.percent,
    );
  });
}

Deno.test("locale decimals round decimal halves away from zero", () => {
  assertEquals(formatMoney(1.005, "en"), "$1.01");
  assertEquals(formatMoney(-1.005, "en"), "-$1.01");
  assertEquals(formatMoney(2.675, "en"), "$2.68");
  assertEquals(formatNumber(0.145, "en", { style: "percent" }), "15%");
});

Deno.test("significant digits survive a rounding carry", () => {
  assertEquals(
    formatNumber(9.999, "en", {
      minimumSignificantDigits: 3,
      maximumSignificantDigits: 3,
    }),
    "10.0",
  );
  assertEquals(
    formatNumber(999.999, "en", { maximumSignificantDigits: 3 }),
    "1,000",
  );
  assertEquals(
    formatNumber(0.99999, "en", { maximumSignificantDigits: 3 }),
    "1",
  );
});

Deno.test("compact units promote the rounded quantity at the locale's threshold", () => {
  assertEquals(
    formatNumber(999.95, "en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }),
    "1K",
  );
  assertEquals(
    formatNumber(1000, "ja", { notation: "compact", maximumFractionDigits: 1 }),
    "1000",
  );
  assertEquals(
    formatNumber(9999.99, "ja", {
      notation: "compact",
      maximumFractionDigits: 1,
    }),
    "1万",
  );
  assertEquals(
    formatNumber(999999, "en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }),
    "1M",
  );
});

Deno.test("signed zero and non-finite readings preserve their labels", () => {
  assertEquals(formatNumber(-0, "en"), "-0");
  assertEquals(
    formatNumber(-0.00001, "en", { maximumFractionDigits: 2 }),
    "-0",
  );
  assertEquals(formatMoney(-0, "en"), "-$0.00");
  assertEquals(formatNumber(NaN, "de"), "NaN");
  assertEquals(formatNumber(-Infinity, "en"), "-∞");
});

Deno.test("four-digit grouping follows each locale", () => {
  assertEquals(formatNumber(1234, "es"), "1234");
  assertEquals(formatNumber(12345, "es"), "12.345");
  assertEquals(formatNumber(1234, "pl"), "1234");
  assertEquals(formatNumber(1234, "de"), "1.234");
});

Deno.test("Finnish uses its minus sign, compact units and inflected date forms", () => {
  assertEquals(formatNumber(-1234.5, "fi-FI"), "−1 234,5");
  assertEquals(formatNumber(1200, "fi", { notation: "compact" }), "1,2 t.");
  assertEquals(
    formatNumber(1200000, "fi", { notation: "compact" }),
    "1,2 milj.",
  );
  assertEquals(
    formatDate(new Date(Date.UTC(2025, 3, 5)), "fi", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    "5. huhtikuuta 2025",
  );
  assertEquals(
    formatDate(new Date(Date.UTC(2025, 3, 5)), "fi", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    "huhtikuu 2025",
  );
});

for (const { locale, input, sorted } of COLLATION_CASES) {
  Deno.test(`Z5.3 ${locale} names sort in Intl.Collator's literal order`, () => {
    assertEquals(
      [...input].sort((a, b) => compareText(a, b, locale)),
      sorted,
    );
  });
}

Deno.test("saved names retain ranks after their characters leave the catalogs", () => {
  assertEquals(compareText("丧", "字", "zh"), -1);
  assertEquals(compareText("飯", "愛", "ja"), 1);
  assertEquals(compareText("`", "~", "en"), -1);
});

Deno.test("Chinese regional aliases keep Traditional compact units and date forms", () => {
  assertEquals(formatNumber(10000, "zh-TW", { notation: "compact" }), "1萬");
  assertEquals(
    formatNumber(10000, "zh-Hant-HK", { notation: "compact" }),
    "1萬",
  );
  assertEquals(
    formatNumber(10000, "zh-Hans-TW", { notation: "compact" }),
    "1万",
  );
  assertEquals(
    formatDate(new Date(Date.UTC(2025, 3, 5)), "zh-TW", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    "2025年4月5日 星期六",
  );
});
