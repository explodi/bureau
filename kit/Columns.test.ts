import { assertEquals } from "@std/assert";
import { columnWidth } from "./Columns.tsx";

Deno.test("four cells share a row wide enough for four", () => {
  assertEquals(columnWidth(680, 4, 150, 8), 164);
});

Deno.test("a narrow row drops to the columns that fit", () => {
  assertEquals(columnWidth(400, 4, 150, 8), 196);
});

Deno.test("never more columns than cells", () => {
  assertEquals(columnWidth(500, 1, 150, 8), 500);
});

Deno.test("a share is whole pixels, the remainder left over", () => {
  assertEquals(columnWidth(498, 3, 135, 12), 158);
  assertEquals(columnWidth(500, 3, 135, 12), 158);
});

Deno.test("a row narrower than the least column gives its cell the row", () => {
  assertEquals(columnWidth(100, 2, 135, 12), 100);
});
