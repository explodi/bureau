/**
 * Sheet — the register's data table, as the mayor's computer draws it:
 * a chrome band of column names over ruled white paper, figures right, labels
 * left, inside a sunken frame.
 *
 * Five programs had five tables and agreed on almost nothing — three row
 * heights, three header colours, zebra in two of them — so a player moving from
 * the payroll to the loan book to the grid's ledger read three different
 * documents. The pixels here are the ones most of those tables already
 * rendered; the disagreements were settled by counting, not by taste.
 *
 * Bureau has no tables, so a sheet is rows of cells laid out by column:
 * the program names each column's width once, and every row's cells take it.
 *
 *   <Sheet
 *     scroll
 *     stickyHeader
 *     columns={[{ width: "40%" }, {}]}
 *     header={
 *       <SheetRow>
 *         <SheetHeaderCell>Role</SheetHeaderCell>
 *         <SheetHeaderCell numeric>Salary</SheetHeaderCell>
 *       </SheetRow>
 *     }
 *   >
 *     <SheetRow interactive selected={id === current}>
 *       <SheetCell header>Fire chief</SheetCell>
 *       <SheetCell numeric tone="bad">$4,200</SheetCell>
 *     </SheetRow>
 *   </Sheet>
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { host, type HostNode } from "bureau/host";
import { Box, Scroll, Text, type TypeStyle } from "bureau/primitives";
import type { Tone } from "./Bureau.tsx";
import { useBoxHint } from "./bureau_status.ts";
import { measuredSize } from "./useMeasuredRect.ts";

export type SheetAlign = "left" | "center" | "right";

/**
 * A column's width: UI pixels, a share of the sheet (`"22%"`), its widest
 * cell (`"fit"`), or its widest cell plus a part of what is left in proportion
 * to it (`"auto"`). Left out, the column takes an equal share of what the
 * others leave.
 */
export type SheetColumn = {
  width?: number | `${number}%` | "fit" | "auto";
};

type SheetContextValue = {
  columns: readonly SheetColumn[];
  /** The measured widths, or null while the cells are being measured. */
  widths: readonly number[] | null;
  register: (column: number, cell: object, node: HostNode | null) => void;
  /** The column band's row, whose width the measured columns share out. */
  registerBand: (node: HostNode | null) => void;
  comfortable: boolean;
  zebra: boolean;
  ruled: boolean;
  mono: boolean;
};

const SheetContext = createContext<SheetContextValue | null>(null);
const ColumnContext = createContext(0);
const RowIndexContext = createContext(0);
const BandContext = createContext(false);

function useSheet(): SheetContextValue {
  const sheet = useContext(SheetContext);
  if (!sheet) throw new Error("A sheet's rows and cells need a <Sheet>");
  return sheet;
}

const isMeasured = (column: SheetColumn | undefined) =>
  column?.width === "fit" || column?.width === "auto";

/**
 * The widths measured columns take, in UI pixels: a `fit` column its widest
 * cell, an `auto` column its widest cell plus a part of the row's spare width
 * in proportion to it. Each part is a whole pixel but the last `auto`
 * column's, which takes what the others leave.
 */
export function distributeWidths(
  columns: readonly SheetColumn[],
  widest: readonly number[],
  rowWidth: number,
): number[] {
  const taken = columns.reduce((sum, column, index) => {
    const width = column.width;
    if (typeof width === "number") return sum + width;
    if (width === "fit" || width === "auto") return sum + widest[index]!;
    if (width?.endsWith("%")) {
      return sum + rowWidth * Number.parseFloat(width) / 100;
    }
    return sum;
  }, 0);
  const autos = columns.flatMap((column, index) =>
    column.width === "auto" ? [index] : []
  );
  const autoWidest = autos.map((index) => widest[index]!);
  const spare = rowWidth - taken;
  const widths = [...widest];
  const hasRoomToShare = spare > 0 && autoWidest.some((width) => width > 0);
  if (!hasRoomToShare) return widths;
  const parts = shareOut(spare, autoWidest);
  autos.forEach((index, at) => {
    widths[index] = widest[index]! + parts[at]!;
  });
  return widths;
}

/** `total` in proportion to `weights`, whole pixels but the last part. */
function shareOut(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const parts = weights.map((weight) => Math.floor(total * weight / sum));
  const given = parts.slice(0, -1).reduce((acc, part) => acc + part, 0);
  parts[parts.length - 1] = total - given;
  return parts;
}

/** The layout a column gives each of its cells. */
export function columnLayout(
  columns: readonly SheetColumn[],
  index: number,
  measured: number | undefined,
) {
  const width = columns[index]?.width;
  if (width === "fit" || width === "auto") {
    // While measuring, every cell takes its content's width.
    if (measured === undefined) return { shrink: 0 };
    return { width: measured, shrink: 0 };
  }
  if (typeof width === "number") return { width, shrink: 0 };
  return relativeLayout(columns, index);
}

