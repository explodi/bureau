import { Children, type ReactNode } from "react";
import { Box } from "bureau/primitives";
import { useMeasuredRect } from "./useMeasuredRect.ts";

/**
 * How wide each of `cells` cells is in a row `rowWidth` wide: as many columns
 * as fit at `min` pixels or more, never more columns than cells, sharing the
 * row between them in whole pixels. A row narrower than `min` gives its one
 * cell the row.
 */
export function columnWidth(
  rowWidth: number,
  cells: number,
  min: number,
  gap: number,
): number {
  const least = Math.min(min, rowWidth);
  const fitting = Math.floor((rowWidth + gap) / (least + gap));
  const columns = Math.max(1, Math.min(fitting, cells));
  // Floored: Yoga wraps in float32, and an exact share can sum a hair past the
  // row and drop the last cell to a row of its own.
  return Math.floor((rowWidth - gap * (columns - 1)) / columns);
}

/**
 * Cells in equal columns, as many to a row as fit at `min` pixels or more,
 * the row's width shared out between them: a report's figures read across,
 * a gallery of choices. The row is measured, then its cells take their width.
 */
export function Columns(
  { min, gap, children }: { min: number; gap: number; children: ReactNode },
) {
  const [measure, row] = useMeasuredRect();
  const cells = Children.toArray(children);
  const width = row === null
    ? undefined
    : columnWidth(row.width, cells.length, min, gap);
  return (
    <Box nodeRef={measure} wrap shrink={0} gap={gap}>
      {width !== undefined &&
        cells.map((cell, index) => (
          <Box key={index} direction="column" width={width} shrink={0}>
            {cell}
          </Box>
        ))}
    </Box>
  );
}
