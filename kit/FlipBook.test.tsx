import { assertEquals } from "@std/assert";
import { createNativeRoot, nativeNodes } from "./primitives/reconciler.ts";
import { FlipBook } from "./FlipBook.tsx";

Deno.test("a flip-book's frames each take a sixth of one beat, a frame apart", () => {
  createNativeRoot(() => {}).renderSync(
    <FlipBook frameMs={100} frame={(index) => `frame ${index}`} />,
  );
  const frames = nativeNodes()
    .filter((node) => node.props.animation)
    .map((node) =>
      `${
        node.children[0]!.text
      }: ${node.props.animation} ${node.props.animationDurationMs}ms from ${node.props.animationDelayMs}ms`
    );
  assertEquals(frames, [
    "frame 0: bureau-flip-sixth-lead 600ms from 0ms",
    "frame 1: bureau-flip-sixth 600ms from -500ms",
    "frame 2: bureau-flip-sixth 600ms from -400ms",
    "frame 3: bureau-flip-sixth 600ms from -300ms",
    "frame 4: bureau-flip-sixth 600ms from -200ms",
    "frame 5: bureau-flip-sixth 600ms from -100ms",
  ]);
});
