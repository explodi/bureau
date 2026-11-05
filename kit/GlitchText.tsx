/**
 * GlitchText — corrupts displayed text with zalgo combining characters,
 * NotoSansSymbols glyphs, and video game glitch references.
 * Used during ransomware incidents to sell the "system hacked" illusion
 * without touching i18n strings.
 *
 * Pure render-time component — no Effects, no timers, no state.
 * Produces a single static corrupted string on each mount.
 *
 * Usage:
 *   <GlitchText text="City Hall" />
 *   <GlitchText text="$500,000" intensity={0.5} />
 */

import { Text, useInheritedTypeStyle } from "bureau/primitives";
import { TYPE_METRICS } from "./tokens.ts";

// Zalgo combining marks (diacritics above, below, and overlay)
const ZALGO_UP = [
  "\u0300",
  "\u0301",
  "\u0302",
  "\u0303",
  "\u0304",
  "\u0305",
  "\u0306",
  "\u0307",
  "\u0308",
  "\u0309",
  "\u030A",
  "\u030B",
  "\u030C",
  "\u030D",
  "\u030E",
  "\u030F",
  "\u0310",
  "\u0311",
  "\u0312",
  "\u0313",
  "\u0314",
  "\u0315",
  "\u031A",
  "\u0338",
  "\u0340",
  "\u0341",
  "\u0342",
  "\u0343",
  "\u0344",
  "\u0346",
  "\u034A",
  "\u034B",
  "\u034C",
];

const ZALGO_DOWN = [
  "\u0316",
  "\u0317",
  "\u0318",
  "\u0319",
  "\u031C",
  "\u031D",
  "\u031E",
  "\u031F",
  "\u0320",
  "\u0321",
  "\u0322",
  "\u0323",
  "\u0324",
  "\u0325",
  "\u0326",
  "\u0327",
  "\u0328",
  "\u0329",
  "\u032A",
  "\u032B",
  "\u032C",
  "\u032D",
  "\u032E",
  "\u032F",
  "\u0330",
  "\u0331",
  "\u0332",
  "\u0333",
  "\u0339",
  "\u033A",
  "\u033B",
  "\u033C",
  "\u0345",
  "\u0347",
  "\u0348",
  "\u0349",
];

// NotoSansSymbols-style unicode glyphs (arrows, blocks, misc symbols)
const SYMBOL_GLYPHS = [
  "\u2588",
  "\u2591",
  "\u2592",
  "\u2593", // block elements
  "\u25A0",
  "\u25A1",
  "\u25B2",
  "\u25BC", // geometric shapes
  "\u2660",
  "\u2663",
  "\u2665",
  "\u2666", // card suits
  "\u2318",
  "\u2325",
  "\u2326",
  "\u232B", // misc technical
  "\u23F0",
  "\u23F3",
  "\u2620",
  "\u2622", // hazard/time
  "\u2639",
  "\u263A",
  "\u2694",
  "\u26A0", // faces/warning
  "\u2702",
  "\u2708",
  "\u270E",
  "\u2764", // misc
  "\u2B1B",
  "\u2B1C",
  "\u2B50", // large squares/star
  "\u29D7",
  "\u29EB",
  "\u2A2F", // math operators
  "\u2190",
  "\u2191",
  "\u2192",
  "\u2193", // arrows
];

// Video game glitch references — short phrases gamers recognise
const GLITCH_REFERENCES = [
  "MISSINGNO.",
  "?????????",
  "#ERR:0xFFFF",
  "LEVEL 256",
  "FAR LANDS",
  "!EMU_ERROR",
  "NaN",
  "NULL",
  "SEGFAULT",
  "0xDEADBEEF",
  "BAD_EGG",
  "??Pokemon??",
  "KERN_PANIC",
  "$¥$73M_W1P3",
  "ACE_EXPLOIT",
  "BEN_DROWNED",
  "HEAP_CORRUPT",
  "STACK_SMASH",
  "M_BLOCK_ERR",
  "GLITCH_CITY",
  "ZZAZZ",
  "TRAINER_???",
  "MAP_FF",
  "PKMn_0x00",
  "ZERO_COOL",
  "ACID_BURN",
  "THE_PLAGUE",
  "THE_GIBSON",
  "HACK_PLANET",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Adds 1-2 zalgo combining marks to a character. */
function zalgoify(char: string, intensity: number): string {
  if (char === " " || Math.random() > intensity) return char;
  const marks = Math.random() < 0.5 * intensity ? 2 : 1;
  let result = char;
  for (let i = 0; i < marks; i++) {
    result += Math.random() > 0.5 ? pick(ZALGO_UP) : pick(ZALGO_DOWN);
  }
  return result;
}

/** Produces a single corrupted version of the text. */
function corruptText(text: string, intensity: number): string {
  const maxLen = text.length;
  let corrupted = text;

  // ~15% chance to splice in a game-glitch reference (capped to fit)
  if (Math.random() < 0.15 * intensity) {
    const ref = pick(GLITCH_REFERENCES).slice(0, maxLen);
    const insertAt = Math.floor(Math.random() * corrupted.length);
    const cutLen = Math.min(ref.length, corrupted.length - insertAt);
    corrupted = corrupted.slice(0, insertAt) + ref +
      corrupted.slice(insertAt + cutLen);
  }

  corrupted = corrupted.slice(0, maxLen);

  let result = "";
  for (const char of corrupted) {
    if (Math.random() < 0.25 * intensity && char !== " ") {
      result += pick(SYMBOL_GLYPHS);
    } else {
      result += zalgoify(char, intensity);
    }
  }
  return result;
}

const GLITCH_STYLE = "glitch-16.2";
const GLITCH_SCALE = 0.9;

/**
 * Stateless component — renders corrupted text directly during render.
 * No Effects, no timers, no state.
 *
 * Set at 0.9 of the type it stands in (18px text outside one), on one line
 * that clips with an ellipsis. Every tint is a palette colour at low alpha,
 * so the effect survives on either chrome.
 */
export function GlitchText({
  text,
  intensity = 1,
}: {
  text: string;
  intensity?: number;
}) {
  const inheritedStyle = useInheritedTypeStyle();
  const lineStyle = inheritedStyle ?? "text";
  const corrupted = corruptText(text, intensity);
  const scale = (GLITCH_SCALE * TYPE_METRICS[lineStyle].size) /
    TYPE_METRICS[GLITCH_STYLE].size;
  return (
    <Text typeStyle={GLITCH_STYLE} scale={scale} ellipsis nowrap>
      {corrupted}
    </Text>
  );
}
