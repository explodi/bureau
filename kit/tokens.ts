/** Bureau's materials, which the native view reads. Values are UI pixels. */

/** DawnBringer 32, the palette the voxels and the chrome share. */
export const DB32 = {
  "black": "#000000",
  "valhalla": "#222034",
  "purple-dark": "#45283c",
  "brown-chocolate": "#663931",
  "brown": "#8f563b",
  "orange-burnt": "#df7126",
  "tan": "#d9a066",
  "skin": "#eec39a",
  "yellow-bright": "#fbf236",
  "green-lime": "#99e550",
  "green": "#6abe30",
  "green-teal": "#37946e",
  "green-olive": "#4b692f",
  "gray-olive": "#524b24",
  "slate": "#323c39",
  "blue-navy": "#3f3f74",
  "blue-slate": "#306082",
  "blue-violet": "#5b6ee1",
  "blue-sky": "#639bff",
  "cyan-bright": "#5fcde4",
  "blue-ice": "#cbdbfc",
  "white": "#ffffff",
  "gray-light": "#9badb7",
  "gray-medium": "#847e87",
  "gray": "#696a6a",
  "gray-dark": "#595652",
  "purple": "#76428a",
  "red": "#ac3232",
  "red-pink": "#d95763",
  "pink": "#d77bba",
  "green-moss": "#8f974a",
  "brown-gold": "#8a6f30",
} as const;

export type PaletteName = keyof typeof DB32;

/** MICRO64's red ramp. */
const MICRO64_RED = {
  maroon: "#880000",
  light: "#ff8080",
} as const;

/** A colour drawn as two palette colours: the first, with `level` sixteenths
 * of the second on a 4x4 Bayer pattern. */
export type PaletteDither = {
  color: string;
  inks: readonly [PaletteName, PaletteName];
  level: number;
};

/**
 * How a picture (an Image's SVG) draws MICRO64's colours past DB32
 * (the MICRO64 palette): each as the dither of two DB32 colours
 * of one hue family that mix, in light, nearest to it. A HiDPI screen draws
 * the dots two device pixels a side, any other one.
 */
export const MICRO64_DITHERS: Record<string, PaletteDither> = {
  "gray-steel": {
    color: "#9b9b9b",
    inks: ["gray-light", "gray-medium"],
    level: 8,
  },
  "gray-silver": { color: "#bababa", inks: ["gray-medium", "white"], level: 6 },
  "gray-platinum": {
    color: "#d4d4d4",
    inks: ["gray-light", "white"],
    level: 8,
  },
  "white-smoke": { color: "#ebebeb", inks: ["white", "gray-light"], level: 4 },
  "gray-slate": {
    color: "#434d61",
    inks: ["blue-navy", "gray-dark"],
    level: 8,
  },
  "red-maroon": {
    color: "#880000",
    inks: ["brown-chocolate", "red"],
    level: 8,
  },
  "red-pure": { color: "#d40000", inks: ["red", "red-pink"], level: 4 },
  "red-bright": {
    color: "#ff4444",
    inks: ["red-pink", "orange-burnt"],
    level: 4,
  },
  "red-light": { color: "#ff8080", inks: ["red-pink", "skin"], level: 6 },
  "orange-rust": { color: "#ba4f1f", inks: ["orange-burnt", "red"], level: 10 },
  "orange-light": {
    color: "#fb984a",
    inks: ["orange-burnt", "skin"],
    level: 6,
  },
  "brown-oak": { color: "#ae7d52", inks: ["brown", "tan"], level: 6 },
  "brown-umber": { color: "#754f21", inks: ["brown", "gray-olive"], level: 8 },
  "gold-ochre": {
    color: "#bc8519",
    inks: ["orange-burnt", "green-moss"],
    level: 8,
  },
  "gold-amber": {
    color: "#e4a40f",
    inks: ["orange-burnt", "yellow-bright"],
    level: 4,
  },
  "gold": {
    color: "#ffcc00",
    inks: ["orange-burnt", "yellow-bright"],
    level: 10,
  },
  "gold-light": { color: "#fbe584", inks: ["skin", "yellow-bright"], level: 8 },
  "cream": { color: "#fff7c6", inks: ["yellow-bright", "white"], level: 8 },
  "green-forest": {
    color: "#124920",
    inks: ["black", "green-olive"],
    level: 6,
  },
  "green-leaf": { color: "#4e9432", inks: ["green", "green-olive"], level: 10 },
  "green-grass": { color: "#91ab47", inks: ["green-moss", "green"], level: 6 },
  "green-sprout": {
    color: "#c1ce66",
    inks: ["green-moss", "yellow-bright"],
    level: 8,
  },
  "teal-deep": { color: "#026565", inks: ["valhalla", "green-teal"], level: 6 },
  "teal": { color: "#349794", inks: ["green-teal", "blue-sky"], level: 4 },
  "mint": { color: "#66cca8", inks: ["green", "cyan-bright"], level: 8 },
  "mint-pale": { color: "#b4f8e0", inks: ["green-lime", "white"], level: 8 },
  "azure-deep": {
    color: "#00396d",
    inks: ["valhalla", "blue-slate"],
    level: 8,
  },
  "azure": { color: "#0069aa", inks: ["blue-slate", "blue-violet"], level: 4 },
  "azure-bright": {
    color: "#0098dc",
    inks: ["blue-slate", "blue-sky"],
    level: 10,
  },
  "azure-pale": {
    color: "#96d6ff",
    inks: ["cyan-bright", "blue-ice"],
    level: 8,
  },
  "lavender": { color: "#9998f9", inks: ["blue-sky", "pink"], level: 4 },
  "pink-blossom": { color: "#f7bfd3", inks: ["pink", "white"], level: 8 },
};