const percentOf = (column: SheetColumn) =>
  typeof column.width === "string" && column.width.endsWith("%")
    ? Number.parseFloat(column.width)
    : null;

/**
 * A share of the row: a column's own percentage, or an unsized column's equal
 * part of what the sized ones leave. When every column is a share, the last
 * one takes whatever rounding leaves, so the shares fill the row exactly.
 */
function relativeLayout(columns: readonly SheetColumn[], index: number) {
  const column = columns[index]!;
  const isRelative = (other: SheetColumn) =>
    other.width === undefined || percentOf(other) !== null;
  const onlyRelative = columns.every(isRelative);
  const lastRelative = columns.findLastIndex(isRelative);
  if (onlyRelative && index === lastRelative) return { basis: 0, grow: 1 };
  const percent = percentOf(column);
  if (percent !== null) return { width: `${percent}%` as const, shrink: 0 };
  if (!onlyRelative) return { basis: 0, grow: 1 };
  const taken = columns.reduce(
    (sum, other) => sum + (percentOf(other) ?? 0),
    0,
  );
  const shares = columns.filter((other) => other.width === undefined).length;
  return { width: `${(100 - taken) / shares}%` as const, shrink: 0 };
}

/**
 * Column widths that depend on content, for rows of Box cells: every cell of a
 * `fit` or `auto` column registers its node, one row (any) registers as the
 * row whose width the columns share, and the widths come back once measured.
 *
 * Two passes: the cells lay out at their content's width, and each column's
 * widest cell decides its width before paint. New `source` (the rows) or the
 * row resizing measures again.
 */
export function useMeasuredColumns(
  columns: readonly SheetColumn[],
  source: unknown,
): {
  /** Null while measuring: cells then take their content's width. */
  widths: readonly number[] | null;
  register: (column: number, cell: object, node: HostNode | null) => void;
  registerRow: (node: HostNode | null) => void;
} {
  const cells = useRef(new Map<number, Map<object, HostNode>>()).current;
  const row = useRef<HostNode | null>(null);
  const [measured, setMeasured] = useState<
    { source: unknown; rowWidth: number; widths: number[] } | null
  >(null);
  const needsMeasure = columns.some(isMeasured);
  const measuring = needsMeasure && measured?.source !== source;

  useLayoutEffect(() => {
    if (!measuring || !row.current) return;
    const widestOf = (column: number) => {
      const nodes = [...(cells.get(column)?.values() ?? [])];
      return Math.max(0, ...nodes.map((node) => measuredSize(node).width));
    };
    const widest = columns.map((_, column) => widestOf(column));
    const rowWidth = measuredSize(row.current).width;
    const widths = distributeWidths(columns, widest, rowWidth);
    setMeasured({ source, rowWidth, widths });
  });

  useEffect(() => {
    const node = row.current;
    if (!needsMeasure || !node) return;
    return host.observeLayout(() => {
      const rowWidth = measuredSize(node).width;
      setMeasured((last) => last?.rowWidth === rowWidth ? last : null);
    });
  }, [needsMeasure]);

  return {
    widths: measuring ? null : measured?.widths ?? null,
    register: (column, cell, node) => {
      let columnCells = cells.get(column);
      if (!columnCells) {
        columnCells = new Map();
        cells.set(column, columnCells);
      }
      if (node) columnCells.set(cell, node);
      else columnCells.delete(cell);
    },
    registerRow: (node) => {
      row.current = node;
    },
  };
}

/* ── The sheet ───────────────────────────────────────────────────────────── */

type SheetProps = {
  columns: readonly SheetColumn[];
  /** The column band: one <SheetRow> of <SheetHeaderCell>s. */
  header: React.ReactNode;
  /** The records: <SheetRow>s of <SheetCell>s. */
  children?: React.ReactNode;
  /** `compact` (28px records) is the register's default and what most sheets
   *  render. `comfortable` (44px) is for a sheet whose rows hold a field. */
  density?: "compact" | "comfortable";
  /** Scroll the records inside the frame, which then takes a tab stop so a
   *  gamepad can read a register that runs past the window. */
  scroll?: boolean;
  /** Take the rest of a window's height. A frame pinned to the window holds
   *  however many records the city produces, so `fill` scrolls too. */
  fill?: boolean;
  /** The frame's tallest, in UI pixels. */
  maxHeight?: number;
  /** Keep the column band visible while the records scroll under it. */
  stickyHeader?: boolean;
  zebra?: boolean;
  /** Vertical column seams as well as horizontal record rules — the
   *  spreadsheet look, for a sheet that reads as cells rather than as lines of
   *  a report. */
  ruled?: boolean;
  /** Set the sheet in the mono face, for a ledger of money read down a column
   *  rather than a report read across a row. */
  mono?: boolean;
  /** The scrolling pane, for a program that drives it with the right stick. */
  scrollRef?: (node: HostNode | null) => void;
  id?: string;
};

