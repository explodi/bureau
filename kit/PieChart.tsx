import { numberFormatter } from "./i18n/format.ts";
/**
 * PieChart — how a whole splits into parts.
 *
 * A ring with the whole printed in its centre, and a key beside it. Chart and
 * key are ONE component, deliberately: a pie without a key is decoration, and
 * every place that has wanted one has then hand-rolled a swatch list beside
 * it. Give it shares, get a readable chart.
 *
 * The key prints each share's percentage and nothing else. A 300px instrument
 * has no room for a column of raw figures beside a ring, and the one raw
 * figure that matters — the whole — sits in the ring's centre, so a share is
 * read as "12% of 14.4M" rather than as a seven-digit number on a row.
 *
 * Colour is per share and never derived from position. The older census pie
 * picks colours by array index, so a category's colour changes when a
 * DIFFERENT category happens to drop to zero — the reason `id` here is both
 * the React key and the share's identity.
 *
 * The ring is a Plot of wedges with a hole cut in them, flat fills with
 * hard separators in the register's shadow colour, never a soft edge: the
 * register the rest of the kit draws in.
 */

import type React from "react";
import { Box, type Ink, Plot, type PlotCommand, Text } from "bureau/primitives";
import { TYPE_METRICS } from "./tokens.ts";

export type PieShare = {
  /** Stable identity — React key AND the reason a share keeps its colour. */
  id: string;
  label: React.ReactNode;
  /** Any non-negative magnitude; the chart takes the percentages. */
  value: number;
  /** The slice's ink, e.g. `paletteInk(ModelPalette.VIKING_BLUE)`. */
  ink: Ink;
};

type PieChartProps = {
  shares: readonly PieShare[];
  /** Ring diameter in logical px. 96 suits a 300px instrument. */
  size?: number;
  /** Optional caption under the figure in the ring. */
  totalLabel?: React.ReactNode;
  /**
   * How the whole is printed in the ring's centre. Long readings shrink to
   * the hole, so the default remains a compact count ("14.4M").
   */
  formatTotal?: (total: number) => string;
  /** Shown instead of the chart when every share is zero. */
  emptyLabel?: React.ReactNode;
};

/** The unit circle plus half the separator, so the outer stroke stays whole. */
const VIEW_RADIUS = 1.06;
/** The separator between slices: 2 real pixels at any size. */
const SEPARATOR = 2;
const TOTAL_STYLE = "mono-14-solid";
const DEFAULT_SIZE = 96;

/**
 * The hole's radius on the unit circle. At 96px this leaves 57px across for
 * the figure, the least that holds "14.4M" in the data face; a thinner ring
 * would stop reading as a pie.
 */
const HOLE_RADIUS = 0.6;

// Pinned to en-US like every other figure in the register (formatprice.ts):
// the hole is sized for "14.4M", and a German machine's "14,4 Mio." is not.
const compactCount = numberFormatter("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatCompactCount = (value: number) => {
  const compact = compactCount.format(value);
  return compact.length <= 7 ? compact : value.toExponential(1);
};

/**
 * One ring slice per share, clockwise from twelve o'clock, which is where a
 * reader expects a pie to start; a share that is the whole ring is the whole
 * ring.
 */
function ringSlices(
  slices: readonly { fraction: number; start: number; ink: Ink }[],
  size: number,
): PlotCommand[] {
  const centre = size / 2;
  const radius = size / (2 * VIEW_RADIUS);
  const angle = (fraction: number) => fraction * 2 * Math.PI - Math.PI / 2;
  return slices.map((slice) => ({
    kind: "wedge",
    x: centre,
    y: centre,
    radius,
    innerRadius: radius * HOLE_RADIUS,
    start: angle(slice.start),
    end: angle(slice.start + slice.fraction),
    ink: slice.ink,
    stroke: { ink: "mid", width: SEPARATOR },
  }));
}

export function PieChart({
  shares,
  size = DEFAULT_SIZE,
  totalLabel,
  formatTotal = formatCompactCount,
  emptyLabel,
}: PieChartProps) {
  const total = shares.reduce(
    (sum, share) => sum + Math.max(0, share.value),
    0,
  );
  const totalText = formatTotal(total);
  // Reserve 0.85em per glyph for the pixel face so wide readings stay in the hole.
  const holeWidth = size * HOLE_RADIUS * 0.88;
  const totalFontSize = Math.min(14, holeWidth / (totalText.length * 0.85));

  if (total <= 0) {
    return (
      <Box direction="column" padding={[16, 0]} ink="ink-neutral">
        <Text typeStyle="ui-13-solid" align="center">{emptyLabel}</Text>
      </Box>
    );
  }

  // Each slice starts where the previous one ended, so the running total is
  // threaded through a plain loop rather than mutated from inside a closure.
  const slices: Array<PieShare & { fraction: number; start: number }> = [];
  let consumed = 0;
  for (const share of shares) {
    const fraction = Math.max(0, share.value) / total;
    slices.push({ ...share, fraction, start: consumed });
    consumed += fraction;
  }

  return (
    <Box align="center" gap={12} ink="ink">
      {
        /* The ring and the figure in its hole are one box; the key takes what
          is left of the row. */
      }
      <Box width={size} height={size} shrink={0}>
        <Plot
          width={size}
          height={size}
          commands={ringSlices(slices, size)}
        />
        <Box
          position="absolute"
          inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
          direction="column"
          align="center"
          justify="center"
          gap={3}
          passThrough
        >
          <Box direction="column" maxWidth="55%">
            <Text
              typeStyle={TOTAL_STYLE}
              scale={totalFontSize / TYPE_METRICS[TOTAL_STYLE].size}
              align="center"
              nowrap
            >
              {totalText}
            </Text>
          </Box>
          {totalLabel && (
            <Text typeStyle="ui-11-caps-solid" ink="ink-neutral" align="center">
              {totalLabel}
            </Text>
          )}
        </Box>
      </Box>
      <Box direction="column" gap={4} grow={1} basis={0}>
        {slices.map((slice) => (
          <Box key={slice.id} role="listitem" align="center" gap={8}>
            <Box
              width={14}
              height={14}
              shrink={0}
              fill={slice.ink}
              surface="ring"
            />
            <Box direction="column" grow={1} basis={0}>
              <Text typeStyle="ui-13-legend" lines={1} ellipsis>
                {slice.label}
              </Text>
            </Box>
            {
              /* A fixed column, so the shares stay in line whether one reads
                4% or 100%. */
            }
            <Box direction="column" width={34} shrink={0}>
              <Text typeStyle="mono-13-legend" align="end">
                {Math.round(slice.fraction * 100)}%
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