/** The colour a dither mixes to in light: what an editor previews for it. */
function ditherMix(
  inks: readonly [PaletteName, PaletteName],
  level: number,
): string {
  const share = level / 16;
  const channel = (at: number) => {
    const linear = (hex: string) => {
      const value = parseInt(hex.slice(at, at + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    const light = linear(DB32[inks[0]]) * (1 - share) +
      linear(DB32[inks[1]]) * share;
    const encoded = light <= 0.0031308
      ? light * 12.92
      : 1.055 * light ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** A tone of `level` sixteenths of `second` over `first`, named by its mix. */
function tone(
  first: PaletteName,
  second: PaletteName,
  level: number,
): PaletteDither {
  return {
    color: ditherMix([first, second], level),
    inks: [first, second],
    level,
  };
}

/**
 * The census pictures' own tones, past MICRO64: the slide master's,
 * the patterns its first master
 * laid in art pixels (sparse violet or valhalla dots on navy, a checker of
 * valhalla and navy) now dithered on the screen's pixels; and the clip art's,
 * a colour kept close to its DB32 one with a quarter of a neighbour's dots.
 */
export const CENSUS_DITHERS: Record<string, PaletteDither> = {
  "census-light": tone("blue-navy", "blue-violet", 2),
  "census-shade": tone("blue-navy", "valhalla", 2),
  "census-dark": tone("valhalla", "blue-navy", 8),
  "census-adult": tone("pink", "purple", 4),
  "census-child": tone("purple", "pink", 4),
  "census-hand": tone("skin", "tan", 4),
};

/** The two authored icon grids; both pixel pictures and vector marks use them. */
export const ICON_SIZES = { small: 20, large: 32 } as const;

/** Control faces and their art slots. Close reserves a standard-sized hit area. */
export const CONTROL_METRICS = {
  standard: { height: 33, icon: ICON_SIZES.small },
  large: { height: 44, icon: ICON_SIZES.large },
  xlarge: { height: 56, icon: ICON_SIZES.large },
  compact: { height: 28, icon: ICON_SIZES.small },
  close: { height: 26, icon: ICON_SIZES.small },
} as const;

/** Inspector cards and map instruments share a width; legends may be narrower. */
export const WIDGET_WIDTH = 280;

export const INSTRUMENT_FOOTER_HEIGHT = { normal: 33, actionable: 44 } as const;

/** Map selectors reserve their vertical touch expansion in the row margins. */
export const SEGMENT_METRICS = {
  height: 33,
  margin: 6,
  hitSlop: 8,
} as const;

/** Input pictures and text keys occupy the same line box. */
export const INPUT_GLYPH_METRICS = {
  heightRatio: 1.1,
  labelRatio: 0.8,
  gapRatio: 0.2,
  paddingRatio: 0.28,
  sizes: {
    toolbar: { height: 18, label: 13.1 },
    text: { height: 19.8, label: 14.4 },
    hint: { height: 15.4, label: 11.2 },
    legend: { height: 14.3, label: 10.4 },
    small: { height: 12.32, label: 8.96 },
    large: { height: 32, label: 15 },
  },
} as const;

/** The palette ink a colour literal is, when it is a DB32 member: data that
 *  names its colours in hex (a sector, a bus line) drawn by name. */
export function db32InkOf(hex: string): `db32-${PaletteName}` | undefined {
  const wanted = hex.toLowerCase();
  const name = (Object.keys(DB32) as PaletteName[]).find((key) =>
    DB32[key] === wanted
  );
  return name === undefined ? undefined : `db32-${name}`;
}

/**
 * The printed documents' greys (a budget report on office paper), off the
 * game palette on purpose: paper is not a screen.
 */
export const PRINT = {
  "gray-50": "#f1f1f1",
  "gray-100": "#e2e2e2",
  "gray-200": "#c6c6c6",
  "gray-300": "#ababab",
  "gray-400": "#939393",
  "gray-600": "#616161",
  "gray-700": "#494949",
  "gray-900": "#1d1d1d",
  "blue-500": "#306082",
} as const;

export type PrintName = keyof typeof PRINT;
/** A printed document's colour, the same in both chromes. */
export type PrintInk = `print-${PrintName}`;

/**
 * Colours a page arriving over the wire keeps as its own, outside the
 * register's palette: LockedIn's warm page ground.
 */
export const WEB = { "page": "#f3f2ef" } as const;

/**
 * Data colours the stats window's charts drew before the register had a
 * palette, outside DB32: the income classes, a mover with no recorded
 * reason, a failed arrival. Kept as they are until they are redrawn in DB32.
 */
export const CHART = {
  "income-lower": "#f44336",
  "income-middle": "#ff9800",
  "income-upper": "#4caf50",
  "unrecorded": "#999999",
  "failed-arrival": "#c99ec4",
} as const;

type BevelInk = "ring" | "shadow" | "highlight";

/** A palette colour by name: the same in both chromes. */
export type PaletteInk =
  | `db32-${PaletteName}`
  | `web-${keyof typeof WEB}`
  | `data-${keyof typeof CHART}`;

/**
 * A data colour written as hex ("#5b6ee1", "#F44336") as the palette ink it
 * is: its DB32 name, or the chart table's. Black if it is neither.
 */
export function dataInk(hex: string): PaletteInk {
  const colour = hex.toLowerCase();
  const db32 = (Object.keys(DB32) as PaletteName[]).find((name) =>
    DB32[name] === colour
  );
  if (db32) return `db32-${db32}`;
  const chart = (Object.keys(CHART) as (keyof typeof CHART)[]).find((name) =>
    CHART[name] === colour
  );
  return chart ? `data-${chart}` : "db32-black";
}

/**
 * A model palette colour (0xd95763) as the DB32 ink it is: the voxels and the
 * map's overlays are painted from the same 32 colours. Black if off-palette.
 */
export function paletteInk(rgb: number): `db32-${PaletteName}` {
  const hex = `#${rgb.toString(16).padStart(6, "0")}`;
  const names = Object.keys(DB32) as PaletteName[];
  const name = names.find((candidate) => DB32[candidate] === hex);
  return name ? `db32-${name}` : "db32-black";
}

/**
 * One line of a recipe, front to back. Inset sides draw inside the box and take
 * no space; `outer-ring` and `drop` draw outside it. A bevel ink follows the
 * chrome; any other ink is a role or palette colour.
 */
export type BevelLine =
  | {
    side:
      | "ring"
      | "outer-ring"
      | "top-left"
      | "bottom-right"
      | "top"
      | "bottom"
      | "left"
      | "right";
    width: number;
    color: BevelInk | ThemeInk | PaletteInk | PrintInk;
    /** A see-through line: the ink at this share over what lies under it. */
    alpha?: number;
  }
  | {
    side: "drop";
    x: number;
    y: number;
    spread?: number;
    color: BevelInk | ThemeInk | PaletteInk | PrintInk;
    alpha?: number;
  };

/** A well's lines: data sunk into the face. A field is cut the same way. */
const WELL = [
  { side: "top-left", width: 1, color: "shadow" },
  { side: "bottom-right", width: 1, color: "highlight" },
] as const;

// Layers are front to back; the ring covers the corner where diagonal edges meet.
export const BEVELS = {
  raised: [
    { side: "ring", width: 1, color: "ring" },
    { side: "bottom-right", width: 3, color: "shadow" },
    { side: "top-left", width: 3, color: "highlight" },
  ],
  pressed: [
    { side: "ring", width: 1, color: "ring" },
    { side: "bottom-right", width: 3, color: "highlight" },
    { side: "top-left", width: 3, color: "shadow" },
  ],
  "danger-raised": [
    { side: "ring", width: 1, color: "ring" },
    { side: "bottom-right", width: 3, color: "danger-shadow" },
    { side: "top-left", width: 3, color: "danger-highlight" },
  ],
  "danger-pressed": [
    { side: "ring", width: 1, color: "ring" },
    { side: "bottom-right", width: 3, color: "danger-highlight" },
    { side: "top-left", width: 3, color: "danger-shadow" },
  ],
  well: WELL,
  plate: [
    { side: "top-left", width: 1, color: "highlight" },
    { side: "bottom-right", width: 1, color: "shadow" },
  ],
  frame: [{ side: "outer-ring", width: 1, color: "ring" }],
  titlebar: [
    { side: "bottom-right", width: 1, color: "ring" },
    { side: "top-left", width: 1, color: "highlight" },
  ],
  "instrument-back": [
    { side: "right", width: 1, color: "shade" },
    { side: "right", width: 2, color: "shadow" },
    { side: "bottom-right", width: 1, color: "ring" },
    { side: "top-left", width: 1, color: "highlight" },
  ],
  field: WELL,
  thumb: [
    { side: "top-left", width: 2, color: "highlight" },
    { side: "bottom-right", width: 2, color: "shadow" },
  ],
  "thumb-pressed": [
    { side: "top-left", width: 2, color: "shadow" },
    { side: "bottom-right", width: 2, color: "highlight" },
  ],
  // The dock's drawer: framed against the city, on a plate.
  drawer: [
    { side: "outer-ring", width: 1, color: "ring" },
    { side: "top-left", width: 1, color: "highlight" },
    { side: "bottom-right", width: 1, color: "shadow" },
  ],
  // A sheet's rules: the column band's seams and the line under a record.
  "sheet-band": [
    { side: "top", width: 1, color: "shade" },
    { side: "right", width: 1, color: "rule-band" },
    { side: "bottom", width: 1, color: "rule-band" },
  ],
  "sheet-rule": [{ side: "bottom", width: 1, color: "rule" }],
  "sheet-rule-ruled": [
    { side: "bottom", width: 1, color: "rule" },
    { side: "right", width: 1, color: "rule" },
  ],
  // A printed document's rules: ink on paper, the same in both chromes.
  "print-frame": [{ side: "ring", width: 1, color: "print-gray-300" }],
  "print-letterhead": [{ side: "bottom", width: 2, color: "print-gray-900" }],
  "print-heading": [
    { side: "bottom", width: 1, color: "print-gray-300" },
    { side: "bottom", width: 2, color: "rule" },
  ],
  "print-line": [{ side: "bottom", width: 1, color: "print-gray-200" }],
  "print-total-above": [{ side: "bottom", width: 1, color: "print-gray-400" }],
  "print-total": [{ side: "top", width: 1, color: "print-gray-400" }],
  "print-focus": [{ side: "ring", width: 2, color: "print-blue-500" }],
  "print-notice": [{ side: "top", width: 2, color: "print-gray-300" }],
  // A field's well, two pixels in from its edge, for under an attention ring.
  "well-framed": [
    { side: "top-left", width: 3, color: "shadow" },
    { side: "bottom-right", width: 3, color: "highlight" },
  ],
  // A locked key's anchor when focused: a ring a pixel outside it.
  "anchor-focus": [
    { side: "drop", x: 0, y: 0, spread: 1, color: "face" },
    { side: "drop", x: 0, y: 0, spread: 3, color: "db32-blue-sky" },
  ],
  // A rating chip's lit and shaded edges, see-through over its colour.
  chip: [
    { side: "top-left", width: 1, color: "db32-white", alpha: 0.4 },
    { side: "bottom-right", width: 1, color: "db32-black", alpha: 0.4 },
  ],
  // The edge of a spreadsheet's paper, and the rules its cells share: each
  // falls on the first pixel of the cell after it.
  "rule-ring": [{ side: "ring", width: 1, color: "rule" }],
  "grid-top": [{ side: "top", width: 1, color: "rule" }],
  "grid-left": [{ side: "left", width: 1, color: "rule" }],
  "grid-top-left": [
    { side: "top", width: 1, color: "rule" },
    { side: "left", width: 1, color: "rule" },
  ],
  // A calm band round a notice: paper with a hairline in the chrome's mid.
  hairline: [{ side: "ring", width: 1, color: "mid" }],
  // The line a letter's signature sits under. Solid: a bevel draws no dashes.
  "signature-rule": [{ side: "top", width: 1, color: "db32-gray-medium" }],
  ring: [{ side: "ring", width: 1, color: "ring" }],
  // The phone's handset: a dark bezel ring and a soft drop onto the city.
  handset: [
    { side: "ring", width: 2, color: "db32-valhalla" },
    { side: "drop", x: 2, y: 2, color: "db32-black", alpha: 0.35 },
  ],
  // An LCD recessed into its bezel, the way the glass sits under the plastic.
  lcd: [
    { side: "top-left", width: 2, color: "db32-green-teal" },
    { side: "bottom-right", width: 2, color: "db32-green" },
  ],
  // A heading's ledger rule under it.
  ruled: [{ side: "bottom", width: 1, color: "rule" }],
  // A speech bubble: one ink ring, one soft drop onto the city.
  speech: [
    { side: "outer-ring", width: 1, color: "ring" },
    { side: "drop", x: 2, y: 2, color: "db32-black", alpha: 0.35 },
  ],
  // LockedIn: a card's hairline ring, a header's rule, the open tab's bar.
  "web-card": [{ side: "ring", width: 1, color: "db32-gray-light" }],
  "web-rule": [{ side: "bottom", width: 1, color: "db32-gray-light" }],
  "web-tab-open": [{ side: "bottom", width: 2, color: "db32-blue-slate" }],
  // The newspaper's two rules, both solid: a hairline between blocks and the
  // heavy rule where the page changes register.
  "news-masthead": [
    { side: "top", width: 1, color: "db32-valhalla" },
    { side: "bottom", width: 3, color: "db32-valhalla" },
  ],
  "news-rule": [{ side: "bottom", width: 3, color: "db32-valhalla" }],
  "news-hairline": [{ side: "bottom", width: 1, color: "db32-valhalla" }],
  "news-hairline-top": [{ side: "top", width: 1, color: "db32-valhalla" }],
  "news-box": [{ side: "ring", width: 1, color: "db32-valhalla" }],
  // The gift shop: a 1995 catalog's rough ink borders and hard shadows.
  "shop-letterhead": [
    { side: "ring", width: 3, color: "db32-valhalla" },
    { side: "ring", width: 6, color: "db32-tan" },
    { side: "drop", x: 4, y: 4, color: "db32-gray-dark" },
  ],
  "shop-strip": [
    { side: "ring", width: 2, color: "db32-valhalla" },
    { side: "drop", x: 3, y: 3, color: "db32-gray-dark" },
  ],
  "shop-mark": [{ side: "ring", width: 2, color: "ink" }],
  "shop-tile": [
    { side: "ring", width: 3, color: "db32-valhalla" },
    { side: "ring", width: 5, color: "db32-tan" },
    { side: "drop", x: 4, y: 4, color: "db32-gray-dark" },
  ],
  // A discovered gift's tile wears its rarity along its top edge.
  "shop-tile-normal": [
    { side: "top", width: 3, color: "db32-tan" },
    { side: "ring", width: 3, color: "db32-valhalla" },
    { side: "ring", width: 5, color: "db32-tan" },
    { side: "drop", x: 4, y: 4, color: "db32-gray-dark" },
  ],
  "shop-tile-rare": [
    { side: "top", width: 3, color: "db32-green-teal" },
    { side: "ring", width: 3, color: "db32-valhalla" },
    { side: "ring", width: 5, color: "db32-tan" },
    { side: "drop", x: 4, y: 4, color: "db32-gray-dark" },
  ],
  "shop-tile-legendary": [
    { side: "top", width: 3, color: "db32-orange-burnt" },
    { side: "ring", width: 3, color: "db32-valhalla" },
    { side: "ring", width: 5, color: "db32-tan" },
    { side: "drop", x: 4, y: 4, color: "db32-gray-dark" },
  ],
  "shop-frame": [{ side: "ring", width: 2, color: "db32-valhalla" }],
  "shop-tag": [{ side: "ring", width: 1, color: "db32-valhalla" }],
  "shop-stamp": [
    { side: "ring", width: 2, color: "db32-red" },
    { side: "drop", x: 2, y: 2, color: "db32-valhalla" },
  ],
  "shop-alert": [
    { side: "ring", width: 3, color: "db32-red" },
    { side: "drop", x: 3, y: 3, color: "db32-gray-dark" },
  ],
  "shop-plate": [
    { side: "ring", width: 3, color: "db32-valhalla" },
    { side: "drop", x: 4, y: 4, color: "db32-gray-dark" },
  ],
  "shop-badge": [{ side: "ring", width: 3, color: "db32-valhalla" }],
  "shop-product": [
    { side: "ring", width: 2, color: "db32-valhalla" },
    { side: "drop", x: 3, y: 3, color: "db32-gray-medium" },
  ],
  // Blackjack: a card's 2px ink edge, the stake chip's rings, a hand's ring.
  "bj-card": [{ side: "outer-ring", width: 2, color: "db32-black" }],
  "bj-chip": [
    { side: "outer-ring", width: 2, color: "db32-black" },
    { side: "ring", width: 4, color: "db32-tan" },
    { side: "ring", width: 6, color: "db32-brown" },
    { side: "ring", width: 12, color: "db32-orange-burnt" },
  ],
  "bj-total": [{ side: "outer-ring", width: 2, color: "db32-slate" }],
  "bj-goal-ring": [{
    side: "outer-ring",
    width: 2,
    color: "db32-yellow-bright",
  }],
  "bj-loss-ring": [{ side: "outer-ring", width: 2, color: "db32-red-pink" }],
  "bj-muted-ring": [{ side: "outer-ring", width: 2, color: "db32-blue-ice" }],
  // A band pinned over a list: a hairline just below its edge.
  band: [{ side: "drop", x: 0, y: 1, color: "rule" }],
  // A toast over the city: framed, and dropped hard onto it. A news clipping
  // drops further, and softer.
  toast: [
    { side: "outer-ring", width: 1, color: "ring" },
    { side: "drop", x: 2, y: 2, color: "db32-black" },
  ],
  clipping: [
    { side: "outer-ring", width: 1, color: "ring" },
    { side: "drop", x: 4, y: 4, color: "db32-black", alpha: 0.6 },
  ],
  // A closed shop's door: lit wood above and left, the register's ink below.
  storefront: [
    { side: "ring", width: 1, color: "ring" },
    { side: "top-left", width: 3, color: "db32-brown" },
    { side: "bottom-right", width: 3, color: "ink" },
  ],
  "storefront-window": [{ side: "bottom-right", width: 2, color: "dark" }],
  // The census slide: projected on the wall, ringed and dropped.
  "census-slide": [
    { side: "drop", x: 2, y: 2, color: "db32-black" },
    { side: "ring", width: 1, color: "db32-blue-ice" },
  ],
  "census-rule-below": [{
    side: "drop",
    x: 0,
    y: 1,
    color: "db32-blue-violet",
  }],
  "census-rule-above": [{
    side: "drop",
    x: 0,
    y: -1,
    color: "db32-blue-violet",
  }],
  "census-bullet": [{ side: "drop", x: 1, y: 1, color: "db32-black" }],
  "census-axis": [{ side: "drop", x: -1, y: 0, color: "db32-black" }],
  // A drawn picture's 2px ink outline, outside its box so neighbours fuse:
  // the triage board's beds and its coffee mug.
  "ink-outline": [{ side: "outer-ring", width: 2, color: "ink" }],
  "world-label": [{
    side: "drop",
    x: 0,
    y: 1,
    color: "db32-black",
    alpha: 0.25,
  }],
  // A lane tag's punched grommet: ink, with a faint ring of ink around it.
  grommet: [{ side: "outer-ring", width: 2, color: "ink", alpha: 0.3 }],
  "swatch-free": [{ side: "outer-ring", width: 1, color: "mid" }],
  // The second puff of steam, up and to the right of the first.
  "steam-puff": [{ side: "drop", x: 5, y: -3, color: "mid" }],
  // A strip map's leg, edged in the register's shadow on both sides.
  "spine-leg": [
    { side: "drop", x: 1, y: 0, color: "mid" },
    { side: "drop", x: -1, y: 0, color: "mid" },
  ],
  // A pull-down hanging off an instrument: framed, and dropped onto the city.
  menu: [
    { side: "outer-ring", width: 1, color: "ring" },
    { side: "drop", x: 2, y: 2, color: "db32-black", alpha: 0.35 },
  ],
  // The attention badge: ringed in black and lifted off its key by a hard
  // black shadow, on either chrome.
  badge: [
    { side: "ring", width: 1, color: "db32-black" },
    { side: "drop", x: 2, y: 2, color: "db32-black" },
  ],
  // A meter's band, parted from the next by a hairline on its right edge; its
  // posts, each a hairline and its opposite; the keys to them in its legend.
  "meter-band": [{ side: "right", width: 1, color: "shade" }],
  "meter-post-threshold": [{ side: "drop", x: 1, y: 0, color: "shade" }],
  "meter-post-goal": [{ side: "drop", x: 1, y: 0, color: "ink" }],
  // A one-pixel ink line outside the box: "you are here", a headshot's frame.
  "ink-outline-thin": [{ side: "outer-ring", width: 1, color: "ink" }],
  "meter-key-threshold": [{ side: "drop", x: 1, y: 1, color: "shade" }],
  "meter-key-goal": [{ side: "drop", x: 1, y: 1, color: "ink" }],
  // A window's pull-down and a pop-up's list: the plate, dropped hard onto
  // the window in the chrome's ink.
  pulldown: [
    { side: "top-left", width: 1, color: "highlight" },
    { side: "bottom-right", width: 1, color: "shadow" },
    { side: "drop", x: 2, y: 2, color: "ink", alpha: 0.35 },
  ],
  // The dock's ink frame, drawn by its tiles: each holds its piece of it.
  "dock-frame": [
    { side: "top", width: 1, color: "db32-black" },
    { side: "bottom", width: 1, color: "db32-black" },
  ],
  "dock-frame-first": [
    { side: "top", width: 1, color: "db32-black" },
    { side: "bottom", width: 1, color: "db32-black" },
    { side: "left", width: 1, color: "db32-black" },
  ],
  "dock-frame-last": [
    { side: "top", width: 1, color: "db32-black" },
    { side: "bottom", width: 1, color: "db32-black" },
    { side: "right", width: 1, color: "db32-black" },
  ],
  // The group box's etched hairline: a groove of two shades, doubled.
  groupbox: [
    { side: "top-left", width: 1, color: "mid" },
    { side: "bottom-right", width: 1, color: "shade" },
    { side: "top-left", width: 2, color: "shade" },
    { side: "bottom-right", width: 2, color: "mid" },
  ],
  // The etched rule between toolbar groups: one dark pixel and one light.
  "etched-vertical": [
    { side: "left", width: 1, color: "mid" },
    { side: "right", width: 1, color: "shade" },
  ],
  "etched-horizontal": [
    { side: "top", width: 1, color: "rule-band" },
    { side: "bottom", width: 1, color: "shade" },
  ],
  // The menu bar's hairline over the client area below it.
  "menubar-rule": [{ side: "bottom", width: 1, color: "ink-disabled" }],
  // A pop-up's handle: a miniature key, its ring and one-pixel bevel.
  "select-handle": [
    { side: "ring", width: 1, color: "ink" },
    { side: "bottom-right", width: 2, color: "mid" },
    { side: "top-left", width: 2, color: "shade" },
  ],
  "select-handle-pressed": [
    { side: "ring", width: 1, color: "ink" },
    { side: "bottom-right", width: 2, color: "shade" },
    { side: "top-left", width: 2, color: "mid" },
  ],
  "select-handle-dead": [
    { side: "ring", width: 1, color: "ink-disabled" },
    { side: "drop", x: 1, y: 1, color: "light" },
  ],
  // A message box's severity tile, lit with the register's highlight and ink.
  "severity-tile": [
    { side: "top-left", width: 1, color: "shade" },
    { side: "bottom-right", width: 1, color: "ink" },
  ],
  // A chip ringed in the chrome's ink: a tab's badge, an error's tone tile.
  "ink-ring": [{ side: "ring", width: 1, color: "ink" }],
  // A keycap: an inlaid ring and one hard bottom edge off the board.
  keycap: [
    { side: "ring", width: 1, color: "ring" },
    { side: "drop", x: 0, y: 2, color: "mid" },
  ],
  // A field out of range: its well and a ring of the bad ink outside it.
  "field-invalid": [
    { side: "top-left", width: 1, color: "shadow" },
    { side: "bottom-right", width: 1, color: "highlight" },
    { side: "outer-ring", width: 1, color: "ink-bad" },
  ],
  // A folder tab's run between its slanted ends: the ink edge along its top.
  "tab-top": [{ side: "top", width: 1, color: "ink" }],
  // The catalog's counter-example: a focus ring from some other system.
  "demo-foreign-ring": [
    { side: "outer-ring", width: 3, color: "db32-green" },
  ],
  // A notebook's page: the rule every tab is cut against, and a plate's sides.
  "notebook-page": [
    { side: "top", width: 1, color: "ink" },
    { side: "right", width: 1, color: "mid" },
    { side: "left", width: 1, color: "shade" },
    { side: "bottom", width: 1, color: "mid" },
  ],
} as const satisfies Record<string, readonly BevelLine[]>;

export type Recipe = keyof typeof BEVELS;

/**
 * A pattern on a box's ground, under its bevel and its content.
 * - `lines`: a rule every `period` pixels, the ink at `alpha`, softened over
 *   one pixel as a printed ledger's is.
 * - `stipple`: the register's checkerboard (EFFECTS.stipple) in an ink: a
 *   latched key's dither, the HUD key's see-through face.
 * - `blocks`: bars of ink `size` pixels wide with `gap` between, along the
 *   box: a progress rail's chunks.
 * - `stripes`: bands `width` pixels wide at `angle` degrees, alternating the
 *   two inks.
 * - `picture`: a photograph covering the box, centred.
 * - `dots`: a run of pixel dots along the box, `on` pixels of ink and `off`
 *   pixels clear: a dotted leader between a label and its figure.
 * - `gridlines`: a one-ink rule every `every` percent.
 */
export const PATTERNS = {
  ledger: { lines: { period: 28, ink: "db32-blue-slate", alpha: 0.07 } },
  // A dotted leader between a label and its figure: `on` pixels of ink and
  // `off` pixels clear along the box.
  leader: { dots: { on: 2, off: 4, ink: "rule" } },
  "stipple-shade": { stipple: { ink: "shade" } },
  "stipple-white": { stipple: { ink: "db32-white" } },
  "stipple-mid": { stipple: { ink: "mid" } },
  "progress-blocks": { blocks: { ink: "titlebar", size: 10, gap: 2 } },
  // The house hatch on the chrome's face: out of service.
  hatch: { stripes: { angle: 45, width: 3, inks: ["face", "mid"] } },
  // The kit's closed-bed texture on the face: the shadow grey's stripe first.
  "hatch-shade": { stripes: { angle: 45, width: 3, inks: ["mid", "face"] } },
  // A chart's track ruled into quarters, one pixel at the start of each.
  "census-grid": {
    gridlines: { every: 25, width: 1, ink: "db32-blue-violet" },
  },
  // A captured city under a specimen, covering its box and centred, as a
  // photograph is mounted: the design catalog's day and night. A photograph
  // stays a JPEG: Chrome draws one through its own decode, which no PNG of it
  // reproduces.
  "city-day": { picture: { source: "/img/bureau/city-day.jpg" } },
  "city-night": { picture: { source: "/img/bureau/city-night.jpg" } },
} as const satisfies Record<
  string,
  | { lines: { period: number; ink: PaletteInk; alpha: number } }
  | { stipple: { ink: ThemeInk | PaletteInk } }
  | { blocks: { ink: ThemeInk | PaletteInk; size: number; gap: number } }
  | { dots: { on: number; off: number; ink: ThemeInk } }
  | {
    stripes: {
      angle: number;
      width: number;
      inks: readonly [ThemeInk | PaletteInk, ThemeInk | PaletteInk];
    };
  }
  | { gridlines: { every: number; width: number; ink: PaletteInk } }
  | { picture: { source: `${string}.png` | `${string}.jpg` } }
>;
export type Pattern = keyof typeof PATTERNS;

/** What a look sets in one state; an unset field keeps the rest state's. */
export interface LookState {
  surface?: Recipe | "none";
  /** The line, in pixels, a box's loose words take. */
  leading?: number;
  /** The size a box's loose words take, in pixels: a map panel's parts at
   *  the chrome size. */
  size?: number;
  /** The face a box's loose words take, by its role. */
  face?: FaceRole;
  fill?: ThemeInk | PaletteInk | PrintInk | "none";
  /** A translucent fill lets the ground show through it. */
  fillOpacity?: number;
  ink?: ThemeInk | PaletteInk | PrintInk;
  opacity?: number;
  /**
   * The text inside knocked out on the stipple in the box's ink, as a dead
   * key's label is: the checkerboard is the box's, so every word on the key
   * shares one grid.
   */
  textStipple?: boolean;
  /** The engraved shadow under the text (the chrome's `emboss`), or none. */
  emboss?: boolean;
  /** What the box holds travels a pixel down and right: a key held down. */
  travel?: boolean;
  /**
   * The face dithered with the shade inside the bevel, the era's mark for a
   * toggle that is on. Needs the state's surface, which the dither stops
   * short of by EFFECTS.ditherInset.
   */
  dither?: boolean;
  /**
   * The focus mark, drawn whether or not the box has focus: the pad's band
   * inside the box's edge while a pad is connected, else the dotted ring this
   * many pixels from the edge (inside when negative).
   */
  ring?: number;
  /** `ring` as the pad's band with no pad connected: the catalog's specimen. */
  band?: true;
}

/**
 * A stateful look: what a box wears at rest and when hovered, focused, held,
 * selected or disabled. Later states win, in that order. Hover and focus are
 * drawn by the host, so they need no JavaScript.
 */
export interface Look {
  rest: LookState;
  hover?: LookState;
  focused?: LookState;
  /** While the box or anything inside it has focus. */
  focusWithin?: LookState;
  selected?: LookState;
  pressed?: LookState;
  /** A toggle that is on; it starts from the pressed state. */
  latched?: LookState;
  disabled?: LookState;
  /**
   * Where the dotted focus ring sits, in pixels from the box's edge (inside
   * when negative; the primitives' own is -4), and its ink; `none` for a
   * box whose focus mark, the pad's band too, is drawn by what it holds.
   */
  focusRing?: { offset: number; ink?: ThemeInk | PaletteInk } | "none";
}

export const LOOKS = {
  "world-badge-info": {
    rest: {
      surface: "world-label",
      fill: "db32-white",
      fillOpacity: 0.92,
      ink: "db32-black",
    },
  },
  "world-badge-warning": {
    rest: {
      surface: "world-label",
      fill: "db32-orange-burnt",
      ink: "db32-white",
    },
  },
  "world-badge-critical": {
    rest: { surface: "world-label", fill: "db32-red-pink", ink: "db32-white" },
  },
  "world-pollution": {
    rest: { surface: "world-label", fill: "db32-valhalla" },
  },
  // The info badge's, with the selected stop in the register's blue.
  "world-stop": {
    rest: {
      surface: "world-label",
      fill: "db32-white",
      fillOpacity: 0.92,
      ink: "db32-black",
    },
    selected: { fill: "db32-blue-violet", fillOpacity: 1, ink: "db32-white" },
  },
  // A list row or choice that the selection marks with the register's blue.
  selectable: {
    rest: {},
    selected: { fill: "row-selected", ink: "knockout-selected" },
  },
  // A sheet's record and cell: the zebra stripe is texture, a hover or the
  // field being edited inside is an offer, the selected record is the subject.
  "sheet-row": {
    rest: {},
    focusWithin: { fill: "row-hover" },
    selected: { fill: "row-selected" },
  },
  "sheet-row-stripe": {
    rest: { fill: "stripe" },
    focusWithin: { fill: "row-hover" },
    selected: { fill: "row-selected" },
  },
  "sheet-row-interactive": {
    rest: {},
    hover: { fill: "row-hover" },
    focusWithin: { fill: "row-hover" },
    selected: { fill: "row-selected" },
  },
  "sheet-row-interactive-stripe": {
    rest: { fill: "stripe" },
    hover: { fill: "row-hover" },
    focusWithin: { fill: "row-hover" },
    selected: { fill: "row-selected" },
  },
  "sheet-cell": { rest: { surface: "sheet-rule" } },
  "grid-top": { rest: { surface: "grid-top" } },
  "grid-left": { rest: { surface: "grid-left" } },
  "grid-top-left": { rest: { surface: "grid-top-left" } },
  // A locked key's anchor: it takes focus so its hint can be read.
  "anchor": { rest: {}, focused: { surface: "anchor-focus" } },
  "sheet-cell-ruled": { rest: { surface: "sheet-rule-ruled" } },
  // A report line a pad can land on to read what it means.
  "print-line": {
    rest: { surface: "print-line" },
    hover: { fill: "print-gray-100" },
    focused: { fill: "print-gray-200", surface: "print-focus" },
  },
  handset: { rest: { surface: "handset", fill: "db32-blue-navy" } },
  lcd: {
    rest: { surface: "lcd", fill: "db32-green-lime", ink: "db32-black" },
  },
  // A heading ruled on the ground it stands on.
  ruled: { rest: { surface: "ruled" } },
  speech: { rest: { surface: "speech", fill: "paper", ink: "ink" } },
  // A toast that opens something lifts its face under the pointer.
  "toast-pressable": {
    rest: { fill: "face" },
    hover: { fill: "face-light" },
  },
  "web-page": {
    rest: { surface: "well", fill: "web-page", ink: "db32-black" },
  },
  "web-card": { rest: { surface: "web-card", fill: "db32-white" } },
  // A picture's hairline frame, open to the card behind it.
  "web-frame": { rest: { surface: "web-card" } },
  "web-row": { rest: { surface: "web-rule" } },
  "news-page": {
    rest: { surface: "well", fill: "db32-white", ink: "db32-valhalla" },
  },
  "news-masthead": { rest: { surface: "news-masthead" } },
  "news-rule": { rest: { surface: "news-rule" } },
  "news-hairline": { rest: { surface: "news-hairline" } },
  "news-hairline-top": { rest: { surface: "news-hairline-top" } },
  "news-box": { rest: { surface: "news-box" } },
  "news-link": { rest: {}, hover: { ink: "db32-gray-medium" } },
  "shop-page": {
    rest: { surface: "well", fill: "db32-skin", ink: "db32-valhalla" },
  },
  "shop-letterhead": {
    rest: { surface: "shop-letterhead", fill: "db32-skin" },
  },
  "shop-strip": { rest: { surface: "shop-strip", fill: "db32-white" } },
  "shop-banner": {
    rest: { surface: "shop-strip", fill: "db32-green-teal", ink: "db32-white" },
  },
  "shop-mark": {
    rest: { surface: "shop-mark", fill: "fill-good", ink: "knockout-good" },
  },
  "shop-tile": { rest: { surface: "shop-tile" } },
  "shop-tile-normal": { rest: { surface: "shop-tile-normal" } },
  "shop-tile-rare": { rest: { surface: "shop-tile-rare" } },
  "shop-tile-legendary": { rest: { surface: "shop-tile-legendary" } },
  "shop-frame": { rest: { surface: "shop-frame" } },
  "shop-art": { rest: { surface: "shop-frame", fill: "db32-green-moss" } },
  "shop-rarity-normal": {
    rest: { surface: "shop-tag", fill: "db32-tan", ink: "db32-valhalla" },
  },
  "shop-rarity-rare": {
    rest: { surface: "shop-tag", fill: "db32-green-teal", ink: "db32-white" },
  },
  "shop-rarity-legendary": {
    rest: { surface: "shop-tag", fill: "db32-orange-burnt", ink: "db32-white" },
  },
  "shop-stamp": {
    rest: { surface: "shop-stamp", fill: "db32-skin", ink: "db32-red" },
  },
  "shop-alert": { rest: { surface: "shop-alert", fill: "db32-white" } },
  "shop-plate": { rest: { surface: "shop-plate", fill: "db32-skin" } },
  "shop-badge": { rest: { surface: "shop-badge" } },
  "shop-checkout": { rest: { surface: "shop-tile", fill: "db32-white" } },
  "shop-product": { rest: { surface: "shop-product", fill: "db32-skin" } },
  "bj-card": { rest: { surface: "bj-card", fill: "db32-white" } },
  "bj-card-edge": { rest: { surface: "bj-card" } },
  "bj-chip": {
    rest: { surface: "bj-chip", fill: "db32-orange-burnt", ink: "db32-white" },
  },
  "bj-total": {
    rest: { surface: "bj-total", fill: "db32-slate", ink: "db32-white" },
  },
  "bj-hand-active": {
    rest: { surface: "bj-goal-ring", fill: "db32-slate", fillOpacity: 0.2 },
  },
  "bj-hand-win": {
    rest: {
      surface: "bj-goal-ring",
      fill: "db32-yellow-bright",
      fillOpacity: 0.18,
    },
  },
  "bj-hand-lose": {
    rest: { surface: "bj-loss-ring", fill: "db32-red-pink", fillOpacity: 0.25 },
  },
  "bj-hand-push": {
    rest: { surface: "bj-muted-ring", fill: "db32-slate", fillOpacity: 0.25 },
  },
  "bj-splash": {
    rest: {
      surface: "bj-goal-ring",
      fill: "db32-slate",
      ink: "db32-yellow-bright",
    },
  },
  "bj-splash-lose": {
    rest: { surface: "bj-loss-ring", fill: "db32-slate", ink: "db32-red-pink" },
  },
  "bj-splash-push": {
    rest: { surface: "bj-muted-ring", fill: "db32-slate", ink: "db32-white" },
  },
  "web-masthead": { rest: { surface: "web-rule", fill: "db32-white" } },
  // A card that is a key: raised at rest, sunk while held.
  "card-key": {
    rest: { surface: "raised", fill: "face" },
    pressed: { surface: "pressed" },
  },
  // The census deck's rules: a line drawn outside the box, on the slide.
  "census-rule-below": { rest: { surface: "census-rule-below" } },
  "census-rule-above": { rest: { surface: "census-rule-above" } },
  "census-axis": { rest: { surface: "census-axis" } },
  "web-tab": {
    rest: { ink: "db32-gray-dark" },
    hover: { fill: "db32-blue-ice", ink: "db32-blue-slate" },
    selected: { surface: "web-tab-open", ink: "db32-blue-slate" },
    pressed: { fill: "db32-blue-ice", ink: "db32-blue-slate" },
  },
  // A window: a flat plate with one outer ink ring; tabbed, its ground drops
  // a step to the ground a notebook's strip sits on.
  // A window takes focus only when nothing in it can, and a ring around a
  // whole window would read as a selection of it.
  window: {
    rest: { surface: "frame", fill: "face", ink: "ink" },
    focusRing: "none",
  },
  // A window whose parts read at the chrome type size, as a map panel's do.
  "window-chrome-type": {
    rest: { surface: "frame", fill: "face", ink: "ink", size: 14 },
    focusRing: "none",
  },
  "window-tabbed": {
    rest: { surface: "frame", fill: "notebook-ground", ink: "ink" },
    focusRing: "none",
  },
  "instrument-back": {
    rest: {
      surface: "instrument-back",
      fill: "titlebar",
      ink: "titlebar-text",
    },
    hover: { fill: "face", ink: "ink" },
    pressed: { fill: "paper", ink: "ink", travel: true },
  },
  // The modal window every program opens in: a window's look, under its own
  // name, its loose words in the dialog's 18px voice.
  dialog: {
    rest: { surface: "frame", fill: "face", ink: "ink", size: 18 },
    focusRing: "none",
  },
  "dialog-tabbed": {
    rest: { surface: "frame", fill: "notebook-ground", ink: "ink", size: 18 },
    focusRing: "none",
  },
  // What a modal lays over the city, and the save beat's lighter veil.
  scrim: { rest: { fill: "db32-black", fillOpacity: 0.7 } },
  veil: { rest: { fill: "ink", fillOpacity: 0.35 } },
  // An instrument on the map: a window's look, under its own name.
  instrument: {
    rest: {
      surface: "frame",
      fill: "face",
      ink: "ink",
      face: "mono",
      size: 12,
    },
    focusRing: "none",
  },
  // A pop-up list: one raised key, which stays down while its list is up.
  select: {
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      emboss: false,
    },
    pressed: { surface: "pressed", travel: true },
    disabled: { ink: "ink", textStipple: true, emboss: false },
  },
  // A menu bar's title: no raised face, a near-white fill under the pointer
  // or the keyboard, inverted for as long as its menu is down.
  "menubar-title": {
    rest: { fill: "none", ink: "ink", emboss: false },
    hover: { fill: "face-light" },
    focused: { fill: "face-light" },
  },
  "menubar-title-open": {
    rest: { fill: "titlebar", ink: "light", emboss: false },
    focused: { fill: "titlebar" },
  },
  // A pull-down's plate, and its rows: the highlighted one inverts to navy,
  // as a Windows menu does, rather than raising a bevel.
  "pulldown-plate": { rest: { surface: "pulldown", fill: "face", ink: "ink" } },
  "menu-row": { rest: { ink: "ink" } },
  "menu-row-highlighted": {
    rest: { fill: "titlebar", ink: "light" },
  },
  // A radio matrix: equal keys in a sunken track, the chosen one raised out
  // of it. An unchosen key's only hover feedback is its label brightening.
  "segment-track": { rest: { surface: "well", fill: "paper" } },
  segment: {
    rest: {
      surface: "none",
      fill: "none",
      ink: "dark",
      emboss: false,
    },
    hover: { ink: "ink" },
    selected: { surface: "raised", fill: "face", ink: "ink" },
  },
  // A check control's row keeps its full ink when dead: only its label is
  // stippled, never faded.
  check: {
    rest: { ink: "ink", emboss: false },
    disabled: { ink: "ink", emboss: false },
  },
  // The controls under a clear enabling box: drained and engraved.
  "dead-group": { rest: { ink: "ink-disabled", emboss: true } },
  // The editable cell: paper in a sunken edge, the dotted ring just inside it
  // while the value has focus; out of range, a ring of the bad ink outside.
  "field-cell": {
    rest: { surface: "well", fill: "paper" },
    focusWithin: { ring: -3 },
  },
  "field-cell-invalid": {
    rest: { surface: "field-invalid", fill: "paper" },
    focusWithin: { ring: -3 },
  },
  // A keycap on the board, and the empty, engraved slot of an unbound one.
  keycap: { rest: { surface: "keycap", fill: "paper", ink: "ink" } },
  "keycap-unbound": {
    rest: { surface: "ring", fill: "face", ink: "ink-disabled", emboss: true },
  },
  // A tile browsed but never pressed: paper in an inlaid ring; one whose
  // subject is not yet earned drops onto the sheet ground and engraves.
  tile: {
    rest: {
      surface: "ring",
      fill: "paper",
      ink: "ink",
      emboss: false,
    },
  },
  "tile-muted": {
    rest: {
      surface: "ring",
      fill: "face-light",
      ink: "ink-disabled",
      emboss: true,
    },
  },
  // An instrument's list row: flat data on the well. The chosen row takes the
  // selected fill and the dotted ring; a quiet list lets the fill alone say
  // so. A row that presses lifts under the pointer. Its own words are the
  // register's face at 14px.
  "list-row": {
    rest: { fill: "none", ink: "ink", face: "ui", size: 14 },
    selected: { fill: "row-selected", ring: -4 },
  },
  "list-row-quiet": {
    rest: { fill: "none", ink: "ink", face: "ui", size: 14 },
    selected: { fill: "row-selected" },
  },
  "list-row-interactive": {
    rest: { fill: "none", ink: "ink", face: "ui", size: 14 },
    hover: { fill: "row-hover" },
    selected: { fill: "row-selected", ring: -4 },
  },
  "list-row-interactive-quiet": {
    rest: { fill: "none", ink: "ink", face: "ui", size: 14 },
    hover: { fill: "row-hover" },
    selected: { fill: "row-selected" },
  },
  // A message box's message: 18px on a 1.6 line, and a long word breaks
  // anywhere rather than pushing the box wide.
  message: {
    rest: { ink: "ink", size: 18, leading: 28.8 },
  },
  // A well holds data; a panel holds controls.
  well: { rest: { surface: "well", fill: "paper" } },
  panel: { rest: { surface: "plate", fill: "face" } },
  // An instrument's virtual pad cursor: the ring real focus draws.
  "pad-cursor": { rest: { ring: -4 } },
  // The push button. Under the pointer its face lifts a step (a no-op on the
  // light chrome); held, the bevel inverts and the label travels a pixel; dead,
  // the label is stippled while the face and bevel keep their strength.
  key: {
    latched: { dither: true },
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      emboss: false,
    },
    hover: { fill: "face-hover" },
    pressed: { surface: "pressed", fill: "face", travel: true },
    disabled: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      textStipple: true,
      emboss: false,
    },
  },
  // A tile keeps its padding when held, so a press never re-lays a grid
  // of tiles.
  "key-tile": {
    latched: { dither: true },
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      emboss: false,
    },
    hover: { fill: "face-hover" },
    pressed: { surface: "pressed", fill: "face" },
    disabled: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      textStipple: true,
      emboss: false,
    },
  },
  "key-danger": {
    latched: { dither: true },
    rest: {
      surface: "danger-raised",
      fill: "fill-alert",
      ink: "knockout-alert",
      emboss: false,
    },
    pressed: { surface: "danger-pressed", fill: "fill-alert", travel: true },
    disabled: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      textStipple: true,
      emboss: false,
    },
  },
  // Tone changes a label; the danger variant changes the whole key.
  "key-bad": {
    latched: { dither: true },
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink-bad",
      emboss: false,
    },
    hover: { fill: "face-hover" },
    pressed: { surface: "pressed", fill: "face", travel: true },
    disabled: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      textStipple: true,
      emboss: false,
    },
  },
  // A message box's key that says its tone in its label's ink.
  "key-good": {
    latched: { dither: true },
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink-good",
      emboss: false,
    },
    hover: { fill: "face-hover" },
    pressed: { surface: "pressed", fill: "face", travel: true },
    disabled: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      textStipple: true,
      emboss: false,
    },
  },
  "key-warn": {
    latched: { dither: true },
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink-warn",
      emboss: false,
    },
    hover: { fill: "face-hover" },
    pressed: { surface: "pressed", fill: "face", travel: true },
    disabled: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      textStipple: true,
      emboss: false,
    },
  },
  // The dock's ink frame, the piece each tile holds, laid over the tile's own
  // bevel without a face of its own.
  "dock-frame": { rest: { surface: "dock-frame" } },
  "dock-frame-first": { rest: { surface: "dock-frame-first" } },
  "dock-frame-last": { rest: { surface: "dock-frame-last" } },
  // A group box's etched frame, laid over whatever ground the box sits on.
  groupbox: { rest: { surface: "groupbox" } },
  // A focused folder tab's dotted ring, four pixels inside the card.
  "tab-focus-mark": { rest: { ring: -4 } },
  // A folder tab: its ring is the mark above, cut to the card.
  tab: { rest: {}, focusRing: "none" },
  // The design catalog's specimens of a key in a state play shows only for a
  // moment, drawn for good: the focus ring, and the pad's band.
  "key-demo-focus": {
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      emboss: false,
      ring: -4,
    },
  },
  "key-demo-pad-focus": {
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      emboss: false,
      ring: -4,
      band: true,
    },
  },
  // The window's close key holds its face under the pointer.
  "key-close": {
    latched: { dither: true },
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      emboss: false,
    },
    pressed: { surface: "pressed", travel: true },
    disabled: { ink: "ink", textStipple: true, emboss: false },
  },
  // The open view's key on a toolbar, sunk into a well.
  "key-sunk": {
    latched: { dither: true },
    rest: {
      surface: "well",
      fill: "face",
      ink: "ink",
      emboss: false,
    },
    pressed: { travel: true },
    disabled: { ink: "ink", textStipple: true, emboss: false },
  },
  // A link that happens to be a control: no bevel until it is touched. A dead
  // one is a dead key.
  "key-flat": {
    rest: {
      surface: "none",
      fill: "none",
      ink: "ink",
      emboss: false,
    },
    hover: { surface: "plate" },
    pressed: { surface: "well", travel: true },
    disabled: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      textStipple: true,
      emboss: false,
    },
  },
  // A bare key that gains a plate under the pointer and a well while held.
  "key-ghost": {
    rest: {
      surface: "none",
      fill: "none",
      ink: "ink",
      emboss: false,
    },
    hover: { surface: "plate" },
    pressed: { surface: "well", travel: true },
    disabled: { surface: "none", ink: "ink", textStipple: true, emboss: false },
  },
  // A ghost key standing on the title screen's painting: white ink and ring.
  "key-backdrop": {
    rest: {
      surface: "none",
      fill: "none",
      ink: "db32-white",
      emboss: false,
    },
    hover: { surface: "plate" },
    pressed: { surface: "well", travel: true },
    disabled: {
      surface: "none",
      ink: "db32-white",
      textStipple: true,
      emboss: false,
    },
    focusRing: { offset: -4, ink: "db32-white" },
  },
  // The map's key: a see-through face (the checkerboard inside it) that turns
  // solid while held or toggled on.
  "key-hud": {
    rest: {
      surface: "raised",
      fill: "none",
      ink: "ink",
      emboss: false,
    },
    pressed: { surface: "pressed", fill: "face", travel: true },
    disabled: { ink: "ink", textStipple: true, emboss: false },
  },
  // A figure on an instrument strip that also presses: no face, no bevel, no
  // travel, the ring drawn round it. Its figures, a counting number among
  // them, read in the strip's data font.
  "key-readout": {
    latched: { dither: true },
    rest: {
      surface: "none",
      fill: "none",
      emboss: false,
      face: "mono",
      size: 12,
      leading: 12,
    },
    disabled: { textStipple: true, emboss: false },
    focusRing: { offset: 0 },
  },
  // A tool on the dock's strip, in the ringless thumb bevel. Under the pointer
  // it takes the key's raised bevel; held, it sinks without its icon moving.
  "key-dock-tile": {
    latched: { dither: true },
    rest: {
      surface: "thumb",
      fill: "face",
      ink: "ink",
      emboss: false,
    },
    hover: { surface: "raised", fill: "face-hover" },
    pressed: { surface: "thumb-pressed" },
    disabled: { ink: "ink", textStipple: true, emboss: false },
  },
  // The chosen tool, an open drawer or the drawer holding the chosen tool.
  "key-dock-tile-latched": {
    latched: { dither: true },
    rest: {
      surface: "thumb-pressed",
      fill: "row-selected",
      ink: "ink",
      emboss: false,
    },
    disabled: { ink: "ink", textStipple: true, emboss: false },
  },
  "key-drawer": {
    latched: { dither: true },
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink",
      emboss: false,
    },
    hover: { fill: "face-hover" },
    pressed: { surface: "pressed" },
    disabled: { ink: "ink", textStipple: true, emboss: false },
  },
  "key-drawer-latched": {
    latched: { dither: true },
    rest: {
      surface: "pressed",
      fill: "row-selected",
      ink: "ink",
      emboss: false,
    },
    disabled: { ink: "ink", textStipple: true, emboss: false },
  },
  // Still pressable, so the press can explain itself, but worn as a dead key
  // that never travels.
  "key-unavailable": {
    latched: { dither: true },
    rest: {
      surface: "raised",
      fill: "face",
      ink: "ink-disabled",
      emboss: true,
    },
  },
  // A map panel's list row: the selection fill under the pad's focus ring.
  "instrument-row": {
    rest: {},
    selected: {
      fill: "row-selected",
      ink: "knockout-selected",
      ring: -3,
    },
  },
  // An ink ring over a picture, open to what is under it.
  ringed: { rest: { surface: "ring" } },
  // A meter's track sunk into an inspector's well, on the well's own ground.
  "meter-well": { rest: { surface: "well" } },
  // The design catalog's colour swatch: a plate that sinks when pressed.
  swatch: { rest: { surface: "plate" }, pressed: { surface: "well" } },
} as const satisfies Record<string, Look>;

