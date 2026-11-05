/**
 * The instrument family — the dark plates that sit ON the city and are read at
 * a glance rather than opened: the transport manager, the Public Works list,
 * the police crime/patrol panel, the energy panel, and any map-layer overlay to
 * come. OPENSTEP ran its dock and its CD player in a dark chrome beside its
 * light windows, drawn with the same bevels and the same keys; this is that
 * chrome, so every Bureau component inside comes out dark with no other change.
 *
 * A panel is assembled, never subclassed:
 *
 *   <Instrument id="my-panel">
 *     <InstrumentHeader heading={...} back={stack.pop} />   // or
 *     <InstrumentScoreHeader heading={...} badge={...} facts={[...]} />
 *     <Segmented .../>                       // optional, OUTSIDE the body
 *     <InstrumentBody>
 *       <List><ListRow .../></List>   // interactive rows, or
 *       <InstrumentSection>…readouts…</InstrumentSection>
 *       <EmptyState .../>                         // or an empty state
 *     </InstrumentBody>
 *     <InstrumentFooter actionable>          // optional
 *       <InstrumentMainKey onPress={...}>Add line</InstrumentMainKey>
 *     </InstrumentFooter>
 *   </Instrument>
 *
 * Rows live in List.tsx, the tab strip in Segmented.tsx, and the
 * read-only body content in StatList.tsx / ColorKey.tsx /
 * PieChart.tsx. The pad drives an instrument by one standard, whose
 * parts these are (instrument_pad.ts).
 *
 * The geometry is the panels' own and is not negotiable — one 280px width and
 * anchor for every map view, 33px title bars (44px for a score),
 * 33px readout or 44px action footers,
 * a body that grows until the bottom controls reserve their space,
 * a 12px inset everywhere,
 * 44px rows by default. The body's scrollbar stays hidden.
 * The panels are loved in that arrangement; what changed is the material.
 */

import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { host, type HostNode } from "bureau/host";
import { Box, Layer, Scroll, Text } from "bureau/primitives";
import {
  useGamepadFrame,
  useHintDevice,
  usePadSet,
} from "./input/useGamepad.ts";
import { InputPrompt } from "./InputPrompt.tsx";
import { Button, type Tone } from "./Bureau.tsx";
import { Mark } from "./Mark.tsx";
import { GlitchText } from "./GlitchText.tsx";
import { INSTRUMENT_PAD_PRIORITY } from "./instrument_pad.ts";
import { useMapPanelFold } from "./map_panel_fold.ts";
import { InstrumentPlace } from "./instrument_place.ts";
import type { ViewMemory } from "./instrument_stack.ts";
import { useNodeHint } from "./useNodeHint.ts";
import { INSTRUMENT_FOOTER_HEIGHT, WIDGET_WIDTH } from "./tokens.ts";

const PANEL_TOP = 60;
const PANEL_RIGHT = 10;
/** How much of the screen's right edge an instrument covers, in UI points:
 * the city framed beside it stays left of this. */
export const INSTRUMENT_RIGHT_INSET = WIDGET_WIDTH + PANEL_RIGHT;
/** The room the bottom controls keep: an xlarge HUD key (56), its margin
 * (8) and a group's gap (12). */
const PANEL_BOTTOM = 56 + 8 + 12;

/** A list body's height, about twelve rows: a long list scrolls in it
 *  instead of running the panel down the screen. */
export const INSTRUMENT_LIST_MAX_HEIGHT = 400;

type InstrumentProps = {
  /** A smaller widget may opt down from the shared Bureau width. */
  width?: number;
  /** A stable handle for tooling and the harness. */
  id?: string;
  /** In the flow of a page rather than pinned over the city's corner: the
   *  design catalog's specimens. */
  inline?: boolean;
  /** The light tokens forced back over the instrument's dark ones: the road
   *  not taken, shown beside the shipped one. */
  chrome?: "light";
  children: ReactNode;
};

/** A folded instrument shows its header alone, which opens it when pressed
 *  (map_panel_fold.ts); the header says how tall it stands. */
const InstrumentFold = createContext<
  {
    folded: boolean;
    unfold: () => void;
    standsAt: (height: number) => void;
  } | null
>(null);

/**
 * The shell: a dark Bureau window pinned to the top-right of the viewport,
 * its body shrinking first so the header, tabs and footer never clip. Its
 * loose text is set in the data font at 12px.
 */
