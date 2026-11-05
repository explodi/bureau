/**
 * Compact instrument readings, as a list or a two-column grid: label left,
 * figure right on a 4px rhythm, or pairs of readings with each figure under
 * its label. Bureau owns icon sizing, typography and spacing in both layouts.
 */

import type React from "react";
import { Box, type Ink, Text } from "bureau/primitives";
import { Icon } from "./Bureau.tsx";

export type StatItem = {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Decorative bitmap path; the label names the reading. */
  icon?: string;
  /** Data colour for the figure: a palette or role ink. */
  ink?: Ink;
  note?: React.ReactNode;
};

export function StatList(
  { items, layout = "rows" }: {
    items: ReadonlyArray<StatItem>;
    /**
     * `rows` is label left, figure right, one item per line — a list the eye
     * scans down. `columns` groups readings in pairs, each figure under its
     * label, with more pairs continuing on the next row.
     */
    layout?: "rows" | "columns";
  },
) {
  if (layout === "columns") return <StatColumns items={items} />;
  return (
    <Box direction="column" gap={4}>
      {items.map((item, index) => (
        <Box key={index} role="listitem" justify="between" align="baseline">
          <Box align="center" gap={4} overflow="hidden">
            {item.icon && <StatIcon src={item.icon} />}
            <Text typeStyle="ui-14-solid" ink="ink" lines={1} ellipsis>
              {item.label}
            </Text>
          </Box>
          <Box direction="column" margin={[0, 0, 0, 8]}>
            <Text typeStyle="mono-12-figures-solid" ink={item.ink ?? "ink"}>
              {item.value}
            </Text>
            {item.note && <StatNote>{item.note}</StatNote>}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Pairs of readings, 12px apart. A pair's labels share one row and its
 * figures the next, so the figures line up even when a translated label
 * wraps.
 */
function StatColumns({ items }: { items: ReadonlyArray<StatItem> }) {
  const pairs: StatItem[][] = [];
  for (let index = 0; index < items.length; index += 2) {
    pairs.push(items.slice(index, index + 2));
  }
  return (
    <Box direction="column" gap={16}>
      {pairs.map((pair, index) => (
        <Box key={index} direction="column" gap={4}>
          <Box gap={12} align="start">
            {pair.map((item, column) => (
              <Box
                key={column}
                grow={1}
                basis={0}
                align="center"
                gap={4}
                minHeight={16}
              >
                {item.icon && <StatIcon src={item.icon} />}
                <Text typeStyle="ui-12-label" ink="ink-neutral">
                  {item.label}
                </Text>
              </Box>
            ))}
            {pair.length === 1 && <Box grow={1} basis={0} />}
          </Box>
          <Box gap={12} align="start">
            {pair.map((item, column) => (
              <Box key={column} direction="column" grow={1} basis={0}>
                <Text typeStyle="mono-16-figures-solid" ink={item.ink ?? "ink"}>
                  {item.value}
                </Text>
                {item.note && <StatNote>{item.note}</StatNote>}
              </Box>
            ))}
            {pair.length === 1 && <Box grow={1} basis={0} />}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function StatIcon({ src }: { src: string }) {
  return <Icon src={src} size={16} />;
}

function StatNote({ children }: { children: React.ReactNode }) {
  return (
    <Box direction="column" padding={[4, 0, 0, 0]}>
      <Text typeStyle="ui-12-note" ink="ink-neutral">{children}</Text>
    </Box>
  );
}
