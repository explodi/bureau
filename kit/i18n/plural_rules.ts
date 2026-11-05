/** CLDR 48 cardinal/ordinal rules for the shipped locales, including decimal operands.
 * Source: https://github.com/unicode-org/cldr-json/tree/48.0.0/cldr-json/cldr-core/supplemental
 */
import {
  formatNumber,
  type NumberFormatOptions,
  resolveFormatLocale,
} from "./format.ts";

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export interface PluralRulesOptions extends
  Pick<
    NumberFormatOptions,
    | "minimumFractionDigits"
    | "maximumFractionDigits"
    | "minimumSignificantDigits"
    | "maximumSignificantDigits"
  > {
  type?: "cardinal" | "ordinal";
}

function ordinalCategory(language: string, count: number): PluralCategory {
  if (language === "fr") return count === 1 ? "one" : "other";
  if (language === "it") {
    return [8, 11, 80, 800].includes(count) ? "many" : "other";
  }
  if (language === "uk") {
    return count % 10 === 3 && count % 100 !== 13 ? "few" : "other";
  }
  if (language !== "en") return "other";
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return "one";
  if (last === 2 && lastTwo !== 12) return "two";
  if (last === 3 && lastTwo !== 13) return "few";
  return "other";
}

function cardinalCategory(
  locale: string,
  count: number,
  fractionDigits: number,
  integer: number,
): PluralCategory {
  const language = locale.split("-")[0];
  if (language === "ja" || language === "ko" || language === "zh") {
    return "other";
  }
  const whole = fractionDigits === 0;
  if (language === "ru" || language === "uk") {
    if (!whole) return "other";
    const last = integer % 10;
    const lastTwo = integer % 100;
    if (last === 1 && lastTwo !== 11) return "one";
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "few";
    return "many";
  }
  if (language === "pl") {
    if (!whole) return "other";
    if (integer === 1) return "one";
    const last = integer % 10;
    const teens = integer % 100 >= 12 && integer % 100 <= 14;
    return last >= 2 && last <= 4 && !teens ? "few" : "many";
  }
  const zeroAndOne = language === "fr" ||
    (language === "pt" && locale !== "pt-PT");
  if (zeroAndOne && integer <= 1) return "one";
  const oneIgnoresDecimals = language === "es" || language === "tr";
  if (count === 1 && (oneIgnoresDecimals || whole)) return "one";
  const hasMillions = language === "fr" || language === "es" ||
    language === "it" || language === "pt";
  if (hasMillions && whole && integer !== 0 && integer % 1_000_000 === 0) {
    return "many";
  }
  return "other";
}

function ordinalCategories(language: string): PluralCategory[] {
  if (language === "en") return ["few", "one", "two", "other"];
  if (language === "fr") return ["one", "other"];
  if (language === "uk") return ["few", "other"];
  if (language === "it") return ["many", "other"];
  return ["other"];
}

function cardinalCategories(language: string): PluralCategory[] {
  if (["ja", "ko", "zh"].includes(language)) return ["other"];
  if (["pl", "ru", "uk"].includes(language)) {
    return ["few", "many", "one", "other"];
  }
  if (["es", "fr", "it", "pt"].includes(language)) {
    return ["many", "one", "other"];
  }
  return ["one", "other"];
}

/** CLDR plural categories shared by Bureau messages and native probes. */
export class PluralRules {
  private readonly locale;
  private readonly options;

  constructor(
    locales?: string | readonly string[],
    options: PluralRulesOptions = {},
  ) {
    this.locale = resolveFormatLocale(locales);
    this.options = options;
  }

  select(value: number): PluralCategory {
    if (!Number.isFinite(value)) return "other";
    const formatted = formatNumber(Math.abs(value), "en", {
      ...this.options,
      useGrouping: false,
      style: "decimal",
      notation: "standard",
    });
    const count = Number(formatted);
    if (this.options.type === "ordinal") {
      return ordinalCategory(this.locale.split("-")[0]!, count);
    }
    const [integerText, fraction = ""] = formatted.split(".");
    // ICU DecimalQuantity::toLong(true) retains the last 18 integer digits.
    const integer = Number(integerText!.slice(-18));
    return cardinalCategory(this.locale, count, fraction.length, integer);
  }

  resolvedOptions() {
    const language = this.locale.split("-")[0];
    const pluralCategories = this.options.type === "ordinal"
      ? ordinalCategories(language!)
      : cardinalCategories(language!);
    return {
      locale: this.locale,
      type: this.options.type ?? "cardinal",
      pluralCategories,
    };
  }
}