export function Instrument(
  { width = WIDGET_WIDTH, id, inline, chrome, children }: InstrumentProps,
) {
  const { folded, unfold } = useMapPanelFold("instrument", !inline);
  const [headerHeight, setHeaderHeight] = useState<number>(
    HEADER_HEIGHT.compact,
  );
  const shell = (
    <Box
      id={id}
      direction="column"
      width={Math.min(width, WIDGET_WIDTH)}
      maxHeight={inline ? undefined : "100%"}
      height={folded ? headerHeight : undefined}
      overflow={folded ? "hidden" : undefined}
      shrink={0}
      chrome={chrome ?? "dark"}
      fill="face"
      surface="frame"
      ink="ink"
      typeStyle="mono-12-solid"
    >
      <InstrumentFold.Provider
        value={{ folded, unfold, standsAt: setHeaderHeight }}
      >
        <InstrumentPlace.Provider value="body">
          {children}
        </InstrumentPlace.Provider>
      </InstrumentFold.Provider>
    </Box>
  );
  if (inline) return shell;
  return (
    <Layer
      stacking="instrument"
      pinned
      anchor={{
        kind: "screen",
        top: PANEL_TOP,
        right: PANEL_RIGHT,
        bottom: PANEL_BOTTOM,
      }}
      passThrough
    >
      {shell}
    </Layer>
  );
}

/** One fact of a score header's status line: "62% coverage", "No buses". A
 *  tone inks the fact as a verdict; without one it is a plain reading. */
export type Fact = { text: string; tone?: Tone };

const FACT_INKS = {
  neutral: "dark",
  good: "ink-good",
  warn: "ink-warn",
  bad: "ink-bad",
} as const;

/** The compact bar fits one line; a score needs room for two beside a badge. */
const HEADER_HEIGHT = { compact: 33, tall: 44 } as const;

type HeaderKeys = {
  /** Steps back one view: draws the back key at the left. */
  back?: () => void;
  /** A close or settings key at the right. */
  right?: ReactNode;
};

/**
 * The title bar of a view with nothing to report but its name: Public Works,
 * Police, a pushed "Buy buses". 33px tall, with or without a back key.
 */
export function InstrumentHeader(
  { heading, back, right }: { heading: string } & HeaderKeys,
) {
  return (
    <HeaderBar back={back} right={right} tall={false}>
      <Box direction="column" grow={1} minWidth={0}>
        <Text typeStyle="ui-14-caps-heading" lines={1} ellipsis>
          {heading}
        </Text>
      </Box>
    </HeaderBar>
  );
}

/**
 * The title bar of a view with a verdict: a badge (a grade stamp, a line
 * badge), the heading, and the status as facts on one line under it, so the
 * view's state is read in the bar and never repeated as a row in the body.
 * Always 44px, with or without its badge, so a loading score never moves the
 * body. `scrambled` sets the facts as a ransomware incident's glitch; the
 * heading stays readable so the player knows which panel is down.
 */
export function InstrumentScoreHeader(
  { heading, badge, facts, scrambled = false, back, right }: {
    heading: string;
    badge?: ReactNode;
    facts: ReadonlyArray<Fact>;
    scrambled?: boolean;
  } & HeaderKeys,
) {
  return (
    <HeaderBar back={back} right={right} tall>
      {badge && <Box shrink={0} align="center" justify="center">{badge}</Box>}
      <Box direction="column" gap={1} grow={1} minWidth={0}>
        <Text typeStyle="ui-14-caps-title-solid" lines={1} ellipsis>
          {heading}
        </Text>
        {facts.length > 0 && (
          <Text typeStyle="ui-12-solid" ink="dark" lines={1} ellipsis>
            {facts.map((fact, index) => (
              <Fragment key={index}>
                {index > 0 && " · "}
                <Text ink={FACT_INKS[fact.tone ?? "neutral"]}>
                  {scrambled ? <GlitchText text={fact.text} /> : fact.text}
                </Text>
              </Fragment>
            ))}
          </Text>
        )}
      </Box>
    </HeaderBar>
  );
}

function HeaderBar(
  { back, right, tall, children }: HeaderKeys & {
    tall: boolean;
    children: ReactNode;
  },
) {
  const fold = useContext(InstrumentFold);
  const height = tall ? HEADER_HEIGHT.tall : HEADER_HEIGHT.compact;
  const standsAt = fold?.standsAt;
  useLayoutEffect(() => standsAt?.(height), [standsAt, height]);
  return (
    <Box
      align="stretch"
      height={height}
      shrink={0}
      fill="titlebar"
      surface="titlebar"
      ink="titlebar-text"
      typeStyle="ui-12-solid"
    >
      {back && <BackKey onClick={back} compact={!tall} />}
      <Box align="center" gap={10} padding={[0, 12]} grow={1} minWidth={0}>
        {children}
        {right && <Box align="center" shrink={0}>{right}</Box>}
      </Box>
      {fold?.folded && (
        // Over the bar's own keys: a folded instrument's header only opens it.
        <Box
          id="instrument-unfold"
          position="absolute"
          inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
          onPress={fold.unfold}
        />
      )}
    </Box>
  );
}

