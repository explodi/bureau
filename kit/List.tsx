import { host, type HostNode } from "bureau/host";
/**
 * List — the rows an instrument's body is made of: a route, a bus
 * model, a stop on a line, a service category.
 *
 * Not a sheet. <Sheet> is a table of cells with a 24px band and ruled
 * 28/44px records; these are 44px flex rows holding a badge,
 * a two-line label, nested action keys and, in the line editor, a strip-map
 * spine. The row owns the hover/selected fill, the pad's selection ring and
 * scrolling itself into view; the caller supplies the inner layout via
 * children, typically a leading icon, a <ListLabel> and trailing action
 * keys or a `chevron`. Nothing here is a bevel: a row is flat data on the
 * well, with its disclosure mark engraved directly into the row.
 *
 * Geometry defaults to the standard 44px row; pass a height for content
 * that needs more room. Inset, gap and alignment are equally overridable per
 * instance through props.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Box, type KeyEvent, Scroll, Text } from "bureau/primitives";
import { contrastingTextColor } from "./contrast_color.ts";
import type { PaletteName } from "./tokens.ts";
import { Icon, type Tone } from "./Bureau.tsx";
import { Mark } from "./Mark.tsx";

/** Every row but the last is ruled under, so the rows read as one list. */
const RuledContext = createContext(false);

/** A flex column of <ListRow>s. Given a height it scrolls on its own,
 *  its bar hidden: the line editor's 220px stop list. A `title` heads it as
 *  a section's quiet caps heading does, saying what the rows are; it stays
 *  put while they scroll. */
export function List(
  { title, maxHeight, children }: {
    title?: string;
    /** The tallest the list grows before it scrolls inside the body's own. */
    maxHeight?: number;
    children: React.ReactNode;
  },
) {
  const rows = React.Children.toArray(children);
  const ruled = rows.map((row, index) => (
    <RuledContext.Provider key={index} value={index < rows.length - 1}>
      {row}
    </RuledContext.Provider>
  ));
  const list = maxHeight === undefined
    ? <Box direction="column">{ruled}</Box>
    : (
      <Scroll direction="column" maxHeight={maxHeight} scrollbar="hidden">
        {ruled}
      </Scroll>
    );
  if (title === undefined) return list;
  return (
    <Box direction="column">
      <Box padding={[10, 12, 4, 12]}>
        <Text typeStyle="ui-11-caps-solid" ink="ink-neutral" role="heading">
          {title}
        </Text>
      </Box>
      {list}
    </Box>
  );
}

type ListRowProps = {
  /** Pad/keyboard selection state — drives the selected fill, the ring (see
   * `ring`) and auto-scrolls the row into view. */
  selected?: boolean;
  /** How the selection ring renders when `selected` is true:
   *  - "row" (default): the register's dotted ring around the whole row —
   *    the row is the activation target, or holds a cluster of actions.
   *  - "none": no ring — the fill alone is the signal. Use in dense lists
   *    where a ring around every row would be noise. */
  ring?: "row" | "none";
  /** The press on the WHOLE row, so pressing anywhere on it (text, padding,
   * the dead space around a short child) activates it. A key inside the row
   * owns its own press, so a remove "X" never also selects the row. */
  onClick?: () => void;
  /** Fires when the row itself takes focus. A list whose footer keys act on
   * "the selected row" reads this so that, with a pad connected, the row the
   * D-pad rests on IS the selection. */
  onFocus?: () => void;
  /** The pointer came over the row: a list that previews what it hovers. */
  onHover?: () => void;
  /** A key while the row has focus; true when the row used it, so it goes no
   * further (Enter then does not also press the row). */
  onKey?: (key: KeyEvent) => boolean;
  /** A handle for a list that has to hand focus to a particular row itself —
   * the neighbour of a row it just removed. */
  id?: string;
  /** A row that is itself the single target, focusable and spoken as a key
   *  ("button"), rather than one that holds keys of its own. */
  as?: "div" | "button";
  /** Row height in px. Defaults to 44; larger content can request more. */
  height?: number;
  /** Horizontal inset in px, both sides. Defaults to 12 (the panel's edge
   * inset). Pass 0 when children own their own edge padding. */
  paddingX?: number;
  /** Gap between direct children in px. Defaults to 12. */
  gap?: number;
  /** Cross-axis alignment of children. Defaults to "center"; "stretch" lets
   * a child fill the row's full height. */
  align?: "center" | "stretch";
  /** Trailing disclosure arrow — the row drills into a sub-view. Purely
   * visual; the row's `onClick` does the navigating. */
  chevron?: boolean;
  /** Fill of the selected state: a palette colour (a bus line's) makes the
   * chosen row read in that list's own hue, its text in the ink that
   * contrasts with it. Defaults to the register's selected-row fill. */
  selectedColor?: `db32-${PaletteName}`;
  /** Switched off but still pressable: the row fades to half strength. */
  dimmed?: boolean;
  /** Drawn in the row's left inset against the row's own box, under its
   *  content: a strip map's spine running down a list of stops. */
  gutter?: React.ReactNode;
  /** Keys at the row's end shown only while it is hovered or selected, so a
   *  long list reads as names rather than a column of buttons. */
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function ListRow({
  selected = false,
  ring = "row",
  onClick,
  onFocus,
  onHover,
  onKey,
  id,
  as = "div",
  height = 44,
  paddingX = 12,
  gap = 12,
  align = "center",
  chevron = false,
  selectedColor,
  dimmed = false,
  gutter,
  actions,
  children,
}: ListRowProps) {
  const rowRef = useRef<HostNode | null>(null);
  const [hovered, setHovered] = useState(false);
  const ruled = useContext(RuledContext);

  useEffect(() => {
    if (selected) host.scrollIntoView(rowRef.current);
  }, [selected]);

  const interactive = Boolean(onClick) || as === "button";
  const ringed = ring === "row";
  const look = interactive
    ? (ringed ? "list-row-interactive" : "list-row-interactive-quiet")
    : (ringed ? "list-row" : "list-row-quiet");
  const customFill = selected && selectedColor !== undefined;
  return (
    <Box
      nodeRef={(node) => {
        rowRef.current = node;
      }}
      id={id}
      role={as === "button" ? "button" : undefined}
      look={look}
      selected={selected}
      fill={customFill ? selectedColor : undefined}
      ink={customFill ? contrastingTextColor(selectedColor) : undefined}
      surface={ruled ? "ruled" : undefined}
      opacity={dimmed ? 0.5 : undefined}
      shrink={0}
      align={align}
      gap={gap}
      padding={[0, paddingX]}
      height={height}
      focusable={as === "button"}
      onPress={onClick}
      onFocusChange={(focused) => {
        if (focused) onFocus?.();
      }}
      onHoverChange={(inside) => {
        setHovered(inside);
        if (inside) onHover?.();
      }}
      onKey={onKey}
    >
      {gutter}
      {children}
      {(hovered || selected) && actions}
      {chevron && <Mark mark="right" size={16} />}
    </Box>
  );
}

type ListLabelProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A verdict on the subtitle line: an overcrowded route in the warn ink. */
  subtitleTone?: Tone;
  /** `large`: the title in body type and its facts one step down, for a
   *  window read at arm's length rather than an instrument's dense list. */
  size?: "large";
  /** Capitalizes the title's words: a city's stored name is lowercase. */
  capitalize?: true;
  /** A small figure after the title, in the data font and the good ink:
   *  how many the player owns. */
  titleNote?: React.ReactNode;
};