export function Sheet(
  {
    columns,
    header,
    children,
    density = "compact",
    scroll,
    fill,
    maxHeight,
    stickyHeader,
    zebra,
    ruled = false,
    mono = false,
    scrollRef,
    id,
  }: SheetProps,
) {
  const measured = useMeasuredColumns(columns, children);
  const context: SheetContextValue = {
    columns,
    widths: measured.widths,
    register: measured.register,
    registerBand: measured.registerRow,
    comfortable: density === "comfortable",
    zebra: Boolean(zebra),
    ruled,
    mono,
  };

  const records = React.Children.toArray(children).map((row, index) => (
    <RowIndexContext.Provider key={keyOf(row, index)} value={index}>
      {row}
    </RowIndexContext.Provider>
  ));
  const band = <BandContext.Provider value>{header}</BandContext.Provider>;
  const scrolls = scroll || fill;
  const paper = scrolls
    ? (
      <Scroll
        nodeRef={scrollRef}
        focusable
        scrollbar="always"
        direction="column"
        grow={1}
        shrink={1}
        basis="auto"
        header={stickyHeader ? band : undefined}
      >
        <Box direction="column" shrink={0}>
          {!stickyHeader && band}
          {records}
        </Box>
      </Scroll>
    )
    : (
      <Box direction="column">
        {band}
        {records}
      </Box>
    );

  return (
    <SheetContext.Provider value={context}>
      <Box
        id={id}
        direction="column"
        padding={2}
        surface="well"
        grow={fill ? 1 : undefined}
        shrink={fill ? 1 : undefined}
        basis={fill ? "auto" : undefined}
        maxHeight={maxHeight}
      >
        {
          /* The well bevel is two pixels of inset shadow, and the paper would
            paint straight over it: the frame's padding holds the paper back. */
        }
        <Box
          direction="column"
          fill="paper"
          ink="ink"
          grow={1}
          shrink={1}
          basis="auto"
        >
          {paper}
        </Box>
      </Box>
    </SheetContext.Provider>
  );
}

function keyOf(row: React.ReactNode, index: number): React.Key {
  return React.isValidElement(row) && row.key !== null ? row.key : index;
}

/* ── Rows and cells ──────────────────────────────────────────────────────── */

export function SheetRow(
  { selected, interactive, attention, onPress, children }: {
    /** The record a menu command would act on — the era's selection blue. */
    selected?: boolean;
    /**
     * This row answers the pointer, because pressing it does something. An
     * interactive row is reachable without a mouse: a pad walks it and A,
     * Enter or Space presses it, because a record that only answers a click is one
     * a pad player cannot open at all.
     */
    interactive?: boolean;
    /** A record the player has not looked at yet: a ring cycling the
     *  palette until it is pressed. */
    attention?: boolean;
    /** What a press on the record does; a row that is not `interactive` still
     *  hears presses on its cells, but takes no stop of its own. */
    onPress?: () => void;
    children?: React.ReactNode;
  },
) {
  const { zebra, registerBand } = useSheet();
  const isBand = useContext(BandContext);
  // The stripe falls on the even records, counting from one.
  const index = useContext(RowIndexContext);
  const striped = zebra && index % 2 === 1;
  const look = interactive
    ? striped ? "sheet-row-interactive-stripe" : "sheet-row-interactive"
    : striped
    ? "sheet-row-stripe"
    : "sheet-row";
  const cells = React.Children.toArray(children).map((cell, column) => (
    <ColumnContext.Provider key={keyOf(cell, column)} value={column}>
      {cell}
    </ColumnContext.Provider>
  ));
  return (
    <Box
      nodeRef={isBand ? registerBand : undefined}
      look={look}
      selected={selected}
      direction="row"
      shrink={0}
      focusable={Boolean(interactive)}
      navigable={interactive}
      animation={attention ? "bureau-attention-rainbow" : undefined}
      onPress={onPress}
    >
      {cells}
    </Box>
  );
}

type CellProps = {
  align?: SheetAlign;
  /** A figure: right-aligned unless told otherwise. */
  numeric?: boolean;
  /** Status-bar help while this cell is hovered or focused. Requires a
   *  <Frame> ancestor; outside one it is a no-op. */
  hint?: string;
  children?: React.ReactNode;
};

/**
 * The register's one alignment rule, applied identically to a column's header
 * and to its records so the two can never drift apart: figures right, labels
 * left, and an explicit `align` overrides both.
 */