/**
 * The header's back compartment shares its face and full height. The row's
 * divider separates the action without setting another raised key on the bar.
 */
export function BackKey(
  { onClick, compact = false }: { onClick: () => void; compact?: boolean },
) {
  const inputMode = useHintDevice();
  const showGamepadHint = inputMode === "gamepad";
  const padSet = usePadSet();

  return (
    <Box
      role="button"
      look="instrument-back"
      width={compact ? HEADER_HEIGHT.compact : HEADER_HEIGHT.tall}
      shrink={0}
      alignSelf="stretch"
      align="center"
      justify="center"
      focusable
      onPress={onClick}
      // Going back is a dismissal, and the pad's Back action already plays the
      // cancel beat; the mouse key matches it.
      feedback="cancel"
    >
      {showGamepadHint
        ? <InputPrompt action={padSet === "city" ? "map_back" : "menu_back"} />
        : <Mark mark="left" />}
    </Box>
  );
}

/**
 * The scrolling well between header and footer. Its scrollbar is hidden ON
 * PURPOSE: a visible 18px Bureau bar would narrow every 280px row by that
 * much and ellipsize titles earlier. Wheel, trackpad, keyboard and pad still
 * scroll it. Content that must stay visible while a long list scrolls (a tab
 * strip, a footer) belongs outside the body as a sibling.
 *
 * `nodeRef` reaches the scrolling node itself, for a read-only page that
 * scrolls on the D-pad.
 */
export function InstrumentBody(
  { nodeRef, memory, maxHeight, children }: {
    nodeRef?: (node: HostNode | null) => void;
    /** Opens at the scroll the view was left at, and keeps the new one. */
    memory?: ViewMemory;
    /** Without one the body grows to the screen's height before scrolling. */
    maxHeight?: number;
    children: ReactNode;
  },
) {
  // Read once: the host applies an offset when it changes, so a later one
  // would pull the list back while it coasts.
  const [opening] = useState(() => memory?.scroll);
  return (
    <Scroll
      direction="column"
      shrink={1}
      maxHeight={maxHeight}
      scrollbar="hidden"
      fill="paper"
      surface="well"
      nodeRef={nodeRef}
      offset={opening}
      onScroll={memory?.keepScroll}
    >
      {/* The page lays out at its own height and the well scrolls it. */}
      <Box direction="column" shrink={0}>{children}</Box>
    </Scroll>
  );
}

/**
 * A chart, gauge or group of readouts uses `title`: one quiet heading,
 * a shared left edge and a rule under every titled section but the last.
 * A headline measurement stays in a list row with its icon, label and value
 * on the same line. `flush` sections are measurements laid edge to edge — a
 * list row and the details under it — ruled like titled ones.
 */
export function InstrumentSection(
  { title, flush, ruled, related, last, children }: {
    title?: string;
    flush?: boolean;
    /** Ruled off from what follows though untitled: a map's colour key
     *  above whichever view comes after it. */
    ruled?: boolean;
    /** A figure and the sentences about it, kept together: 6px apart rather
     *  than the 18px between readouts. */
    related?: boolean;
    /** The body's last section, with no rule under it. */
    last?: boolean;
    children: ReactNode;
  },
) {
  const hasRule = (Boolean(title) || Boolean(flush) || Boolean(ruled)) &&
    !last;
  let gap = related ? 6 : 18;
  let padding: number | [number, number] = 12;
  if (title) {
    gap = 12;
    padding = [10, 12];
  }
  if (flush) {
    gap = 0;
    padding = 0;
  }
  return (
    <Box
      direction="column"
      gap={gap}
      padding={padding}
      look={hasRule ? "ruled" : undefined}
    >
      {title
        ? (
          <>
            <Text
              typeStyle="ui-11-caps-solid"
              ink="ink-neutral"
              role="heading"
            >
              {title}
            </Text>
            <Box direction="column" gap={6}>{children}</Box>
          </>
        )
        : children}
    </Box>
  );
}

/**
 * The bottom strip, 33px for readings or 44px for actions, laid out as a row on
 * a raised plate, a gutter between its parts however wide a key grows. Its
 * parts: <InstrumentFooterInfo> (stacked stat lines on the left),
 * <InstrumentMetric> (a single metric) and
 * <InstrumentFooterActions> (the key row on the right). Keys are
 * `<Button size="small">`, the 33px key, at a 12px label, so "Add
 * line", "Buses" and "Remove line" share a 276px strip with a two-line
 * readout. Action-only footers put their keys in FooterActions, aligned right.
 */
