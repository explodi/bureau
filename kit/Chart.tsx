import { formatNumber } from "./i18n/format.ts";
/**
 * Chart — a run of figures over time, cut into the chrome.
 *
 * One chart for every history the machine shows: a city statistic in the
 * stats window, a company's ledger in its inspector, a share of something
 * stacked month by month.
 *
 * The look, so a program never has to choose it:
 * - The plot is a WELL, one step lighter than the chrome, so the marks read
 *   as marks rather than as a sheet. Set on a well already or inside an
 *   instrument, the chart uses the parent's ground and margins: nesting
 *   another bevel would split one block of data into boxes.
 * - Gridlines at round figures, each labelled, the way an instrument's scale
 *   is: the axis is chosen for the data (chart_scale.ts), and its figures
 *   take exactly the width the widest needs, so a run of millions and a run
 *   of percentages each get their own margin.
 * - Marks are square, in the register's blocky hand; lines are two pixels. A
 *   series wears the meter's ink unless it carries a verdict (a tone ink) or
 *   is data with a colour of its own (a crop, a tax).
 * - The key sits under the well, once there is more than one thing to name,
 *   and the caption — what the run measures — under the key, so a chart
 *   carries its own explanation and no window lays one out beside it.
 *   The hover reading names every series at the column under the cursor —
 *   the whole column answers, not a radius around a marker.
 *
 * The whole well is one Plot, axes included, so every figure sits on the
 * gridline it names by the same arithmetic that places the line. Its inks
 * follow the chrome it sits in, so the same chart comes out in the dark
 * chrome's inks on an instrument.
 */

