/**
 * Vector marks cut into a key, row or header. A dark inner wall and a lit
 * opposite edge give the cut its depth at every screen scale. The surface
 * material chooses the floor: muted chrome, white on a red danger key, or the
 * good tone's green.
 *
 * Button owns placement and input through its `mark` prop. A standalone
 * Mark adds neither a key face nor a hit target. Directional marks are
 * triangles; the music player's previous/next marks also carry a stop bar.
 */

import {
  Box,
  type Ink,
  Plot,
  type PlotCommand,
  type Point,
} from "bureau/primitives";

export type TransportMark = "previous" | "play" | "pause" | "next";
export type ArrowMark = "left" | "right" | "up" | "down";
export type MarkName =
  | TransportMark
  | ArrowMark
  | "close"
  | "minus"
  | "plus"
  | "rotate-left"
  | "rotate-right"
  | "hammer"
  | "info";

/**
 * The marks that point right. A key's mark stands on the side it points, so
 * these follow the label (Start →) and every other mark leads it (← Back).
 */
export const RIGHTWARD_MARKS: ReadonlySet<MarkName> = new Set([
  "play",
  "next",
  "right",
]);

/** The mark's 20px square, the square the register's icons are drawn in. */
const MARK_SIZE = 20;

/** The clockwise ring the two rotate marks share; the left one is its mirror. */
const ROTATE_RIGHT: readonly Point[] = [
  [14, 14],
  [10, 16],
  [6, 14],
  [4, 10],
  [6, 6],
  [10, 4],
  [14, 6],
  [15.5, 4.5],
  [16, 9.5],
  [11, 9],
  [12, 8],
  [10, 7],
  [8, 8],
  [7, 10],
  [8, 12],
  [10, 13],
  [12, 12],
];

/** Marks share a 12px footprint inside the 20px square. */
const MARK_ART: Record<MarkName, readonly (readonly Point[])[]> = {
  previous: [
    [[4, 4], [7, 4], [7, 16], [4, 16]],
    [[16, 4], [16, 16], [8, 10]],
  ],
  play: [[[5, 4], [15, 10], [5, 16]]],
  pause: [
    [[6, 4], [9, 4], [9, 16], [6, 16]],
    [[11, 4], [14, 4], [14, 16], [11, 16]],
  ],
  next: [
    [[4, 4], [12, 10], [4, 16]],
    [[13, 4], [16, 4], [16, 16], [13, 16]],
  ],
  left: [[[15, 4], [15, 16], [5, 10]]],
  right: [[[5, 4], [15, 10], [5, 16]]],
  up: [[[4, 15], [10, 5], [16, 15]]],
  down: [[[4, 5], [16, 5], [10, 15]]],
  minus: [[[4, 8], [16, 8], [16, 12], [4, 12]]],
  // One outline, as close's, so no wall runs where the bars cross.
  plus: [[
    [8, 4],
    [12, 4],
    [12, 8],
    [16, 8],
    [16, 12],
    [12, 12],
    [12, 16],
    [8, 16],
    [8, 12],
    [4, 12],
    [4, 8],
    [8, 8],
  ]],
  // A three-quarter ring turning clockwise, open on the right, its head at
  // the top: one outline, so no wall runs where the head meets the ring.
  "rotate-right": [ROTATE_RIGHT],
  "rotate-left": [ROTATE_RIGHT.map(([x, y]): Point => [MARK_SIZE - x, y])],
  // A hammer laid corner to corner, head up and right, as one outline.
  hammer: [[
    [11.5, 3],
    [17, 8.5],
    [14, 11.5],
    [12, 9.5],
    [5, 17],
    [3, 15],
    [10.5, 8],
    [8.5, 6],
  ]],
  // A lower-case i: its dot over a stem with a foot.
  info: [
    [[8.5, 3.5], [11.5, 3.5], [11.5, 6.5], [8.5, 6.5]],
    [
      [7.5, 8.5],
      [11.5, 8.5],
      [11.5, 14],
      [13, 14],
      [13, 16.5],
      [7, 16.5],
      [7, 14],
      [8.5, 14],
      [8.5, 11],
      [7.5, 11],
    ],
  ],
  // One outline, both bars together, so no wall runs where they cross.
  close: [[
    [4, 4],
    [7, 4],
    [10, 7],
    [13, 4],
    [16, 4],
    [16, 7],
    [13, 10],
    [16, 13],
    [16, 16],
    [13, 16],
    [10, 13],
    [7, 16],
    [4, 16],
    [4, 13],
    [7, 10],
    [4, 7],
  ]],
};

export type MarkMaterial = "chrome" | "danger" | "good";

/** Each material's wall, floor and lit edge. */
const MATERIALS = {
  chrome: {
    shadow: "engraving-shadow",
    floor: "engraving-floor",
    lit: "engraving-lit",
  },
  danger: {
    shadow: "engraving-danger-shadow",
    floor: "engraving-danger-floor",
    lit: "engraving-danger-lit",
  },
  good: {
    shadow: "engraving-good-shadow",
    floor: "engraving-good-floor",
    lit: "engraving-good-lit",
  },
} as const satisfies Record<
  MarkMaterial,
  { shadow: Ink; floor: Ink; lit: Ink }
>;

/** A dead mark of any material: its wall and floor grey into one. */
const DEAD = {
  shadow: "engraving-disabled",
  floor: "engraving-disabled",
  lit: "engraving-lit",
} as const satisfies { shadow: Ink; floor: Ink; lit: Ink };

function engraving(
  mark: MarkName,
  dead: boolean,
  size: number,
  material: MarkMaterial,
): PlotCommand[] {
  const scale = size / MARK_SIZE;
  const paths = MARK_ART[mark].map((path) =>
    path.map(([x, y]): Point => [x * scale, y * scale])
  );
  return [{ kind: "engraving", paths, ...(dead ? DEAD : MATERIALS[material]) }];
}

/**
 * `dead` is the mark of a dead key: its wall and floor grey into one, as
 * OPENSTEP's dead keys did. A stipple would break a one-pixel wall into dots.
 */
export function Mark(
  { mark, dead = false, size = MARK_SIZE, material = "chrome" }: {
    mark: MarkName;
    dead?: boolean;
    /** Button selects the material from its variant and tone. */
    material?: MarkMaterial;
    /** 16px disclosures, 20px small controls, 32px large controls. */
    size?: 16 | 20 | 32;
  },
) {
  return (
    <Box width={size} height={size} shrink={0} hidden>
      <Plot
        width={size}
        height={size}
        commands={engraving(mark, dead, size, material)}
      />
    </Box>
  );
}