export type LookName = keyof typeof LOOKS;

/** What a role ink names: a palette colour, a MICRO64 shade, or another role. */
export type ColorReference =
  | `db32-${PaletteName}`
  | (typeof MICRO64_RED)[keyof typeof MICRO64_RED]
  | "face"
  | "chart-well";

// Names describe roles; sharing a DB32 colour must not merge those roles.
const LIGHT_INKS = {
  "face": "db32-gray-light",
  "light": "db32-white",
  "shade": "db32-blue-ice",
  "mid": "db32-gray",
  "dark": "db32-slate",
  "ink": "db32-black",
  "paper": "db32-white",
  "rule": "db32-gray-medium",
  "face-light": "db32-blue-ice",
  "face-hover": "db32-gray-light",
  "rule-band": "db32-gray-dark",
  "stripe": "db32-blue-ice",
  "row-hover": "db32-gray-light",
  "row-selected": "db32-blue-sky",
  "titlebar": "db32-blue-navy",
  "titlebar-text": "db32-white",
  "scrollbar-track": "db32-gray-medium",
  "ink-disabled": "db32-gray",
  "engraving-shadow": "db32-black",
  "engraving-floor": "db32-slate",
  "engraving-lit": "db32-blue-ice",
  "engraving-disabled": "db32-gray",
  "engraving-danger-shadow": MICRO64_RED.maroon,
  "engraving-danger-floor": "db32-white",
  "engraving-danger-lit": MICRO64_RED.light,
  "engraving-good-shadow": "db32-black",
  "engraving-good-floor": "db32-green-olive",
  "engraving-good-lit": "db32-green-lime",
  "danger-shadow": MICRO64_RED.maroon,
  "danger-highlight": MICRO64_RED.light,
  "ink-neutral": "db32-slate",
  "ink-good": "db32-green-olive",
  "ink-warn": "db32-orange-burnt",
  "ink-bad": "db32-red",
  "fill-neutral": "db32-slate",
  "fill-good": "db32-green-olive",
  "fill-warn": "db32-orange-burnt",
  "fill-bad": "db32-red",
  "fill-alert": "db32-red",
  "fill-notice": "db32-blue-slate",
  "paper-notice": "db32-skin",
  "notebook-ground": "db32-gray-medium",
  "knockout-neutral": "db32-white",
  "knockout-good": "db32-white",
  "knockout-warn": "db32-black",
  "knockout-bad": "db32-white",
  "knockout-alert": "db32-white",
  "knockout-notice": "db32-white",
  "knockout-selected": "db32-black",
  "meter-ink": "db32-blue-navy",
  "meter-track": "face",
  "chart-well": "db32-blue-ice",
  "scope-well": "chart-well",
  "goal": "db32-yellow-bright",
} as const satisfies Record<string, ColorReference>;

