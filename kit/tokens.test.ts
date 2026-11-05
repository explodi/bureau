import { assert, assertEquals } from "@std/assert";
import {
  BEVELS,
  BUREAU_TOKENS,
  CENSUS_DITHERS,
  CHROMES,
  DB32,
  FONT_FAMILIES,
  LOOKS,
  MICRO64_DITHERS,
  TYPE_METRICS,
  TYPOGRAPHY,
} from "./tokens.ts";

Deno.test("T1.1 the chrome face resolves to today's literal palette colour", () => {
  assertEquals(CHROMES.light.inks.face, "db32-gray-light");
  assertEquals(DB32["gray-light"], "#9badb7");
  assertEquals(CHROMES.dark.inks.face, "db32-slate");
  assertEquals(DB32.slate, "#323c39");
});

Deno.test("T1.3 both chromes carry the same named tokens", () => {
  assertEquals(Object.keys(CHROMES.light), Object.keys(CHROMES.dark));
  assertEquals(
    Object.keys(CHROMES.light.inks).sort(),
    Object.keys(CHROMES.dark.inks).sort(),
  );
});

type Chrome = keyof typeof CHROMES;

/** `#rrggbb` for a chrome's colour, following its named roles. */
function resolveColour(chrome: Chrome, name: string): string {
  const inks: Record<string, string> = CHROMES[chrome].inks;
  const role = inks[name];
  if (role !== undefined) return resolveColour(chrome, role);
  if (name.startsWith("#")) return name;
  return (DB32 as Record<string, string>)[name.slice("db32-".length)]!;
}

function channel(byte: number): number {
  const unit = byte / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(hex.slice(5, 7), 16));
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

Deno.test("engraving walls keep their light direction in both chromes", () => {
  assert(
    luminance(resolveColour("light", "engraving-shadow")) <
      luminance(resolveColour("light", "engraving-floor")),
  );
  assert(
    luminance(resolveColour("light", "engraving-floor")) <
      luminance(resolveColour("light", "face")),
  );
  assert(
    luminance(resolveColour("light", "engraving-lit")) >
      luminance(resolveColour("light", "face")),
  );
  assert(
    luminance(resolveColour("dark", "engraving-shadow")) <
      luminance(resolveColour("dark", "engraving-floor")),
  );
  assert(
    contrast(
      resolveColour("dark", "engraving-floor"),
      resolveColour("dark", "face"),
    ) >= 3,
  );
  assert(
    luminance(resolveColour("dark", "engraving-lit")) >
      luminance(resolveColour("dark", "engraving-floor")),
  );
});

Deno.test("the instrument back area shares the header bevel with a divider", () => {
  assertEquals(LOOKS["instrument-back"].rest.fill, "titlebar");
  assertEquals(BEVELS["instrument-back"], [
    { side: "right", width: 1, color: "shade" },
    { side: "right", width: 2, color: "shadow" },
    ...BEVELS.titlebar,
  ]);
});

Deno.test("danger keys keep their DB32 red face and a legible white label", () => {
  const danger = LOOKS["key-danger"];
  assertEquals(resolveColour("light", danger.rest.fill), "#ac3232");
  assertEquals(resolveColour("dark", danger.rest.fill), "#ac3232");
  assertEquals(resolveColour("light", danger.rest.ink), "#ffffff");
  assertEquals(resolveColour("dark", danger.rest.ink), "#ffffff");
  assertEquals(danger.pressed.fill, danger.rest.fill);
  assertEquals(danger.disabled.fill, "face");
  assertEquals(danger.disabled.surface, "raised");
  assertEquals(LOOKS["key-bad"].rest.fill, "face");
  assertEquals(LOOKS["key-bad"].rest.ink, "ink-bad");
});

Deno.test("danger keys reverse their red bevels when pressed", () => {
  const danger = LOOKS["key-danger"];
  assertEquals(BEVELS[danger.rest.surface], [
    { side: "ring", width: 1, color: "ring" },
    { side: "bottom-right", width: 3, color: "danger-shadow" },
    { side: "top-left", width: 3, color: "danger-highlight" },
  ]);
  assertEquals(BEVELS[danger.pressed.surface], [
    { side: "ring", width: 1, color: "ring" },
    { side: "bottom-right", width: 3, color: "danger-highlight" },
    { side: "top-left", width: 3, color: "danger-shadow" },
  ]);
});

Deno.test("danger materials use MICRO64 red edges and white engraving floors", () => {
  const roles = [
    "danger-shadow",
    "danger-highlight",
    "engraving-danger-shadow",
    "engraving-danger-floor",
    "engraving-danger-lit",
  ];
  const colours = [
    "#880000",
    "#ff8080",
    "#880000",
    "#ffffff",
    "#ff8080",
  ];
  assertEquals(roles.map((role) => resolveColour("light", role)), colours);
  assertEquals(roles.map((role) => resolveColour("dark", role)), colours);
});

