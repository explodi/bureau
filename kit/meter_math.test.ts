import { assertAlmostEquals, assertEquals } from "@std/assert";
import {
  bandFitsLabel,
  clampToRange,
  meterPercent,
  segmentWidths,
} from "./meter_math.ts";

/**
 * The register's clamping rule, tested once so the nine bars that used to each
 * have their own can stop having one. Every case below is a state some existing
 * bar could reach: an unclamped survey reading, a zero denominator on a city
 * with no coal fleet, a stacked bar whose slices are all zero on day one.
 */

Deno.test("meterPercent: the midpoint of a 0..1 meter is half the track", () => {
  assertEquals(meterPercent(0.5, 0, 1), 50);
});

Deno.test("meterPercent: a value above the range fills the track", () => {
  assertEquals(meterPercent(4, 0, 1), 100);
});

Deno.test("meterPercent: a value below the range empties the track", () => {
  assertEquals(meterPercent(-3, 0, 1), 0);
});

Deno.test("meterPercent: a range with no span reads as empty", () => {
  assertEquals(meterPercent(5, 12, 12), 0);
});

Deno.test("meterPercent: an inverted range reads as empty", () => {
  assertEquals(meterPercent(5, 12, 0), 0);
});

Deno.test("meterPercent: a non-finite value reads as empty", () => {
  assertEquals(meterPercent(Number.NaN, 0, 1), 0);
});

Deno.test("meterPercent: a range in natural units scales to the track", () => {
  assertEquals(meterPercent(9, 0, 12), 75);
});

Deno.test("meterPercent: a range that does not start at zero is offset", () => {
  assertEquals(meterPercent(0, -6, 6), 50);
});

Deno.test("meterPercent: a repeating share stays precise", () => {
  assertAlmostEquals(meterPercent(1, 0, 3), 33.3333, 0.001);
});

Deno.test("clampToRange: a value inside the range is reported as given", () => {
  assertEquals(clampToRange(3.4, 0, 6), 3.4);
});

Deno.test("clampToRange: a value above the range is held at the maximum", () => {
  assertEquals(clampToRange(19, 0, 12), 12);
});

Deno.test("clampToRange: a value below the range is held at the minimum", () => {
  assertEquals(clampToRange(-40, -6, 6), -6);
});

Deno.test("clampToRange: a non-finite value is reported as the minimum", () => {
  assertEquals(clampToRange(Number.NaN, 0, 12), 0);
});

Deno.test("clampToRange: a range with no span reports the minimum", () => {
  assertEquals(clampToRange(5, 12, 12), 12);
});

Deno.test("segmentWidths: weights split the track in proportion", () => {
  assertEquals(segmentWidths([1, 1, 2]), [25, 25, 50]);
});

Deno.test("segmentWidths: shares that already sum to one are unchanged", () => {
  assertEquals(segmentWidths([0.2, 0.8]), [20, 80]);
});

Deno.test("segmentWidths: raw counts are normalised to the whole track", () => {
  assertEquals(segmentWidths([30, 10]), [75, 25]);
});

Deno.test("segmentWidths: an all-zero split leaves the track empty", () => {
  assertEquals(segmentWidths([0, 0, 0]), [0, 0, 0]);
});

Deno.test("segmentWidths: a negative weight takes no width", () => {
  assertEquals(segmentWidths([-5, 1, 1]), [0, 50, 50]);
});

Deno.test("segmentWidths: a non-finite weight takes no width", () => {
  assertEquals(segmentWidths([Number.NaN, 3, 1]), [0, 75, 25]);
});

Deno.test("segmentWidths: no segments produce no widths", () => {
  assertEquals(segmentWidths([]), []);
});

Deno.test("bandFitsLabel: a tenth of the track holds a label", () => {
  assertEquals(bandFitsLabel(10), true);
});

Deno.test("bandFitsLabel: a narrower band does not", () => {
  assertEquals(bandFitsLabel(9.9), false);
});

Deno.test("bandFitsLabel: an empty band does not", () => {
  assertEquals(bandFitsLabel(0), false);
});