export type ThemeInk = keyof typeof LIGHT_INKS;

type Chrome = {
  inks: Record<ThemeInk, ColorReference>;

  bevelInks: Record<BevelInk, `db32-${PaletteName}`>;

  /** The dotted focus ring. */
  focus: { width: number; color: `db32-${PaletteName}` };

  emboss: { x: number; y: number; color: `db32-${PaletteName}` };
};

export const CHROMES = {
  light: {
    inks: LIGHT_INKS,
    bevelInks: {
      ring: "db32-black",
      shadow: "db32-gray",
      highlight: "db32-blue-ice",
    },
    focus: { width: 1, color: "db32-black" },
    emboss: { x: 1, y: 1, color: "db32-white" },
  },

  dark: {
    inks: {
      "face": "db32-slate",
      "light": "db32-black",
      "shade": "db32-gray",
      "mid": "db32-black",
      "dark": "db32-gray-light",
      "ink": "db32-white",
      "paper": "db32-valhalla",
      "rule": "db32-gray-dark",
      "face-light": "db32-gray-dark",
      "face-hover": "db32-gray-dark",
      "rule-band": "db32-gray",
      "stripe": "db32-purple-dark",
      "row-hover": "db32-slate",
      "row-selected": "db32-blue-navy",
      "titlebar": "db32-black",
      "titlebar-text": "db32-white",
      "scrollbar-track": "db32-black",
      "ink-disabled": "db32-gray-medium",
      "engraving-shadow": "db32-black",
      "engraving-floor": "db32-gray-light",
      "engraving-lit": "db32-blue-ice",
      "engraving-disabled": "db32-slate",
      "engraving-danger-shadow": MICRO64_RED.maroon,
      "engraving-danger-floor": "db32-white",
      "engraving-danger-lit": MICRO64_RED.light,
      "engraving-good-shadow": "db32-black",
      "engraving-good-floor": "db32-green-lime",
      "engraving-good-lit": "db32-white",
      "danger-shadow": MICRO64_RED.maroon,
      "danger-highlight": MICRO64_RED.light,
      "ink-neutral": "db32-gray-light",
      "ink-good": "db32-green-lime",
      "ink-warn": "db32-yellow-bright",
      "ink-bad": "db32-red-pink",
      "fill-neutral": "db32-gray-light",
      "fill-good": "db32-green-lime",
      "fill-warn": "db32-yellow-bright",
      "fill-bad": "db32-red-pink",
      "fill-alert": "db32-red",
      "fill-notice": "db32-blue-slate",
      "paper-notice": "db32-gray-olive",
      "notebook-ground": "db32-black",
      "knockout-neutral": "db32-black",
      "knockout-good": "db32-black",
      "knockout-warn": "db32-black",
      "knockout-bad": "db32-black",
      "knockout-alert": "db32-white",
      "knockout-notice": "db32-white",
      "knockout-selected": "db32-white",
      "meter-ink": "db32-blue-sky",
      "meter-track": "face",
      "chart-well": "db32-valhalla",
      "scope-well": "chart-well",
      "goal": "db32-yellow-bright",
    },
    bevelInks: {
      ring: "db32-black",
      shadow: "db32-black",
      highlight: "db32-gray",
    },
    focus: { width: 1, color: "db32-white" },
    emboss: { x: 1, y: 1, color: "db32-black" },
  },
} as const satisfies Record<"light" | "dark", Chrome>;

/** A typeface the stacks below name, and the file under public/ that carries it. */
export interface FontFile {
  family: string;
  source: `/fonts/${string}.ttf` | `/fonts/${string}.otf`;
  /** A weight this file answers for; one file may answer for several. */
  weight?: 400 | 600 | 700;
  /** Matches the face's apparent size while preserving the type style's line box. */
  sizeAdjust?: number;
  /** Shown in the fallback face until the file arrives, never invisible. */
  swap?: true;
}

export const FONT_FACES = [
  { family: "Jersey25", source: "/fonts/Jersey25-Regular.ttf" },
  {
    family: "Sofia Sans",
    source: "/fonts/SofiaSans-SemiBold.ttf",
    weight: 600,
    sizeAdjust: 0.94,
  },
  { family: "Diffusion Bold", source: "/fonts/diffusion-regular.ttf" },
  { family: "BoldPixels", source: "/fonts/BoldPixels.otf" },
  // One Regular file answers for every weight a Plex Sans heading asks for.
  {
    family: "IBM Plex Sans",
    source: "/fonts/IBMPlexSans-Regular.ttf",
    weight: 400,
  },
  {
    family: "IBM Plex Sans",
    source: "/fonts/IBMPlexSans-Regular.ttf",
    weight: 600,
  },
  {
    family: "IBM Plex Sans",
    source: "/fonts/IBMPlexSans-Regular.ttf",
    weight: 700,
  },
  {
    family: "IBM Plex Serif",
    source: "/fonts/IBMPlexSerif-Regular.ttf",
    weight: 400,
  },
  {
    family: "IBM Plex Serif",
    source: "/fonts/IBMPlexSerif-SemiBold.ttf",
    weight: 600,
  },
  {
    family: "IBM Plex Serif",
    source: "/fonts/IBMPlexSerif-Bold.ttf",
    weight: 700,
  },
  {
    family: "Manufacturing Consent",
    source: "/fonts/ManufacturingConsent-Regular.ttf",
  },
  // The ransomware glitch face: the symbol glyphs corrupted text is spliced from.
  {
    family: "NotoSansSymbols",
    source: "/fonts/NotoSansSymbols-VariableFont_wght.ttf",
    swap: true,
  },
  { family: "WDXLLubrifont SC", source: "/fonts/WDXLLubrifontSC-Regular.ttf" },
  { family: "WDXLLubrifont TC", source: "/fonts/WDXLLubrifontTC-Regular.ttf" },
  {
    family: "WDXLLubrifont JPN",
    source: "/fonts/WDXLLubrifontJPN-Regular.ttf",
  },
  { family: "IBM Plex Sans KR", source: "/fonts/IBMPlexSansKR-Medium.ttf" },
] as const satisfies readonly FontFile[];

export const FONT_FAMILIES = {
  default: {
    "primary": [
      '"Jersey25"',
      "sans-serif",
    ],
    "ui": [
      '"Jersey25"',
      "sans-serif",
    ],
    "system": [
      "system-ui",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      "Oxygen",
      "Ubuntu",
      "Cantarell",
      '"Open Sans"',
      '"Helvetica Neue"',
      "sans-serif",
    ],
    "heading": [
      '"IBM Plex Sans"',
      "sans-serif",
    ],
    "bold-pixels": [
      '"BoldPixels"',
    ],
    "serif": [
      '"IBM Plex Serif"',
      "serif",
    ],
    "small": [
      '"IBM Plex Sans"',
      "sans-serif",
    ],
    "newspaper-masthead": [
      '"Manufacturing Consent"',
    ],
    "mono": [
      '"Diffusion Bold"',
      "monospace",
    ],
    "terminal": [
      "monospace",
    ],
    // Scripts BoldPixels lacks fall through to the UI face.
    "bold-pixels-ui": [
      '"BoldPixels"',
      '"Jersey25"',
      "sans-serif",
    ],
    // Corrupted text: the symbol face carries the blocks, arrows and hazard
    // signs it is spliced from; the mono face shows through where it thins.
    "glitch": [
      '"NotoSansSymbols"',
      '"Diffusion Bold"',
      "monospace",
    ],
  },
  ru: {
    "primary": ['"Sofia Sans"', "sans-serif"],
    "ui": ['"Sofia Sans"', "sans-serif"],
  },
  uk: {
    "primary": ['"Sofia Sans"', "sans-serif"],
    "ui": ['"Sofia Sans"', "sans-serif"],
  },
  zh: {
    "primary": [
      '"WDXLLubrifont SC"',
      "sans-serif",
    ],
    "ui": [
      '"WDXLLubrifont SC"',
      "sans-serif",
    ],
    "heading": [
      '"WDXLLubrifont SC"',
      "sans-serif",
    ],
    "small": [
      '"WDXLLubrifont SC"',
      "sans-serif",
    ],
    "serif": [
      '"WDXLLubrifont SC"',
      "serif",
    ],
    "bold-pixels-ui": [
      '"BoldPixels"',
      '"WDXLLubrifont SC"',
      "sans-serif",
    ],
  },
  "zh-TW": {
    "primary": [
      '"WDXLLubrifont TC"',
      "sans-serif",
    ],
    "ui": [
      '"WDXLLubrifont TC"',
      "sans-serif",
    ],
    "heading": [
      '"WDXLLubrifont TC"',
      "sans-serif",
    ],
    "small": [
      '"WDXLLubrifont TC"',
      "sans-serif",
    ],
    "serif": [
      '"WDXLLubrifont TC"',
      "serif",
    ],
    "bold-pixels-ui": [
      '"BoldPixels"',
      '"WDXLLubrifont TC"',
      "sans-serif",
    ],
  },
  ja: {
    "primary": [
      '"WDXLLubrifont JPN"',
      "sans-serif",
    ],
    "ui": [
      '"WDXLLubrifont JPN"',
      "sans-serif",
    ],
    "heading": [
      '"WDXLLubrifont JPN"',
      "sans-serif",
    ],
    "small": [
      '"WDXLLubrifont JPN"',
      "sans-serif",
    ],
    "serif": [
      '"WDXLLubrifont JPN"',
      "serif",
    ],
    "bold-pixels-ui": [
      '"BoldPixels"',
      '"WDXLLubrifont JPN"',
      "sans-serif",
    ],
  },
  ko: {
    "primary": [
      '"IBM Plex Sans KR"',
      "sans-serif",
    ],
    "ui": [
      '"IBM Plex Sans KR"',
      "sans-serif",
    ],
    "heading": [
      '"IBM Plex Sans KR"',
      "sans-serif",
    ],
    "small": [
      '"IBM Plex Sans KR"',
      "sans-serif",
    ],
    "serif": [
      '"IBM Plex Sans KR"',
      "serif",
    ],
    "bold-pixels-ui": [
      '"BoldPixels"',
      '"IBM Plex Sans KR"',
      "sans-serif",
    ],
  },
} as const;

export type FaceRole = keyof typeof FONT_FAMILIES.default;

/**
 * A type style names a face by its role, which each language maps to a font
 * (FONT_FAMILIES), and fixes its metrics in UI pixels. Line heights are
 * explicit: the native host has no `normal`.
 */