export function InstrumentFooter(
  { actionable = false, children }: {
    /** Reserves room for 33px action keys. */
    actionable?: boolean;
    children: ReactNode;
  },
) {
  return (
    <Box
      align="center"
      justify="between"
      gap={12}
      height={actionable
        ? INSTRUMENT_FOOTER_HEIGHT.actionable
        : INSTRUMENT_FOOTER_HEIGHT.normal}
      padding={[0, 12]}
      shrink={0}
      fill="face"
      surface="plate"
      typeStyle="ui-12-solid"
    >
      <InstrumentPlace.Provider value="footer">
        {children}
      </InstrumentPlace.Provider>
    </Box>
  );
}

/**
 * The footer's main key, the one the pad's Y presses: Add line, Add station,
 * Buy. Its glyph stands on the key while the pad is in hand. A footer has one;
 * any other key on it is the mouse's alone.
 */
export function InstrumentMainKey(
  {
    onPress,
    disabled = false,
    danger = false,
    gamepadEnabled = true,
    children,
  }: {
    onPress: () => void;
    disabled?: boolean;
    /** A removal: worn as the danger key rather than the default one. */
    danger?: boolean;
    /** False while a dialog over the map holds the pad. */
    gamepadEnabled?: boolean;
    children: ReactNode;
  },
) {
  const key = useRef<HostNode | null>(null);
  const device = useHintDevice();
  const showsGlyph = device === "gamepad";
  // Y presses the key itself, so the pad hears and sees the press a click
  // makes.
  useGamepadFrame(
    (input) => {
      if (!input.connected || !input.wasPressed("map_main")) return;
      if (key.current) host.press(key.current);
    },
    { priority: INSTRUMENT_PAD_PRIORITY, enabled: gamepadEnabled && !disabled },
  );
  return (
    <Button
      ref={key}
      size="small"
      variant={danger ? "danger" : undefined}
      isDefault={!danger}
      onPress={onPress}
      disabled={disabled}
    >
      {showsGlyph && <InputPrompt action="map_main" />}
      {children}
    </Button>
  );
}

/**
 * A row's removal key, in its actions: Remove, Sell. On the pad's band the X
 * glyph takes the mark's place, X being what removes the band's row.
 */
export function InstrumentRowRemoveKey(
  { onPress, onBand, mark = "close", tooltip }: {
    onPress: () => void;
    /** The pad's band rests on this row. */
    onBand: boolean;
    /** Minus where the row loses one of several (selling a bus). */
    mark?: "close" | "minus";
    tooltip: ReactNode;
  },
) {
  return (
    <Button
      size="small"
      variant="danger"
      mark={onBand ? undefined : mark}
      onPress={onPress}
      tooltip={tooltip}
    >
      {onBand && <InputPrompt action="map_delete" />}
    </Button>
  );
}

/** Stacked stat lines on the footer's left: one <InstrumentFooterLine> each. */
export function InstrumentFooterInfo(
  { children }: { children: ReactNode },
) {
  return (
    <Box direction="column" gap={2} ink="dark">
      {children}
    </Box>
  );
}

const LINE_INKS = {
  neutral: "dark",
  good: "ink-good",
  warn: "ink-warn",
  bad: "ink-bad",
} as const;

/**
 * One line of the footer's info; a `warn` line is the alert, a size down. A
 * `tooltip` explains it on the floating plate, and makes it a stop for the
 * keyboard so it can be read without a pointer.
 */
export function InstrumentFooterLine(
  { tone = "neutral", tooltip, children }: {
    tone?: Tone;
    tooltip?: ReactNode;
    children: ReactNode;
  },
) {
  const tip = useNodeHint();
  const isAlert = tone === "warn";
  return (
    <Box
      direction="column"
      ink={LINE_INKS[tone]}
      focusable={tooltip ? true : undefined}
      {...(tooltip ? tip(tooltip) : {})}
    >
      <Text typeStyle={isAlert ? "ui-12-solid" : "ui-13-solid"}>
        {children}
      </Text>
    </Box>
  );
}

/** The footer's key row, on its right. */
export function InstrumentFooterActions(
  { children }: { children: ReactNode },
) {
  return (
    <Box gap={8} margin={[0, 0, 0, "auto"]} minWidth={0}>
      {children}
    </Box>
  );
}

const METRIC_INKS = {
  neutral: "ink",
  good: "ink-good",
  warn: "ink-warn",
  bad: "ink-bad",
} as const;

/**
 * A single-metric footer's two halves: the muted label left, the value right
 * in the data font, inked by its tone. Children of <InstrumentFooter>.
 */
export function InstrumentMetric(
  { label, value, tone = "neutral" }: {
    label: ReactNode;
    value: ReactNode;
    tone?: Tone;
  },
) {
  return (
    <>
      <Text typeStyle="ui-13-solid" ink="dark">{label}</Text>
      <Text typeStyle="mono-12-solid" ink={METRIC_INKS[tone]}>{value}</Text>
    </>
  );
}
