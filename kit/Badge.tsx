/**
 * The attention badge: a small yellow chip pinned to the corner of a key —
 * the "!" on a toolbox drawer with an unseen unlock, the count on the gift
 * key, the mark on a fiscal sheet that wants a decision.
 *
 * The goal yellow, ringed and lifted off its key by one hard shadow, pinned
 * to the key's top-right corner: 4px above it, but flush with its right
 * edge, since dock tiles stand edge to edge and a neighbour must not wear
 * the chip. Its ink is black by name rather than
 * the chrome's ink: the chip is yellow on both chromes, and white on bright
 * yellow is the one pairing in this register nobody can read.
 */
import type React from "react";
import { Box, Text } from "bureau/primitives";

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <Box
      hidden
      position="absolute"
      inset={{ top: -4, right: 0 }}
      align="center"
      justify="center"
      minWidth={16}
      height={16}
      padding={[0, 3]}
      fill="goal"
      surface="badge"
      ink="db32-black"
    >
      <Text typeStyle="ui-10-solid">{children}</Text>
    </Box>
  );
}