export interface TypeMetrics {
  face: FaceRole;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  weight?: 100 | 400 | 500 | 600 | 700;
  italic?: boolean;
  case?: "upper" | "lower" | "capitalize";
  /**
   * A line under the letters: a link's, at the face's own offset and weight,
   * or a mnemonic's, `thickness` pixels at `offset` pixels below the baseline.
   */
  underline?: { offset?: number; thickness?: number };
  /** Extra space added to each word space, in UI pixels. */
  wordSpacing?: number;
  /** Where another language's font sets the line taller or shorter. */
  languageLineHeights?: Partial<Record<"ja" | "ko" | "zh" | "zh-TW", number>>;
  /** Half the pixels knocked out on the register's checkerboard: a caption
   *  whose control is dead. It drops any inherited shadow. */
  stipple?: true;
  /** Digits of one width, so figures line up down a column. */
  figures?: "tabular";
  /** A shadow under the letters, for type knocked out of a coloured fill. */
  shadow?: { x: number; y: number; color: PaletteInk; opacity: number };
  /** Four hard one-pixel shadows keep letters readable over a map. */
  halo?: PaletteInk;
}

// Names say face, size and what else differs, so a call site reads its look.
export const TYPE_METRICS = {
  "world-badge": { face: "mono", size: 11, lineHeight: 13.2, letterSpacing: 0 },
  text: { face: "ui", size: 18, lineHeight: 21.6, letterSpacing: 0 },
  "text-field": { face: "ui", size: 16, lineHeight: 19.2, letterSpacing: 0 },
  "text-small": { face: "ui", size: 15, lineHeight: 18, letterSpacing: 0 },
  "text-chrome": { face: "ui", size: 14, lineHeight: 16.8, letterSpacing: 0 },
  "ui-12": { face: "ui", size: 12, lineHeight: 15.6, letterSpacing: 0 },
  // The floating hint's voice.
  "ui-15-loose": { face: "ui", size: 15, lineHeight: 22.5, letterSpacing: 0 },
  "ui-13": { face: "ui", size: 13, lineHeight: 16.9, letterSpacing: 0 },
  "ui-16-capitalize": {
    face: "ui",
    size: 16,
    lineHeight: 18,
    letterSpacing: 0,
    case: "capitalize",
  },
  // The inspector card's header and its company's building name, on the
  // card's 1.2em line at 14px.
  "ui-14-caps-title": {
    face: "ui",
    size: 14,
    lineHeight: 18.2,
    letterSpacing: 1,
    case: "upper",
  },
  "ui-16-capitalize-card": {
    face: "ui",
    size: 16,
    lineHeight: 16.8,
    letterSpacing: 0,
    case: "capitalize",
  },
  "ui-12-caption": { face: "ui", size: 12, lineHeight: 16.2, letterSpacing: 0 },
  "ui-12-loose": { face: "ui", size: 12, lineHeight: 18, letterSpacing: 0 },
  // A breaking-news clipping's headline and the stamp before it. The stamp's
  // 18px line leaves its capitals as much room below as above on the plate.
  "ui-22-compact": {
    face: "ui",
    size: 22,
    lineHeight: 26.4,
    letterSpacing: 0,
  },
  "ui-16-stamp": {
    face: "ui",
    size: 16,
    lineHeight: 18,
    letterSpacing: 0.8,
  },
  "ui-14-loose": { face: "ui", size: 14, lineHeight: 21, letterSpacing: 0 },
  "ui-17-compact": {
    face: "ui",
    size: 17,
    lineHeight: 20.390625,
    letterSpacing: 0,
  },
  // The ransomware card's fine print, on the card's line.
  "ui-10-card": { face: "ui", size: 10, lineHeight: 16.8, letterSpacing: 0 },
  "ui-15-capitalize-solid": {
    face: "ui",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0,
    case: "capitalize",
  },
  "ui-11-figures-solid": {
    face: "ui",
    size: 11,
    lineHeight: 11,
    letterSpacing: 0,
    figures: "tabular",
  },
  // `figures`: digits of one width, so a column of figures lines up.
  "ui-14-figures-solid": {
    face: "ui",
    size: 14,
    lineHeight: 14,
    letterSpacing: 0,
    figures: "tabular",
  },
  "ui-16-figures-solid": {
    face: "ui",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0,
    figures: "tabular",
  },
  "mono-14-figures-solid": {
    face: "mono",
    size: 14,
    lineHeight: 14,
    letterSpacing: 0,
    figures: "tabular",
  },
  "mono-16-figures-solid": {
    face: "mono",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0,
    figures: "tabular",
  },
  "ui-11-caps-figures-solid": {
    face: "ui",
    size: 11,
    lineHeight: 11,
    letterSpacing: 0.5,
    case: "upper",
    figures: "tabular",
  },
  "ui-12-caps-figures-solid": {
    face: "ui",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0.5,
    case: "upper",
    figures: "tabular",
  },
  "mono-11-caps-figures-solid": {
    face: "mono",
    size: 11,
    lineHeight: 11,
    letterSpacing: 0.5,
    case: "upper",
    figures: "tabular",
  },
  "mono-12-caps-figures-solid": {
    face: "mono",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0.5,
    case: "upper",
    figures: "tabular",
  },
  // `prose`: a sheet's wrapping cell, 1.25 lines. `caps`: a column band.
  "ui-11-caps-solid": {
    face: "ui",
    size: 11,
    lineHeight: 11,
    letterSpacing: 0.5,
    case: "upper",
  },
  "ui-12-caps-solid": {
    face: "ui",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0.5,
    case: "upper",
  },
  "ui-14-prose": {
    face: "ui",
    size: 14,
    lineHeight: 17.5,
    letterSpacing: 0,
  },
  "ui-16-solid": {
    face: "ui",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0,
  },
  "ui-16-snug": {
    face: "ui",
    size: 16,
    lineHeight: 20.0,
    letterSpacing: 0,
  },
  "mono-11-caps-solid": {
    face: "mono",
    size: 11,
    lineHeight: 11,
    letterSpacing: 0.5,
    case: "upper",
  },
  "mono-12-caps-solid": {
    face: "mono",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0.5,
    case: "upper",
  },
  "mono-14-solid": {
    face: "mono",
    size: 14,
    lineHeight: 14,
    letterSpacing: 0,
  },
  "mono-14-prose": {
    face: "mono",
    size: 14,
    lineHeight: 17.5,
    letterSpacing: 0,
  },
  "mono-16-solid": {
    face: "mono",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0,
  },
  "mono-16-prose": {
    face: "mono",
    size: 16,
    lineHeight: 20.0,
    letterSpacing: 0,
  },
  // `knockout`: white on the alert fill, lifted off it by a dark shadow.
  "ui-15-knockout-solid": {
    face: "ui",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0,
    shadow: { x: 1, y: 1, color: "db32-black", opacity: 0.6 },
  },
  "ui-18-knockout-solid": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0.5,
    shadow: { x: 1, y: 1, color: "db32-black", opacity: 0.6 },
  },
  // `message`: a message box's prose, 1.6 lines. `about`: an about box's, 1.35.
  "ui-18-message": { face: "ui", size: 18, lineHeight: 28.8, letterSpacing: 0 },
  "ui-15-message": { face: "ui", size: 15, lineHeight: 24, letterSpacing: 0 },
  "ui-13-caps-message": {
    face: "ui",
    size: 13,
    lineHeight: 20.8,
    letterSpacing: 0.5,
    case: "upper",
  },
  "ui-15-about": { face: "ui", size: 15, lineHeight: 20.25, letterSpacing: 0 },
  "ui-20-about": { face: "ui", size: 20, lineHeight: 27, letterSpacing: 0.3 },
  // `tight`: a heading's 1.1 lines. `eyebrow`: the small caps over a name.
  "ui-20-tight": { face: "ui", size: 20, lineHeight: 22, letterSpacing: 0 },
  "ui-18-tight": {
    face: "ui",
    size: 18,
    lineHeight: 19.8,
    letterSpacing: 0,
    weight: 700,
  },
  "ui-12-eyebrow-solid": {
    face: "ui",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0.4,
    case: "upper",
  },
  "ui-15-prose": { face: "ui", size: 15, lineHeight: 18.75, letterSpacing: 0 },
  "ui-15-figures-prose": {
    face: "ui",
    size: 15,
    lineHeight: 18.75,
    letterSpacing: 0,
    figures: "tabular",
  },
  // A spreadsheet's point sizes: 11pt cells, 10pt row and column names.
  "ui-11pt-solid": {
    face: "ui",
    size: 44 / 3,
    lineHeight: 44 / 3,
    letterSpacing: 0,
  },
  "ui-10pt-solid": {
    face: "ui",
    size: 40 / 3,
    lineHeight: 40 / 3,
    letterSpacing: 0,
  },
  "ui-10pt-spaced-solid": {
    face: "ui",
    size: 40 / 3,
    lineHeight: 40 / 3,
    letterSpacing: 0.5,
  },
  "ui-10pt-italic-solid": {
    face: "ui",
    size: 40 / 3,
    lineHeight: 40 / 3,
    letterSpacing: 0,
    italic: true,
  },
  "ui-13-solid": { face: "ui", size: 13, lineHeight: 13, letterSpacing: 0 },
  // The Bank's letter: its stationery's sizes.
  "ui-11-solid": {
    face: "ui",
    size: 11,
    lineHeight: 11,
    letterSpacing: 0,
  },
  "ui-11-italic-solid": {
    face: "ui",
    size: 11,
    lineHeight: 11,
    letterSpacing: 0,
    italic: true,
  },
  "ui-12-italic-solid": {
    face: "ui",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0,
    italic: true,
  },
  "ui-13-italic-solid": {
    face: "ui",
    size: 13,
    lineHeight: 13,
    letterSpacing: 0,
    italic: true,
  },
  "ui-12-spaced-solid": {
    face: "ui",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0.3,
  },
  "ui-13-ribbon-solid": {
    face: "ui",
    size: 13,
    lineHeight: 13,
    letterSpacing: 0.3,
    weight: 700,
    italic: true,
  },
  // `fineprint`: a disclosure's 1.4 lines, floored to the layout unit as a
  // unitless line height is; `message`: an approval's.
  "ui-11-fineprint": {
    face: "ui",
    size: 11,
    lineHeight: 15.390625,
    letterSpacing: 0,
  },
  "ui-13-letter": {
    face: "ui",
    size: 13,
    lineHeight: 18.2,
    letterSpacing: 0,
  },
  // `upper`: capitals at the face's own spacing.
  "mono-11-upper-solid": {
    face: "mono",
    size: 11,
    lineHeight: 11,
    letterSpacing: 0,
    case: "upper",
  },
  "mono-11-loose": {
    face: "mono",
    size: 11,
    lineHeight: 16.5,
    letterSpacing: 0,
  },
  "mono-11-bold-loose": {
    face: "mono",
    size: 11,
    lineHeight: 16.5,
    letterSpacing: 0,
    weight: 700,
  },
  "mono-12-solid": {
    face: "mono",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0,
  },
  "street-name": {
    face: "mono",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0,
    halo: "db32-white",
  },
  "street-name-small": {
    face: "mono",
    size: 9,
    lineHeight: 9,
    letterSpacing: 0,
    halo: "db32-white",
  },
  "mono-12-bold-solid": {
    face: "mono",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0,
    weight: 700,
  },
  "mono-13-solid": {
    face: "mono",
    size: 13,
    lineHeight: 13,
    letterSpacing: 0,
  },
  "mono-13-bold-solid": {
    face: "mono",
    size: 13,
    lineHeight: 13,
    letterSpacing: 0,
    weight: 700,
  },
  "mono-14-bold-solid": {
    face: "mono",
    size: 14,
    lineHeight: 14,
    letterSpacing: 0,
    weight: 700,
  },
  "mono-14-title-solid": {
    face: "mono",
    size: 14,
    lineHeight: 14,
    letterSpacing: 1,
    weight: 700,
    case: "upper",
  },
  "mono-18-title-solid": {
    face: "mono",
    size: 18,
    lineHeight: 18,
    letterSpacing: 1,
    case: "upper",
  },
  "mono-20-bold-solid": {
    face: "mono",
    size: 20,
    lineHeight: 20,
    letterSpacing: 0,
    weight: 700,
  },
  "mono-26-bold-solid": {
    face: "mono",
    size: 26,
    lineHeight: 26,
    letterSpacing: 0,
    weight: 700,
  },
  // `tight`: a notice band's 1.15 lines.
  "ui-14-tight": { face: "ui", size: 14, lineHeight: 16.1, letterSpacing: 0 },
  "ui-14-snug": { face: "ui", size: 14, lineHeight: 17.5, letterSpacing: 0 },
  "ui-13-caps-solid": {
    face: "ui",
    size: 13,
    lineHeight: 13,
    letterSpacing: 0.5,
    case: "upper",
  },
  // `solid`: set solid, line height equal to the size (the root's own type).
  "ui-14-solid": { face: "ui", size: 14, lineHeight: 14, letterSpacing: 0 },
  "ui-18-solid": { face: "ui", size: 18, lineHeight: 18, letterSpacing: 0 },
  "ui-18-italic-solid": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0,
    italic: true,
  },
  "ui-20-solid": { face: "ui", size: 20, lineHeight: 20, letterSpacing: 0 },
  "ui-24-solid": { face: "ui", size: 24, lineHeight: 24, letterSpacing: 0 },
  "serif-8-solid": { face: "serif", size: 8, lineHeight: 8, letterSpacing: 0 },
  "serif-10-caps-solid": {
    face: "serif",
    size: 10,
    lineHeight: 10,
    letterSpacing: 0,
    case: "upper",
  },
  "serif-12-solid": {
    face: "serif",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0,
  },
  "serif-12-italic-solid": {
    face: "serif",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0,
    italic: true,
  },
  "serif-13-bold-solid": {
    face: "serif",
    size: 13,
    lineHeight: 13,
    letterSpacing: 0,
    weight: 700,
  },
  "serif-20-solid": {
    face: "serif",
    size: 20,
    lineHeight: 20,
    letterSpacing: 0,
  },
  "serif-21.6-solid": {
    face: "serif",
    size: 21.6,
    lineHeight: 21.6,
    letterSpacing: 0,
  },
  "serif-27-solid": {
    face: "serif",
    size: 27,
    lineHeight: 27,
    letterSpacing: 0,
  },
  "ui-16-prose": { face: "ui", size: 16, lineHeight: 22.4, letterSpacing: 0 },
  "ui-15-solid": { face: "ui", size: 15, lineHeight: 15, letterSpacing: 0 },
  // A menu row's tick, in the system face, which has one.
  "system-13-solid": {
    face: "system",
    size: 13,
    lineHeight: 13,
    letterSpacing: 0,
  },
  // A folder tab's label.
  "ui-14-tab-solid": {
    face: "ui",
    size: 14,
    lineHeight: 14,
    letterSpacing: 0.5,
    case: "upper",
  },
  // A segment's label: small capitals spaced a pixel apart.
  "ui-13-segment-solid": {
    face: "ui",
    size: 13,
    lineHeight: 13,
    letterSpacing: 1,
    case: "upper",
  },
  // A check control's description, at a label's 1.25.
  "ui-12-snug": { face: "ui", size: 12, lineHeight: 15, letterSpacing: 0 },
  "ui-12-snug-stipple": {
    face: "ui",
    size: 12,
    lineHeight: 15,
    letterSpacing: 0,
    stipple: true,
  },
  // A city's name as typed, each word capitalized.
  "ui-16-capitalize-solid": {
    face: "ui",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0,
    case: "capitalize",
  },
  // A state's quieter help line, at 1.4.
  "ui-15-relaxed": { face: "ui", size: 15, lineHeight: 21, letterSpacing: 0 },
  // An error tile's glyph, set solid.
  "mono-22-solid": { face: "mono", size: 22, lineHeight: 22, letterSpacing: 0 },
  // A keycap's label: four fifths of the line it stands in, in capitals
  // spaced a fiftieth of an em; a sentence on a cap keeps its own case.
  "keycap-text": {
    face: "ui",
    size: 14.4,
    lineHeight: 14.4,
    letterSpacing: 0.288,
    case: "upper",
  },
  "keycap-hint": {
    face: "ui",
    size: 11.2,
    lineHeight: 11.2,
    letterSpacing: 0.224,
    case: "upper",
  },
  "keycap-legend": {
    face: "ui",
    size: 10.4,
    lineHeight: 10.4,
    letterSpacing: 0.208,
    case: "upper",
  },
  "keycap-small": {
    face: "ui",
    size: 8.96,
    lineHeight: 8.96,
    letterSpacing: 0.1792,
    case: "upper",
  },
  "keycap-large": {
    face: "ui",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0.3,
    case: "upper",
  },
  "keycap-large-sentence": {
    face: "ui",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0.3,
  },
  "keycap-large-unbound": {
    face: "ui",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0.3,
    italic: true,
  },
  // A list row's title, a city's stored lowercase name capitalized.
  "ui-14-capitalize-solid": {
    face: "ui",
    size: 14,
    lineHeight: 14,
    letterSpacing: 0,
    case: "capitalize",
  },
  "ui-18-capitalize-solid": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0,
    case: "capitalize",
  },
  // A flat key's label: a link, underlined at the face's own offset.
  "ui-15-solid-underline": {
    face: "ui",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0,
    underline: {},
  },
  // The electricity exchange's power figure.
  "ui-32-solid": { face: "ui", size: 32, lineHeight: 32, letterSpacing: 0 },
  // The on-screen keyboard's keys, lowercase as typed.
  "ui-20-lower-solid": {
    face: "ui",
    size: 20,
    lineHeight: 20,
    letterSpacing: 0,
    case: "lower",
  },
  "ui-18-lower-solid": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0,
    case: "lower",
  },
  // A window's name in its title bar.
  "ui-18-title-solid": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  // A message box's severity glyph on its 32px tile.
  "ui-22-tile-solid": {
    face: "ui",
    size: 22,
    lineHeight: 32,
    letterSpacing: 0,
  },
  // A support report to copy, in the machine's own words.
  "mono-15-report": {
    face: "mono",
    size: 15,
    lineHeight: 22.5,
    letterSpacing: 0,
  },
  // The ™ a window's name borrows from the system face, which has one.
  "system-18-title-solid": {
    face: "system",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  // A status bar's readout cell: a mode, a count, a year.
  "mono-10-pill-solid": {
    face: "mono",
    size: 10,
    lineHeight: 10,
    letterSpacing: 0.5,
  },
  // A menu bar's titles, and the underlined mnemonic in one.
  "ui-16-menu-solid": {
    face: "ui",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  "ui-16-menu-solid-underline": {
    face: "ui",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0.3,
    underline: { offset: 2, thickness: 1 },
  },
  // A stamp's 0.6rem.
  "ui-9.6-solid": { face: "ui", size: 9.6, lineHeight: 9.6, letterSpacing: 0 },
  // A list of names at 1.3 and a paragraph of prose at 1.4.
  "ui-16-list": { face: "ui", size: 16, lineHeight: 20.8, letterSpacing: 0 },
  // A form caption sets its own weight, at a label's 1.25.
  "ui-18-label": {
    face: "ui",
    size: 18,
    lineHeight: 22.5,
    letterSpacing: 0,
    weight: 400,
  },
  "ui-15-snug": { face: "ui", size: 15, lineHeight: 18.75, letterSpacing: 0 },
  "ui-28-solid": { face: "ui", size: 28, lineHeight: 28, letterSpacing: 0 },
  "ui-14.4-solid": {
    face: "ui",
    size: 14.4,
    lineHeight: 14.4,
    letterSpacing: 0,
  },
  "ui-128-solid": { face: "ui", size: 128, lineHeight: 128, letterSpacing: 0 },
  "terminal-13": {
    face: "terminal",
    size: 13,
    lineHeight: 15,
    letterSpacing: 0,
  },
  "ui-18-snug": { face: "ui", size: 18, lineHeight: 22.5, letterSpacing: 0 },
  "ui-18-label-stipple": {
    face: "ui",
    size: 18,
    lineHeight: 22.5,
    letterSpacing: 0,
    weight: 400,
    stipple: true,
  },
  "ui-18-solid-stipple": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0,
    stipple: true,
  },
  "ui-15-hint": { face: "ui", size: 15, lineHeight: 19.5, letterSpacing: 0 },
  "ui-14.4-solid-caps": {
    face: "ui",
    size: 14.4,
    lineHeight: 14.4,
    letterSpacing: 0.864,
    case: "upper",
  },
  // The title screen's logo, white on the backdrop with the register's shadow.
  "bold-pixels-80-solid-shadow": {
    face: "bold-pixels",
    size: 80,
    lineHeight: 80,
    letterSpacing: 0,
    shadow: { x: 3, y: 3, color: "db32-black", opacity: 1 },
  },
  // A letter's own voice, generously leaded and spaced.
  "ui-24-letter": {
    face: "ui",
    size: 24,
    lineHeight: 48,
    letterSpacing: 0.3,
    wordSpacing: 2.4,
    italic: true,
  },
  // BoldPixels draws on a 16px em: at 16px each font pixel is one UI pixel.
  "bold-pixels-ui-16": {
    face: "bold-pixels-ui",
    size: 16,
    lineHeight: 24,
    letterSpacing: 0,
  },
  "bold-pixels-ui-16-caps": {
    face: "bold-pixels-ui",
    size: 16,
    lineHeight: 24,
    letterSpacing: 0,
    case: "upper",
  },
  "ui-24": { face: "ui", size: 24, lineHeight: 27.6, letterSpacing: 0 },
  "ui-15": { face: "ui", size: 15, lineHeight: 19.5, letterSpacing: 0 },
  // 1.3 × 14 is 18.2, which a multiplier floors to the 1/64px layout unit.
  "ui-14": { face: "ui", size: 14, lineHeight: 18.1875, letterSpacing: 0 },
  "ui-18-loose": { face: "ui", size: 18, lineHeight: 28.8, letterSpacing: 0 },
  "mono-15-solid": { face: "mono", size: 15, lineHeight: 15, letterSpacing: 0 },
  "system-15": {
    face: "system",
    size: 15,
    lineHeight: 20.25,
    letterSpacing: 0,
  },
  "system-18": { face: "system", size: 18, lineHeight: 24.3, letterSpacing: 0 },
  // The UI face's own `normal` line, measured in Chrome per language's font.
  "ui-18-normal": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0,
    languageLineHeights: { ja: 21, zh: 21, "zh-TW": 21, ko: 27 },
  },
  "ui-23-solid": { face: "ui", size: 23, lineHeight: 23, letterSpacing: 0 },
  "ui-30-solid": { face: "ui", size: 30, lineHeight: 30, letterSpacing: 0 },
  "ui-16-loose": { face: "ui", size: 16, lineHeight: 24, letterSpacing: 0 },
  // Multiplier line heights floor to the 1/64px layout unit: 1.3, 1.4, 1.25.
  "ui-16": { face: "ui", size: 16, lineHeight: 20.796875, letterSpacing: 0 },
  "ui-16-relaxed": {
    face: "ui",
    size: 16,
    lineHeight: 22.390625,
    letterSpacing: 0,
  },
  "ui-14-relaxed": {
    face: "ui",
    size: 14,
    lineHeight: 19.59375,
    letterSpacing: 0,
  },
  "ui-12-solid": { face: "ui", size: 12, lineHeight: 12, letterSpacing: 0 },
  // The newspaper's own type: its nameplate face, Plex Serif and the UI face.
  "masthead-44": {
    face: "newspaper-masthead",
    size: 44,
    lineHeight: 46.1875,
    letterSpacing: 0,
  },
  "masthead-20": {
    face: "newspaper-masthead",
    size: 20,
    lineHeight: 21,
    letterSpacing: 0,
  },
  "serif-8": {
    face: "serif",
    size: 8,
    lineHeight: 10.390625,
    letterSpacing: 0,
  },
  "serif-8-caps": {
    face: "serif",
    size: 8,
    lineHeight: 10.390625,
    letterSpacing: 0,
    case: "upper",
  },
  "serif-8-bold": {
    face: "serif",
    size: 8,
    lineHeight: 10.390625,
    letterSpacing: 0,
    weight: 700,
  },
  "serif-10-caps": {
    face: "serif",
    size: 10,
    lineHeight: 13,
    letterSpacing: 0,
    case: "upper",
  },
  "serif-27-caps": {
    face: "serif",
    size: 27,
    lineHeight: 29.7,
    letterSpacing: 0,
    case: "upper",
  },
  "serif-21.6": {
    face: "serif",
    size: 21.6,
    lineHeight: 28.08,
    letterSpacing: 0,
  },
  "serif-18-bold": {
    face: "serif",
    size: 18,
    lineHeight: 25.2,
    letterSpacing: 0,
    weight: 700,
  },
  "ui-16-solid-caps": {
    face: "ui",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0,
    case: "upper",
  },
  "ui-16-compact": { face: "ui", size: 16, lineHeight: 19.2, letterSpacing: 0 },
  "ui-18": { face: "ui", size: 18, lineHeight: 23.4, letterSpacing: 0 },
  "ui-14-caps": {
    face: "ui",
    size: 14,
    lineHeight: 18.2,
    letterSpacing: 0,
    case: "upper",
  },
  // The gift shop's catalog type, all set solid unless it says otherwise.
  "shop-kicker": {
    face: "ui",
    size: 11,
    lineHeight: 11,
    letterSpacing: 1.5,
    weight: 700,
    case: "upper",
  },
  "shop-name": {
    face: "ui",
    size: 42,
    lineHeight: 39.890625,
    letterSpacing: 0.5,
  },
  "ui-15-italic-solid": {
    face: "ui",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0,
    italic: true,
  },
  "shop-banner": {
    face: "ui",
    size: 22,
    lineHeight: 22,
    letterSpacing: 0.5,
    case: "upper",
  },
  "mono-11-solid": { face: "mono", size: 11, lineHeight: 11, letterSpacing: 0 },
  "shop-number": { face: "mono", size: 11, lineHeight: 11, letterSpacing: 1 },
  "shop-ornament": {
    face: "mono",
    size: 10,
    lineHeight: 10,
    letterSpacing: 36,
  },
  "shop-gift-name": { face: "ui", size: 20, lineHeight: 22, letterSpacing: 0 },
  "shop-mystery-name": {
    face: "mono",
    size: 22,
    lineHeight: 24.1875,
    letterSpacing: 3,
  },
  "shop-rarity": {
    face: "ui",
    size: 14,
    lineHeight: 15.390625,
    letterSpacing: 0,
    case: "upper",
  },
  "shop-mystery-copy": {
    face: "ui",
    size: 15,
    lineHeight: 16.5,
    letterSpacing: 0,
    italic: true,
  },
  "ui-18-solid-bold": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0,
    weight: 700,
  },
  "shop-stamp": { face: "ui", size: 18, lineHeight: 18, letterSpacing: 1 },
  "shop-stamp-note": {
    face: "ui",
    size: 13,
    lineHeight: 13.640625,
    letterSpacing: 0,
  },
  "ui-13-bold": {
    face: "ui",
    size: 13,
    lineHeight: 16.890625,
    letterSpacing: 0,
    weight: 700,
  },
  "mono-15-bold-solid": {
    face: "mono",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0,
    weight: 700,
  },
  "mono-20-solid": { face: "mono", size: 20, lineHeight: 20, letterSpacing: 0 },
  "mono-28-solid": { face: "mono", size: 28, lineHeight: 28, letterSpacing: 0 },
  // Blackjack's table lettering, set solid in rem-sized type.
  "bj-label": {
    face: "ui",
    size: 12.48,
    lineHeight: 12.48,
    letterSpacing: 1,
    case: "upper",
  },
  "bj-amount": {
    face: "mono",
    size: 16.8,
    lineHeight: 16.8,
    letterSpacing: 0,
  },
  "bj-prompt": {
    face: "ui",
    size: 13.6,
    lineHeight: 13.6,
    letterSpacing: 3,
    case: "upper",
  },
  "bj-chip": {
    face: "mono",
    size: 17.6,
    lineHeight: 17.6,
    letterSpacing: 0,
  },
  "bj-seat": {
    face: "ui",
    size: 12,
    lineHeight: 16,
    letterSpacing: 1.5,
    case: "upper",
  },
  "bj-total": {
    face: "mono",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0,
  },
  "bj-bet": {
    face: "mono",
    size: 12.48,
    lineHeight: 12.48,
    letterSpacing: 0.5,
  },
  "bj-result": {
    face: "ui",
    size: 12.48,
    lineHeight: 12.48,
    letterSpacing: 1,
    case: "upper",
  },
  "bj-splash": {
    face: "ui",
    size: 32,
    lineHeight: 32,
    letterSpacing: 4,
    case: "upper",
  },
  "bj-status": {
    face: "ui",
    size: 13.6,
    lineHeight: 13.6,
    letterSpacing: 0,
  },
  "bj-note": {
    face: "ui",
    size: 11.2,
    lineHeight: 11.2,
    letterSpacing: 0,
    italic: true,
  },
  "bj-shortcuts": {
    face: "ui",
    size: 11.2,
    lineHeight: 11.2,
    letterSpacing: 0,
  },
  "bj-stake": {
    face: "mono",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0.5,
    case: "upper",
  },
  "bj-deal": {
    face: "ui",
    size: 14,
    lineHeight: 14,
    letterSpacing: 2,
    case: "upper",
  },
  "bj-action": {
    face: "ui",
    size: 15,
    lineHeight: 15,
    letterSpacing: 0.5,
    case: "upper",
  },
  "bj-action-big": {
    face: "ui",
    size: 15,
    lineHeight: 15,
    letterSpacing: 2,
    case: "upper",
  },
  "ui-14-italic": {
    face: "ui",
    size: 14,
    lineHeight: 21,
    letterSpacing: 0,
    italic: true,
  },
  // The design catalog's page: its prose and captions, 1.5 lines; its
  // headings in caps; its table of contents.
  "ui-13-loose": { face: "ui", size: 13, lineHeight: 19.5, letterSpacing: 0 },
  "mono-12-loose": { face: "mono", size: 12, lineHeight: 18, letterSpacing: 0 },
  "ui-18-caps-solid": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0.5,
    case: "upper",
  },
  "ui-16-caps-solid": {
    face: "ui",
    size: 16,
    lineHeight: 16,
    letterSpacing: 0.5,
    case: "upper",
  },
  "ui-13-index": {
    face: "ui",
    size: 13,
    lineHeight: 17.546875,
    letterSpacing: 0,
  },
  "bold-pixels-20": {
    face: "bold-pixels",
    size: 20,
    lineHeight: 24,
    letterSpacing: 0,
  },
  // The catalog's type specimens: the display face, the mono at its sizes,
  // and the small serif at its thin cut (the counter-example).
  "bold-pixels-32-solid": {
    face: "bold-pixels",
    size: 32,
    lineHeight: 32,
    letterSpacing: 0,
  },
  "mono-18-solid": { face: "mono", size: 18, lineHeight: 18, letterSpacing: 0 },
  "mono-10-solid": { face: "mono", size: 10, lineHeight: 10, letterSpacing: 0 },
  "serif-13-thin-solid": {
    face: "serif",
    size: 13,
    lineHeight: 13,
    letterSpacing: 0,
    weight: 100,
  },
  // A code run in 1.4-line prose.
  "mono-12-relaxed": {
    face: "mono",
    size: 12,
    lineHeight: 16.796875,
    letterSpacing: 0,
  },
  // The catalog's bulleted lists: 1.7 lines, and a code run inside one.
  "ui-15-list": { face: "ui", size: 15, lineHeight: 25.5, letterSpacing: 0 },
  "mono-12-list": {
    face: "mono",
    size: 12,
    lineHeight: 20.4,
    letterSpacing: 0,
  },
  // The catalog's contract: its guard badges, and its canonical text at 1.6.
  "mono-11-caps-loose": {
    face: "mono",
    size: 11,
    lineHeight: 16.5,
    letterSpacing: 0.5,
    case: "upper",
  },
  "mono-11-listing": {
    face: "mono",
    size: 11,
    lineHeight: 17.6,
    letterSpacing: 0,
  },
  // The kit's data display: the attention badge's figure.
  "ui-10-solid": { face: "ui", size: 10, lineHeight: 10, letterSpacing: 0 },
  // A colour key on the city: its title, and its rows at 1.2.
  "ui-14-caps-spaced-solid": {
    face: "ui",
    size: 14,
    lineHeight: 14,
    letterSpacing: 0.8,
    case: "upper",
  },
  "ui-13-legend": {
    face: "ui",
    size: 13,
    lineHeight: 15.59375,
    letterSpacing: 0,
  },
  // Ransomware's corrupted text, at 0.9 of the 18px text it replaces and a
  // 1.2 line; GlitchText scales it to the line it stands in.
  // A pie's key: each share's percentage in the data face, at 1.2.
  "mono-13-legend": {
    face: "mono",
    size: 13,
    lineHeight: 15.59375,
    letterSpacing: 0,
  },
  // A chart's axis figures on their 12px line, and its time labels.
  "mono-10-axis": { face: "mono", size: 10, lineHeight: 12, letterSpacing: 0 },
  "mono-9-axis": { face: "mono", size: 9, lineHeight: 14, letterSpacing: 0 },
  // A meter's reading beside its track in a header line, at 1.25.
  "ui-14-figures-snug": {
    face: "ui",
    size: 14,
    lineHeight: 17.5,
    letterSpacing: 0,
    figures: "tabular",
  },
  // A stat list's figures and its column labels at 1.2.
  "mono-12-figures-solid": {
    face: "mono",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0,
    figures: "tabular",
  },
  "ui-12-label": {
    face: "ui",
    size: 12,
    lineHeight: 14.390625,
    letterSpacing: 0,
  },
  // Readouts: a section's title, its cadence chip, a tile's label and figure,
  // a headline figure, and the stamps' words and step glyphs.
  "ui-16-caps-tight": {
    face: "ui",
    size: 16,
    lineHeight: 17.59375,
    letterSpacing: 0.5,
    case: "upper",
  },
  "ui-11-caps": {
    face: "ui",
    size: 11,
    lineHeight: 14.296875,
    letterSpacing: 0.5,
    case: "upper",
  },
  "ui-12-caps-label": {
    face: "ui",
    size: 12,
    lineHeight: 14.390625,
    letterSpacing: 0.5,
    case: "upper",
  },
  "ui-26-figures-tight": {
    face: "ui",
    size: 26,
    lineHeight: 28.59375,
    letterSpacing: 0,
    figures: "tabular",
  },
  "ui-18-figures-tight": {
    face: "ui",
    size: 18,
    lineHeight: 19.796875,
    letterSpacing: 0,
    figures: "tabular",
  },
  "mono-26-figures-solid": {
    face: "mono",
    size: 26,
    lineHeight: 26,
    letterSpacing: 0,
    figures: "tabular",
  },
  "ui-12-caps-snug": {
    face: "ui",
    size: 12,
    lineHeight: 15,
    letterSpacing: 0.5,
    case: "upper",
  },
  "ui-14-upper-solid": {
    face: "ui",
    size: 14,
    lineHeight: 14,
    letterSpacing: 0,
    case: "upper",
  },
  // The inspector card's figures and its stamp, on the card's 16.8px line.
  "ui-12-card": { face: "ui", size: 12, lineHeight: 16.8, letterSpacing: 0 },
  "ui-11-caps-card": {
    face: "ui",
    size: 11,
    lineHeight: 16.8,
    letterSpacing: 0.5,
    case: "upper",
  },
  // 0.85em of the body's 18, on a 1.2 line floored to the layout unit.
  "ui-15.3": { face: "ui", size: 15.3, lineHeight: 18.34375, letterSpacing: 0 },
  "ui-16-caps-wide-solid": {
    face: "ui",
    size: 16,
    lineHeight: 16,
    letterSpacing: 1,
    case: "upper",
  },
  "ui-12-tracked-solid": {
    face: "ui",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0.5,
  },
  "ui-18-figures-solid": {
    face: "ui",
    size: 18,
    lineHeight: 18,
    letterSpacing: 0,
    figures: "tabular",
  },
  // An instrument's title at its 1.3 line, and a stat list's note at 1.3,
  // in the figures of the reading it sits under.
  "ui-14-caps-heading": {
    face: "ui",
    size: 14,
    lineHeight: 18.1875,
    letterSpacing: 1,
    case: "upper",
  },
  "ui-12-note": {
    face: "ui",
    size: 12,
    lineHeight: 15.59375,
    letterSpacing: 0,
    figures: "tabular",
  },
  // An instrument's score heading beside its badge, set solid.
  "ui-14-caps-title-solid": {
    face: "ui",
    size: 14,
    lineHeight: 14,
    letterSpacing: 1,
    case: "upper",
  },
  "ui-22-spaced-solid": {
    face: "ui",
    size: 22,
    lineHeight: 22,
    letterSpacing: 0.5,
  },
  "ui-14-caps-solid": {
    face: "ui",
    size: 14,
    lineHeight: 14,
    letterSpacing: 0.5,
    case: "upper",
  },
  "mono-12-upper-solid": {
    face: "mono",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0,
    case: "upper",
  },
  // `caption`: a 1.35 line, which the layout floors to its 1/64 px unit.
  "ui-14-caption": {
    face: "ui",
    size: 14,
    lineHeight: 18.890625,
    letterSpacing: 0,
  },
  "ui-12-caption-floored": {
    face: "ui",
    size: 12,
    lineHeight: 16.1875,
    letterSpacing: 0,
  },
  // A terminal's 1.7 line, floored to the layout unit.
  "mono-12-terminal": {
    face: "mono",
    size: 12,
    lineHeight: 20.390625,
    letterSpacing: 0,
  },
  "ui-12-solid-caps": {
    face: "ui",
    size: 12,
    lineHeight: 12,
    letterSpacing: 0,
    case: "upper",
  },
  "mono-22-upper-solid": {
    face: "mono",
    size: 22,
    lineHeight: 22,
    letterSpacing: 0,
    case: "upper",
  },
  // A triage lane's count of patients: mono figures at 22.
  "mono-22-figures-solid": {
    face: "mono",
    size: 22,
    lineHeight: 22,
    letterSpacing: 0,
    figures: "tabular",
  },
  "glitch-16.2": {
    face: "glitch",
    size: 16.2,
    lineHeight: 19.4375,
    letterSpacing: 0,
  },
  // The census deck: a slide's serif and its small sans, 1.4 lines (floored
  // to the 1/64 px layout unit), titles 1.15.
  "serif-30-bold-tight": {
    face: "serif",
    size: 30,
    lineHeight: 34.5,
    letterSpacing: 0,
    weight: 700,
  },
  "serif-36-bold-tight": {
    face: "serif",
    size: 36,
    lineHeight: 41.390625,
    letterSpacing: 0,
    weight: 700,
  },
  "serif-25-bold-tight": {
    face: "serif",
    size: 25,
    lineHeight: 28.75,
    letterSpacing: 0,
    weight: 700,
  },
  "serif-48-bold-italic-tight": {
    face: "serif",
    size: 48,
    lineHeight: 55.1875,
    letterSpacing: 0,
    weight: 700,
    italic: true,
  },
  "serif-12-prose": {
    face: "serif",
    size: 12,
    lineHeight: 16.796875,
    letterSpacing: 0,
  },
  "serif-13-prose": {
    face: "serif",
    size: 13,
    lineHeight: 18.1875,
    letterSpacing: 0,
  },
  "serif-14-prose": {
    face: "serif",
    size: 14,
    lineHeight: 19.59375,
    letterSpacing: 0,
  },
  "serif-18-prose": {
    face: "serif",
    size: 18,
    lineHeight: 25.1875,
    letterSpacing: 0,
  },
  "serif-20-prose": {
    face: "serif",
    size: 20,
    lineHeight: 28,
    letterSpacing: 0,
  },
  "serif-26-prose": {
    face: "serif",
    size: 26,
    lineHeight: 36.390625,
    letterSpacing: 0,
  },
  "serif-15": { face: "serif", size: 15, lineHeight: 19.5, letterSpacing: 0 },
  "serif-16-semibold-prose": {
    face: "serif",
    size: 16,
    lineHeight: 22.390625,
    letterSpacing: 0,
    weight: 600,
  },
  "serif-17-semibold-prose": {
    face: "serif",
    size: 17,
    lineHeight: 23.796875,
    letterSpacing: 0,
    weight: 600,
  },
  "serif-20-semibold-prose": {
    face: "serif",
    size: 20,
    lineHeight: 28,
    letterSpacing: 0,
    weight: 600,
  },
  "small-12-prose": {
    face: "small",
    size: 12,
    lineHeight: 16.796875,
    letterSpacing: 0,
  },
  "small-13-prose": {
    face: "small",
    size: 13,
    lineHeight: 18.1875,
    letterSpacing: 0,
  },
  "small-14-prose": {
    face: "small",
    size: 14,
    lineHeight: 19.59375,
    letterSpacing: 0,
  },
  "small-15-prose": {
    face: "small",
    size: 15,
    lineHeight: 21,
    letterSpacing: 0,
  },
  "small-12-snug": {
    face: "small",
    size: 12,
    lineHeight: 15,
    letterSpacing: 0,
  },
  "small-13-figures-prose": {
    face: "small",
    size: 13,
    lineHeight: 18.1875,
    letterSpacing: 0,
    figures: "tabular",
  },
  "small-15-figures-prose": {
    face: "small",
    size: 15,
    lineHeight: 21,
    letterSpacing: 0,
    figures: "tabular",
  },
  "small-18-figures-prose": {
    face: "small",
    size: 18,
    lineHeight: 25.1875,
    letterSpacing: 0,
    figures: "tabular",
  },
  "small-21-figures-prose": {
    face: "small",
    size: 21,
    lineHeight: 29.390625,
    letterSpacing: 0,
    figures: "tabular",
  },
} as const satisfies Record<string, TypeMetrics>;
export type TypeStyleName = keyof typeof TYPE_METRICS;

