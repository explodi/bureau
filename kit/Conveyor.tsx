import type { ReactNode } from "react";
import { Box } from "bureau/primitives";

export type ConveyorDirection = "up" | "down" | "left" | "right";

const FLOW_ANIMATION = {
  up: "bureau-flow-up",
  down: "bureau-flow-down",
  left: "bureau-flow-left",
  right: "bureau-flow-right",
} as const;

/**
 * Marks moving steadily along a run for as long as the conveyor is mounted:
 * packets on a wire, cars on a belt. The `marks` are its repeating pattern,
 * set `pitch` pixels apart and carried in `direction` at `speed` pixels a
 * second; the conveyor is `length` long and `across` wide, and clips what
 * lies past its ends. The host moves it, so no React render happens per
 * frame. Under reduced motion the marks stand still.
 *
 * The strip is two copies of the pattern, repeated enough to cover the run,
 * moved one copy's length each cycle so the second copy takes the first's
 * place without a seam.
 */
export function Conveyor(
  { direction, length, across, pitch, speed, marks }: {
    direction: ConveyorDirection;
    length: number;
    across: number;
    pitch: number;
    speed: number;
    /** The pattern, one mark per pitch, each sized by its caller. */
    marks: readonly ReactNode[];
  },
) {
  const isVertical = direction === "up" || direction === "down";
  const patternLength = marks.length * pitch;
  // One copy covers the run, so wherever the strip stands in its cycle the
  // two together cover it.
  const copies = Math.max(1, Math.ceil(length / patternLength));
  const copyLength = copies * patternLength;
  const durationMs = Math.round(copyLength / speed * 1000);
  const slots = Array.from(
    { length: 2 * copies * marks.length },
    (_, slot) => ({
      slot,
      along: slot * pitch,
      mark: marks[slot % marks.length],
    }),
  );
  return (
    <Box
      width={isVertical ? across : length}
      height={isVertical ? length : across}
      overflow="hidden"
      shrink={0}
    >
      <Box
        position="absolute"
        inset={{ top: 0, left: 0 }}
        width={isVertical ? across : 2 * copyLength}
        height={isVertical ? 2 * copyLength : across}
        animation={FLOW_ANIMATION[direction]}
        animationDurationMs={durationMs}
      >
        {slots.map(({ slot, along, mark }) => (
          <Box
            key={slot}
            position="absolute"
            inset={isVertical
              ? { top: along, left: 0 }
              : { top: 0, left: along }}
          >
            {mark}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
