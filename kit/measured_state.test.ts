import { assertStrictEquals } from "@std/assert";
import { keepMeasure } from "./measured_state.ts";

Deno.test("a measure with the same values keeps the object it had", () => {
  const last = { width: 320, height: 200 };
  assertStrictEquals(keepMeasure(last, { width: 320, height: 200 }), last);
});

Deno.test("a measure with another value is the new object", () => {
  const next = { width: 321, height: 200 };
  assertStrictEquals(keepMeasure({ width: 320, height: 200 }, next), next);
});

Deno.test("a measure whose anchor holds the same values keeps its object", () => {
  const last = { anchor: { kind: "screen", left: 12, top: 40 }, width: 180 };
  const next = { anchor: { kind: "screen", left: 12, top: 40 }, width: 180 };
  assertStrictEquals(keepMeasure(last, next), last);
});

Deno.test("a measure whose anchor moved is the new object", () => {
  const last = { anchor: { kind: "screen", left: 12, top: 40 }, width: 180 };
  const next = { anchor: { kind: "screen", left: 12, top: 44 }, width: 180 };
  assertStrictEquals(keepMeasure(last, next), next);
});

Deno.test("a measure that swaps one edge for another is the new object", () => {
  const last = { kind: "screen", left: 12, top: 40 };
  const next = { kind: "screen", left: 12, bottom: 40 };
  assertStrictEquals(keepMeasure<Record<string, unknown>>(last, next), next);
});

Deno.test("the first measure replaces none", () => {
  const next = { left: 12, top: 40, maxHeight: 300 };
  assertStrictEquals(keepMeasure<typeof next | null>(null, next), next);
});
