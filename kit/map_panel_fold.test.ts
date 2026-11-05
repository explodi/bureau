import { assertEquals } from "@std/assert";
import { isFolded } from "./map_panel_fold.ts";

const BOTH_ON_A_TABLET = {
  folds: true,
  legends: 1,
  instruments: 1,
  open: "instrument",
} as const;

Deno.test("on a tablet with both up, the legend folds into its key", () => {
  assertEquals(isFolded("legend", BOTH_ON_A_TABLET), true);
});

Deno.test("on a tablet with both up, the instrument stands open first", () => {
  assertEquals(isFolded("instrument", BOTH_ON_A_TABLET), false);
});

Deno.test("an opened legend folds the instrument", () => {
  const legendOpen = { ...BOTH_ON_A_TABLET, open: "legend" } as const;
  assertEquals(isFolded("instrument", legendOpen), true);
});

Deno.test("an opened legend stands open itself", () => {
  const legendOpen = { ...BOTH_ON_A_TABLET, open: "legend" } as const;
  assertEquals(isFolded("legend", legendOpen), false);
});

Deno.test("a legend alone never folds", () => {
  const legendAlone = { ...BOTH_ON_A_TABLET, instruments: 0 };
  assertEquals(isFolded("legend", legendAlone), false);
});

Deno.test("an instrument alone never folds", () => {
  const instrumentAlone = {
    ...BOTH_ON_A_TABLET,
    legends: 0,
    open: "legend",
  } as const;
  assertEquals(isFolded("instrument", instrumentAlone), false);
});

Deno.test("a desktop shows both", () => {
  const desktop = { ...BOTH_ON_A_TABLET, folds: false };
  assertEquals(isFolded("legend", desktop), false);
});
