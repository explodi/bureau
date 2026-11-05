import { assertEquals } from "@std/assert";
import {
  type Host,
  type HostNode,
  type HostRect,
  installHost,
  notifyFocus,
} from "bureau/host";
import {
  findClosestInDirection,
  navigateDirection,
} from "./spatialNavigation.ts";

const rectangles = new Map<HostNode, HostRect>();

/** A committed box whose rectangle is 20 pixels square at (left, top). */
function box(id: number, left: number, top: number): HostNode {
  const node = {
    id,
    type: "bureau-box",
    props: {},
    text: "",
    children: [],
    attached: true,
  };
  rectangles.set(node, {
    left,
    top,
    right: left + 20,
    bottom: top + 20,
    width: 20,
    height: 20,
    scale: 1,
  });
  return node;
}

const centre = box(1, 100, 100);
const above = box(2, 100, 50);
const below = box(3, 100, 150);
const left = box(4, 50, 100);
const right = box(5, 150, 100);
const diagonal = box(6, 140, 140);

function fakeHost(services: Partial<Host>): Host {
  return new Proxy(services as Host, {
    get(target, name) {
      const service = Reflect.get(target, name);
      if (!service) throw new Error(`Unexpected host call: ${String(name)}`);
      return service;
    },
  });
}

Deno.test("Z4.1 the pad walk chooses literal neighbouring rectangles in each direction", () => {
  const restore = installHost(fakeHost({
    navigable: () => [centre, above, below, left, right, diagonal],
    measure: (node) => rectangles.get(node)!,
  }));
  try {
    assertEquals(findClosestInDirection(centre, "up"), above);
    assertEquals(findClosestInDirection(centre, "down"), below);
    assertEquals(findClosestInDirection(centre, "left"), left);
    assertEquals(findClosestInDirection(centre, "right"), right);
    assertEquals(findClosestInDirection(above, "up"), null);
  } finally {
    restore();
  }
});

Deno.test("the pad enters a grid at its first control and keeps focus at its edge", () => {
  let focused: HostNode | null = null;
  let grid: string | undefined;
  const restore = installHost(fakeHost({
    navigable: (gridId) => {
      grid = gridId;
      return [centre, right];
    },
    measure: (node) => rectangles.get(node)!,
    isNavigable: (node) => node === centre || node === right,
    focus: (node) => {
      if (!node) return;
      focused = node;
      notifyFocus(node);
    },
  }));
  try {
    notifyFocus(null);
    assertEquals(navigateDirection("right", "tools"), true);
    assertEquals(focused, centre);
    assertEquals(grid, "tools");
    assertEquals(navigateDirection("right", "tools"), true);
    assertEquals(focused, right);
    assertEquals(navigateDirection("right", "tools"), false);
    assertEquals(focused, right);
  } finally {
    restore();
  }
});