export interface TypeStyle {
  face: string;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  wordSpacing: number;
  weight: number;
  italic: boolean;
  case: "none" | "upper" | "lower" | "capitalize";
  shadow: TypeMetrics["shadow"] | null;
  halo: TypeMetrics["halo"] | null;
  figures: "proportional" | "tabular";
  underline: TypeMetrics["underline"] | null;
}

type Language =
  | "de"
  | "en"
  | "es"
  | "fi"
  | "fr"
  | "it"
  | "ja"
  | "ko"
  | "nl"
  | "pl"
  | "pt"
  | "ru"
  | "tr"
  | "uk"
  | "zh"
  | "zh-TW";

function faceFor(language: Language, role: FaceRole): string {
  const overrides: Partial<Record<FaceRole, readonly string[]>> =
    language in FONT_FAMILIES
      ? FONT_FAMILIES[language as keyof typeof FONT_FAMILIES]
      : {};
  const stack = overrides[role] ?? FONT_FAMILIES.default[role];
  return (stack[0] ?? "").replaceAll('"', "");
}

function typeStyles(language: Language): Record<TypeStyleName, TypeStyle> {
  const styles = {} as Record<TypeStyleName, TypeStyle>;
  for (const name of Object.keys(TYPE_METRICS) as TypeStyleName[]) {
    const metrics: TypeMetrics = TYPE_METRICS[name];
    const face = faceFor(language, metrics.face);
    const languageLineHeight = language === "ja" || language === "ko" ||
        language === "zh" || language === "zh-TW"
      ? metrics.languageLineHeights?.[language]
      : undefined;
    styles[name] = {
      face,
      size: metrics.size,
      lineHeight: languageLineHeight ?? metrics.lineHeight,
      letterSpacing: metrics.letterSpacing,
      wordSpacing: metrics.wordSpacing ?? 0,
      weight: face === "Sofia Sans" ? 600 : metrics.weight ?? 400,
      italic: metrics.italic ?? false,
      case: metrics.case ?? "none",
      shadow: metrics.shadow ?? null,
      halo: metrics.halo ?? null,
      figures: metrics.figures ?? "proportional",
      underline: metrics.underline ?? null,
    };
  }
  return styles;
}

