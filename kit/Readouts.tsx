/**
 * The shapes a block of figures is built from on the mayor's computer: a titled
 * section, the as-of-when chip it is stamped with, a reflowing row of readouts,
 * one readout, and the stamp that carries a verdict.
 *
 * `cadence` is a REQUIRED prop on Section, and that is the point of this
 * file: a daily reading and a monthly table can legitimately disagree for up
 * to a month, and a player who cannot see which clock a block is on files that
 * as a bug. Making the prop
 * mandatory means a new block cannot be added without answering "as of when?".
 */
import { createContext, type ReactNode, useContext } from "react";
import { Box, type Ink, Text } from "bureau/primitives";
import { Icon, type Tone } from "./Bureau.tsx";
import { Columns } from "./Columns.tsx";
import { useBoxHint } from "./bureau_status.ts";
import type { ThemeInk } from "./tokens.ts";
import { useNodeHint } from "./useNodeHint.ts";

const TONE_INKS: Record<Tone, ThemeInk> = {
  neutral: "ink",
  good: "ink-good",
  warn: "ink-warn",
  bad: "ink-bad",
};

/**
 * A titled block of figures, stamped with the clock it was read off.
 *
 * Sections stack on one sheet and separate themselves with a hairline rule, so
 * a program composes a tab by listing them and nothing else: a flat ledger
 * rule between blocks rather than a depth edge, as they are one sheet of
 * paper, not a stack of panels.
 */
export function Section(
  { title, cadence, last, children }: {
    title: string;
    /** As of when: "today", "this month", "at completion". */
    cadence: string;
    /** The last block on its sheet, with no rule under it. */
    last?: boolean;
    children: ReactNode;
  },
) {
  return (
    <Box
      direction="column"
      gap={8}
      padding={[10, 8]}
      look={last ? undefined : "ruled"}
      ink="ink"
    >
      <Box align="center" justify="between" gap={8}>
        <Text typeStyle="ui-16-caps-tight" role="heading">
          {title}
        </Text>
        <Cadence>{cadence}</Cadence>
      </Box>
      {children}
    </Box>
  );
}

/**
 * The as-of-when chip on its own, for the blocks that are not sections.
 *
 * <Section> stamps one on every block it renders; this is for the blocks
 * that have no Section to hang it on, such as a card's header band or the space
 * above a bare table. Small, grey and ringed in the register's soft dark so it
 * reads as a label ON the block rather than a figure inside it.
 */
export function Cadence({ children }: { children: ReactNode }) {
  return (
    <Box shrink={0} padding={[2, 6]} fill="face" surface="hairline">
      <Text typeStyle="ui-11-caps" ink="ink-neutral" nowrap>
        {children}
      </Text>
    </Box>
  );
}

/** A readout in a Tiles row stretches to its column's height. */
const InTiles = createContext(false);

/**
 * A row of readouts that reflows to fewer columns in a narrow window: as many
 * 150px tiles as fit, sharing the row, which also covers the fixed two-up row
 * the bank drew by hand.
 *
 * It takes <Readout> children only: a readout is a term and its figure.
 */
export function Tiles({ children }: { children: ReactNode }) {
  return (
    <InTiles.Provider value>
      <Columns min={150} gap={8}>{children}</Columns>
    </InTiles.Provider>
  );
}

/**
 * One readout: a label, a figure, and an optional line of context, in the
 * sunken well: content cut into the chrome, holding data rather than
 * offering an action. The figure is 26px over a small uppercase grey label.
 *
 * `label`, `value` and `note` are plain strings rather than nodes on purpose —
 * the figure clips with an ellipsis and the row aligns every figure on one
 * baseline, and both of those contracts break the moment a caller nests markup
 * in the slot.
 *
 * Tone colours the FIGURE only, never the label or the note — a red number is
 * a claim about the number, and colouring the whole tile would make the claim
 * about the tile.
 */
