import { assertEquals } from "@std/assert";
import { createNativeRoot, nativeNodes } from "./primitives/reconciler.ts";
import { Conveyor } from "./Conveyor.tsx";

// The nodes of every root rendered so far; the last are this test's.
function strip() {
  return nativeNodes().filter((node) => node.props.animation).at(-1)!;
}

Deno.test("a conveyor's strip is two copies of a pattern that covers its run, moved one copy a cycle", () => {
  createNativeRoot(() => {}).renderSync(
    <Conveyor
      direction="up"
      length={20}
      across={4}
      pitch={8}
      speed={24}
      marks={["a", "b"]}
    />,
  );
  // A 16px pattern covers 20px in two copies; the strip holds twice that,
  // 64px and eight marks, and moves 32px in 1,333ms at 24px a second.
  const moving = strip();
  assertEquals(
    [
      moving.props.animation,
      moving.props.height,
      moving.props.animationDurationMs,
    ],
    ["bureau-flow-up", 64, 1333],
  );
  assertEquals(
    moving.children.map((mark) =>
      `${mark.children[0]!.text}@${(mark.props.inset as { top: number }).top}`
    ),
    ["a@0", "b@8", "a@16", "b@24", "a@32", "b@40", "a@48", "b@56"],
  );
});

Deno.test("a conveyor running right lays its marks along x and clips to its run", () => {
  createNativeRoot(() => {}).renderSync(
    <Conveyor
      direction="right"
      length={30}
      across={4}
      pitch={10}
      speed={30}
      marks={["a"]}
    />,
  );
  const moving = strip();
  const clip = nativeNodes().filter((node) => node.props.overflow === "hidden")
    .at(-1)!;
  assertEquals(
    [
      moving.props.animation,
      moving.props.width,
      clip.props.width,
      clip.props.height,
    ],
    ["bureau-flow-right", 60, 30, 4],
  );
  assertEquals(moving.children[1]!.props.inset, { top: 0, left: 10 });
});
