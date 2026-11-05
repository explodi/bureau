/**
 * ColorKey — what the map is painting: a titled column of swatch rows,
 * the content of the map legend (MapLegend). Keys live only there: an
 * instrument shows the city's numbers and controls, never a colour key.
 *
 * The legend is read from map distance: a 16px swatch, 12px between it and
 * its label, rows bounded by the shared widget width, and a 14px title. The
 * swatch uses the register's inlaid ring, and the title echoes the chrome's
 * caption voice so a key reads as a named section, not as content rows.
 */

import type React from "react";
import { Box, type Ink, Text } from "bureau/primitives";

export type ColorKeyItem = {
  /** The swatch's ink, e.g. paletteInk(ModelPalette.MANDY_RED). */
  ink: Ink;
  label: React.ReactNode;
};

const SWATCH = 16;

export function ColorKey(
  { title, items }: {
    title?: React.ReactNode;
    items: ReadonlyArray<ColorKeyItem>;
  },
) {
  return (
    <Box direction="column" gap={6}>
      {title && (
        <Box direction="column" padding={[0, 0, 4, 0]}>
          <Text typeStyle="ui-14-caps-spaced-solid" ink="ink-neutral">
            {title}
          </Text>
        </Box>
      )}
      <Box direction="column" gap={4}>
        {items.map((item, index) => (
          <Box
            key={index}
            role="listitem"
            align="center"
            gap={12}
            minWidth={150}
          >
            <Box
              width={SWATCH}
              height={SWATCH}
              shrink={0}
              fill={item.ink}
              surface="ring"
            />
            <Text typeStyle="ui-13-legend" ink="ink">
              {item.label}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
