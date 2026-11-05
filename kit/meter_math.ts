/**
 * The arithmetic every Bureau meter runs on, kept out of the component so the
 * register's one clamping rule can be tested alone.
 *
 * WHY it is worth extracting: the ten bars <Meter> replaces each did
 * their own arithmetic and disagreed about it. Exactly one clamped both ends of
 * its value; four clamped only the top; the rest trusted the caller, so a
 * reading outside its declared ±6 range would have drawn a negative width. Three divided by a denominator they had to remember to guard at
 * the call site, and the fourth guarded it with `Math.max(1, …)` instead.
 *
 * Everything below returns a number that is safe to use straight as a width,
 * never NaN, never negative, never past 100, so the component has
 * no error cases left to handle. That is the point: the special cases are
 * defined out of existence here rather than repeated at nine call sites.
 */

/**
 * A band narrower than this cannot hold its own label: the digits are wider
 * than the band and spill across the divide into the neighbouring colour. The
 * approval bar has drawn its percentages under this rule since it shipped.
 */
const MIN_LABELLED_BAND_PERCENT = 10;

/** The caller's number, held inside its own declared bounds. */
export function clampToRange(value: number, min: number, max: number): number {
  // `max > min` is false for equal, inverted AND NaN bounds — one test for all
  // three, which is why this is not written as `max <= min`.
  const hasRange = max > min;
  if (!hasRange) return min;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Where `value` sits along the track, as a percent of it (0..100). A meter
 * whose bounds are empty, inverted or unset reads as an empty track rather
 * than as a division by zero.
 */
export function meterPercent(value: number, min: number, max: number): number {
  const hasRange = max > min;
  if (!hasRange) return 0;
  return ((clampToRange(value, min, max) - min) / (max - min)) * 100;
}

/**
 * Split a track between weighted bands — import tiers, the slices of a stacked
 * bar, the two halves of a diverging one. Widths are percentages of the whole
 * track and sum to 100 whenever any weight is positive, so the bands always
 * fill the rail exactly and a caller can pass raw counts rather than shares.
 *
 * A negative or non-finite weight is treated as absent: a slice of minus three
 * kilowatt-hours is a data fault, and rendering it as a band that eats its
 * neighbours' width would hide that fault behind a plausible-looking chart.
 */
export function segmentWidths(weights: number[]): number[] {
  const usable = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0
  );
  const total = usable.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return usable.map(() => 0);
  return usable.map((weight) => (weight / total) * 100);
}

/** Whether a band of this width can hold a label drawn inside it. */
export function bandFitsLabel(widthPercent: number): boolean {
  return widthPercent >= MIN_LABELLED_BAND_PERCENT;
}
