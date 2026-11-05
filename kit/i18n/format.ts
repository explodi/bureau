/** Locale formatting for the native JavaScript client. No ICU at runtime. */
import localeTables from "./format_locale_data.json" with { type: "json" };
import collationData from "./collation_data.json" with { type: "json" };
import { normalizeLanguage } from "./language.ts";

export type FormatLocale = keyof typeof localeTables;
let defaultLocale: FormatLocale = "en";

/** The host supplies its UI locale so unspecified call sites keep the OS's formatting. */
export function setFormatLocale(locale: string): void {
  defaultLocale = resolveFormatLocale(locale);
}

export function resolveFormatLocale(
  locale?: string | readonly string[],
): FormatLocale {
  const requested = typeof locale === "string" ? locale : locale?.[0];
  if (!requested) return defaultLocale;
  const tag = requested.toLowerCase().replaceAll("_", "-");
  if (tag === "en-gb") return "en-GB";
  if (tag === "pt-pt") return "pt-PT";
  return normalizeLanguage(tag);
}

export interface NumberFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  minimumSignificantDigits?: number;
  maximumSignificantDigits?: number;
  useGrouping?: boolean;
  style?: "decimal" | "percent" | "currency";
  currency?: "USD";
  notation?: "standard" | "compact";
}

interface Decimal {
  digits: string;
  point: number;
}

/** Decimal arithmetic matches the visible decimal value, including 1.005 → 1.01. */
function decimalOf(value: number, shift = 0): Decimal {
  const [coefficient, exponent = "0"] = Math.abs(value).toString().split("e");
  const [integer, fraction = ""] = coefficient!.split(".");
  return {
    digits: integer! + fraction,
    point: integer!.length + Number(exponent) + shift,
  };
}

function roundedDecimal(value: number, places: number, shift = 0): string {
  const { digits, point } = decimalOf(value, shift);
  const cut = point + places;
  const kept = cut > 0 ? digits.slice(0, cut).padEnd(cut, "0") : "0";
  const next = cut >= 0 ? digits[cut] ?? "0" : "0";
  const rounded = (BigInt(kept) + (next >= "5" ? 1n : 0n)).toString();
  if (places <= 0) return rounded + "0".repeat(-places);
  const padded = rounded.padStart(places + 1, "0");
  return `${padded.slice(0, -places)}.${padded.slice(-places)}`;
}

function fractionBounds(
  value: number,
  shift: number,
  options: NumberFormatOptions,
): { min: number; max: number } {
  if (
    options.maximumSignificantDigits !== undefined ||
    options.minimumSignificantDigits !== undefined
  ) {
    const maxSignificant = options.maximumSignificantDigits ?? 21;
    const minSignificant = options.minimumSignificantDigits ?? 1;
    const decimal = decimalOf(value, shift);
    const leadingZeros = decimal.digits.match(/^0*/)?.[0].length ?? 0;
    const magnitude = value === 0 ? 1 : decimal.point - leadingZeros;
    return {
      min: Math.max(0, minSignificant - magnitude),
      max: maxSignificant - magnitude,
    };
  }
  const currency = options.style === "currency";
  const min = options.minimumFractionDigits ?? (currency ? 2 : 0);
  const defaultMax = currency ? 2 : options.style === "percent" ? 0 : 3;
  return {
    min,
    max: options.maximumFractionDigits ?? Math.max(min, defaultMax),
  };
}

function localizedDigits(
  value: number,
  shift: number,
  locale: FormatLocale,
  options: NumberFormatOptions,
  compact: boolean,
): string {
  const table = localeTables[locale];
  let { min, max } = fractionBounds(value, shift, options);
  if (min < 0 || min > 100 || max > 100 || (max >= 0 && min > max)) {
    throw new RangeError("Invalid fraction digit bounds");
  }
  const rounded = roundedDecimal(value, max, shift);
  if (
    options.minimumSignificantDigits !== undefined ||
    options.maximumSignificantDigits !== undefined
  ) {
    min = fractionBounds(Number(rounded), 0, options).min;
  }
  const [integer = "0", fraction = ""] = rounded.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "").padEnd(min, "0");
  const minimumGroupingDigits = compact ? 5 : table.minimumGroupingDigits;
  const grouped =
    options.useGrouping !== false && integer.length >= minimumGroupingDigits
      ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, table.group)
      : integer;
  return trimmedFraction
    ? `${grouped}${table.decimal}${trimmedFraction}`
    : grouped;
}

