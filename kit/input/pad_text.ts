import type { SupportedLanguage } from "../i18n/language.ts";

export const PAD_LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pl: "Polski",
  de: "Deutsch",
  tr: "Türkçe",
  pt: "Português",
  it: "Italiano",
  zh: "简体中文",
  ja: "日本語",
  ko: "한국어",
  fi: "Suomi",
  nl: "Nederlands",
  ru: "Русский",
  uk: "Українська",
  "zh-TW": "繁體中文",
};

export const LATIN_KEYS = [
  "1234567890",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "-.'",
];
export const SYMBOL_KEYS = ["!@#$%^&*()", "_+=/\\|[]{}", ';:"?<>~`,'];
export const KANA_KEYS = [
  "あいうえおかきくけこ",
  "さしすせそたちつてと",
  "なにぬねのはひふへほ",
  "まみむめもやゆよらり",
  "るれろわをんー",
];
export const HANGUL_KEYS = [
  "ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ",
  "ㅁㄴㅇㄹㅎㅗㅓㅏㅣ",
  "ㅋㅌㅊㅍㅠㅜㅡ",
];
export const ACCENT_KEYS: Partial<Record<SupportedLanguage, string[]>> = {
  es: ["áéíóúüñ", "¿¡"],
  fr: ["àâæçéèêë", "îïôœùûüÿ"],
  pl: ["ąćęłńóśźż"],
  de: ["äöüß"],
  tr: ["çğıöşü"],
  pt: ["áàâãéêíóôõ", "úüç"],
  it: ["àèéìíòóùú"],
  fi: ["åäöšž"],
  nl: ["áéëïóöüèê"],
  ru: ["йцукенгшщзхъ", "фывапролджэ", "ячсмитьбюё"],
  uk: ["йцукенгшщзхї", "фівапролджє", "ячсмитьбюґ"],
};

const LEADING = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const TRAILING = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
const COMPOUND_VOWELS: Record<string, string> = {
  "ㅗㅏ": "ㅘ",
  "ㅗㅐ": "ㅙ",
  "ㅗㅣ": "ㅚ",
  "ㅜㅓ": "ㅝ",
  "ㅜㅔ": "ㅞ",
  "ㅜㅣ": "ㅟ",
  "ㅡㅣ": "ㅢ",
};
const COMPOUND_FINALS: Record<string, string> = {
  "ㄱㅅ": "ㄳ",
  "ㄴㅈ": "ㄵ",
  "ㄴㅎ": "ㄶ",
  "ㄹㄱ": "ㄺ",
  "ㄹㅁ": "ㄻ",
  "ㄹㅂ": "ㄼ",
  "ㄹㅅ": "ㄽ",
  "ㄹㅌ": "ㄾ",
  "ㄹㅍ": "ㄿ",
  "ㄹㅎ": "ㅀ",
  "ㅂㅅ": "ㅄ",
};
const SHIFT_JAMO: Record<string, string> = {
  "ㅂ": "ㅃ",
  "ㅈ": "ㅉ",
  "ㄷ": "ㄸ",
  "ㄱ": "ㄲ",
  "ㅅ": "ㅆ",
  "ㅐ": "ㅒ",
  "ㅔ": "ㅖ",
};
const splitCompound = (
  table: Record<string, string>,
  value: string,
): string | undefined => Object.keys(table).find((key) => table[key] === value);
const syllable = (leading: number, vowel: number, final = 0): string =>
  String.fromCharCode(0xac00 + (leading * 21 + vowel) * 28 + final);