export function Readout(
  { label, value, note, tone = "neutral", hint, orientation = "stacked", mark }:
    {
      label: string;
      value: string;
      note?: string;
      tone?: Tone;
      /** Explains the figure in the window's status bar on hover or focus.
       *  Requires a <Frame> ancestor; outside one, this is a no-op. */
      hint?: string;
      /**
       * `stacked` is a tile in a grid of figures. `inline` is the same readout
       * laid along a toolbar row, where a window carries one running total
       * beside its controls rather than a block of them — the shop's funds, a
       * treasury balance. Both are the same component because they are the same
       * claim; only the axis differs.
       */
      orientation?: "stacked" | "inline";
      /** A glyph before the label, for an inline readout that has to be found
       *  at a glance in a row of buttons. Decorative: the label still names it.
       *  An 18px picture. */
      mark?: ReactNode;
    },
) {
  const hintProps = useBoxHint(hint);
  const inTiles = useContext(InTiles);
  const isInline = orientation === "inline";
  return (
    <Box
      {...hintProps}
      role="listitem"
      direction={isInline ? "row" : "column"}
      align={isInline ? "center" : undefined}
      gap={isInline ? 6 : undefined}
      minHeight={isInline ? 32 : undefined}
      grow={inTiles ? 1 : undefined}
      padding={[6, 8]}
      fill="paper"
      surface="well"
    >
      {mark && (
        <Box align="center" shrink={0} hidden>
          {mark}
        </Box>
      )}
      <Text typeStyle="ui-12-caps-label" ink="ink-neutral">{label}</Text>
      {
        /* The `auto` top holds every figure in a row on one baseline when a
          single label wraps to two lines in a translated build. */
      }
      <Box direction="column" margin={isInline ? 0 : ["auto", 0, 0, 0]}>
        <Text
          typeStyle={isInline ? "ui-18-figures-tight" : "ui-26-figures-tight"}
          ink={TONE_INKS[tone]}
          lines={1}
          ellipsis
        >
          {value}
        </Text>
      </Box>
      {note && (
        <Box direction="column" margin={isInline ? [0, 0, 0, 4] : 0}>
          <Text typeStyle="ui-12-label" ink="ink-neutral">{note}</Text>
        </Box>
      )}
    </Box>
  );
}

/** A headline figure with its unit, a plain-language verdict and a face or
 * symbol. The figure's colour carries the verdict; the chrome stays quiet. */
export function StatusReadout(
  { label, value, status, icon, ink = "ink" }: {
    label: string;
    value: string;
    status: string;
    icon: string;
    /** The figure's ink: its verdict. */
    ink?: Ink;
  },
) {
  return (
    <Box align="center" gap={12} ink="ink">
      <Box direction="column-reverse" gap={4} shrink={0}>
        <Text typeStyle="ui-11-solid" ink="ink-neutral">{label}</Text>
        <Text typeStyle="mono-26-figures-solid" ink={ink}>{value}</Text>
      </Box>
      <Box direction="column" grow={1} basis={0}>
        <Text typeStyle="ui-16-compact">{status}</Text>
      </Box>
      <Icon src={icon} size={40} />
    </Box>
  );
}

const STAMP_FILLS: Record<Tone, ThemeInk> = {
  neutral: "face",
  good: "fill-good",
  warn: "fill-warn",
  bad: "fill-bad",
};
const STAMP_INKS: Record<Tone, ThemeInk> = {
  neutral: "ink",
  good: "knockout-good",
  warn: "knockout-warn",
  bad: "knockout-bad",
};

/** Each stamp's box and type: the word, a meter's twin and the step glyphs. */
const STAMP_SHAPES = {
  word: {
    minWidth: undefined,
    minHeight: 20,
    width: undefined,
    height: undefined,
    padding: [2, 8],
    justify: "start",
    typeStyle: "ui-12-caps-solid",
  },
  meter: {
    minWidth: undefined,
    minHeight: 20,
    width: undefined,
    height: 20,
    padding: [0, 8],
    justify: "start",
    typeStyle: "ui-14-upper-solid",
  },
  glyph: {
    minWidth: 24,
    minHeight: 24,
    width: undefined,
    height: undefined,
    padding: [2, 2],
    justify: "center",
    typeStyle: "mono-12-upper-solid",
  },
  "glyph-large": {
    minWidth: 0,
    minHeight: 0,
    width: 32,
    height: 32,
    padding: [0, 0],
    justify: "center",
    typeStyle: "mono-22-upper-solid",
  },
} as const;

