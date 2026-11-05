import { COLLATION_CASES } from "bureau/kit/i18n/collation_cases.ts";
import fixtures from "bureau/kit/i18n/format_fixtures.json" with {
  type: "json",
};
import {
  compareText,
  formatDate,
  formatMoney,
  formatNumber,
} from "bureau/kit/i18n/format.ts";
import { PluralRules } from "bureau/kit/i18n/plural_rules.ts";

declare global {
  var __bureauCommit: (commit: string) => void;
}

// The same values format.test.ts and plural_rules.test.ts check in Deno,
// formatted again in Hermes, which has no Intl.
const day = new Date(Date.UTC(2025, 3, 5));
const formatting = fixtures.map((fixture) => {
  const cardinal = new PluralRules(fixture.locale);
  const ordinal = new PluralRules(fixture.locale, { type: "ordinal" });
  return {
    locale: fixture.locale,
    number: formatNumber(1234567.89, fixture.locale),
    money: formatMoney(-1234.5, fixture.locale),
    date: formatDate(day, fixture.locale, { timeZone: "UTC" }),
    fullDate: formatDate(day, fixture.locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    percent: formatNumber(0.1534, fixture.locale, {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    plurals: fixture.plurals.map(({ value }) => ({
      value,
      expected: cardinal.select(value),
    })),
    ordinals: fixture.ordinals.map(({ value }) => ({
      value,
      expected: ordinal.select(value),
    })),
  };
});

const letters = ["ä", "ł", "ß", "İ"];
globalThis.__bureauCommit(JSON.stringify({
  upper: letters.map((letter) => letter.toUpperCase()),
  lower: letters.map((letter) => letter.toLowerCase()),
  normalized: [
    "é".normalize("NFD"),
    "ＡＢＣ１２３".normalize("NFKC"),
    "ﬁ".normalize("NFKC"),
  ],
  collation: COLLATION_CASES.map(({ locale, input }) =>
    [...input].sort((a, b) => compareText(a, b, locale))
  ),
  expectedCollation: COLLATION_CASES.map(({ sorted }) => sorted),
  formatting,
  expectedFormatting: fixtures,
}));