/** Unicode's modern Hangul composition, with two-set compound vowels/finals. */
export function appendHangul(text: string, key: string): string {
  const characters = Array.from(text);
  const last = characters.pop() ?? "";
  const prefix = characters.join("");
  const code = last.charCodeAt(0) - 0xac00;
  const nextVowel = VOWELS.indexOf(key);
  if (code >= 0 && code < 11172) {
    const leading = Math.floor(code / 588);
    const vowel = Math.floor(code / 28) % 21;
    const final = code % 28;
    if (nextVowel >= 0) {
      if (final) {
        const pair = splitCompound(COMPOUND_FINALS, TRAILING[final]!);
        const stays = pair ? TRAILING.indexOf(pair[0]!) : 0;
        const moves = LEADING.indexOf(pair ? pair[1]! : TRAILING[final]!);
        return prefix + syllable(leading, vowel, stays) +
          syllable(moves, nextVowel);
      }
      const compound = COMPOUND_VOWELS[VOWELS[vowel]! + key];
      if (compound) return prefix + syllable(leading, VOWELS.indexOf(compound));
    } else {
      const nextFinal = TRAILING.indexOf(key);
      if (!final && nextFinal > 0) {
        return prefix + syllable(leading, vowel, nextFinal);
      }
      const compound = COMPOUND_FINALS[TRAILING[final]! + key];
      if (compound) {
        return prefix + syllable(leading, vowel, TRAILING.indexOf(compound));
      }
    }
  }
  const leading = LEADING.indexOf(last);
  if (last && leading >= 0 && nextVowel >= 0) {
    return prefix + syllable(leading, nextVowel);
  }
  const compound = COMPOUND_VOWELS[last + key];
  return compound ? prefix + compound : text + key;
}

/** Backspace removes the last composed jamo, as a Korean keyboard does. */
export function deleteHangul(text: string): string {
  const characters = Array.from(text);
  const last = characters.pop() ?? "";
  const prefix = characters.join("");
  const code = last.charCodeAt(0) - 0xac00;
  if (!last) return prefix;
  if (code < 0 || code >= 11172) {
    const pair = splitCompound(COMPOUND_VOWELS, last);
    return prefix + (pair?.[0] ?? "");
  }
  const leading = Math.floor(code / 588);
  const vowel = Math.floor(code / 28) % 21;
  const final = code % 28;
  if (final) {
    const pair = splitCompound(COMPOUND_FINALS, TRAILING[final]!);
    return prefix +
      syllable(leading, vowel, pair ? TRAILING.indexOf(pair[0]!) : 0);
  }
  const pair = splitCompound(COMPOUND_VOWELS, VOWELS[vowel]!);
  return prefix +
    (pair ? syllable(leading, VOWELS.indexOf(pair[0]!)) : LEADING[leading]);
}

export function shiftedKey(key: string, language: SupportedLanguage): string {
  if (language === "ko" && SHIFT_JAMO[key]) return SHIFT_JAMO[key];
  if (language === "tr" && key === "i") return "İ";
  if (language === "tr" && key === "ı") return "I";
  return key.toUpperCase();
}

export function katakana(text: string): string {
  return Array.from(
    text,
    (c) =>
      c >= "ぁ" && c <= "ゖ" ? String.fromCharCode(c.charCodeAt(0) + 0x60) : c,
  ).join("");
}
export function hiragana(text: string): string {
  return Array.from(
    text,
    (c) =>
      c >= "ァ" && c <= "ヶ" ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c,
  ).join("");
}

export function changeLastKana(text: string, small: boolean): string {
  const characters = Array.from(text);
  const last = characters.pop();
  if (!last) return text;
  const wasKatakana = last !== hiragana(last);
  const kana = hiragana(last);
  const groups = small
    ? [
      "あぁ",
      "いぃ",
      "うぅ",
      "えぇ",
      "おぉ",
      "つっ",
      "やゃ",
      "ゆゅ",
      "よょ",
      "わゎ",
      "かゕ",
      "けゖ",
    ]
    : [
      "うゔ",
      "かが",
      "きぎ",
      "くぐ",
      "けげ",
      "こご",
      "さざ",
      "しじ",
      "すず",
      "せぜ",
      "そぞ",
      "ただ",
      "ちぢ",
      "つづ",
      "てで",
      "とど",
      "はばぱ",
      "ひびぴ",
      "ふぶぷ",
      "へべぺ",
      "ほぼぽ",
    ];
  const group = groups.find((value) => value.includes(kana));
  if (!group) return text;
  const replacement = group[(group.indexOf(kana) + 1) % group.length]!;
  return characters.join("") +
    (wasKatakana ? katakana(replacement) : replacement);
}