/**
 * The word rubber-stamped on a catalog page, a contract receipt or a table row:
 * SIGNED, CURTAILED, HIRING. Flat and uppercase, with the tone filling the
 * field rather than tinting the type, so a column of stamps reads down a table
 * at a glance; edged with the register's own hard ink ring.
 *
 * A stamp states a status in one word. If it needs a sentence, that sentence is
 * a `hint` and belongs in the status bar, not in the chip.
 *
 * WHY there are only four tones, when the bank's credit rating has five steps:
 * the register's colour law is that chrome is grey and a coloured figure is a
 * claim, and it can make exactly one of four claims. A five-colour ramp would
 * be colour used as decoration, which is the law's opposite. A graded scale
 * instead splits the two jobs — `glyph` carries the STEP (the letter A…E, which
 * is the precise value) and `tone` carries the VERDICT (whether that step is
 * good news) — so A and B can share a tone without losing the distinction
 * between them, because the letter never stopped being visible.
 */
export function Stamp(
  {
    tone = "neutral",
    glyph,
    large,
    readout,
    alignSelf = "start",
    hint,
    tooltip,
    pop,
    wrap,
    children,
  }: {
    tone?: Tone;
    /** Centred in its column, and its words wrap to the column's width. */
    wrap?: boolean;
    /** A single-character badge: mono, centred, square-ish. For one step of a
     *  graded scale — a credit rating, a grade, a tier. */
    glyph?: boolean;
    /** A grade beside an instrument's title: 32 pixels square, its glyph
     *  set large. */
    large?: boolean;
    /** Level with a meter beside it: the track's 20px height and its
     *  readout's type. */
    readout?: boolean;
    /** Where it stands across its row: at the top of a column of text by
     *  default, `center` level with a name or a meter beside it, `auto` as
     *  the row aligns everything else. */
    alignSelf?: "start" | "center" | "auto";
    /** Explains the stamp in the window's status bar. Requires a
     *  <Frame> ancestor; outside one, this is a no-op. */
    hint?: string;
    /**
     * The same explanation on the floating plate, for a stamp inside a
     * window that has no status bar — an inspector opens in a <Dialog>
     * and its flags are read while the pointer rests. Hover only, like the
     * flag it replaces: a stamp is not a stop on the pad's walk.
     */
    tooltip?: ReactNode;
    /**
     * One-shot entry pop for a stamp that just appeared (ON DIVERT, NO
     * POWER). Off by default: a chronically bad state must not pulse, and
     * after the pop the stamp holds still.
     */
    pop?: boolean;
    children: ReactNode;
  },
) {
  const hintProps = useBoxHint(hint);
  const tip = useNodeHint();
  const tipProps: Partial<ReturnType<typeof tip>> = tooltip ? tip(tooltip) : {};
  let shapeName: keyof typeof STAMP_SHAPES = "word";
  if (readout) shapeName = "meter";
  if (glyph) shapeName = "glyph";
  if (large) shapeName = "glyph-large";
  const shape = STAMP_SHAPES[shapeName];
  return (
    <Box
      {...hintProps}
      {...tipProps}
      onHoverChange={(inside) => {
        hintProps.onHoverChange?.(inside);
        tipProps.onHoverChange?.(inside);
      }}
      onFocusChange={(focused) => {
        hintProps.onFocusChange?.(focused);
        tipProps.onFocusChange?.(focused);
      }}
      align="center"
      justify={wrap ? "center" : shape.justify}
      alignSelf={wrap ? "center" : alignSelf}
      maxWidth={wrap ? "100%" : undefined}
      minWidth={shape.minWidth}
      minHeight={shape.minHeight}
      width={shape.width}
      height={shape.height}
      padding={shape.padding}
      fill={STAMP_FILLS[tone]}
      surface="ring"
      ink={STAMP_INKS[tone]}
      animation={pop ? "bureau-pop" : undefined}
    >
      <Text
        typeStyle={wrap ? "ui-12-caps-snug" : shape.typeStyle}
        align={wrap ? "center" : undefined}
        nowrap={!wrap}
      >
        {children}
      </Text>
    </Box>
  );
}
