/** The languages the kit's formatters and on-screen keyboards know. */
export const SUPPORTED_LANGS = [
  "en",
  "es",
  "fr",
  "pl",
  "de",
  "tr",
  "pt",
  "it",
  "zh",
  "ja",
  "ko",
  "fi",
  "nl",
  "ru",
  "uk",
  "zh-TW",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGS)[number];

/** The supported language a tag such as `zh-Hant-HK` or `pt_BR.UTF-8` names. */
export function supportedLanguage(
  tag: string | null,
): SupportedLanguage | undefined {
  const parts = tag?.trim().toLowerCase().split(/[-_.@]/) ?? [];
  const base = parts[0];
  const traditionalChinese = base === "zh" && !parts.includes("hans") &&
    parts.some((part) => ["hant", "tw", "hk", "mo"].includes(part));
  if (traditionalChinese) return "zh-TW";
  return SUPPORTED_LANGS.find((language) => language === base);
}

export function normalizeLanguage(tag: string | null): SupportedLanguage {
  return supportedLanguage(tag) ?? "en";
}
