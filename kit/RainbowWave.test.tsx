import { assertEquals } from "@std/assert";
import { createNativeRoot, nativeNodes } from "./primitives/reconciler.ts";
import { RAINBOW_WAVE_STEP_MS, RainbowWave } from "./RainbowWave.tsx";

Deno.test("a rainbow wave dances each glyph in a box of its own, a step behind the one before", () => {
  createNativeRoot(() => {}).renderSync(<RainbowWave text="300" />);

  const glyphs = nativeNodes()
    .filter((node) => node.props.animation)
    .map((node) =>
      `${node.props.animation} from ${node.props.animationDelayMs}ms`
    );

  assertEquals(glyphs, [
    "bureau-rainbow-wave from 0ms",
    `bureau-rainbow-wave from ${RAINBOW_WAVE_STEP_MS}ms`,
    `bureau-rainbow-wave from ${2 * RAINBOW_WAVE_STEP_MS}ms`,
  ]);
});