export function formatNumber(
  value: number,
  locale?: string,
  options: NumberFormatOptions = {},
): string {
  const language = resolveFormatLocale(locale);
  const table = localeTables[language];
  const negative = value < 0 || Object.is(value, -0);
  const style = options.style ?? "decimal";
  let shift = style === "percent" ? 2 : 0;
  let compactPattern = "{number}";
  const compactMagnitude = Number.isFinite(value)
    ? Number(
      roundedDecimal(value, fractionBounds(value, shift, options).max, shift),
    )
    : 0;
  const compact = options.notation === "compact" && compactMagnitude >= 1000;
  if (compact) {
    let magnitude = Math.min(18, Math.floor(Math.log10(compactMagnitude)));
    let unit = table.compact[magnitude - 3]!;
    shift -= unit.exponent;
    const bounds = fractionBounds(value, shift, options);
    const rounded = Number(roundedDecimal(value, bounds.max, shift));
    const nextUnit = table.compact[magnitude - 2];
    const nextThreshold = 10 **
      ((nextUnit?.exponent ?? unit.exponent) - unit.exponent);
    if (
      nextUnit && nextUnit.exponent > unit.exponent && rounded >= nextThreshold
    ) {
      magnitude++;
      unit = table.compact[magnitude - 3]!;
      shift = -unit.exponent;
    }
    compactPattern = unit.pattern;
  }
  let digits: string;
  if (Number.isNaN(value)) digits = table.nan;
  else if (!Number.isFinite(value)) digits = table.infinity;
  else {digits = localizedDigits(
      Math.abs(value),
      shift,
      language,
      options,
      compact,
    );}
  digits = compactPattern.replace("{number}", digits);
  if (style === "currency" || style === "percent") {
    const pattern = table[style][negative ? "negative" : "positive"];
    return pattern.replace("{number}", digits);
  }
  const minus = "minus" in table ? table.minus : "-";
  return negative ? `${minus}${digits}` : digits;
}

export function numberFormatter(
  locale?: string,
  options: NumberFormatOptions = {},
) {
  return { format: (value: number) => formatNumber(value, locale, options) };
}

