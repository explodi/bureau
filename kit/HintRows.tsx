/**
 * The floating hint's rows, for a hint with more than one fact in it: the
 * cursor's readout on the city (what a tower plugs into, what a click, a drag
 * or the rotate keys do here) and a chart's values under the pointer.
 *
 *   HintRows      the column, one fact a row
 *     HintLine    a fact set in the plate's own voice
 *     HintHeading the decision, louder than the figures under it
 *     HintPair    a label left and its figure right
 *     HintWarning a sentence that costs the player something
 *     HintAction  something the player can do from here
 *     HintKeys    keys and words on one line: "Press [Q] [E] to rotate"
 *
 * Nothing here paints: the rows sit inside the plate's own box. A row is one
 * line, so two suppliers compare at a glance; warnings and actions are
 * sentences and wrap.
 */
import { Children, type ReactNode } from "react";
import { Box, Text } from "bureau/primitives";
import { useFiguresWide } from "./figures_wide.ts";

export function HintRows({ children }: { children: ReactNode }) {
  return <Box direction="column" gap={3}>{children}</Box>;
}

export function HintLine({ children }: { children: ReactNode }) {
  return (
    <Box direction="column">
      <Text typeStyle="ui-15-loose" nowrap>{children}</Text>
    </Box>
  );
}

/** Set apart from its details by a gap alone: the rows under it are dimmer. */
export function HintHeading({ children }: { children: ReactNode }) {
  return (
    <Box direction="column" padding={[0, 0, 2, 0]}>
      <Text typeStyle="ui-15-loose" nowrap>{children}</Text>
    </Box>
  );
}

export function HintPair(
  { label, children }: { label: ReactNode; children: ReactNode },
) {
  return (
    <Box justify="between" gap={16}>
      <Text typeStyle="ui-14-loose" ink="dark" nowrap>{label}</Text>
      <Text typeStyle="ui-14-loose" nowrap>{children}</Text>
    </Box>
  );
}

/** Full ink, capped at 32 figures wide. */
export function HintWarning({ children }: { children: ReactNode }) {
  const width = useFiguresWide("ui-14-loose", 32);
  return (
    <Box
      direction="column"
      padding={[3, 0, 0, 0]}
      maxWidth={width}
    >
      <Text typeStyle="ui-14-loose">{children}</Text>
    </Box>
  );
}

/** In the softer ink, held apart from the facts above it. */
export function HintAction({ children }: { children: ReactNode }) {
  return (
    <Box direction="column" padding={[3, 0, 0, 0]}>
      <Text typeStyle="ui-14-loose" ink="dark">{children}</Text>
    </Box>
  );
}

/**
 * Words and key pictures (glyphs, keycaps) on one line, each centred on it,
 * in the voice of the row it stands in. A word is a string child; anything
 * else is a key.
 */
export function HintKeys({ children }: { children: ReactNode }) {
  return (
    <Box align="center" gap={6}>
      {Children.map(
        children,
        (child) => typeof child === "string" ? <Text>{child}</Text> : child,
      )}
    </Box>
  );
}
