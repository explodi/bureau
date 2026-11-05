/*
 * The keyboard and bumper semantics of a Bureau tab strip, with no host in
 * them, so they can be tested directly (a .test.ts in this repo cannot
 * import a .tsx).
 *
 * Both functions take and return an INDEX into the strip, because a strip is a
 * row and "one to the right, wrapping" is the entire model.
 *
 * WHY the count is a parameter rather than a constant: the implementation this
 * replaces wrapped with a literal `% 4`, written when its window happened to
 * have four tabs. A three-tab strip would have wrapped to an index outside the
 * row, and a five-tab one would have skipped its last tab entirely.
 */

/** How far one bumper press or one arrow key moves the selection. */
export type TabStep = 1 | -1;

function wrapped(index: number, count: number): number {
  // JS keeps the sign of the dividend, so a bare -1 % 4 is -1, not 3.
  return ((index % count) + count) % count;
}

/**
 * The tab an Arrow/Home/End press moves to, or null when the strip does not own
 * the key. Null is what stops the caller from calling preventDefault: swallow
 * everything and Tab could never leave the strip again.
 */
export function tabIndexForKey(
  key: string,
  current: number,
  count: number,
): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight") return wrapped(current + 1, count);
  if (key === "ArrowLeft") return wrapped(current - 1, count);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** The tab LB/RB cycle to. Wraps, so a pad can reach every sheet with one hand. */
export function cycledTabIndex(
  current: number,
  step: TabStep,
  count: number,
): number | null {
  if (count === 0) return null;
  return wrapped(current + step, count);
}