export function formatMoney(
  value: number,
  locale?: string,
  digits = 2,
): string {
  return formatNumber(value, locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export interface DateFormatOptions {
  year?: "numeric";
  month?: "numeric" | "2-digit" | "short" | "long";
  day?: "numeric" | "2-digit";
  weekday?: "long";
  timeZone?: "UTC";
}

type DateShape = keyof typeof localeTables.en.dates;
function dateShape(options: DateFormatOptions): DateShape {
  if (options.weekday) return "full";
  if (options.month === "long") return options.day ? "long" : "monthLong";
  if (options.month === "short") return "monthShort";
  return options.month === "2-digit" ? "padded" : "numeric";
}

export function formatDate(
  value: Date | number,
  locale?: string,
  options: DateFormatOptions = {},
): string {
  const date = typeof value === "number" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "Invalid Date";
  const utc = options.timeZone === "UTC";
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const month = utc ? date.getUTCMonth() : date.getMonth();
  const day = utc ? date.getUTCDate() : date.getDate();
  const weekday = utc ? date.getUTCDay() : date.getDay();
  const table =
    localeTables[resolveFormatLocale(locale)].dates[dateShape(options)];
  return table.fields.map((part) => {
    if (part.literal !== undefined) return part.literal;
    if (part.field === "month") return table.months[month];
    if (part.field === "weekday") return table.weekdays[weekday];
    if (part.field === "year") return String(year);
    return String(day).padStart(part.width === 2 ? 2 : 1, "0");
  }).join("");
}

/** A local clock time from UTC and the shell offset; no host-local Date getters. */
export function formatClockTime(
  utcMs: number,
  utcOffsetMinutes: number,
  locale?: string,
): string {
  const local = new Date(utcMs - utcOffsetMinutes * 60_000);
  if (!Number.isFinite(local.getTime())) return "–";
  const hour = formatNumber(local.getUTCHours(), locale, {
    useGrouping: false,
  });
  const minute = formatNumber(local.getUTCMinutes(), locale, {
    useGrouping: false,
  }).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function dateFormatter(
  locale?: string,
  options: DateFormatOptions = {},
) {
  return {
    format: (value: Date | number) => formatDate(value, locale, options),
  };
}

/*
 * Sorting: a three-level comparison in the shape of the Unicode Collation
 * Algorithm, held to Intl.Collator's order for the shipped languages. Letters
 * compare by base letter, then accent, then case. Han and kana order (pinyin,
 * on-yomi) is not in the code points, so collation_data.json ranks such
 * characters; one it lacks sorts by code point, after the ranked ones.
 */

/** Letters a language sorts as their own, just after (+) or before (-) a base. */
const LETTER_TAILORINGS: Partial<Record<string, Record<string, string>>> = {
  es: { "ñ": "n+" },
  fi: { "å": "z+", "ä": "z++", "ö": "z+++" },
  pl: {
    "ą": "a+",
    "ć": "c+",
    "ę": "e+",
    "ł": "l+",
    "ń": "n+",
    "ó": "o+",
    "ś": "s+",
    "ź": "z+",
    "ż": "z++",
  },
  tr: { "ç": "c+", "ğ": "g+", "ı": "i-", "ö": "o+", "ş": "s+", "ü": "u+" },
};

/** Letters Unicode does not decompose, spelt as what they sort as. */
const LETTER_EXPANSIONS: Record<string, string> = {
  "ß": "ss",
  "æ": "ae",
  "œ": "oe",
  "ø": "o̸",
  "ł": "l̸",
  "đ": "d̸",
};

// Accents in the order of the Unicode Collation Algorithm's secondary weights.
const ACCENT_ORDER = [
  0x301,
  0x300,
  0x306,
  0x302,
  0x30c,
  0x30a,
  0x308,
  0x30b,
  0x303,
  0x307,
  0x338,
  0x328,
  0x327,
  0x304,
];

// Scripts sort in this order; a weight is its class plus its rank within it.
const SYMBOL = 100_000;
const UNRANKED_SYMBOL = 200_000;
const DIGIT = 300_000;
const LATIN = 400_000;
const OTHER_LETTER = 500_000;
const HANGUL = 600_000;
const RANKED = 700_000;
const UNRANKED_HAN = 800_000;
// Korean puts Hangul, and Chinese puts Han, before Latin letters.
const KOREAN_HANGUL = 350_000;
const CHINESE_HAN = 360_000;
const CYRILLIC = 370_000;

interface CollationKey {
  primary: number[];
  secondary: number[];
  tertiary: number[];
}

const rankTables = new Map<string, Map<string, number>>();
function rankTable(name: string): Map<string, number> | undefined {
  const groups = (collationData as Record<string, string[][]>)[name];
  if (!groups) return undefined;
  const cached = rankTables.get(name);
  if (cached) return cached;
  const table = new Map<string, number>();
  groups.forEach((group, rank) => {
    for (const character of group) table.set(character, rank);
  });
  rankTables.set(name, table);
  return table;
}

function groupIndex(part: string, language: string): number {
  const rank = rankTable(language)?.get(part);
  if (rank === undefined) return 0;
  const groups = (collationData as Record<string, string[][]>)[language]!;
  return groups[rank]!.indexOf(part);
}

function latinWeight(letter: string, shift = ""): number {
  const index = letter.charCodeAt(0) - 0x61;
  const offset = shift === "-" ? -1 : shift.length;
  return LATIN + index * 10 + 5 + offset;
}

function accentWeight(mark: number): number {
  const rank = ACCENT_ORDER.indexOf(mark);
  return rank >= 0 ? rank + 1 : 100 + mark;
}

function scriptWeight(part: string, language: string): number {
  const code = part.codePointAt(0)!;
  const scriptRank = rankTable(language)?.get(part);
  if (scriptRank !== undefined) {
    const script = language.startsWith("zh")
      ? CHINESE_HAN
      : language === "ru" || language === "uk"
      ? CYRILLIC
      : RANKED;
    return script + scriptRank;
  }
  const symbolRank = rankTable("symbols")?.get(part);
  if (symbolRank !== undefined) return SYMBOL + symbolRank;
  const folded = part.normalize("NFKC").toLowerCase();
  if (/^[a-z]$/.test(folded)) return latinWeight(folded);
  if (/^\d$/.test(folded)) return DIGIT + Number(folded);
  if (/\p{Nd}/u.test(part)) return DIGIT + code;
  if (code >= 0x1100 && code <= 0xd7af) {
    return (language === "ko" ? KOREAN_HANGUL : HANGUL) + code;
  }
  const isCjk = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u
    .test(part);
  if (isCjk) return UNRANKED_HAN + code;
  if (/\p{L}/u.test(part)) return OTHER_LETTER + code;
  return UNRANKED_SYMBOL + code;
}

// Japanese reads the long-vowel mark ー as the vowel of the kana before it.
const KANA_VOWELS: Record<string, string> = {
  "あ": "あかさたなはまやらわがざだばぱぁゃゎ",
  "い": "いきしちにひみりぎじぢびぴぃ",
  "う": "うくすつぬふむゆるぐずづぶぷぅゅっゔ",
  "え": "えけせてねへめれげぜでべぺぇ",
  "お": "おこそとのほもよろをごぞどぼぽぉょ",
};
function kanaVowel(kana: string): string | undefined {
  const code = kana.codePointAt(0)!;
  const isKatakana = code >= 0x30a1 && code <= 0x30f6;
  const hiragana = isKatakana ? String.fromCodePoint(code - 0x60) : kana;
  for (const [vowel, row] of Object.entries(KANA_VOWELS)) {
    if (row.includes(hiragana)) return vowel;
  }
  return undefined;
}

/** Turkish pairs dotted and dotless i in case: I is ı's capital, İ is i's. */
function lowerLetter(character: string, language: string): string {
  if (language === "tr" && character === "I") return "ı";
  if (language === "tr" && character === "İ") return "i";
  return character.toLowerCase();
}

function collationKey(text: string, language: string): CollationKey {
  const key: CollationKey = { primary: [], secondary: [], tertiary: [] };
  const tailoring: Record<string, string> = {
    "ı": "i+",
    ...LETTER_TAILORINGS[language],
  };
  let previous = "";
  for (const character of text.normalize("NFC")) {
    const vowel = character === "ー" && language === "ja"
      ? kanaVowel(previous)
      : undefined;
    previous = character;
    if (vowel) {
      key.primary.push(scriptWeight(vowel, language));
      key.secondary.push(1);
      key.tertiary.push(0);
      continue;
    }
    const lower = lowerLetter(character, language);
    const caseWeight = character === lower ? 0 : 1;
    // Cyrillic alphabets have distinct letters that NFD would fold together.
    if (/\p{Script=Cyrillic}/u.test(lower) && rankTable(language)?.has(lower)) {
      key.primary.push(scriptWeight(lower, language));
      key.secondary.push(groupIndex(lower, language));
      key.tertiary.push(caseWeight);
      continue;
    }
    const tailored = tailoring[lower];
    if (tailored) {
      key.primary.push(latinWeight(tailored[0]!, tailored.slice(1)));
      key.secondary.push(0);
      key.tertiary.push(caseWeight);
      continue;
    }
    const expansion = LETTER_EXPANSIONS[lower];
    // ß sorts as ss, after it at the case level.
    const expandedWeight = expansion ? 4 : 0;
    for (const part of (expansion ?? lower).normalize("NFD")) {
      const last = key.secondary.length - 1;
      if (/\p{M}/u.test(part) && last >= 0) {
        key.secondary[last] = key.secondary[last]! * 1000 +
          accentWeight(part.codePointAt(0)!);
        continue;
      }
      const code = part.codePointAt(0)!;
      const isKatakana = code >= 0x30a1 && code <= 0x30fa;
      const isFullwidth = part !== part.normalize("NFKC");
      key.primary.push(scriptWeight(part, language));
      // Kana that differ only in voicing (て, で) share a rank; Intl's order
      // within the rank tells them apart at the accent level.
      key.secondary.push(groupIndex(part, language));
      key.tertiary.push(
        caseWeight + expandedWeight + (isKatakana || isFullwidth ? 2 : 0),
      );
    }
  }
  return key;
}

function compareWeights(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}

/** Orders two strings as the language's dictionary does, like Intl.Collator. */
export function compareText(a: string, b: string, locale?: string): number {
  const resolved = resolveFormatLocale(locale);
  const language = resolved === "zh-TW" ? resolved : resolved.slice(0, 2);
  const left = collationKey(a, language);
  const right = collationKey(b, language);
  return compareWeights(left.primary, right.primary) ||
    compareWeights(left.secondary, right.secondary) ||
    compareWeights(left.tertiary, right.tertiary);
}
