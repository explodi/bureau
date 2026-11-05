import { assertEquals } from "@std/assert";
import { nearestColumn, niceScale, printableScale } from "./chart_scale.ts";

// --- the axis -------------------------------------------------------------

const oneDecimal = (value: number) => value.toFixed(1);

Deno.test("a figure printed to one decimal never labels two gridlines alike", () => {
  // Approval 0.43 .. 0.6 would step by 0.05 and print "0.5" twice.
  assertEquals(printableScale(0.43, 0.6, oneDecimal).ticks, [0.4, 0.5, 0.6]);
});

Deno.test("an axis whose figures already print apart keeps its ticks", () => {
  assertEquals(
    printableScale(0, 174_084, String).ticks,
    niceScale(0, 174_084).ticks,
  );
});

Deno.test("a fractional run gets round half-steps that enclose it", () => {
  // The median-age chart: 49.33 .. 50.69.
  assertEquals(niceScale(49.33, 50.69), {
    min: 49,
    max: 51,
    step: 0.5,
    ticks: [49, 49.5, 50, 50.5, 51],
  });
});

Deno.test("a money run gets round tens of thousands", () => {
  assertEquals(niceScale(0, 174_084).ticks, [
    0,
    50_000,
    100_000,
    150_000,
    200_000,
  ]);
});

Deno.test("a run crossing zero keeps zero on a tick", () => {
  assertEquals(niceScale(-300, 900).ticks, [-500, 0, 500, 1000]);
});

Deno.test("integer-only data never steps by less than one", () => {
  // A population of 100..102 would otherwise step by 0.5 and print
  // "100, 100, 101, 101, 102".
  assertEquals(niceScale(100, 102, { integerOnly: true }).ticks, [
    100,
    101,
    102,
  ]);
});

Deno.test("ticks are printed without float noise", () => {
  assertEquals(niceScale(0, 0.7).ticks, [0, 0.2, 0.4, 0.6, 0.8]);
});

Deno.test("a flat run is given room either side of its value", () => {
  assertEquals(niceScale(50, 50), {
    min: 44,
    max: 56,
    step: 2,
    ticks: [44, 46, 48, 50, 52, 54, 56],
  });
});

Deno.test("a flat run of zero is not shown a negative axis", () => {
  assertEquals(niceScale(0, 0, { integerOnly: true }).ticks, [0, 1]);
});

Deno.test("a flat negative run keeps its sign", () => {
  assertEquals(niceScale(-5, -5).min < -5, true);
  assertEquals(niceScale(-5, -5).max > -5, true);
});

// --- the hover column -----------------------------------------------------

const COLUMNS = [0, 62, 124];

Deno.test("a cursor on a column picks that column", () => {
  assertEquals(nearestColumn(COLUMNS, 62), 1);
});

Deno.test("a cursor between columns picks the closer one", () => {
  assertEquals(nearestColumn(COLUMNS, 70), 1);
  assertEquals(nearestColumn(COLUMNS, 100), 2);
});

Deno.test("a cursor past either end still picks the end column", () => {
  assertEquals(nearestColumn(COLUMNS, 900), 2);
  assertEquals(nearestColumn(COLUMNS, -50), 0);
});

Deno.test("densely packed columns resolve to the nearest, not the first", () => {
  // The 10-year spacing: 120 columns 5.73px apart. A radius test returned the
  // first marker within 10px, which at this density was never the closest.
  const dense = Array.from({ length: 120 }, (_, i) => i * 5.73);

  assertEquals(nearestColumn(dense, 0), 0);
  assertEquals(nearestColumn(dense, 5.73 * 40), 40);
  assertEquals(nearestColumn(dense, 5.73 * 99 + 2), 99);
});

Deno.test("no columns means no reading", () => {
  assertEquals(nearestColumn([], 10), undefined);
});
