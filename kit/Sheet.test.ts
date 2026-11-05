import { assertEquals } from "@std/assert";
import { distributeWidths } from "./Sheet.tsx";

Deno.test("auto columns share the spare width in proportion to their widest cell", () => {
  assertEquals(
    distributeWidths(
      [{ width: "auto" }, { width: "auto" }, { width: "auto" }],
      [92, 44, 60],
      914,
    ),
    [429, 205, 280],
  );
});

Deno.test("the last auto column takes the fraction whole pixels leave", () => {
  assertEquals(
    distributeWidths([{ width: "auto" }, { width: "auto" }], [10, 20], 100.5),
    [33, 67.5],
  );
});

Deno.test("fixed columns are taken before auto columns share the rest", () => {
  assertEquals(
    distributeWidths(
      [{ width: 120 }, { width: "auto" }, { width: "auto" }],
      [0, 30, 10],
      400,
    ),
    [0, 210, 70],
  );
});

Deno.test("fit columns keep their widest cell and auto columns take the rest", () => {
  assertEquals(
    distributeWidths(
      [{ width: "auto" }, { width: "fit" }, { width: "fit" }],
      [100, 40, 60],
      400,
    ),
    [300, 40, 60],
  );
});

Deno.test("measured columns overflow rather than shrink below their widest cell", () => {
  assertEquals(
    distributeWidths([{ width: "auto" }, { width: "fit" }], [300, 200], 400),
    [300, 200],
  );
});
