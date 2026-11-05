/**
 * The arithmetic behind Chart, kept apart from the drawing so it can be
 * tested on its own: the axis a run of values earns, and which column of the
 * plot a cursor is over.
 */

/** A y axis: evenly spaced ticks a reader can hold in their head. */
export type ChartScale = {
  /** The bottom tick. */
  min: number;
  /** The top tick. */
  max: number;
  /** The distance between ticks. */
  step: number;
  /** Every tick value, bottom to top: `min` first, `max` last. */
  ticks: number[];
};

/**
 * Snaps a magnitude to the 1-2-5 ladder at its own power of ten: 0.34 becomes
 * 0.5, 174,084 becomes 200,000. `round` picks the nearest rung, which is what
 * a tick STEP wants; a RANGE takes the rung above so the outer ticks still
 * enclose the data.
 */
function niceNumber(magnitude: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(magnitude));
  const fraction = magnitude / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

/** Decimal places that print a multiple of `step` without float noise. */
function decimalsFor(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step)));
}

/**
 * A nice axis over the data's [low, high] (Heckbert, Graphics Gems I): a step
 * from the 1-2-5 ladder sized for about `maxTicks` ticks, and both ends
 * snapped outward to multiples of it, so every gridline carries a round
 * figure and the outermost two still enclose the data.
 *
 * A flat run has no range to build an axis from, so it is given a tenth of
 * its own size either side — but never pushed below zero when the run itself
 * never was: a count that has always been zero gets 0..1, not -1..1.
 *
 * `integerOnly` holds the step at 1 or more, for counts and whole-currency
 * figures whose formatter prints integers: a step of 0.5 would otherwise
 * label two neighbouring gridlines with the same number.
 */
export function niceScale(
  low: number,
  high: number,
  { maxTicks = 6, integerOnly = false } = {},
): ChartScale {
  let from = low;
  let to = high;
  if (from === to) {
    const pad = Math.abs(from) * 0.1 || 1;
    from -= pad;
    to += pad;
    if (low >= 0) from = Math.max(from, 0);
  }

  const range = niceNumber(to - from, false);
  let step = niceNumber(range / (maxTicks - 1), true);
  if (integerOnly) step = Math.max(step, 1);

  const decimals = decimalsFor(step);
  const min = Number((Math.floor(from / step) * step).toFixed(decimals));
  const max = Number((Math.ceil(to / step) * step).toFixed(decimals));
  const count = Math.round((max - min) / step) + 1;
  const ticks = Array.from(
    { length: count },
    (_, i) => Number((min + i * step).toFixed(decimals)),
  );
  return { min, max, step, ticks };
}

/**
 * The finest nice axis whose ticks all print differently through `format`.
 *
 * A figure printed to one decimal cannot label a step of 0.05: 0.45 and 0.5
 * both read "0.5". Rather than label two gridlines alike, the axis takes
 * fewer, coarser ticks until every one reads as its own figure; with two
 * left, it keeps them.
 */
export function printableScale(
  low: number,
  high: number,
  format: (value: number) => string,
  { integerOnly = false } = {},
): ChartScale {
  for (let maxTicks = 6; maxTicks > 2; maxTicks--) {
    const scale = niceScale(low, high, { maxTicks, integerOnly });
    const printed = new Set(scale.ticks.map(format));
    if (printed.size === scale.ticks.length) return scale;
  }
  return niceScale(low, high, { maxTicks: 2, integerOnly });
}

/**
 * The column the cursor is over: the index whose x is nearest, at any height.
 *
 * On a chart x alone identifies a column — its y is the answer, not part of
 * the question — so the whole column belongs to the nearest one, and no
 * part of the plot is inert between markers.
 */
export function nearestColumn(
  xs: readonly number[],
  x: number,
): number | undefined {
  if (xs.length === 0) return undefined;
  let nearest = 0;
  let nearestDistance = Infinity;
  xs.forEach((columnX, index) => {
    const distance = Math.abs(columnX - x);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}
