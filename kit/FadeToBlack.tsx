import { Box, Layer } from "bureau/primitives";
import { host } from "bureau/host";
import { useLayoutEffect } from "react";
import { PAD_ACTION_NAMES } from "bureau/pad_actions";
import {
  GamepadPriority,
  useGamepadFrame,
  usePadContext,
} from "./input/useGamepad.ts";

/** How long the screen takes to go black: what a caller waits before it
 * swaps what is underneath. */
export const FADE_TO_BLACK_MS = 1000;

/**
 * The screen going black over FADE_TO_BLACK_MS, under the window's watch
 * cursor, while the game does something the player waits for (leaving a
 * city). It holds every key and pad press until it is unmounted.
 */
export function FadeToBlack() {
  usePadContext("menu", true, GamepadPriority.MODAL + 30);
  useLayoutEffect(() => host.captureKeys(() => true, true), []);
  useGamepadFrame(
    (input) => {
      if (!input.connected) return;
      for (const action of PAD_ACTION_NAMES) input.wasPressed(action);
    },
    { enabled: true, priority: GamepadPriority.MODAL + 30 },
  );
  return (
    <Layer stacking="blocking" cover>
      <Box
        windowBusy
        busy
        fill="db32-black"
        width="100%"
        height="100%"
        animation="bureau-fade-to-black"
      />
    </Layer>
  );
}