function justifyOf(align: SheetAlign | undefined, numeric?: boolean) {
  const resolved = align ?? (numeric ? "right" : "left");
  if (resolved === "left") return "start";
  return resolved === "center" ? "center" : "end";
}

/** A cell's place in its column: its width, and its node while measuring. */
function useColumnCell(spansRow = false) {
  const sheet = useSheet();
  const column = useContext(ColumnContext);
  const self = useRef({}).current;
  const measured = !spansRow && isMeasured(sheet.columns[column]);
  const nodeRef = measured
    ? (node: HostNode | null) => sheet.register(column, self, node)
    : undefined;
  const isLast = column === sheet.columns.length - 1;
  return {
    sheet,
    isLast,
    nodeRef,
    layout: spansRow
      ? { basis: 0, grow: 1 }
      : columnLayout(sheet.columns, column, sheet.widths?.[column]),
  };
}

/**
 * A column name. Takes the same `align`/`numeric` a record cell does, so a
 * column declares which kind it is once and its header follows.
 */
export function SheetHeaderCell(
  { align, numeric, hint, children }: CellProps,
) {
  const { sheet, nodeRef, layout } = useColumnCell();
  const hintProps = useBoxHint(hint);
  const face = sheet.mono ? "mono" : "ui";
  const size = sheet.comfortable ? 12 : 11;
  const figures = numeric ? "-figures" : "";
  const typeStyle = `${face}-${size}-caps${figures}-solid` as TypeStyle;
  return (
    <Box
      {...hintProps}
      {...layout}
      nodeRef={nodeRef}
      role="none"
      surface="sheet-band"
      ink="ink-neutral"
      height={sheet.comfortable ? 28 : 24}
      padding={[0, 8]}
      // The name spans the cell and aligns inside its line, so a right-hand
      // name ends at the cell's padding.
      direction="column"
      justify="center"
      overflow="hidden"
    >
      <Text
        typeStyle={typeStyle}
        align={justifyOf(align, numeric)}
        lines={1}
        ellipsis
      >
        {children}
      </Text>
    </Box>
  );
}

/**
 * One field of one record.
 *
 * A string or a number is set in the sheet's type; anything else is laid in
 * the cell as it is, centred on the record's height.
 */
export function SheetCell(
  {
    align,
    tone,
    numeric,
    wrap,
    spansRow,
    padding,
    verticalAlign,
    hint,
    children,
  }:
    & CellProps
    & {
      tone?: Tone;
      /** Let this cell's text wrap and grow the row. For prose columns only. */
      wrap?: boolean;
      /** The record's one cell, across every column: a note under the rows. */
      spansRow?: boolean;
      /** The inset on every side, in UI pixels, for a cell that holds a card. */
      padding?: number;
      /** A wrapping cell hangs from the top unless told to centre. */
      verticalAlign?: "top" | "middle";
    },
) {
  const { sheet, isLast, nodeRef, layout } = useColumnCell(spansRow);
  const hintProps = useBoxHint(hint);
  const face = sheet.mono ? "mono" : "ui";
  const size = sheet.comfortable ? 16 : 14;
  const isText = typeof children === "string" || typeof children === "number";
  const ruledSeam = sheet.ruled && !isLast && !spansRow;
  const justify = justifyOf(align, numeric);
  const vertical = (verticalAlign ?? (wrap ? "top" : "middle")) === "top"
    ? "start"
    : "center";

  return (
    <Box
      {...hintProps}
      {...layout}
      nodeRef={nodeRef}
      role="cell"
      look={ruledSeam ? "sheet-cell-ruled" : "sheet-cell"}
      ink={tone ? `ink-${tone}` : undefined}
      minHeight={sheet.comfortable ? 44 : 28}
      padding={padding ?? (wrap ? 8 : [0, 8])}
      // Text spans the cell and aligns inside its line, so a right-hand figure
      // ends at the cell's padding. Anything else sits in a row of its own, so
      // the cell centres it whatever the child says about its own alignment.
      direction="column"
      align="stretch"
      justify={vertical}
      overflow={wrap ? undefined : "hidden"}
    >
      {isText && wrap && (
        <Text
          typeStyle={`${face}-${size}-prose` as TypeStyle}
          align={justify}
        >
          {children}
        </Text>
      )}
      {isText && !wrap && (
        <Text
          typeStyle={`${face}-${size}-${
            numeric ? "figures-" : ""
          }solid` as TypeStyle}
          align={justify}
          lines={1}
          ellipsis
        >
          {children}
        </Text>
      )}
      {!isText && (
        <Box direction="row" align="center" justify={justify}>
          {children}
        </Box>
      )}
    </Box>
  );
}
