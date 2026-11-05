import { assertEquals } from "@std/assert";
import { createElement } from "react";
import { Box, Image, Text } from "bureau/primitives";
import { holdsOnlyIcons } from "./icon_only.ts";

function Mark() {
  return null;
}

const ICON_TYPES = new Set<unknown>([Image, Mark]);

Deno.test("a key holding one image is icon-only", () => {
  const children = createElement(Image, { source: "/a.png" });
  assertEquals(holdsOnlyIcons(children, ICON_TYPES), true);
});

Deno.test("a key holding a kit icon component is icon-only", () => {
  const children = createElement(Mark);
  assertEquals(holdsOnlyIcons(children, ICON_TYPES), true);
});

Deno.test("a key holding only icons, with a skipped slot, is icon-only", () => {
  const children = [false, createElement(Mark, { key: "m" }), null];
  assertEquals(holdsOnlyIcons(children, ICON_TYPES), true);
});

Deno.test("a key with a text label is not icon-only", () => {
  assertEquals(holdsOnlyIcons("Buy", ICON_TYPES), false);
});

Deno.test("a key with an icon and a label is not icon-only", () => {
  const children = [
    createElement(Image, { key: "i", source: "/a.png" }),
    "Open",
  ];
  assertEquals(holdsOnlyIcons(children, ICON_TYPES), false);
});

Deno.test("a key whose label is set in a Text is not icon-only", () => {
  const children = createElement(Text, null, "Open");
  assertEquals(holdsOnlyIcons(children, ICON_TYPES), false);
});

Deno.test("a key holding an icon inside a box is not icon-only", () => {
  const children = createElement(Box, null, createElement(Mark));
  assertEquals(holdsOnlyIcons(children, ICON_TYPES), false);
});

Deno.test("an empty key is not icon-only", () => {
  assertEquals(holdsOnlyIcons(null, ICON_TYPES), false);
});
