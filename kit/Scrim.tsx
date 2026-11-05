import type React from "react";
import { Box, Layer, type StackingLevel } from "bureau/primitives";

/** The air a modal keeps inside the safe area, so its frame and the scrim
 *  show all round however much room it takes. */
export const SCRIM_MARGIN = 12;

/**
 * The scrim a modal lays over the city: full-screen ink at seven tenths,
 * centring whatever it is given. Every modal (a program's window, a message
 * box) sits on this one layer, so the stacking
 * of "the game behind, the window in front" is decided in exactly one place:
 * above every instrument on the city and below the register's pop-ups, which
 * is where a select's list has to land when it is opened from a window.
 *
 * WHY the scrim re-lights its contents: a modal is the machine interrupting,
 * and stays the light chrome whatever raised it. Without it a message box
 * opened from a dark instrument on the map would inherit the panel's slate.
 */
export function Scrim(
  { children, rootId, stacking = "modal" }: {
    children: React.ReactNode;
    /** The element the modal opens in, when it is not the UI root. */
    rootId?: string;
    /** Lifts the modal above the others that share the scrim's level. */
    stacking?: StackingLevel;
  },
) {
  return (
    <Layer rootId={rootId} stacking={stacking} cover>
      <Box
        id="bureau-scrim"
        chrome="light"
        look="scrim"
        width="100%"
        height="100%"
        align="center"
        justify="center"
        padding={SCRIM_MARGIN}
      >
        {children}
      </Box>
    </Layer>
  );
}
