/**
 * A measure for a layout observer to keep in state: `next`, or `last` itself
 * when both hold the same values. A new object for the same measure renders
 * again, the commit lays the tree out again, and the observer is called
 * again, without end.
 */
export function keepMeasure<T>(last: T, next: T): T {
  return sameValues(last, next) ? last : next;
}

function sameValues(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  const bothObjects = typeof a === "object" && typeof b === "object" &&
    a !== null && b !== null;
  if (!bothObjects) return false;
  const one = a as Record<string, unknown>;
  const other = b as Record<string, unknown>;
  const keys = Object.keys(one);
  const sameKeys = keys.length === Object.keys(other).length;
  return sameKeys && keys.every((key) => sameValues(one[key], other[key]));
}