import {
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { host, type HostNode } from "bureau/host";
import {
  Box,
  type Ink,
  type PixelSource,
  Plot,
  type PlotCommand,
  Text,
} from "bureau/primitives";
import { Hint } from "./Hint.tsx";
import { MeterOnWell } from "./Meter.tsx";
import { HintHeading, HintPair, HintRows } from "./HintRows.tsx";
import { useLocalHint } from "./bureau_hint_channel.ts";
import {
  type ChartScale,
  nearestColumn,
  printableScale,
} from "./chart_scale.ts";
import { InstrumentPlace } from "./instrument_place.ts";

export type ChartMarker = {
  index: number;
  label?: string;
  ink?: Ink;
};

export type ChartSeries = {
  /** Stable identity: the React key, and what keeps a series its colour. */
  id: string;
  /** Named in the key and in the hover reading. */
  label: ReactNode;
  /** One value per column, in the columns' order. */
  values: readonly number[];
  /**
   * A role ink follows the chrome the chart sits in (`ink-good`); a palette
   * ink is data with a colour of its own. Defaults to the meter's ink: a
   * quantity, not a verdict.
   */
  ink?: Ink;
  /** Shade between the line and zero, in the line's own colour. */
  area?: boolean;
  /** A comparison baseline can differ in pattern as well as colour. */
  dashed?: boolean;
  /** Omitted: mark every sample. Empty: line only. */
  markers?: readonly ChartMarker[];
  /**
   * Below zero the line changes colour and name: the ledger's profit becomes
   * loss. Painted per segment, so a run crossing zero changes at the crossing.
   */
  belowZero?: { ink: Ink; label: ReactNode };
};

export type ChartAnnotation = {
  /** The column the marker sits over. */
  index: number;
  /** A small bitmap, drawn above the column's highest mark at pixel scale. */
  icon: string;
  /** What the marker means, read out with the column under the cursor. */
  label: ReactNode;
};

export type ChartMarks = "lines" | "stacked-bars";

type ChartProps = {
  series: readonly ChartSeries[];
  /** One per column: the hover reading's heading, e.g. "Mar 2001". */
  labels: readonly string[];
  /** Label these columns below the plot, e.g. every six hours. */
  xTicks?: readonly number[];
  /**
   * `lines` plots each series as a line; `stacked-bars` stacks them into one
   * bar per column, the first series at the bottom.
   */
  marks?: ChartMarks;
  /** How a figure is printed, on the axis and in the reading. */
  formatValue?: (value: number) => string;
  /**
   * The well's height in logical px, time labels included, or fill the
   * space left by the caption.
   */
  height?: number | "fill";
  annotations?: readonly ChartAnnotation[];
  /** Shown in the well when there is nothing to plot. */
  emptyLabel?: ReactNode;
  /**
   * What the run measures, set under the key as the chart's caption. A
   * program's own breakdown (a table of the figure's components) rides in
   * it too.
   */
  description?: ReactNode;
  /** The caption keeps room for this many lines, so a window holding several
   *  charts in turn does not jump as their captions change. */
  captionMinLines?: number;
};

const DEFAULT_INK: Ink = "meter-ink";
const MARKER = 6;
const LINE_WIDTH = 2;
const AREA_ALPHA = 0.15;
const ICON_SIZE = 18;
/** Between the plot and the well's edge: half a marker, half an axis figure. */
const PLOT_INSET = 10;
/** Half a square marker keeps the end samples whole at a parent's margin. */
const WELL_PLOT_INSET_X = 3;
const AXIS_STYLE = "mono-10-axis";
const TIME_STYLE = "mono-9-axis";
/** The well's edge to the axis figures, on a well of the chart's own. */
const AXIS_MARGIN = 8;
/** The axis figures to the plot. */
const AXIS_GAP = 6;
/** The row of time labels at the foot of the well. */
const X_AXIS_HEIGHT = 20;
/** A marker label's middle, above its sample. */
const MARKER_LABEL_RISE = 12;
/** Gridlines a chart with nothing to plot still draws, so the well reads as
 *  the chart it is about to hold. */
const EMPTY_GRIDLINES = 6;
/** A well that fills its window keeps a readable plot when a long caption
 *  makes the window scroll. */
const FILL_MIN_HEIGHT = 180;
/** The caption's line box: 14px at 1.5. */
const CAPTION_LINE_HEIGHT = 21;
const NO_ANNOTATIONS: readonly ChartAnnotation[] = [];
const NO_TICKS: readonly number[] = [];

const formatCount = (value: number) => formatNumber(Math.round(value));

/** A value's contribution to a stack: nothing when absent, NaN or negative. */
function positivePart(value: number | undefined): number {
  const isPositive = value !== undefined && Number.isFinite(value) && value > 0;
  return isPositive ? value : 0;
}

function stackTotals(
  series: readonly ChartSeries[],
  columnCount: number,
): number[] {
  return Array.from(
    { length: columnCount },
    (_, index) =>
      series.reduce((sum, s) => sum + positivePart(s.values[index]), 0),
  );
}

/** The axis the series earn, or undefined when there is nothing to plot. */
function buildScale(
  series: readonly ChartSeries[],
  totals: readonly number[] | undefined,
  columnCount: number,
  formatValue: (value: number) => string,
): ChartScale | undefined {
  if (columnCount === 0) return undefined;
  const values = totals ??
    series.flatMap((s) => s.values.slice(0, columnCount)).filter(
      Number.isFinite,
    );
  if (values.length === 0) return undefined;

  let low = Math.min(...values);
  let high = Math.max(...values);
  // A stack rises from zero, and a line whose shading or colour depends on
  // the sign of its values needs the zero rule in view.
  const includesZero = totals !== undefined ||
    series.some((s) => s.area === true || s.belowZero !== undefined);
  if (includesZero) {
    low = Math.min(low, 0);
    high = Math.max(high, 0);
  }
  return printableScale(low, high, formatValue, {
    integerOnly: values.every(Number.isInteger),
  });
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/** A series with its inks settled. */
type DrawnSeries = {
  values: readonly number[];
  area: boolean;
  ink: Ink;
  belowZeroInk: Ink;
  dashed: boolean;
  markers?: readonly ChartMarker[];
};

/** The plot's geometry, in the well's logical px, shared by the drawing
 *  steps. */
type Geometry = {
  /** The x of every column's centre. */
  columnXs: number[];
  yOf: (value: number) => number;
  zeroY: number;
  left: number;
  right: number;
};

function gridlines(
  ys: number[],
  left: number,
  right: number,
): PlotCommand[] {
  // A hairline on a half pixel is a crisp 1px rule; on a whole pixel it is
  // a 2px smear.
  return ys.flatMap((y) => {
    const snapped = Math.round(y) + 0.5;
    return [
      { kind: "move", x: left, y: snapped },
      { kind: "line", x: right, y: snapped, ink: "rule", width: 1 },
    ] as const;
  });
}

/** Each gridline's figure, right-aligned in the margin before the plot. */
function axisFigures(
  scale: ChartScale,
  figures: readonly string[],
  right: number,
  yOf: (value: number) => number,
): PlotCommand[] {
  return scale.ticks.map((tick, index) => ({
    kind: "text",
    x: right,
    y: Math.round(yOf(tick)),
    text: figures[index]!,
    ink: "ink",
    typeStyle: AXIS_STYLE,
    align: "end",
  }));
}

/**
 * The time labels under the plot, each centred on its column; the first
 * starts at its column and the last ends at its own, so neither leaves the
 * plot.
 */
function timeLabels(
  plot: Geometry,
  ticks: readonly number[],
  labels: readonly string[],
  y: number,
): PlotCommand[] {
  const lastPosition = ticks.length - 1;
  return ticks.flatMap((index, position) => {
    const x = plot.columnXs[index];
    const text = labels[index];
    if (x === undefined || text === undefined) return [];
    let align: "start" | "center" | "end" = "center";
    if (position === 0) align = "start";
    if (position === lastPosition) align = "end";
    return [{
      kind: "text",
      x,
      y,
      text,
      ink: "ink-neutral",
      typeStyle: TIME_STYLE,
      align,
    }];
  });
}

function zeroRule(plot: Geometry): PlotCommand[] {
  const y = Math.round(plot.zeroY);
  return [
    { kind: "dash", lengths: [5, 3] },
    { kind: "move", x: plot.left, y },
    { kind: "line", x: plot.right, y, ink: "ink-neutral", width: 2 },
    { kind: "dash", lengths: [] },
  ];
}

/** The points a line series has: one per column with a finite value. */
function linePoints(plot: Geometry, series: DrawnSeries) {
  return plot.columnXs.map((x, index) => {
    const value = series.values[index];
    if (value === undefined || !Number.isFinite(value)) return undefined;
    return { x, y: plot.yOf(value), value };
  });
}

/** The sign of a segment's mean picks its ink, so a run crossing zero
 *  changes colour at the crossing rather than at a point. */
function segmentInk(series: DrawnSeries, from: number, to: number): Ink {
  return (from + to) / 2 < 0 ? series.belowZeroInk : series.ink;
}

function area(plot: Geometry, series: DrawnSeries): PlotCommand[] {
  if (!series.area) return [];
  const points = linePoints(plot, series);
  const commands: PlotCommand[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    if (!from || !to) continue;
    commands.push({
      kind: "polygon",
      points: [
        [from.x, from.y],
        [to.x, to.y],
        [to.x, plot.zeroY],
        [from.x, plot.zeroY],
      ],
      ink: segmentInk(series, from.value, to.value),
      opacity: AREA_ALPHA,
    });
  }
  return commands;
}

/** One stroke per run of a single ink, broken where a value is missing. */
function line(
  plot: Geometry,
  series: DrawnSeries,
): PlotCommand[] {
  const points = linePoints(plot, series);
  const commands: PlotCommand[] = [
    { kind: "dash", lengths: series.dashed ? [5, 4] : [] },
  ];
  let run: { ink: Ink; points: [number, number][] } | null = null;
  const finish = () => {
    // Consecutive lines in one ink join into one polyline (Plot).
    if (run && run.points.length > 1) {
      const [first, ...rest] = run.points;
      commands.push({ kind: "move", x: first![0], y: first![1] });
      for (const [x, y] of rest) {
        commands.push({ kind: "line", x, y, ink: run.ink, width: LINE_WIDTH });
      }
    }
    run = null;
  };
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    if (!from || !to) {
      finish();
      continue;
    }
    const ink = segmentInk(series, from.value, to.value);
    if (!run || run.ink !== ink) {
      finish();
      run = { ink, points: [[from.x, from.y]] };
    }
    run.points.push([to.x, to.y]);
  }
  finish();
  commands.push({ kind: "dash", lengths: [] });
  const markers: readonly ChartMarker[] = series.markers ??
    points.map((_, index) => ({ index }));
  for (const marker of markers) {
    const point = points[marker.index];
    if (!point) continue;
    const ink = marker.ink ??
      (point.value < 0 ? series.belowZeroInk : series.ink);
    commands.push({
      kind: "rect",
      x: point.x - MARKER / 2,
      y: point.y - MARKER / 2,
      width: MARKER,
      height: MARKER,
      ink,
    });
    if (marker.label) {
      // Centred over its sample, but never past the plot's ends.
      const halfWidth = host.measureText("mono-10-solid", marker.label) / 2;
      const x = Math.max(
        plot.left + halfWidth,
        Math.min(plot.right - halfWidth, point.x),
      );
      commands.push({
        kind: "text",
        x,
        y: point.y - MARKER_LABEL_RISE,
        text: marker.label,
        ink,
        typeStyle: "mono-10-solid",
      });
    }
  }
  return commands;
}

/** One bar per column, the first series at the bottom. */
function stackedBars(
  plot: Geometry,
  series: readonly DrawnSeries[],
  barWidth: number,
): PlotCommand[] {
  const commands: PlotCommand[] = [];
  plot.columnXs.forEach((x, index) => {
    const left = Math.round(x - barWidth / 2);
    let top = plot.zeroY;
    for (const s of series) {
      const value = positivePart(s.values[index]);
      if (value === 0) continue;
      const height = plot.zeroY - plot.yOf(value);
      top -= height;
      commands.push({
        kind: "rect",
        x: left,
        y: top,
        width: barWidth,
        height,
        ink: s.ink,
      });
    }
  });
  return commands;
}

/** The y of each column's highest mark: what an annotation hangs over. */
function highestMarkYs(
  plot: Geometry,
  series: readonly DrawnSeries[],
  totals: readonly number[] | undefined,
): number[] {
  return plot.columnXs.map((_, index) => {
    if (totals) return plot.yOf(totals[index] ?? 0);
    const ys = series.flatMap((s) => {
      const value = s.values[index];
      const isPlottable = value !== undefined && Number.isFinite(value);
      return isPlottable ? [plot.yOf(value)] : [];
    });
    return Math.min(...ys);
  });
}

function annotationIcons(
  plot: Geometry,
  annotations: readonly ChartAnnotation[],
  highestYs: number[],
): PlotCommand[] {
  const commands: PlotCommand[] = [];
  for (const annotation of annotations) {
    const columnX = plot.columnXs[annotation.index];
    const markY = highestYs[annotation.index];
    if (
      columnX === undefined || markY === undefined || !Number.isFinite(markY)
    ) {
      continue;
    }
    // A column's icons sit side by side, centred over it.
    const column = annotations.filter((a) => a.index === annotation.index);
    const slot = column.indexOf(annotation);
    const x = columnX + (slot - (column.length - 1) / 2) * (ICON_SIZE + 2);
    // Above the mark, and never off the top of the well.
    const centreY = Math.max(
      ICON_SIZE / 2 + 2,
      markY - MARKER / 2 - 4 - ICON_SIZE / 2,
    );
    commands.push({
      kind: "image",
      source: annotation.icon as PixelSource,
      x: Math.round(x - ICON_SIZE / 2),
      y: Math.round(centreY - ICON_SIZE / 2),
      width: ICON_SIZE,
      height: ICON_SIZE,
    });
  }
  return commands;
}

/* ── The component ───────────────────────────────────────────────────────── */

export function Chart({
  series,
  labels,
  xTicks = NO_TICKS,
  marks = "lines",
  formatValue = formatCount,
  height: requestedHeight = 300,
  annotations = NO_ANNOTATIONS,
  emptyLabel,
  description,
  captionMinLines,
}: ChartProps) {
  const wellRef = useRef<HostNode | null>(null);
  const [wellSize, setWellSize] = useState({ width: 0, height: 0 });
  const onScopeWell = useContext(MeterOnWell);
  const place = useContext(InstrumentPlace);
  const onWell = onScopeWell || place !== "none";
  const insetX = onWell ? WELL_PLOT_INSET_X : PLOT_INSET;
  const fillsHeight = requestedHeight === "fill";
  const hasXAxis = xTicks.length > 0;
  const { tooltip, showTooltip, hideTooltip } = useLocalHint();

  const columnCount = labels.length;
  const isStacked = marks === "stacked-bars";
  const totals = useMemo(
    () => isStacked ? stackTotals(series, columnCount) : undefined,
    [isStacked, series, columnCount],
  );
  const scale = useMemo(
    () => buildScale(series, totals, columnCount, formatValue),
    [series, totals, columnCount, formatValue],
  );
  // A stack reads from the top down; so do its key and its reading.
  const readingOrder = isStacked ? [...series].reverse() : series;
  // Icons and labelled readings need room above the highest mark.
  const hasMarkerLabels = series.some((s) => s.markers?.some((m) => m.label));
  const insetTop = annotations.length > 0 || hasMarkerLabels
    ? PLOT_INSET + ICON_SIZE + 4
    : PLOT_INSET;

  // The well's room changes with the window and with the caption under it.
  useLayoutEffect(() => {
    const node = wellRef.current;
    if (!node) return;
    const measure = () => {
      const rect = host.measure(node);
      setWellSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    };
    measure();
    return host.observeLayout(measure);
  }, []);

  const drawing = useMemo((): {
    commands: PlotCommand[];
    columnXs: number[];
  } => {
    const { width, height } = wellSize;
    if (width === 0 || height === 0) return { commands: [], columnXs: [] };
    const top = insetTop;
    const bottom = height - PLOT_INSET - (hasXAxis ? X_AXIS_HEIGHT : 0);

    if (!scale) {
      // Nothing to plot yet: the rules alone, evenly spaced.
      const ys = Array.from(
        { length: EMPTY_GRIDLINES },
        (_, i) => top + ((bottom - top) * i) / (EMPTY_GRIDLINES - 1),
      );
      return {
        commands: gridlines(ys, insetX, width - insetX),
        columnXs: [],
      };
    }

    const figures = scale.ticks.map(formatValue);
    const figuresWidth = Math.max(
      ...figures.map((figure) => host.measureText(AXIS_STYLE, figure)),
    );
    const figuresRight = (onWell ? 0 : AXIS_MARGIN) + figuresWidth;
    const left = figuresRight + AXIS_GAP + insetX;
    const right = width - insetX;
    const span = right - left;
    const slot = span / columnCount;
    const columnXs = Array.from({ length: columnCount }, (_, i) => {
      if (isStacked) return left + slot * (i + 0.5);
      if (columnCount === 1) return left + span / 2;
      return left + (span / (columnCount - 1)) * i;
    });
    const yOf = (value: number) =>
      top +
      (bottom - top) * (1 - (value - scale.min) / (scale.max - scale.min));
    const geometry: Geometry = {
      columnXs,
      yOf,
      zeroY: yOf(0),
      left,
      right,
    };

    const commands = [
      ...gridlines(scale.ticks.map(yOf), left, right),
      ...axisFigures(scale, figures, figuresRight, yOf),
      ...timeLabels(geometry, xTicks, labels, height - X_AXIS_HEIGHT / 2),
    ];
    const crossesZero = scale.min < 0 && scale.max > 0;
    if (crossesZero) commands.push(...zeroRule(geometry));

    const drawn: DrawnSeries[] = series.map((s) => ({
      values: s.values,
      area: s.area === true,
      ink: s.ink ?? DEFAULT_INK,
      belowZeroInk: s.belowZero?.ink ?? s.ink ?? DEFAULT_INK,
      dashed: s.dashed === true,
      markers: s.markers,
    }));
    if (isStacked) {
      // A gap between bars, so they read as bars and not as one smear.
      const gap = Math.max(1, Math.min(6, Math.floor(slot * 0.15)));
      commands.push(
        ...stackedBars(geometry, drawn, Math.max(1, Math.floor(slot - gap))),
      );
    } else {
      for (const s of drawn) commands.push(...area(geometry, s));
      for (const s of drawn) commands.push(...line(geometry, s));
    }
    commands.push(
      ...annotationIcons(
        geometry,
        annotations,
        highestMarkYs(geometry, drawn, totals),
      ),
    );
    return { commands, columnXs };
  }, [
    wellSize,
    series,
    totals,
    isStacked,
    scale,
    columnCount,
    labels,
    xTicks,
    hasXAxis,
    formatValue,
    annotations,
    insetTop,
    insetX,
    onWell,
  ]);

  /** The hover reading for one column: its label, then every series' figure. */
  const readingFor = (index: number): ReactNode => {
    const total = totals?.[index] ?? 0;
    const notes = annotations.filter((a) => a.index === index);
    return (
      <HintRows>
        <HintHeading>{labels[index]}</HintHeading>
        {readingOrder.map((s) => {
          const value = s.values[index];
          if (value === undefined || !Number.isFinite(value)) return null;
          const below = value < 0 ? s.belowZero : undefined;
          const share = total > 0
            ? ` (${Math.round((value / total) * 100)}%)`
            : "";
          return (
            <HintPair
              key={s.id}
              label={
                <>
                  <Swatch ink={below?.ink ?? s.ink ?? DEFAULT_INK} inline />
                  {below?.label ?? s.label}
                </>
              }
            >
              {formatValue(value) + share}
            </HintPair>
          );
        })}
        {notes.map((note, i) => (
          <Box key={i} direction="column" padding={[3, 0, 0, 0]}>
            <Text typeStyle="ui-14-loose">{note.label}</Text>
          </Box>
        ))}
      </HintRows>
    );
  };

  const readColumnUnder = (point: { x: number; y: number }) => {
    const node = wellRef.current;
    if (!node) return;
    const index = nearestColumn(drawing.columnXs, point.x);
    if (index === undefined) return;
    const rect = host.measure(node);
    showTooltip(
      { x: rect.left + point.x, y: rect.top + point.y },
      readingFor(index),
    );
  };

  const key = readingOrder.flatMap((s) => {
    const entries = [{
      id: s.id,
      ink: s.ink ?? DEFAULT_INK,
      label: s.label,
      dashed: s.dashed === true,
    }];
    if (s.belowZero) {
      entries.push({
        id: `${s.id}:below-zero`,
        ink: s.belowZero.ink,
        label: s.belowZero.label,
        dashed: s.dashed === true,
      });
    }
    return entries;
  });

  const isEmpty = scale === undefined;

  return (
    <Box
      direction="column"
      gap={8}
      width="100%"
      grow={fillsHeight ? 1 : undefined}
      shrink={fillsHeight ? 0 : undefined}
      ink="ink"
    >
      <Box
        nodeRef={(node) => {
          wellRef.current = node;
        }}
        direction="column"
        height={fillsHeight ? undefined : requestedHeight}
        grow={fillsHeight ? 1 : undefined}
        shrink={fillsHeight ? 0 : undefined}
        basis={fillsHeight ? FILL_MIN_HEIGHT : undefined}
        minHeight={fillsHeight ? FILL_MIN_HEIGHT : undefined}
        fill={onWell ? undefined : "chart-well"}
        surface={onWell ? undefined : "well"}
        onHoverMove={readColumnUnder}
        onHoverChange={(inside) => {
          if (!inside) hideTooltip();
        }}
      >
        {
          /* Out of the flow, so the drawing never holds the well open at the
            size it was drawn for. */
        }
        <Box position="absolute" inset={{ top: 0, left: 0 }}>
          <Plot
            width={wellSize.width}
            height={wellSize.height}
            commands={drawing.commands}
          />
        </Box>
        {isEmpty && emptyLabel !== undefined && (
          <Box
            position="absolute"
            inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
            align="center"
            justify="center"
            padding={16}
          >
            <Text typeStyle="ui-14-solid" ink="ink-neutral" align="center">
              {emptyLabel}
            </Text>
          </Box>
        )}
      </Box>
      {key.length > 1 && (
        <Box wrap gap={[4, 16]}>
          {key.map((entry) => (
            <Box key={entry.id} role="listitem" align="center" gap={6}>
              {entry.dashed
                ? <DashKey ink={entry.ink} />
                : <Swatch ink={entry.ink} />}
              <Text typeStyle="ui-13-legend">{entry.label}</Text>
            </Box>
          ))}
        </Box>
      )}
      {description !== undefined && (
        <Box
          direction="column"
          minHeight={captionMinLines
            ? captionMinLines * CAPTION_LINE_HEIGHT
            : undefined}
        >
          <Text typeStyle="ui-14-loose">{description}</Text>
        </Box>
      )}
      <Hint {...tooltip} />
    </Box>
  );
}

/**
 * Every swatch in the kit wears the inlaid ring, never a border. `inline`:
 * set in a line of the reading, before a series' name.
 */
function Swatch({ ink, inline }: { ink: Ink; inline?: boolean }) {
  if (inline) {
    return (
      <Text
        hidden
        plate={{ fill: ink, surface: "ring", padding: [6, 6], trailing: 6 }}
      />
    );
  }
  return (
    <Box width={12} height={12} shrink={0} fill={ink} surface="ring" hidden />
  );
}

/** A dashed series is keyed by its dash, not a block of colour. */
function DashKey({ ink }: { ink: Ink }) {
  return (
    <Plot
      width={12}
      height={12}
      hidden
      commands={[
        { kind: "dash", lengths: [4, 3] },
        { kind: "move", x: 0, y: 6 },
        { kind: "line", x: 12, y: 6, ink, width: 2 },
      ]}
    />
  );
}