/** What the native host draws per language. */
export const TYPOGRAPHY = {
  de: typeStyles("de"),
  en: typeStyles("en"),
  es: typeStyles("es"),
  fi: typeStyles("fi"),
  fr: typeStyles("fr"),
  it: typeStyles("it"),
  ja: typeStyles("ja"),
  ko: typeStyles("ko"),
  nl: typeStyles("nl"),
  pl: typeStyles("pl"),
  pt: typeStyles("pt"),
  ru: typeStyles("ru"),
  tr: typeStyles("tr"),
  uk: typeStyles("uk"),
  zh: typeStyles("zh"),
  "zh-TW": typeStyles("zh-TW"),
} as const;

/** Shared durations in milliseconds: `snap` for a key latching or a box
 *  appearing, `fill` for a meter reaching its figure. */
export const TEMPOS = { snap: 120, fill: 240 } as const;

export interface AnimationFrame {
  at: readonly number[];
  scale?: number;
  scaleX?: number;
  translateXPercent?: number;
  translateYPercent?: number;
  /** A nudge in pixels and a tilt in degrees, together one transform. */
  translateX?: number;
  translateY?: number;
  rotateDeg?: number;
  widthPercent?: number;
  opacity?: number;
  /** Shown or hidden: a frame of a flip-book, which no compositor layer
   *  carries, so the content painted after it rasterizes as it would still. */
  shown?: boolean;
  fill?: ThemeInk;
  /** The text's ink. */
  ink?: ThemeInk | PaletteInk;
  /** Out of sight and out of reach of the pointer and focus. */
  hidden?: boolean;
  /** The attention ring's colours, stepped through the palette: an outline,
   *  and a 2px inset ring, optionally over a recipe. */
  outlineColor?: PaletteInk;
  ringColor?: PaletteInk;
  ringOver?: Recipe;
}

/** How an animation moves between its frames: the usual timing functions. */
export type AnimationEasing =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | { steps: number; jumpNone?: true }
  | { bezier: readonly [number, number, number, number] };

/**
 * An animation that moves: its frames (`at` in percent of a cycle) and how
 * it plays them. Bureau reads it from the token document as it is.
 */
export interface TweenRecord {
  /** One cycle; a `tempo` names a shared duration instead. */
  durationMs?: number;
  tempo?: keyof typeof TEMPOS;
  easing: AnimationEasing;
  repeat?: "forever";
  /** Every other cycle runs backwards. */
  alternate?: true;
  delayMs?: number;
  /** Which end's frame holds before the start and after the end. */
  fill?: "forwards" | "backwards" | "both";
  /** The moment shown under reduced motion, when not the end of a
   * play-once animation that fills forwards, nor the box at rest. */
  stillAtMs?: number;
  /** While the pointer, keyboard focus or the pad is on the box: `stop`
   * shows it at rest and starts over after, `pause` holds where it is. */
  whileHovered?: "stop" | "pause";
  frames: readonly AnimationFrame[];
}

/** A moment of a hold: the values that jump in `atMs` into the cycle. */
export type HoldMoment = { atMs: number } & Omit<AnimationFrame, "at">;

/**
 * An animation that jumps: blinks, lamps and steps. Each value holds from
 * its moment until the next moment that sets it, round a repeating cycle.
 */
export interface HoldRecord {
  cycleMs: number;
  repeat: "forever";
  hold: readonly HoldMoment[];
  /** The moment shown under reduced motion, else the box at rest. */
  stillAtMs?: number;
}

export type AnimationRecord = TweenRecord | HoldRecord;