Deno.test("good engravings cut the good tone's green, lit from the same side", () => {
  const roles = [
    "engraving-good-shadow",
    "engraving-good-floor",
    "engraving-good-lit",
  ];
  assertEquals(roles.map((role) => resolveColour("light", role)), [
    "#000000",
    "#4b692f",
    "#99e550",
  ]);
  assertEquals(roles.map((role) => resolveColour("dark", role)), [
    "#000000",
    "#99e550",
    "#ffffff",
  ]);
});

Deno.test("a good engraving's floor is the good tone's ink", () => {
  assertEquals(
    resolveColour("light", "engraving-good-floor"),
    resolveColour("light", "ink-good"),
  );
  assertEquals(
    resolveColour("dark", "engraving-good-floor"),
    resolveColour("dark", "ink-good"),
  );
});

// A fill sits behind type and its knockout is the type on it: one white ink
// for every fill was unreadable on the dark chrome's bright fills. Knockouts
// are chip-sized type, so AA's 4.5:1 for body text, not the large-text 3:1.
Deno.test("every fill is legible under its own knockout in both chromes", () => {
  const names = Object.keys(CHROMES.light.inks);
  const pairs = [
    ...names
      .filter((name) => name.startsWith("fill-"))
      .map((fill) => [fill, fill.replace("fill-", "knockout-")]),
    ["row-selected", "knockout-selected"],
    ["titlebar", "titlebar-text"],
  ];
  const paired = pairs.map(([, knockout]) => knockout);
  const knockouts = names.filter((name) => name.startsWith("knockout-"));
  assertEquals(knockouts.filter((name) => !paired.includes(name)), []);
  assertEquals(paired.filter((name) => !names.includes(name!)), []);

  const illegible: string[] = [];
  for (const chrome of ["light", "dark"] as const) {
    for (const [fill, knockout] of pairs) {
      const ratio = contrast(
        resolveColour(chrome, fill!),
        resolveColour(chrome, knockout!),
      );
      if (ratio < 4.5) {
        illegible.push(`${chrome}: ${knockout} on ${fill} is ${ratio}:1`);
      }
    }
  }
  assertEquals(illegible, []);
});

Deno.test("every chrome colour resolves to a palette colour", () => {
  const unknown: string[] = [];
  for (const chrome of ["light", "dark"] as const) {
    const { inks, bevelInks, focus, emboss } = CHROMES[chrome];
    const colours = [
      ...Object.values(inks),
      ...Object.values(bevelInks),
      focus.color,
      emboss.color,
    ];
    for (const colour of colours) {
      if (!/^#[0-9a-f]{6}$/.test(resolveColour(chrome, colour) ?? "")) {
        unknown.push(`${chrome}: ${colour}`);
      }
    }
  }
  assertEquals(unknown, []);
});

Deno.test("T1.5 every language and type style has an explicit pixel line height", () => {
  const styles = Object.values(TYPOGRAPHY).flatMap((language) =>
    Object.values(language)
  );
  assertEquals(
    styles.length,
    Object.keys(TYPOGRAPHY).length * Object.keys(TYPE_METRICS).length,
  );
  assertEquals(
    styles.filter((style) =>
      !Number.isFinite(style.lineHeight) || style.lineHeight <= 0
    ),
    [],
  );
  assertEquals(TYPOGRAPHY.en.text.lineHeight, 21.6);
  assertEquals(TYPOGRAPHY.ja["text-field"].lineHeight, 19.2);
  assertEquals(TYPOGRAPHY.zh["text-small"].lineHeight, 18);
  assertEquals(TYPOGRAPHY.ko["text-chrome"].lineHeight, 16.8);
});

Deno.test("Bureau font swaps and type metrics keep their literal values", () => {
  assertEquals(TYPOGRAPHY.en.text.face, "Jersey25");
  assertEquals(TYPOGRAPHY.fi, TYPOGRAPHY.en);
  assertEquals(TYPOGRAPHY.nl, TYPOGRAPHY.en);
  assertEquals(TYPOGRAPHY.ja.text.face, "WDXLLubrifont JPN");
  assertEquals(TYPOGRAPHY.zh.text.face, "WDXLLubrifont SC");
  assertEquals(TYPOGRAPHY.ko.text.face, "IBM Plex Sans KR");
  assertEquals(TYPOGRAPHY.en["text-small"].lineHeight, 18);
});

Deno.test("Cyrillic UI uses Sofia Semibold while keeping the other type roles", () => {
  assertEquals(TYPOGRAPHY.ru.text.face, "Sofia Sans");
  assertEquals(TYPOGRAPHY.ru.text.weight, 600);
  assertEquals(TYPOGRAPHY.uk["text-field"].face, "Sofia Sans");
  assertEquals(TYPOGRAPHY.uk["text-field"].weight, 600);
  assertEquals(TYPOGRAPHY.ru.text.size, TYPOGRAPHY.en.text.size);
  assertEquals(TYPOGRAPHY.uk.text.lineHeight, TYPOGRAPHY.en.text.lineHeight);
  assertEquals(
    TYPOGRAPHY.ru["bold-pixels-ui-16"],
    TYPOGRAPHY.en["bold-pixels-ui-16"],
  );
  assertEquals(TYPOGRAPHY.uk["serif-8"], TYPOGRAPHY.en["serif-8"]);
  assertEquals(TYPOGRAPHY.ru["world-badge"], TYPOGRAPHY.en["world-badge"]);
});

