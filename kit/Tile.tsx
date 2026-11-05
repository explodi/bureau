import type React from "react";
import { Box } from "bureau/primitives";

/**
 * A flat, ink-ringed tile that is focusable but inert: an achievement on the
 * trophy shelf, an entry in an unlock gallery — something the player browses
 * with the d-pad and reads, never presses.
 *
 * It takes focus so the dialog's gamepad navigation walks it and scrolls it
 * into view, but it is NOT a key: a raised bevel means "press me", and a tile
 * has nothing to press, so it keeps the flat plate and the register's inlaid
 * ring in every state.
 *
 * `muted` is the tile whose subject is not yet earned: it drops onto the sheet
 * ground and its text engraves, the way a dead key's label does. `shelf`
 * sizes a trophy shelf's tiles: `tall` for an earned trophy, `short` for a
 * goal. `stretch` fills the cell the tile stands in, both ways.
 */
export function Tile(
  { muted, shelf, stretch, children }: {
    muted?: boolean;
    shelf?: "tall" | "short";
    stretch?: boolean;
    children?: React.ReactNode;
  },
) {
  return (
    <Box
      look={muted ? "tile-muted" : "tile"}
      focusable
      align="center"
      gap={12}
      minWidth={0}
      minHeight={shelf === "tall" ? 104 : shelf === "short" ? 64 : undefined}
      padding={shelf === "short" ? [10, 12] : 12}
      grow={stretch ? 1 : undefined}
      shrink={stretch ? 1 : undefined}
      basis={stretch ? "auto" : undefined}
    >
      {children}
    </Box>
  );
}