export const ANIMATIONS = {
  // A quiet periodic shake that invites a visit without moving focus: most of
  // the cycle is still, then a short shake.
  "bureau-attention-shake": {
    durationMs: 2800,
    easing: "ease-in-out",
    repeat: "forever",
    whileHovered: "pause",
    frames: [
      { at: [0, 72, 100], translateX: 0, rotateDeg: 0 },
      { at: [76], translateX: -2, rotateDeg: -5 },
      { at: [80], translateX: 2, rotateDeg: 5 },
      { at: [84], translateX: -2, rotateDeg: -3 },
      { at: [88], translateX: 1, rotateDeg: 2 },
      { at: [92], translateX: 0, rotateDeg: 0 },
    ],
  },
  // A new control's ring cycling the rainbow, every frame a DB32 colour.
  "bureau-attention-rainbow": {
    cycleMs: 1400,
    repeat: "forever",
    hold: [
      { atMs: 0, outlineColor: "db32-orange-burnt" },
      { atMs: 196, outlineColor: "db32-yellow-bright" },
      { atMs: 392, outlineColor: "db32-green-lime" },
      { atMs: 588, outlineColor: "db32-cyan-bright" },
      { atMs: 784, outlineColor: "db32-blue-sky" },
      { atMs: 980, outlineColor: "db32-purple" },
      { atMs: 1176, outlineColor: "db32-pink" },
    ],
  },
  // The same ring round a group (a slider and its reading), drawn as a 2px
  // inset ring over the group's padding.
  "bureau-attention-rainbow-framed": {
    cycleMs: 1400,
    repeat: "forever",
    hold: [
      {
        atMs: 0,
        outlineColor: "db32-orange-burnt",
        ringColor: "db32-red-pink",
      },
      {
        atMs: 196,
        outlineColor: "db32-yellow-bright",
        ringColor: "db32-orange-burnt",
      },
      {
        atMs: 392,
        outlineColor: "db32-green-lime",
        ringColor: "db32-yellow-bright",
      },
      {
        atMs: 588,
        outlineColor: "db32-cyan-bright",
        ringColor: "db32-green-lime",
      },
      {
        atMs: 784,
        outlineColor: "db32-blue-sky",
        ringColor: "db32-cyan-bright",
      },
      { atMs: 980, outlineColor: "db32-purple", ringColor: "db32-blue-sky" },
      { atMs: 1176, outlineColor: "db32-pink", ringColor: "db32-purple" },
    ],
  },
  // And round a field, its well bevel moved inside the ring.
  "bureau-attention-rainbow-field": {
    cycleMs: 1400,
    repeat: "forever",
    hold: [
      {
        atMs: 0,
        outlineColor: "db32-orange-burnt",
        ringColor: "db32-red-pink",
        ringOver: "well-framed",
      },
      {
        atMs: 196,
        outlineColor: "db32-yellow-bright",
        ringColor: "db32-orange-burnt",
      },
      {
        atMs: 392,
        outlineColor: "db32-green-lime",
        ringColor: "db32-yellow-bright",
      },
      {
        atMs: 588,
        outlineColor: "db32-cyan-bright",
        ringColor: "db32-green-lime",
      },
      {
        atMs: 784,
        outlineColor: "db32-blue-sky",
        ringColor: "db32-cyan-bright",
      },
      { atMs: 980, outlineColor: "db32-purple", ringColor: "db32-blue-sky" },
      { atMs: 1176, outlineColor: "db32-pink", ringColor: "db32-purple" },
    ],
  },
  // A compromised letter's twitch: still, then a jump of a pixel or two.
  "bureau-glitch-jitter": {
    cycleMs: 1400,
    repeat: "forever",
    hold: [
      { atMs: 0, translateX: 0, translateY: 0 },
      { atMs: 126, translateX: -0.5 },
      { atMs: 252, translateX: -1 },
      { atMs: 273, translateX: 0.5, translateY: -0.5 },
      { atMs: 294, translateX: 2, translateY: -1 },
      { atMs: 308, translateX: 1, translateY: -0.5 },
      { atMs: 322, translateX: 0, translateY: 0 },
      { atMs: 595, translateX: -1, translateY: 0.5 },
      { atMs: 868, translateX: -2, translateY: 1 },
      { atMs: 889, translateX: -0.5, translateY: 0.5 },
      { atMs: 910, translateX: 1, translateY: 0 },
      { atMs: 1155, translateX: 0.5 },
    ],
  },
  "bureau-hold-fill": {
    tempo: "fill",
    easing: "linear",
    fill: "forwards",
    frames: [{ at: [100], scaleX: 1 }],
  },
  "bureau-keycap-blink": {
    cycleMs: 480,
    repeat: "forever",
    hold: [
      { atMs: 0, fill: "paper" },
      { atMs: 240, fill: "goal" },
    ],
  },
  "bureau-lamp-blink": {
    cycleMs: 1000,
    repeat: "forever",
    hold: [
      { atMs: 0, opacity: 1 },
      { atMs: 250, opacity: 0.3 },
      { atMs: 750, opacity: 1 },
    ],
  },
  "bureau-lamp-blink-fast": {
    cycleMs: 600,
    repeat: "forever",
    hold: [
      { atMs: 0, opacity: 1 },
      { atMs: 150, opacity: 0.3 },
      { atMs: 450, opacity: 1 },
    ],
  },
  "bureau-cursor-blink": {
    cycleMs: 1000,
    repeat: "forever",
    hold: [
      { atMs: 0, opacity: 1 },
      { atMs: 250, opacity: 0 },
      { atMs: 750, opacity: 1 },
    ],
  },
  // A heart monitor's trace scrolling one complex (70px) a period.
  "bureau-ecg-scroll": {
    durationMs: 1600,
    easing: { steps: 35 },
    repeat: "forever",
    frames: [{ at: [100], translateX: -70 }],
  },
  // Steam off a cup, as a flip-book of two frames: the puff at rest for the
  // first and last quarters of the beat, risen and faded between.
  "bureau-steam-rest": {
    cycleMs: 1600,
    repeat: "forever",
    hold: [
      { atMs: 0, shown: true },
      { atMs: 400, shown: false },
      { atMs: 1200, shown: true },
    ],
  },
  "bureau-steam-risen": {
    cycleMs: 1600,
    repeat: "forever",
    hold: [
      { atMs: 0, shown: false },
      { atMs: 400, shown: true },
      { atMs: 1200, shown: false },
    ],
  },
  // A flip-book of six frames stacked in one place (FlipBook): each is
  // shown for the first sixth of the beat, and each starts a sixth later. The
  // lead frame, which sizes the book, alone stays under reduced motion.
  "bureau-flip-sixth": {
    cycleMs: 600,
    repeat: "forever",
    // Under reduced motion only the lead frame shows.
    stillAtMs: 100,
    hold: [
      { atMs: 0, shown: true },
      { atMs: 100, shown: false },
    ],
  },
  "bureau-flip-sixth-lead": {
    cycleMs: 600,
    repeat: "forever",
    hold: [
      { atMs: 0, shown: true },
      { atMs: 100, shown: false },
    ],
  },
  // "+1" rising off a key and fading: linear, the fill tempo.
  "bureau-float-up": {
    durationMs: 1200,
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0], opacity: 1, translateY: 0 },
      { at: [50], opacity: 1, translateY: -20 },
      { at: [100], opacity: 0, translateY: -35 },
    ],
  },
  "bureau-messagebox-appear": {
    tempo: "snap",
    easing: { steps: 1 },
    frames: [
      { at: [0], scale: 0.9, opacity: 0 },
      { at: [100], scale: 1, opacity: 1 },
    ],
  },
  "bureau-pop": {
    tempo: "snap",
    easing: { steps: 1 },
    frames: [{ at: [0], scale: 1.18 }],
  },
  "bureau-saving-fill": {
    durationMs: 800,
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0], widthPercent: 0 },
      { at: [100], widthPercent: 100 },
    ],
  },
  "bureau-saving-pending": {
    durationMs: 1200,
    easing: "ease-in-out",
    repeat: "forever",
    alternate: true,
    frames: [
      { at: [0], translateXPercent: 0 },
      { at: [100], translateXPercent: 185 },
    ],
  },
  "glitch-scan": {
    durationMs: 2000,
    easing: "linear",
    repeat: "forever",
    frames: [
      { at: [0], translateYPercent: -100 },
      { at: [100], translateYPercent: 100 },
    ],
  },
  "bureau-curtain-darken": {
    durationMs: 200,
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0], opacity: 0 },
      { at: [100], opacity: 1 },
    ],
  },
  "bureau-curtain-lighten": {
    durationMs: 200,
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0], opacity: 1 },
      { at: [100], opacity: 0 },
    ],
  },
  // Leaving a city: the screen goes black under the watch (FADE_TO_BLACK_MS).
  "bureau-fade-to-black": {
    durationMs: 1000,
    easing: "ease-in",
    fill: "both",
    frames: [
      { at: [0], opacity: 0 },
      { at: [100], opacity: 1 },
    ],
  },
  "bureau-boot-fade-in": {
    durationMs: 300,
    easing: "ease-in",
    delayMs: 1000,
    fill: "both",
    frames: [
      { at: [0], opacity: 0 },
      { at: [100], opacity: 1 },
    ],
  },
  // The title city fades in from black once it has drawn, holding a moment
  // so the fade plays over a city already running smoothly.
  "bureau-city-reveal": {
    durationMs: 1200,
    easing: "ease-out",
    delayMs: 300,
    fill: "both",
    frames: [
      { at: [0], opacity: 1 },
      { at: [100], opacity: 0 },
    ],
  },
  // Unread mail hops: two frames, the way a sprite would.
  "bureau-hop": {
    cycleMs: 1000,
    repeat: "forever",
    hold: [
      { atMs: 0, translateY: 0 },
      { atMs: 500, translateY: -10 },
    ],
  },
  "bureau-appear": {
    tempo: "snap",
    easing: { steps: 1 },
    frames: [{ at: [0], opacity: 0 }, { at: [100], opacity: 1 }],
  },
  // A ringing receiver rattles twice, then rests for half a beat.
  "bureau-ring": {
    durationMs: 1000,
    easing: "linear",
    repeat: "forever",
    frames: [
      { at: [0, 100], rotateDeg: 0 },
      { at: [10, 30], rotateDeg: -10 },
      { at: [20, 40], rotateDeg: 10 },
      { at: [50], rotateDeg: 0 },
    ],
  },
  // A parcel rattled while it is being opened, its swing dying away.
  "bureau-shake": {
    durationMs: 500,
    easing: "ease-in-out",
    repeat: "forever",
    frames: [
      { at: [0, 100], translateX: 0, rotateDeg: 0 },
      { at: [10, 30], translateX: -8, rotateDeg: -3 },
      { at: [20, 40], translateX: 8, rotateDeg: 3 },
      { at: [50], translateX: -6, rotateDeg: -2 },
      { at: [60], translateX: 6, rotateDeg: 2 },
      { at: [70], translateX: -4, rotateDeg: -1 },
      { at: [80], translateX: 4, rotateDeg: 1 },
      { at: [90], translateX: -2, rotateDeg: -0.5 },
    ],
  },
  // Up from small, a touch past full size, and settled.
  "bureau-spring-in": {
    durationMs: 520,
    easing: { bezier: [0.2, 0.9, 0.3, 1.25] },
    fill: "both",
    frames: [
      { at: [0], opacity: 0, translateY: 24, scale: 0.3 },
      { at: [60], opacity: 1 },
      { at: [100], opacity: 1, translateY: 0, scale: 1 },
    ],
  },
  // Blackjack's diegetic motion: cards, chips and results, eased like a toy.
  "bureau-deal-in": {
    durationMs: 360,
    easing: { bezier: [0.34, 1.56, 0.64, 1] },
    fill: "backwards",
    frames: [
      { at: [0], translateX: 220, translateY: -90, rotateDeg: 35, opacity: 0 },
      { at: [60], opacity: 1 },
      { at: [100], translateX: 0, translateY: 0, rotateDeg: 0, opacity: 1 },
    ],
  },
  "bureau-bounce": {
    durationMs: 600,
    easing: { bezier: [0.18, 1.6, 0.5, 1] },
    frames: [
      { at: [0], translateY: 0 },
      { at: [35], translateY: -8 },
      { at: [70], translateY: -1 },
      { at: [100], translateY: 0 },
    ],
  },
  "bureau-shudder": {
    durationMs: 500,
    easing: { bezier: [0.34, 1.56, 0.64, 1] },
    frames: [
      { at: [0], translateX: 0 },
      { at: [20], translateX: -5 },
      { at: [40], translateX: 5 },
      { at: [60], translateX: -3 },
      { at: [80], translateX: 3 },
      { at: [100], translateX: 0 },
    ],
  },
  "bureau-swell": {
    durationMs: 400,
    easing: { bezier: [0.34, 1.56, 0.64, 1] },
    frames: [
      { at: [0], scale: 1 },
      { at: [40], scale: 1.4 },
      { at: [100], scale: 1 },
    ],
  },
  // Scale then translateY(8px) is translateY(3.2px) then scale.
  "bureau-pop-in": {
    durationMs: 500,
    easing: { bezier: [0.18, 1.6, 0.5, 1] },
    frames: [
      { at: [0], translateY: 3.2, scale: 0.4, opacity: 0 },
      { at: [60], translateY: -2.5, scale: 1.25, opacity: 1 },
      { at: [100], translateY: 0, scale: 1, opacity: 1 },
    ],
  },
  "bureau-chip-in": {
    durationMs: 320,
    easing: { bezier: [0.34, 1.56, 0.64, 1] },
    frames: [
      { at: [0], rotateDeg: -12, scale: 0.5, opacity: 0 },
      { at: [100], rotateDeg: 0, scale: 1, opacity: 1 },
    ],
  },
  "bureau-splash": {
    durationMs: 1600,
    easing: { bezier: [0.18, 1.6, 0.5, 1] },
    fill: "forwards",
    frames: [
      { at: [0], rotateDeg: -18, scale: 0.2, opacity: 0 },
      { at: [18], rotateDeg: -8, scale: 1.3, opacity: 1 },
      { at: [35], rotateDeg: -2, scale: 1 },
      { at: [60], rotateDeg: 0, scale: 1, opacity: 1 },
      { at: [100], rotateDeg: 0, scale: 0.95, opacity: 0 },
    ],
  },
  "bureau-flash-good": {
    durationMs: 380,
    easing: { steps: 1 },
    frames: [{ at: [0, 100], ink: "ink-good" }],
  },
  "bureau-flash-bad": {
    durationMs: 380,
    easing: { steps: 1 },
    frames: [{ at: [0, 100], ink: "ink-bad" }],
  },
  "bureau-rise-in": {
    durationMs: 320,
    easing: "ease-out",
    delayMs: 360,
    fill: "both",
    frames: [
      { at: [0], opacity: 0, translateY: 10 },
      { at: [100], opacity: 1, translateY: 0 },
    ],
  },
  // A figure that rose or fell flashes its verdict, then settles to ink.
  "bureau-flash-increase": {
    durationMs: 1000,
    easing: { steps: 6, jumpNone: true },
    frames: [
      { at: [0], ink: "ink-neutral" },
      { at: [15, 30], ink: "ink-good" },
      { at: [100], ink: "ink" },
    ],
  },
  "bureau-flash-decrease": {
    durationMs: 1000,
    easing: { steps: 6, jumpNone: true },
    frames: [
      { at: [0], ink: "ink-neutral" },
      { at: [15, 30], ink: "ink-bad" },
      { at: [100], ink: "ink" },
    ],
  },
  // The term label pulses through the year before an election.
  "bureau-term-pulse": {
    cycleMs: 1400,
    repeat: "forever",
    hold: [
      { atMs: 0, opacity: 1 },
      { atMs: 350, opacity: 0.55 },
      { atMs: 1050, opacity: 1 },
    ],
  },
  // The paused and fast-forward lamps beside the city's name.
  "bureau-pause-blink": {
    cycleMs: 1000,
    repeat: "forever",
    hold: [
      { atMs: 0, opacity: 1 },
      { atMs: 500, opacity: 0 },
    ],
  },
  "bureau-fast-blink": {
    cycleMs: 400,
    repeat: "forever",
    hold: [
      { atMs: 0, opacity: 1 },
      { atMs: 200, opacity: 0 },
    ],
  },
  // The incident dice rolling.
  "bureau-incident-roll": {
    cycleMs: 100,
    repeat: "forever",
    hold: [
      { atMs: 0, scale: 1 },
      { atMs: 25, scale: 1.05 },
      { atMs: 75, scale: 1 },
    ],
  },
  // The dock slides off the bottom edge under an inspection, then hides.
  "bureau-dock-hide": {
    tempo: "fill",
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0], translateYPercent: 0, translateY: 0 },
      { at: [100], translateYPercent: 100, translateY: 16, hidden: true },
    ],
  },
  // Already away when it first appears.
  "bureau-dock-away": {
    durationMs: 0,
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0, 100], translateYPercent: 100, translateY: 16, hidden: true },
    ],
  },
  "bureau-dock-show": {
    tempo: "fill",
    easing: "linear",
    frames: [
      { at: [0], translateYPercent: 100, translateY: 16 },
      { at: [100], translateYPercent: 0, translateY: 0 },
    ],
  },
  // A wrapped gift shakes its drawer in the last moments of a 30s loop.
  "bureau-gift-shake": {
    durationMs: 30000,
    easing: "linear",
    repeat: "forever",
    whileHovered: "stop",
    frames: [
      { at: [0, 94, 100], translateX: 0, rotateDeg: 0 },
      { at: [95], translateX: -2, rotateDeg: -8 },
      { at: [96], translateX: 2, rotateDeg: 8 },
      { at: [97], translateX: -2, rotateDeg: -6 },
      { at: [98], translateX: 1, rotateDeg: 4 },
      { at: [99], translateX: -1, rotateDeg: -2 },
    ],
  },
  // A toast slides in from the right edge and back out; swiped, it leaves
  // upward, the way the finger pushed it.
  "bureau-toast-in": {
    tempo: "fill",
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0], translateXPercent: 100, translateX: 16 },
      { at: [100], translateXPercent: 0, translateX: 0 },
    ],
  },
  "bureau-toast-out": {
    tempo: "snap",
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0], translateXPercent: 0, translateX: 0 },
      { at: [100], translateXPercent: 100, translateX: 16 },
    ],
  },
  "bureau-toast-swipe": {
    tempo: "snap",
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0], translateYPercent: 0, translateY: 0 },
      { at: [100], translateYPercent: -100, translateY: -96 },
    ],
  },
  // Held, not played: a box centred on its left edge by half its own width.
  "bureau-centre-x": {
    durationMs: 0,
    easing: "linear",
    fill: "forwards",
    frames: [{ at: [0, 100], translateXPercent: -50 }],
  },
  // The inspector card rises from below the edge and sinks back.
  "bureau-card-rise": {
    tempo: "snap",
    easing: "linear",
    frames: [
      { at: [0], translateYPercent: 100, translateY: 10 },
      { at: [100], translateYPercent: 0, translateY: 0 },
    ],
  },
  "bureau-card-sink": {
    tempo: "snap",
    easing: "linear",
    fill: "forwards",
    frames: [
      { at: [0], translateYPercent: 0, translateY: 0 },
      { at: [100], translateYPercent: 100, translateY: 10 },
    ],
  },
  // The tutorial's "look here" on the demand figures, on palette stops.
  "bureau-rainbow": {
    cycleMs: 3000,
    repeat: "forever",
    hold: [
      { atMs: 0, ink: "db32-red-pink" },
      { atMs: 420, ink: "db32-orange-burnt" },
      { atMs: 840, ink: "db32-yellow-bright" },
      { atMs: 1260, ink: "db32-green-lime" },
      { atMs: 1710, ink: "db32-blue-sky" },
      { atMs: 2130, ink: "db32-purple" },
      { atMs: 2550, ink: "db32-pink" },
    ],
  },
  // The same figures dancing, a demoscene wave: each glyph a box of its own,
  // a step behind the one before (`RainbowWave`), bobbing up and down as it
  // steps through the rainbow, so the wave and the colours travel along it.
  "bureau-rainbow-wave": {
    durationMs: 1400,
    easing: "ease-in-out",
    repeat: "forever",
    stillAtMs: 0,
    frames: [
      { at: [0, 50, 100], translateY: 0 },
      { at: [25], translateY: -3 },
      { at: [75], translateY: 3 },
      { at: [0], ink: "db32-red-pink" },
      { at: [14], ink: "db32-orange-burnt" },
      { at: [28], ink: "db32-yellow-bright" },
      { at: [43], ink: "db32-green-lime" },
      { at: [57], ink: "db32-blue-sky" },
      { at: [71], ink: "db32-purple" },
      { at: [86], ink: "db32-pink" },
    ],
  },
} as const satisfies Record<string, AnimationRecord>;
export type Animation = keyof typeof ANIMATIONS;

export const EFFECTS = {
  focusOffset: -4,
  // The pad's band: a yellow line centred on a black backing a pixel wider
  // each side, lining the focused box inside its edge.
  padFocus: {
    width: 3,
    color: "db32-yellow-bright",
    backing: 5,
    backingColor: "db32-black",
  },
  stipple: { size: 2 },
  // How far inside its bevel a latched key's dither starts.
  ditherInset: 3,
  // The ring round a control the player has not looked at yet: an outline
  // outside it, and in a framed one a band inside its edge. Its inks step
  // through the palette in `bureau-attention-rainbow`.
  attention: { width: 2, offset: 1, inset: 2 },
  // A Scroll's bar, the same breadth on every Scroll.
  scrollbar: 18,
  // A Field with no size of its own: a text field's box, and a slider's
  // height, which leaves its thumb room above and below the track.
  field: {
    width: 150,
    height: 32,
    rangeHeight: CONTROL_METRICS.standard.height,
  },
  // The type of words outside any Text or typed box: a field's own line, a
  // bare box's strut.
  typeStyle: "ui-14-solid" satisfies TypeStyleName,
} as const;

/**
 * The Layers' stacking order, bottom to top: a Layer later in the list
 * paints over an earlier one and takes the pointer first.
 */
export const LAYERS = [
  // The city's own names (stops, badges, streets), under every control.
  "world",
  "dock",
  "overlay",
  // A map panel pinned over the city's corner, under the top bar; the
  // HUD's corner keys and legend stand above it.
  "instrument",
  "hud",
  "top-bar",
  // Every modal's scrim: above the top bar, below the pop-ups.
  "modal",
  "popup",
  // The tutor speaks just above the pop-ups.
  "tutor",
  // Active placement controls and raised modals stand above the tutorial.
  "attention",
  // A call or a letter interrupts above any window.
  "interruption",
  "blocking",
  // Hides everything while a city loads, the HUD's highest included.
  "curtain",
] as const;

export const BUREAU_TOKENS = {
  palette: DB32,
  dithers: { ...MICRO64_DITHERS, ...CENSUS_DITHERS },
  print: PRINT,
  web: WEB,
  chart: CHART,
  metrics: TYPE_METRICS,
  chromes: CHROMES,
  bevels: BEVELS,
  patterns: PATTERNS,
  looks: LOOKS,
  faces: FONT_FACES,
  fonts: FONT_FAMILIES,
  typography: TYPOGRAPHY,
  tempos: TEMPOS,
  animations: ANIMATIONS,
  effects: EFFECTS,
  layers: LAYERS,
} as const;
