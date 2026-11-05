import { assertEquals } from "@std/assert";
import { cardLeft, shelfOrder } from "./Shelf.tsx";

Deno.test("the shelf keeps a drawer's usable tools in their order", () => {
  assertEquals(
    shelfOrder<{ key: string; withheld?: boolean }>([
      { key: "a" },
      { key: "b" },
      { key: "c" },
    ]).map((i) => i.key),
    ["a", "b", "c"],
  );
});

Deno.test("the shelf sets the withheld tools after the usable ones", () => {
  assertEquals(
    shelfOrder([
      { key: "tower", withheld: true },
      { key: "house" },
      { key: "block", withheld: true },
      { key: "cottage" },
    ]).map((i) => i.key),
    ["house", "cottage", "tower", "block"],
  );
});

Deno.test("a card stands centred over its key", () => {
  assertEquals(
    cardLeft({
      keyCentre: 300,
      cardWidth: 200,
      shelfLeft: 100,
      safeLeft: 0,
      safeRight: 800,
    }),
    200,
  );
});

Deno.test("a card over the first key stays a gutter inside the window", () => {
  assertEquals(
    cardLeft({
      keyCentre: 50,
      cardWidth: 200,
      shelfLeft: 20,
      safeLeft: 0,
      safeRight: 800,
    }),
    -4,
  );
});

Deno.test("a card over the last key stays a gutter inside the window", () => {
  assertEquals(
    cardLeft({
      keyCentre: 600,
      cardWidth: 200,
      shelfLeft: 100,
      safeLeft: 0,
      safeRight: 800,
    }),
    484,
  );
});

Deno.test("a card over the first key keeps clear of a phone's notch", () => {
  assertEquals(
    cardLeft({
      keyCentre: 50,
      cardWidth: 200,
      shelfLeft: 120,
      safeLeft: 59,
      safeRight: 800,
    }),
    -45,
  );
});
