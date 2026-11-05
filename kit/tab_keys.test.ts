import { assertEquals } from "@std/assert";
import { cycledTabIndex, tabIndexForKey } from "./tab_keys.ts";

/* A three-tab strip throughout: the implementation this replaces wrapped at a
   hardcoded four, so three is the width that catches it. */
const STRIP = 3;

Deno.test("ArrowRight moves to the next tab", () => {
  assertEquals(tabIndexForKey("ArrowRight", 0, STRIP), 1);
});

Deno.test("ArrowRight wraps from the last tab to the first", () => {
  assertEquals(tabIndexForKey("ArrowRight", 2, STRIP), 0);
});

Deno.test("ArrowLeft moves to the previous tab", () => {
  assertEquals(tabIndexForKey("ArrowLeft", 2, STRIP), 1);
});

Deno.test("ArrowLeft wraps from the first tab to the last", () => {
  assertEquals(tabIndexForKey("ArrowLeft", 0, STRIP), 2);
});

Deno.test("Home jumps to the first tab", () => {
  assertEquals(tabIndexForKey("Home", 2, STRIP), 0);
});

Deno.test("End jumps to the last tab", () => {
  assertEquals(tabIndexForKey("End", 0, STRIP), 2);
});

Deno.test("a four-tab strip wraps at four", () => {
  assertEquals(tabIndexForKey("ArrowRight", 3, 4), 0);
});

Deno.test("a five-tab strip reaches its fifth tab", () => {
  assertEquals(tabIndexForKey("ArrowRight", 3, 5), 4);
});

Deno.test("Tab is not a tab-strip key", () => {
  assertEquals(tabIndexForKey("Tab", 0, STRIP), null);
});

Deno.test("ArrowDown is not a tab-strip key", () => {
  assertEquals(tabIndexForKey("ArrowDown", 0, STRIP), null);
});

Deno.test("Enter is not a tab-strip key", () => {
  assertEquals(tabIndexForKey("Enter", 0, STRIP), null);
});

Deno.test("an empty strip has nowhere to move", () => {
  assertEquals(tabIndexForKey("ArrowRight", 0, 0), null);
});

Deno.test("RB steps to the next tab", () => {
  assertEquals(cycledTabIndex(0, 1, STRIP), 1);
});

Deno.test("RB wraps past the last tab", () => {
  assertEquals(cycledTabIndex(2, 1, STRIP), 0);
});

Deno.test("LB steps to the previous tab", () => {
  assertEquals(cycledTabIndex(2, -1, STRIP), 1);
});

Deno.test("LB wraps past the first tab", () => {
  assertEquals(cycledTabIndex(0, -1, STRIP), 2);
});

Deno.test("an empty strip cannot be cycled", () => {
  assertEquals(cycledTabIndex(0, 1, 0), null);
});