const SUBTITLE_INKS = {
  neutral: "ink-neutral",
  good: "ink-good",
  warn: "ink-warn",
  bad: "ink-bad",
} as const;

/** One line, clipped with an ellipsis when the row is cramped. */
function LabelLine(
  { typeStyle, ink, margin, children }: {
    typeStyle: React.ComponentProps<typeof Text>["typeStyle"];
    ink: React.ComponentProps<typeof Text>["ink"];
    margin?: number;
    children: React.ReactNode;
  },
) {
  return (
    <Box overflow="hidden" margin={margin ? [margin, 0, 0, 0] : undefined}>
      <Text typeStyle={typeStyle} ink={ink} lines={1} ellipsis>
        {children}
      </Text>
    </Box>
  );
}

/** The standard two-line text block of a row: title over a muted subtitle,
 * claiming the flexible middle of the row and ellipsizing when cramped. */
export function ListLabel(
  { title, subtitle, subtitleTone, size, capitalize, titleNote }:
    ListLabelProps,
) {
  const hasSubtitle = subtitle !== undefined && subtitle !== null &&
    subtitle !== "";
  const large = size === "large";
  const titleStyle = large
    ? (capitalize ? "ui-18-capitalize-solid" : "ui-18-solid")
    : (capitalize ? "ui-14-capitalize-solid" : "ui-14-solid");
  return (
    <Box direction="column" grow={1} basis="0%" minWidth={0}>
      <LabelLine typeStyle={titleStyle} ink="ink">
        {title}
        {titleNote !== undefined && (
          <Box inline={{ align: "baseline" }} margin={[0, 0, 0, 6]}>
            <Text typeStyle="mono-11-solid" ink="ink-good">{titleNote}</Text>
          </Box>
        )}
      </LabelLine>
      {hasSubtitle && (
        <LabelLine
          typeStyle={large ? "ui-14-solid" : "ui-11-solid"}
          ink={subtitleTone ? SUBTITLE_INKS[subtitleTone] : "dark"}
          margin={2}
        >
          {subtitle}
        </LabelLine>
      )}
    </Box>
  );
}

/**
 * A measurement's 44px list row: its icon, its label and its figure at the
 * row's end. The label and a <StatFigure> share what the icon leaves,
 * half each; anything else there (a row of line badges) takes its own width.
 * With `onPress` the row opens what the figure is made of, behind a chevron.
 */
export function StatRow(
  { icon, label, onPress, selected, children }: {
    icon: string;
    label: string;
    onPress?: () => void;
    /** The pad's band rests on it. */
    selected?: boolean;
    children: React.ReactNode;
  },
) {
  const opens = onPress !== undefined;
  return (
    <ListRow
      gap={8}
      as={opens ? "button" : "div"}
      onClick={onPress}
      selected={selected}
      chevron={opens}
    >
      <Icon size={16} contain src={icon} />
      <Box grow={1} basis="0%">
        <Text typeStyle="ui-14-solid">{label}</Text>
      </Box>
      {children}
    </ListRow>
  );
}

/** A stat row's figure, set flush right: the reading over a quieter note,
 *  the reading inked by its verdict when it has one. */
export function StatFigure(
  { value, note, tone }: {
    value: React.ReactNode;
    note?: React.ReactNode;
    tone?: Tone;
  },
) {
  return (
    <Box direction="column" align="end" gap={1} grow={1} basis="0%">
      <Text
        typeStyle="ui-13-solid"
        ink={tone ? `ink-${tone}` : undefined}
        nowrap
      >
        {value}
      </Text>
      {note !== undefined && (
        <Text typeStyle="ui-11-solid" ink="dark" nowrap>{note}</Text>
      )}
    </Box>
  );
}
