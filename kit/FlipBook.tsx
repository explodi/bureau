import type { ReactNode } from "react";
import { Box } from "bureau/primitives";

const FRAME_COUNT = 6;
const FRAME_INDICES = Array.from({ length: FRAME_COUNT }, (_, index) => index);

/**
 * Six frames shown in turn in one place, `frameMs` each, for as long as the
 * book is mounted: a roulette, a flickering figure. The host steps them, so
 * no React render happens per frame. The first frame sizes the book, and is
 * the one left standing under reduced motion.
 */
export function FlipBook({ frameMs, frame }: {
  frameMs: number;
  /** Draws frame `index`, 0 to 5. */
  frame: (index: number) => ReactNode;
}) {
  const beatMs = FRAME_COUNT * frameMs;
  return (
    <Box>
      {FRAME_INDICES.map((index) => {
        const isLead = index === 0;
        // A negative delay starts a frame already under way, at its own
        // place in the beat, so none waits unshown for its first turn.
        const delayMs = isLead ? 0 : (index - FRAME_COUNT) * frameMs;
        return (
          <Box
            key={index}
            position={isLead ? undefined : "absolute"}
            inset={isLead ? undefined : { top: 0, left: 0 }}
            animation={isLead ? "bureau-flip-sixth-lead" : "bureau-flip-sixth"}
            animationDurationMs={beatMs}
            animationDelayMs={delayMs}
          >
            {frame(index)}
          </Box>
        );
      })}
    </Box>
  );
}
