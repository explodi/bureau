import { Box, Text, type TypeStyle } from "bureau/primitives";

/** How far behind the glyph before it each glyph dances, in milliseconds. */
export const RAINBOW_WAVE_STEP_MS = 110;

/**
 * Text whose glyphs dance, a demoscene "look here" for a figure the player
 * must notice: each glyph a box of its own running `bureau-rainbow-wave` a
 * step behind the one before, so it bobs up and down through the DB32
 * rainbow and the wave and the colours travel along the text. The host runs
 * it; reduced motion shows it still.
 */
export function RainbowWave(
  { text, typeStyle }: {
    text: string;
    /** The glyphs' type; the line's they stand in by default. */
    typeStyle?: TypeStyle;
  },
) {
  return (
    <Box direction="row">
      {Array.from(text).map((glyph, index) => (
        <Box
          key={index}
          animation="bureau-rainbow-wave"
          animationDelayMs={index * RAINBOW_WAVE_STEP_MS}
        >
          <Text typeStyle={typeStyle}>{glyph}</Text>
        </Box>
      ))}
    </Box>
  );
}