Deno.test("Traditional Chinese uses local glyph forms in every prose role", () => {
  assertEquals(TYPOGRAPHY["zh-TW"].text.face, "WDXLLubrifont TC");
  assertEquals(TYPOGRAPHY["zh-TW"]["text-field"].face, "WDXLLubrifont TC");
  assertEquals(
    TYPOGRAPHY["zh-TW"]["small-18-figures-prose"].face,
    "WDXLLubrifont TC",
  );
  assertEquals(TYPOGRAPHY["zh-TW"]["serif-14-prose"].face, "WDXLLubrifont TC");
  assertEquals(
    TYPOGRAPHY["zh-TW"].text.lineHeight,
    TYPOGRAPHY.zh.text.lineHeight,
  );
  assertEquals(
    FONT_FAMILIES["zh-TW"]["bold-pixels-ui"][1],
    '"WDXLLubrifont TC"',
  );
});

Deno.test("an animation record holds its frames and how it plays them", () => {
  assertEquals(BUREAU_TOKENS.animations["bureau-keycap-blink"], {
    cycleMs: 480,
    repeat: "forever",
    hold: [
      { atMs: 0, fill: "paper" },
      { atMs: 240, fill: "goal" },
    ],
  });
  assertEquals(BUREAU_TOKENS.animations["bureau-saving-pending"], {
    durationMs: 1200,
    easing: "ease-in-out",
    repeat: "forever",
    alternate: true,
    frames: [
      { at: [0], translateXPercent: 0 },
      { at: [100], translateXPercent: 185 },
    ],
  });
  assertEquals(BUREAU_TOKENS.animations["bureau-centre-x"], {
    durationMs: 0,
    easing: "linear",
    fill: "forwards",
    frames: [{ at: [0, 100], translateXPercent: -50 }],
  });
  assertEquals(BUREAU_TOKENS.tempos, { snap: 120, fill: 240 });
});

/** Names that share one value, grouped in table order. */
function sameValues(table: Record<string, unknown>): string[][] {
  const byValue = new Map<string, string[]>();
  for (const [name, value] of Object.entries(table)) {
    const key = JSON.stringify(value);
    byValue.set(key, [...(byValue.get(key) ?? []), name]);
  }
  return [...byValue.values()].filter((names) => names.length > 1);
}

// Entries that repeat another's value, from the step-zero migration, waiting
// for a merge that keeps Sheet's built names (`${face}-${size}-prose`)
// whole. A new repeat fails here; a merged one leaves this list. A field
// shares the well's lines on purpose.
Deno.test("Bureau tokens add no second name for a value", () => {
  assertEquals(sameValues(BEVELS), [
    ["well", "field"],
    ["sheet-rule", "ruled"],
    ["speech", "menu"],
    ["news-box", "shop-tag"],
  ]);
  assertEquals(sameValues(TYPE_METRICS), [
    ["text-field", "ui-16-compact"],
    ["ui-14-prose", "ui-14-snug"],
    ["mono-16-solid", "bj-total"],
    ["ui-18-message", "ui-18-loose"],
    ["ui-20-tight", "shop-gift-name"],
    ["ui-15-prose", "ui-15-snug"],
    ["ui-14-tab-solid", "ui-14-caps-solid"],
    ["ui-15-hint", "ui-15"],
    ["bj-label", "bj-result"],
  ]);
  assertEquals(sameValues(LOOKS), [
    ["segment-track", "well"],
    ["pad-cursor", "tab-focus-mark"],
  ]);
});

Deno.test("a dither leaves each of its inks some of the pattern", () => {
  const levels = Object.values(MICRO64_DITHERS).map((dither) => dither.level);
  assert(levels.every((level) => level > 0 && level < 16));
});

Deno.test("a colour names one dither at most, and never a DB32 colour", () => {
  const colours = [MICRO64_DITHERS, CENSUS_DITHERS].flatMap((dithers) =>
    Object.values(dithers).map((dither) => dither.color)
  );
  const db32 = new Set<string>(Object.values(DB32));
  assertEquals(new Set(colours).size, colours.length);
  assertEquals(colours.filter((colour) => db32.has(colour)), []);
});

Deno.test("the token document carries both dither tables", () => {
  assertEquals(
    Object.keys(BUREAU_TOKENS.dithers).length,
    Object.keys(MICRO64_DITHERS).length + Object.keys(CENSUS_DITHERS).length,
  );
});
