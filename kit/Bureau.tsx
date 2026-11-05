import { platform } from "platform";
/**
 * Bureau core chrome as React components — the window, the toolbar, the status
 * bar, the button, and the surfaces a program's body sits on.
 *
 * Inside a Frame, controls send hints to the window's StatusBar.
 * Controls on the map take a `tooltip` for the floating hint. Frame
 * adds nothing to the screen; layout belongs to the program.
 *
 * Every part is drawn with the primitives, and every look is token data
 * (LOOKS, BEVELS and TYPE_METRICS in tokens.ts).
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CONTROL_METRICS, ICON_SIZES, WIDGET_WIDTH } from "./tokens.ts";
import { StatusContext } from "./bureau_status.ts";
import { Mark, type MarkName, RIGHTWARD_MARKS } from "./Mark.tsx";
import { holdsOnlyIcons } from "./icon_only.ts";
import { Glyph } from "./Glyph.tsx";
import { KeyStripContext } from "./key_strip.ts";
import { InstrumentPlace } from "./instrument_place.ts";
import { TabbedGround } from "./window_ground.ts";
import { DeadGroup } from "./dead_group.ts";
import { useOptionalHintActions } from "./hint_context.tsx";
import { host, type HostNode } from "bureau/host";
import {
  Box,
  type BoxProps,
  Image,
  type KeyEvent,
  Layer,
  type Layout,
  type Look,
  type PixelSource,
  type Press,
  Scroll,
  Text,
  type TypeStyle,
} from "bureau/primitives";

/** Visual emphasis for a neutral fact, a gain, a caution, or active harm. */
export type Tone = "neutral" | "good" | "warn" | "bad";

/** A node ref, or a ref object holding the node. */
export type NodeRef =
  | React.RefObject<HostNode | null>
  | ((node: HostNode | null) => void)
  | null
  | undefined;

/**
 * Hands a primitive's node to a kit component's refs. Call it from the
 * primitive's `nodeRef` callback, never during render: the React Compiler
 * skips a component that passes a ref to a function while rendering.
 */
function setNodeRefs(node: HostNode | null, ...refs: NodeRef[]) {
  for (const ref of refs) {
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }
}

/* ── The hint bus ────────────────────────────────────────────────────────── */
// The context and the hooks that write to it (useStatus, useBoxHint)
// live in bureau_status.ts.

export function Frame({ children }: { children: React.ReactNode }) {
  const [hint, setHint] = useState("");
  const value = useMemo(() => ({ hint, setHint }), [hint]);
  return (
    <StatusContext.Provider value={value}>
      {children}
    </StatusContext.Provider>
  );
}

/* ── Status bar ──────────────────────────────────────────────────────────── */

export type StatusBarPill = {
  key: string;
  label: React.ReactNode;
  hint?: string;
  /** The state the player must act on, in the alert fill. */
  alert?: boolean;
  /** `counter`: a count in words, in the UI face and at least 150px wide. */
  variant?: "counter";
};

function StatusCell(
  { grow, minWidth, justify, fill, ink, children, ...rest }:
    & Pick<BoxProps, "onHoverChange" | "onFocusChange" | "focusable">
    & {
      grow?: boolean;
      minWidth?: number;
      justify?: "center";
      fill?: "fill-alert";
      ink?: "knockout-alert" | "dark";
      children: React.ReactNode;
    },
) {
  return (
    <Box
      {...rest}
      surface="field"
      fill={fill ?? "face"}
      ink={ink ?? "ink"}
      align="center"
      justify={justify}
      grow={grow ? 1 : undefined}
      minWidth={minWidth}
      minHeight={26}
      padding={[2, 8]}
      overflow="hidden"
    >
      {children}
    </Box>
  );
}

export function StatusBar(
  { children, pills, priorityText, inert, wrap = false }: {
    children?: React.ReactNode;
    /** Out of reach while a box over the window owns the keys. */
    inert?: boolean;
    pills?: StatusBarPill[];
    /** A transient result or error that must not be hidden by control hints. */
    priorityText?: string;
    /** Keep a persistent report readable when its translation needs more room. */
    wrap?: boolean;
  },
) {
  const ctx = useContext(StatusContext);
  const text = priorityText || ctx?.hint || children;
  const setStatus = (next: string) => ctx?.setHint(next);

  return (
    <Box
      align="stretch"
      gap={2}
      padding={2}
      fill="face"
      surface="plate"
      shrink={0}
      inert={inert}
    >
      <StatusCell grow>
        <Text typeStyle="ui-15-solid" nowrap={!wrap}>{text}</Text>
      </StatusCell>
      {pills?.map((pill) => {
        const counter = pill.variant === "counter";
        const show = (shown: boolean) => {
          if (pill.hint) setStatus(shown ? pill.hint : "");
        };
        return (
          <StatusCell
            key={pill.key}
            // A cell's minimum is its words', inside its 8px insets.
            minWidth={(counter ? 150 : 56) + 16}
            justify="center"
            fill={pill.alert ? "fill-alert" : undefined}
            ink={pill.alert ? "knockout-alert" : "dark"}
            focusable={Boolean(pill.hint)}
            onHoverChange={show}
            onFocusChange={show}
          >
            <Text
              typeStyle={counter ? "ui-13-solid" : "mono-10-pill-solid"}
              nowrap
            >
              {pill.label}
            </Text>
          </StatusCell>
        );
      })}
      {
        /* Speaks `priorityText` ONLY. A hover must never be announced, so the
          hint channel deliberately does not reach this region. */
      }
      <Box
        position="absolute"
        width={1}
        height={1}
        margin={-1}
        overflow="hidden"
        passThrough
        opacity={0}
      >
        <Text typeStyle="ui-15-solid" nowrap>{priorityText ?? ""}</Text>
      </Box>
    </Box>
  );
}

/* ── Window chrome ───────────────────────────────────────────────────────── */

const TITLE_BAR_HEIGHT = CONTROL_METRICS.standard.height;
const CLOSE_KEY_SIZE = CONTROL_METRICS.close.height;
// The close key's inset belongs to its hit target, filling the bar's right square.
const CLOSE_KEY_INSET = (TITLE_BAR_HEIGHT - CLOSE_KEY_SIZE) / 2;

/**
 * A window's title bar. Bureau draws its own rather than restyling whatever
 * header its host dialog happens to render, so a nested modal, a blocking save
 * box and a full program all get the same bar.
 */
export function TitleBar(
  { title, titleId, inactive, identity, children }: {
    /** The window's NAME, which may carry a node (a trademark mark). */
    title: React.ReactNode;
    /** Id for the title text, where tooling finds the window's name. */
    titleId?: string;
    /** The title bar of a window that does not have focus. Mac OS 8 and
     *  Windows both drained the fill; we drain it to chrome grey. */
    inactive?: boolean;
    /** A program's own identity on its bar, in a tone's ink: the tax
     *  spreadsheet runs green. */
    identity?: "good";
    children?: React.ReactNode;
  },
) {
  const fill = inactive ? "mid" : identity === "good" ? "ink-good" : "titlebar";
  return (
    <Box
      align="center"
      gap={8}
      height={TITLE_BAR_HEIGHT}
      padding={[0, 0, 0, 8]}
      fill={fill}
      surface="titlebar"
      shrink={0}
    >
      <Box grow={1} basis={0} minWidth={0} overflow="hidden">
        <Text
          id={titleId}
          typeStyle="ui-18-title-solid"
          ink={inactive ? "shade" : "titlebar-text"}
          lines={1}
          ellipsis
        >
          {title}
        </Text>
      </Box>
      {children}
    </Box>
  );
}

type WindowProps = {
  title?: React.ReactNode;
  titleBarExtras?: React.ReactNode;
  /**
   * This window's body is a <Notebook>: drop the frame's ground one
   * step, to the ground the tab strip sits on. A tabbed window is darker
   * than the tab that is open, and the rule is the window's — a program
   * lays a menu bar and a row of readouts above the strip, and those have
   * to be on the same surface or the step reads as a rectangle pasted
   * across the chrome. `<Dialog tabbed>` is the same flag on
   * the host dialog, so moving a window here keeps the word.
   */
  tabbed?: true;
  /** A fixed width in UI pixels, still no wider than its container. */
  width?: number;
  /** The dark chrome of the instruments on the map. */
  chrome?: "light" | "dark";
  /** An instrument on the map: its figures read in the 12px data font. */
  instrument?: boolean;
  /** Bars and body in a column at least this tall, the body taking
   *  whatever height the bars leave: a whole program laid out top to
   *  bottom. */
  columnHeight?: number;
  /** Its parts read at the chrome type size, as a map panel's do. */
  chromeType?: true;
  /** The window's own box, where a host sizes or places it. */
  layout?: Pick<
    Layout,
    | "width"
    | "maxWidth"
    | "maxHeight"
    | "minHeight"
    | "height"
    | "grow"
    | "shrink"
    | "overflow"
  >;
  /** One of the kit's animations: a message box snaps in. */
  animation?: BoxProps["animation"];
  id?: string;
  role?: "dialog";
  busy?: boolean;
  focusable?: boolean;
  onKey?: (key: KeyEvent) => boolean;
  children?: React.ReactNode;
};

/**
 * The frame: a flat plate with one outer ink ring, as OPENSTEP drew a window.
 * WHY the ring: without it the chrome dissolves into whatever city is rendered
 * behind the dialog. WHY no bevel: the title bar carries the window's depth,
 * and a beveled frame around a beveled bar read as two windows nested.
 *
 * `title` is optional because a Bureau surface is sometimes mounted inside a
 * host dialog that already draws the bar.
 */
export const Window = React.forwardRef<HostNode, WindowProps>(
  function Window(
    {
      title,
      titleBarExtras,
      tabbed,
      width,
      chrome,
      instrument,
      layout,
      columnHeight,
      chromeType,
      animation,
      children,
      ...access
    },
    ref,
  ) {
    const look: Look = instrument
      ? "instrument"
      : tabbed
      ? "window-tabbed"
      : chromeType
      ? "window-chrome-type"
      : "window";
    return (
      <Box
        {...access}
        nodeRef={(host) => setNodeRefs(host, ref)}
        look={look}
        chrome={chrome}
        direction="column"
        width={width}
        maxWidth={width === undefined ? undefined : "100%"}
        minHeight={columnHeight}
        animation={animation}
        {...layout}
      >
        {title !== undefined && (
          <TitleBar title={title}>{titleBarExtras}</TitleBar>
        )}
        <TabbedGround.Provider value={Boolean(tabbed)}>
          {children}
        </TabbedGround.Provider>
      </Box>
    );
  },
);

/* ── Controls and surfaces ───────────────────────────────────────────────── */

/** Where a program places a surface in its own layout, and lays out what the
 *  surface holds. */
export type SurfaceLayout = Pick<
  Layout,
  | "grow"
  | "shrink"
  | "basis"
  | "width"
  | "minWidth"
  | "minHeight"
  | "gap"
  | "direction"
  | "padding"
  | "align"
>;

/**
 * The usual places for a well or a plate inside a program's body: `fill`
 * takes the room its row leaves; `key-column` stacks keys in a fixed column
 * as wide as the widest; `key-row` sets keys side by side, 8px apart.
 */
export type SurfaceLayoutName = "fill" | "key-column" | "key-row";

const SURFACE_LAYOUTS: Record<SurfaceLayoutName, SurfaceLayout> = {
  fill: { grow: 1, shrink: 1, basis: "0%", minWidth: 0 },
  "key-column": {
    grow: 0,
    shrink: 0,
    basis: "auto",
    direction: "column",
    align: "stretch",
    gap: 6,
  },
  "key-row": { direction: "row", gap: 8 },
};

function surfaceLayout(
  layout: SurfaceLayout | SurfaceLayoutName | undefined,
): SurfaceLayout | undefined {
  return typeof layout === "string" ? SURFACE_LAYOUTS[layout] : layout;
}

/** The chrome-coloured ground a program's body sits on. */
export function Container(
  { body, children, layout }: {
    /** A program's body below its bars: it takes the window's remaining
     *  height on 12px of air, and sets its plate and its well side by side. */
    body?: "split";
    children?: React.ReactNode;
    layout?: SurfaceLayout;
  },
) {
  const split: SurfaceLayout | undefined = body === "split"
    ? {
      grow: 1,
      shrink: 1,
      basis: "0%",
      direction: "row",
      gap: 12,
      padding: 12,
    }
    : undefined;
  return (
    <Box fill="face" ink="ink" direction="column" {...split} {...layout}>
      {children}
    </Box>
  );
}

/** A toolbar's keys sink into a well when latched: the open view's key. */
const ToolbarContext = createContext(false);

export function Toolbar(
  { children, inert, wrap }: {
    children?: React.ReactNode;
    /** Out of reach while a box over the window owns the keys. */
    inert?: boolean;
    /** A long row of keys drops onto a second line instead of clipping. */
    wrap?: boolean;
  },
) {
  return (
    <ToolbarContext.Provider value>
      <Box
        role="toolbar"
        inert={inert}
        align="center"
        gap={2}
        padding={4}
        fill="face"
        surface="plate"
        shrink={0}
        wrap={wrap}
      >
        {children}
      </Box>
    </ToolbarContext.Provider>
  );
}

/** The etched rule between toolbar groups. */
export function ToolbarSeparator() {
  return (
    <Box
      width={2}
      alignSelf="stretch"
      margin={[4, 6]}
      surface="etched-vertical"
      shrink={0}
      hidden
    />
  );
}

/** What draws a picture or a mark in a key. A key holding one of these
 *  alone is square; a mark beside a pad glyph is two, and widens. */
const ICON_TYPES = new Set<unknown>([
  Icon,
  Mark,
  Glyph,
  Image,
]);

/**
 * Pictures inherit their key's art slot and disabled treatment.
 */
const KeyContext = createContext<{ dead: boolean; iconSize: number } | null>(
  null,
);

export type ButtonProps = {
  children?: React.ReactNode;
  /** The press: a click or a tap, Enter or Space, the pad's A. A tap
   *  (`press.touch`) came with no hover, so the tooltip went unread. */
  onPress?: (press: Press) => void;
  /** The press, with whether Shift was held: an operator's variant of it. */
  onActivate?: (press: { shift: boolean }) => void;
  id?: string;
  disabled?: boolean;
  /** A toggle that is on: the key stays down. */
  pressed?: boolean;
  /** Focus lands here as the key mounts: the one default action. */
  autoFocus?: boolean;
  /** Status-bar hint shown while this button is focused or hovered.
   *  Requires a <Frame> ancestor; outside one, this is a no-op. */
  hint?: string;
  /** The floating hint while hovered or focused: a key on the map. A function
   *  builds it when it shows. */
  tooltip?: React.ReactNode | (() => React.ReactNode);
  /** Keeps a tooltip quiet (a drawer covers the key), but still hides it. */
  tooltipShows?: boolean;
  /** `cursor`: the tooltip follows the pointer across a wide key (the top
   *  bar's figures); focus by keyboard or pad still anchors it under the key. */
  tooltipFollows?: "cursor";
  /** Fires as the pointer arrives, whether or not the tooltip shows. */
  onPointerEnter?: () => void;
  onHoverChange?: (inside: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
  onKey?: (key: KeyEvent) => boolean;
  /**
   * The press as it is held, for a key that acts while held: `start` when the
   * primary pointer, Space or Enter goes down on it, `release` when it comes
   * up there, `cancel` when the press is lost.
   */
  onHold?: (phase: "start" | "release" | "cancel") => void;
  /** A stop on the pad's walk through its window, in `navigationGrid`. */
  navigable?: boolean;
  navigationGrid?: string;
  /** False: the pad and the host focus it, Tab passes it by. */
  tabStop?: boolean;
  /**
   * `toolbar` defaults to a 33px square icon key with a 20px picture slot;
   * `flat` an underlined text link that grows a plate on hover; `danger` a red key for destructive actions;
   * `ghost` a bare key that gains a bevel on hover;
   * `hud` a square, beveled key with a translucent checkerboard face on the
   * map. Held or toggled on, its face becomes solid.
   * `readout` a figure on an instrument strip that also presses: no face,
   * the strip's 12px data font, and the focus ring drawn around it.
   * `dock-tile` a tool on the dock's strip, set edge to edge with its
   * neighbours; `drawer` a raised key in the drawer above the strip.
   */
  variant?:
    | "default"
    | "toolbar"
    | "flat"
    | "danger"
    | "ghost"
    | "hud"
    | "readout"
    | "dock-tile"
    | "drawer";
  /** The first or last tile of the dock, which closes the dock's frame. */
  dockEnd?: "first" | "last";
  /** A dock key the city may not use yet: faded, and refusing the pointer. */
  withheld?: boolean;
  /** A dock key that refuses a press, shown by the pointer alone. */
  refuses?: boolean;
  /** A dock tile with a wrapped gift behind it, shaking now and then. */
  shaking?: boolean;
  /** A card-sized key sharing its row: its picture over its name, a
   *  building style's render. */
  stacked?: true;
  /** A command row of a pull-down: full width, its label at the right. */
  menuItem?: boolean;
  /**
   * The symbol cut into the key: an arrow for a key that steps, a transport
   * mark on the music player. It stands on the side it points (← Back,
   * Start →), and alone it makes the key square, which then needs a
   * label. A symbol is always a mark, never a typed character (deno
   * lint: bureau/symbols-are-marks); a picture is an icon among the
   * children, drawn as it is.
   */
  mark?: MarkName;
  /** Fill the width of its column, and let a long label wrap onto more
   *  lines instead of clipping: a key in a narrow action column. */
  wide?: boolean;
  /** Down until something else is chosen: the open view's key on a
   *  toolbar, sunk into a well; on the dock, the chosen tool, an open
   *  drawer or the drawer holding the chosen tool, in the selection fill. */
  latched?: boolean;
  /** Shakes now and then until the player visits where it leads, to
   *  invite a look without moving focus or opening anything. */
  attention?: boolean;
  /** Momentary press feedback for keyboard/gamepad or custom hold gestures.
   *  For a toggle's persistent state, use `pressed` instead. */
  held?: boolean;
  /**
   * The action this key started, under way: from 0 to 1, how far along it
   * is. While set, the key stays pressed and cannot be pressed again, and
   * its face fills that far, as a held key's does.
   */
  progress?: number;
  /**
   * `standard`: 33px with 20px art. `large`: 44px with 32px art.
   * Omitted, standard, including toolbar keys.
   * `small` draws a 33px face with a 37px hit area, for list actions.
   * `compact` draws a 28px face and reserves the 36px hit area around it,
   * for dense rows and title bars. `large` (44px) and `xlarge`
   * (56px) are for surfaces that want big keys, such as the map's HUD.
   * `title` is a large key in body type, the title screen's drawer.
   */
  size?: "standard" | "compact" | "small" | "large" | "xlarge" | "title";
  /** Spans the column it stands in, with no side margins. */
  fill?: true;
  /** No side margins: a key in a row that spaces its own keys, or one
   *  against its row's edge. */
  flush?: boolean;
  /**
   * Where a program places the key in its own layout: a key spanning an
   * action column, a pager arrow with a wider inset. It wins over the key's
   * own box, as the program's rule did.
   */
  layout?: Pick<
    Layout,
    "width" | "margin" | "padding" | "gap" | "grow" | "shrink" | "minWidth"
  >;
  /** Takes the room left in its row: a lone key across a strip. */
  grow?: true;
  /** A key stepping through a set beside a heading (‹ ›): it never shrinks
   *  as the heading wraps, and sets its arrow in body type. */
  stepper?: boolean;
  /** A compact key as tall as its row: the "+3 more…" beside two-line
   *  chips, which a compact key's fixed height would refuse. */
  expander?: boolean;
  /** A fixed width in UI pixels: one of a field of equal tiles. */
  width?: number;
  /**
   * The design catalog's specimens: the focus ring or the pad's doubled
   * ring drawn for good.
   */
  demo?: "focus" | "pad-focus";
  /** A ghost key standing on the title screen's backdrop rather than on
   *  chrome: white ink and a white focus ring. */
  backdrop?: true;
  /** A tall key that stacks its picture over its label: a language's flag. */
  tile?: true;
  /**
   * A key of the on-screen keyboard a pad player types with: a 50px
   * `character` or the wide `space`, the `command` and `accept` keys under
   * them (Backspace, Enter), and the `cancel` link spanning the last row.
   */
  keyboardKey?: "character" | "space" | "command" | "accept" | "cancel";
  /**
   * The key Enter would press: its sound is the accept beat. It wears no
   * mark of its own, because the pad's band means gamepad focus and
   * nothing else. One per window.
   */
  isDefault?: boolean;
  /** An instrument's virtual pad cursor rests on this key: the pad's band. */
  padCursor?: boolean;
  /**
   * Still focusable and pressable, so the press can explain why it does
   * nothing, but worn as a dead key that never travels.
   */
  unavailable?: boolean;
  /** Colours the label in a tone's ink, keeping the ordinary key face. */
  tone?: Tone;
  /** Overrides the sound the feedback layer plays for this key; the variant
   *  decides it otherwise. */
  feedback?: "accept" | "cancel" | "click" | "none";
};

/** The key's face, art slot and label type. */
function keyMetrics(size: ButtonProps["size"]) {
  const geometry = size === "title"
    ? CONTROL_METRICS.large
    : CONTROL_METRICS[size === "small" ? "standard" : size ?? "standard"];
  const typeStyle: TypeStyle = size === "title"
    ? "ui-18-solid"
    : size === "compact" || size === "small"
    ? "ui-14-solid"
    : "ui-15-solid";
  return { face: geometry.height, iconSize: geometry.icon, typeStyle };
}

/** The type a keyboard key sets its label in: lowercase, as typed. */
const KEYBOARD_TYPE = {
  character: "ui-20-lower-solid",
  space: "ui-20-lower-solid",
  command: "ui-18-lower-solid",
  accept: "ui-18-lower-solid",
  cancel: "ui-18-lower-solid",
} as const satisfies Record<string, TypeStyle>;

/** A catalog specimen's key wears a moment of play for good. */
const DEMO_LOOKS = {
  focus: "key-demo-focus",
  "pad-focus": "key-demo-pad-focus",
} as const;

/** A mark stands 0.4em from its label, less the 4px of air in its box. */
const MARK_GAP_EM = 0.4;
const MARK_AIR = 4;
/** A pad glyph stands 0.5em from its label or mark: wider than a mark's
 *  gap, since the glyph's own outline reads as touching the word. */
const GLYPH_GAP_EM = 0.5;
const TYPE_SIZES: Partial<Record<TypeStyle, number>> = {
  "ui-14-solid": 14,
  "ui-15-solid": 15,
  "ui-18-solid": 18,
};

type KeyFlags =
  & Pick<
    ButtonProps,
    | "variant"
    | "size"
    | "tile"
    | "fill"
    | "flush"
    | "backdrop"
    | "keyboardKey"
    | "wide"
    | "stacked"
    | "menuItem"
    | "unavailable"
    | "grow"
    | "expander"
    | "stepper"
  >
  & { icon: boolean; close: boolean; share: boolean };

/**
 * The key's box. The parts are laid in order of precedence, each over the
 * last: the key, then each modifier, then the two-part ones that win over
 * every single modifier.
 */
function keyLayout(flags: KeyFlags): Layout {
  const { face } = keyMetrics(flags.size);
  const compact = flags.size === "compact";
  const padX = flags.icon ? 4 : 16;
  const box: Layout = {
    align: "center",
    justify: "center",
    minWidth: face,
    minHeight: face,
    height: face,
    margin: [0, 1],
    padding: [4, padX],
  };
  if (flags.tile) {
    Object.assign(box, {
      direction: "column",
      grow: 1,
      gap: 8,
      height: undefined,
      minHeight: 84,
      margin: 0,
      padding: [12, 8],
    });
  }
  if (flags.icon) {
    Object.assign(box, { width: face, shrink: 0, padding: 4 });
  }
  if (flags.variant === "hud") {
    Object.assign(box, { width: face, minWidth: face, height: face });
    box.padding = 4;
  }
  if (flags.wide) {
    Object.assign(box, { width: "100%", height: undefined, minHeight: face });
  }
  if (compact) {
    Object.assign(box, {
      minWidth: face,
      minHeight: face,
      height: face,
      margin: 4,
      padding: [2, 8],
    });
  }
  if (flags.fill) Object.assign(box, { width: "100%", margin: 0 });
  if (flags.flush) box.margin = 0;
  if (flags.backdrop) box.padding = 8;
  const keyboard = flags.keyboardKey;
  if (keyboard) {
    Object.assign(box, {
      minWidth: 50,
      minHeight: 50,
      height: undefined,
      grow: 0,
      shrink: 0,
      basis: "auto",
    });
    const typed = keyboard === "character" || keyboard === "space" ||
      keyboard === "command";
    if (typed) Object.assign(box, { margin: 0, padding: 10 });
    if (keyboard === "space") box.minWidth = 300;
    if (keyboard !== "character" && keyboard !== "space") box.minWidth = 150;
    if (keyboard === "cancel") {
      Object.assign(box, { width: "100%", margin: [10, 1, 0, 1], padding: 10 });
    }
  }
  if (flags.variant === "readout") {
    Object.assign(box, {
      justify: "start",
      gap: 7,
      minWidth: 0,
      height: undefined,
      minHeight: face,
      alignSelf: "center",
      margin: 0,
      padding: 0,
    });
  }
  if (flags.variant === "dock-tile" || flags.variant === "drawer") {
    Object.assign(box, {
      width: 44,
      minWidth: 0,
      height: 44,
      minHeight: 44,
      margin: 0,
      padding: 0,
    });
  }
  if (flags.stacked) {
    Object.assign(box, {
      grow: 1,
      shrink: 1,
      basis: "0%",
      direction: "column",
      gap: 4,
      height: undefined,
    });
  }
  if (flags.menuItem) {
    Object.assign(box, {
      justify: "end",
      width: "100%",
      margin: 0,
      padding: [0, 20],
    });
  }
  if (flags.close) {
    Object.assign(box, {
      width: CLOSE_KEY_SIZE,
      minWidth: CLOSE_KEY_SIZE,
      minHeight: CLOSE_KEY_SIZE,
      height: CLOSE_KEY_SIZE,
      margin: CLOSE_KEY_INSET,
      padding: 2,
    });
  }
  if (flags.unavailable) box.padding = [4, padX];
  if (compact && flags.icon && !flags.close) {
    Object.assign(box, { width: face, padding: 2 });
  }
  if (flags.stepper) Object.assign(box, { shrink: 0, padding: [0, 10] });
  if (flags.expander) {
    Object.assign(box, { height: undefined, minHeight: 28 });
  }
  if (flags.share) {
    Object.assign(box, {
      grow: 1,
      shrink: 1,
      basis: 0,
      minWidth: 0,
      margin: 0,
    });
  }
  if (flags.grow) box.grow = 1;
  return box;
}

function keyLook(
  variant: NonNullable<ButtonProps["variant"]>,
  flags: {
    latched?: boolean;
    unavailable?: boolean;
    close: boolean;
    backdrop?: true;
    inToolbar: boolean;
    tone?: Tone;
    tile?: true;
  },
): Look {
  if (flags.unavailable) return "key-unavailable";
  if (flags.close) return "key-close";
  if (variant === "dock-tile") {
    return flags.latched ? "key-dock-tile-latched" : "key-dock-tile";
  }
  if (variant === "drawer") {
    return flags.latched ? "key-drawer-latched" : "key-drawer";
  }
  if (variant === "readout") return "key-readout";
  if (variant === "hud") return "key-hud";
  if (flags.latched && flags.inToolbar) return "key-sunk";
  if (variant === "ghost") return flags.backdrop ? "key-backdrop" : "key-ghost";
  if (variant === "flat") return "key-flat";
  if (variant === "danger") return "key-danger";
  if (flags.tone === "bad") return "key-bad";
  if (flags.tone === "good") return "key-good";
  if (flags.tone === "warn") return "key-warn";
  return flags.tile ? "key-tile" : "key";
}

/** A key's parts, a fragment's parts standing among its own: what both its
 *  layout and its gap read, so a glyph in a fragment is still a glyph. */
function keyParts(children: React.ReactNode): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const flatten = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      const fragment = React.isValidElement(child) &&
        child.type === React.Fragment;
      if (fragment) {
        flatten((child.props as { children?: React.ReactNode }).children);
      } else parts.push(child);
    });
  };
  flatten(children);
  return parts;
}

/** Words on a key are set in its type, a run of them one line; pictures and
 *  the caller's own runs stand as they are. */
function keyLabel(
  children: React.ReactNode,
  typeStyle: TypeStyle,
  align: "center" | "end",
  wraps: boolean,
): React.ReactNode {
  const parts = keyParts(children);
  const laid: React.ReactNode[] = [];
  let words: (string | number)[] = [];
  const endRun = () => {
    // A space between two pictures is no part of the key's row.
    const blank = words.join("").trim() === "";
    if (blank) words = [];
    if (words.length === 0) return;
    laid.push(
      <Text
        key={`words-${laid.length}`}
        typeStyle={typeStyle}
        align={align}
        breakAnywhere={wraps}
      >
        {words.join("")}
      </Text>,
    );
    words = [];
  };
  for (const part of parts) {
    if (typeof part === "string" || typeof part === "number") {
      words.push(part);
      continue;
    }
    endRun();
    // A pad glyph is set in the key's words, so its 1.1em is theirs.
    const glyph = React.isValidElement(part) && part.type === Glyph;
    if (glyph) {
      laid.push(
        <Text key={`glyph-${laid.length}`} typeStyle={typeStyle}>{part}</Text>,
      );
      continue;
    }
    if (part !== null && part !== undefined && typeof part !== "boolean") {
      laid.push(
        React.isValidElement(part) && part.key === null
          ? React.cloneElement(part, { key: `part-${laid.length}` })
          : part,
      );
    }
  }
  endRun();
  return laid;
}

/** The floating hint for a key, anchored under it while hovered or focused. */
function useKeyTooltip(
  tooltip: ButtonProps["tooltip"],
  shows: boolean,
  follows: ButtonProps["tooltipFollows"],
  onPointerEnter: (() => void) | undefined,
) {
  const hints = useOptionalHintActions();
  const anchor = useRef<HostNode | null>(null);
  const stopFollowing = useRef<(() => void) | null>(null);
  useEffect(() => () => stopFollowing.current?.(), []);
  const read = () => typeof tooltip === "function" ? tooltip() : tooltip;
  const follow = () => {
    if (!hints) return;
    let opened = false;
    stopFollowing.current = host.observeCursor((point) => {
      if (opened) return hints.updateTooltipPosition(point.x, point.y);
      opened = true;
      hints.showTooltip(point.x, point.y, read());
    });
  };
  return {
    anchor,
    show: (shown: boolean, pointer: boolean) => {
      if (pointer && shown) onPointerEnter?.();
      stopFollowing.current?.();
      stopFollowing.current = null;
      if (!hints || tooltip === undefined) return;
      if (!shown || !anchor.current) return hints.hideTooltip();
      if (!shows) return;
      if (pointer && follows === "cursor") return follow();
      hints.showTooltipAtNode(anchor.current, read());
    },
  };
}

export const Button = React.forwardRef<HostNode, ButtonProps>(
  function Button(props, ref) {
    return <Key {...props} keyRef={ref} close={false} />;
  },
);

/** Every key, the window's close key among them. */
function Key(
  {
    keyRef: ref,
    close: isClose,
    hint,
    variant = "default",
    mark,
    held = false,
    progress,
    size: requestedSize,
    tile,
    fill,
    flush,
    grow,
    stepper,
    expander,
    width,
    demo,
    backdrop,
    keyboardKey,
    isDefault,
    wide,
    latched,
    attention,
    padCursor,
    unavailable,
    menuItem,
    onActivate,
    onPress,
    onHold,
    withheld,
    // A refusal shows by the pointer alone, which the machine does not draw.
    refuses: _refuses,
    shaking,
    stacked,
    dockEnd,
    feedback,
    tone,
    layout,
    disabled: disabledProp = false,
    pressed,
    autoFocus,
    tooltip,
    tooltipShows = true,
    tooltipFollows,
    onPointerEnter,
    onHoverChange,
    onFocusChange,
    children,
    ...rest
  }: ButtonProps & {
    keyRef: React.ForwardedRef<HostNode>;
    close: boolean;
  },
) {
  const ctx = useContext(StatusContext);
  const strip = useContext(KeyStripContext);
  // Footer keys use the strip's 12px type; the strip owns their spacing.
  const place = useContext(InstrumentPlace);
  const inFooter = place === "footer";
  const inToolbar = useContext(ToolbarContext);
  // A key under a clear enabling box is dead with the rest of its group.
  const groupDead = useContext(DeadGroup);
  // Under way, the key is not dead: it keeps its ink and only stops pressing.
  const inProgress = progress !== undefined;
  const disabled = (disabledProp || groupDead) && !inProgress;
  const node = useRef<HostNode | null>(null);
  const shift = useRef(false);
  const [holding, setHolding] = useState(false);
  const [hovered, setHovered] = useState(false);
  const tip = useKeyTooltip(
    tooltip,
    tooltipShows,
    tooltipFollows,
    onPointerEnter,
  );
  const size = requestedSize ?? "standard";
  const look = demo ? DEMO_LOOKS[demo] : keyLook(variant, {
    latched,
    unavailable,
    close: isClose,
    backdrop,
    inToolbar,
    tone,
    tile,
  });
  const metrics = keyMetrics(size);
  const iconSize = isClose ? CONTROL_METRICS.close.icon : metrics.iconSize;
  const markArt = mark === undefined ? null : (
    <Mark
      mark={mark}
      size={iconSize}
      dead={disabled}
      material={look === "key-danger"
        ? "danger"
        : tone === "good"
        ? "good"
        : "chrome"}
    />
  );
  const markTrails = mark !== undefined && RIGHTWARD_MARKS.has(mark);
  const pictures = React.Children.toArray([markArt, children]);
  const isIconOnly = variant === "toolbar" || variant === "hud" ||
    (pictures.length === 1 && holdsOnlyIcons(pictures, ICON_TYPES));
  const typeStyle = keyboardKey
    ? KEYBOARD_TYPE[keyboardKey]
    : stepper
    ? "ui-18-solid"
    : variant === "readout"
    ? "mono-12-solid"
    : strip.typeStyle ??
      (inFooter
        ? "ui-12-solid"
        : variant === "flat"
        ? "ui-15-solid-underline"
        : menuItem
        ? "ui-15-solid"
        : metrics.typeStyle);
  const box = keyLayout({
    variant,
    size,
    tile,
    fill,
    flush,
    backdrop,
    keyboardKey,
    wide,
    stacked,
    menuItem,
    unavailable,
    grow,
    stepper,
    expander,
    icon: isIconOnly,
    close: isClose,
    share: Boolean(strip.share),
  });
  if (strip.minWidth !== undefined) box.minWidth = strip.minWidth;
  if (strip.flush) box.margin = 0;
  if (inFooter) box.margin = 0;
  if (width !== undefined) box.width = width;
  Object.assign(box, layout);
  const markGap = mark !== undefined && children !== undefined &&
    children !== null && variant !== "readout" && !stacked;
  if (markGap) {
    const em = TYPE_SIZES[typeStyle] ?? 15;
    box.gap = Math.max(
      0,
      MARK_GAP_EM * em - MARK_AIR * iconSize / ICON_SIZES.small,
    );
  }
  const holdsGlyph = keyParts(children).some((child) =>
    React.isValidElement(child) && child.type === Glyph
  );
  if (holdsGlyph && !isIconOnly) {
    box.gap = GLYPH_GAP_EM * (TYPE_SIZES[typeStyle] ?? 15);
  }

  useEffect(() => {
    if (autoFocus) host.focus(node.current);
  }, [autoFocus]);

  // Shift is read off the keyboard, because a press carries no modifiers.
  useEffect(() => {
    if (!onActivate) return;
    return host.observeKeyHold("Shift", (down) => {
      shift.current = down;
    });
  }, [onActivate]);

  const setStatus = (next: string) => {
    if (!hint || !ctx) return;
    ctx.setHint(next);
  };
  const hudSolid = Boolean(pressed) || held || holding;
  const sound = feedback ??
    (isDefault ? "accept" : variant === "danger" ? "cancel" : "click");

  return (
    <KeyContext.Provider value={{ dead: disabled, iconSize }}>
      <Box
        {...rest}
        {...box}
        nodeRef={(host) => setNodeRefs(host, ref, node, tip?.anchor)}
        role="button"
        look={look}
        disabled={disabled}
        pressed={pressed}
        held={held || inProgress}
        hitSlop={isClose
          ? CLOSE_KEY_INSET
          : size === "compact"
          ? 4
          : size === "small"
          ? 2
          : undefined}
        focusable
        feedback={sound}
        opacity={withheld ? 0.6 : undefined}
        animation={shaking
          ? "bureau-gift-shake"
          : attention
          ? "bureau-attention-shake"
          : undefined}
        onPress={(press) => {
          if (inProgress) return;
          onActivate?.({ shift: shift.current });
          onPress?.(press);
        }}
        onHoldChange={(down, released) => {
          if (variant === "hud") setHolding(down);
          onHold?.(down ? "start" : released ? "release" : "cancel");
        }}
        onHoverChange={(inside) => {
          if (variant === "hud") setHovered(inside);
          setStatus(inside ? hint ?? "" : "");
          tip?.show(inside, true);
          onHoverChange?.(inside);
        }}
        onFocusChange={(focused) => {
          setStatus(focused ? hint ?? "" : "");
          tip?.show(focused, false);
          onFocusChange?.(focused);
        }}
      >
        {variant === "hud" && (
          <HudFace solid={hudSolid} lifted={hovered && !disabled} />
        )}
        {variant === "dock-tile" && <DockFrame end={dockEnd} />}
        {inProgress && <ProgressFill progress={progress} />}
        {
          // The pad's virtual cursor is an instrument's; elsewhere real focus
          // shows where the pad is.
          padCursor && place !== "none" && <PadCursor />
        }
        {!markTrails && markArt}
        {keyLabel(
          children,
          typeStyle,
          menuItem ? "end" : "center",
          Boolean(wide),
        )}
        {markTrails && markArt}
      </Box>
    </KeyContext.Provider>
  );
}

/** How much of the city shows through a HUD key's checkerboard. */
const HUD_FACE = 0.32;
const HUD_FACE_HOVER = 0.5;
/** The HUD key's see-through face: a white checkerboard, solid when held. */
function HudFace({ solid, lifted }: { solid: boolean; lifted: boolean }) {
  return (
    <Box
      position="absolute"
      inset={{ top: 3, right: 3, bottom: 3, left: 3 }}
      pattern="stipple-white"
      opacity={solid ? 0 : lifted ? HUD_FACE_HOVER : HUD_FACE}
      passThrough
      hidden
    />
  );
}

/** How far a key's action has come, filling its face inside the pressed
 *  bevel's 3px. */
function ProgressFill({ progress }: { progress: number }) {
  const percent = Math.min(1, Math.max(0, progress)) * 100;
  return (
    <Box
      position="absolute"
      inset={{ top: 3, right: 3, bottom: 3, left: 3 }}
      direction="row"
      passThrough
      hidden
    >
      <Box width={`${percent}%`} fill="row-selected" />
    </Box>
  );
}

/** The dock's ink frame, the piece of it each tile holds. */
function DockFrame({ end }: { end?: "first" | "last" }) {
  return (
    <Box
      position="absolute"
      inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
      look={end === "first"
        ? "dock-frame-first"
        : end === "last"
        ? "dock-frame-last"
        : "dock-frame"}
      passThrough
      hidden
    />
  );
}

/** An instrument's virtual pad cursor: the mark real focus draws. */
function PadCursor() {
  return (
    <Box
      position="absolute"
      inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
      look="pad-cursor"
      passThrough
      hidden
    />
  );
}

type CloseButtonProps =
  & Omit<ButtonProps, "children" | "variant" | "size" | "mark">
  & { label: string };

/** The compact close key at the right edge of every Bureau title bar. */
export function CloseButton(props: CloseButtonProps) {
  return (
    <Key
      {...props}
      keyRef={null}
      close
      variant="toolbar"
      size="compact"
      feedback="cancel"
      mark="close"
    />
  );
}

export type HoldButtonProps = ButtonProps & {
  /** The host's own reading of the hold: a pad button or a key kept down. */
  holding: boolean;
  durationMs: number;
  /** Fires once per hold, the moment the face is full. */
  onHoldComplete: () => void;
};

/**
 * A key confirmed by holding it. While `holding`, its face fills left to right
 * over `durationMs` and `onHoldComplete` fires when it is full; letting go
 * early empties it. The hold comes from the host because only the host knows
 * which pad button or key means this key. A press still presses it at once.
 *
 * The fill is the selected-row blue, which the key's own ink already reads on
 * in both chromes, so the label never changes colour as the fill passes it.
 */
export function HoldButton(
  { holding, durationMs, onHoldComplete, children, ...rest }: HoldButtonProps,
) {
  // A ref, so a host that hands in a fresh callback every render does not
  // restart the hold it is in the middle of.
  const onHoldCompleteRef = useRef(onHoldComplete);
  useEffect(() => {
    onHoldCompleteRef.current = onHoldComplete;
  });

  useEffect(() => {
    if (!holding) return;
    const timer = platform.timers.setTimeout(
      () => onHoldCompleteRef.current(),
      durationMs,
    );
    return () => platform.timers.clearTimeout(timer);
  }, [holding, durationMs]);

  return (
    <Button {...rest}>
      {holding && (
        <Box
          position="absolute"
          inset={{ top: 2, right: 2, bottom: 2, left: 2 }}
          fill="row-selected"
          animation="bureau-hold-fill"
          animationDurationMs={durationMs}
          passThrough
          hidden
        />
      )}
      {children}
    </Button>
  );
}

/** A well holds data: list bodies, sheet frames, anything read rather than
 *  pressed. A panel holds controls. That is the whole distinction. */
export const Well = React.forwardRef<
  HostNode,
  {
    /** Holds a list: takes the room left in its column, scrolls inside its
     *  bevel and keeps only a hairline of air around the rows. */
    scrollingList?: true;
    /** A fixed width in UI pixels; it may still shrink in a crowded row. */
    width?: number;
    id?: string;
    layout?: SurfaceLayout | SurfaceLayoutName;
    children?: React.ReactNode;
  }
>(
  function Well(
    { scrollingList, width, layout, children, ...access },
    ref,
  ) {
    if (scrollingList) {
      return (
        <ScrollingWell
          {...access}
          nodeRef={(host) => setNodeRefs(host, ref)}
          layout={surfaceLayout(layout)}
        >
          {children}
        </ScrollingWell>
      );
    }
    return (
      <Box
        {...access}
        nodeRef={(host) => setNodeRefs(host, ref)}
        look="well"
        direction="column"
        padding={[12, 16]}
        width={width}
        {...surfaceLayout(layout)}
      >
        {children}
      </Box>
    );
  },
);

/** The well's list: a sunken Scroll with a hairline of air around the rows. */
function ScrollingWell(
  { nodeRef, layout, children, ...access }: {
    nodeRef: (node: HostNode | null) => void;
    layout?: SurfaceLayout;
    id?: string;
    children?: React.ReactNode;
  },
) {
  return (
    // From nothing, so the well takes what its siblings leave instead of
    // squeezing them: every box may shrink to nothing.
    <Box
      look="well"
      direction="column"
      grow={1}
      basis={0}
      minHeight={0}
      {...layout}
    >
      <Scroll
        {...access}
        nodeRef={nodeRef}
        direction="column"
        grow={1}
        minHeight={0}
        padding={4}
      >
        {children}
      </Scroll>
    </Box>
  );
}

export const Panel = React.forwardRef<
  HostNode,
  {
    /** The dark chrome of the instruments on the map. */
    chrome?: "light" | "dark";
    /**
     * A standalone map legend: pinned top-left, opposite the instruments on
     * the right, and transparent to the pointer, so a drag that starts on
     * the city passes through it.
     */
    legend?: boolean;
    id?: string;
    layout?: SurfaceLayout | SurfaceLayoutName;
    children?: React.ReactNode;
  }
>(function Panel({ chrome, legend, layout, children, ...access }, ref) {
  const panel = (
    <Box
      {...access}
      nodeRef={(host) => setNodeRefs(host, ref)}
      look="panel"
      chrome={chrome}
      direction="column"
      padding={[12, 16]}
      passThrough={legend}
      maxWidth={legend ? WIDGET_WIDTH : undefined}
      {...surfaceLayout(layout)}
    >
      {children}
    </Box>
  );
  if (!legend) return panel;
  return (
    <Layer
      anchor={{ kind: "screen", top: 60, left: 10 }}
      stacking="hud"
      passThrough
    >
      {panel}
    </Layer>
  );
});

/**
 * A titled frame around related controls — the era's signature container:
 * an etched hairline with the legend knocked out of its top-left.
 *
 * The legend sits on the frame's top rule, which runs through the middle of
 * its line, and covers the rule with a fill in the chrome colour, which is what
 * makes a group box read as a labelled frame rather than as text sitting on a
 * line. The children stack in the frame's body.
 */
export function GroupBox(
  { legend, spacing, children }: {
    legend: React.ReactNode;
    /** `group`: whole settings stand a group apart, not the related rows
     *  the frame spaces by default, so a hint never reads as the caption
     *  of the control under it. */
    spacing?: "group";
    children?: React.ReactNode;
  },
) {
  return (
    <Box direction="column" minWidth={0} padding={[0, 12, 12, 12]}>
      <Box
        position="absolute"
        inset={{ top: LEGEND_LINE / 2, right: 0, bottom: 0, left: 0 }}
        look="groupbox"
        passThrough
        hidden
      />
      <Box alignSelf="start" padding={[0, 4]} fill="face" ink="ink">
        <Text typeStyle="ui-15-solid">{legend}</Text>
      </Box>
      <Box
        direction="column"
        gap={spacing === "group" ? 12 : 8}
        minWidth={0}
        margin={[16, 0, 0, 0]}
      >
        {children}
      </Box>
    </Box>
  );
}
/** The legend's line, set solid: the frame's rule runs through its middle. */
const LEGEND_LINE = 15;

/** A heading inside a window's form, in the chrome's mono at its size. */
export function Heading({ children }: { children?: React.ReactNode }) {
  return (
    <Box>
      <Text typeStyle="mono-14-solid" ink="ink">{children}</Text>
    </Box>
  );
}

/** Prose in the register's body type, or one step down. */
export function BodyText(
  { small, children }: { small?: boolean; children?: React.ReactNode },
) {
  return (
    <Box>
      <Text typeStyle={small ? "ui-15-solid" : "ui-18-solid"} ink="ink">
        {children}
      </Text>
    </Box>
  );
}

/**
 * A row of keys standing side by side: the settings sheet's test-sound keys,
 * a window's Reset/Apply pair, the two choices under a revealed gift.
 *
 * WHY a kit part for a flex row: five windows had each written the same
 * wrapping row. `align` names which edge the keys gather at; the row is a
 * key-high band so a lone key in it lines up with the labelled rows above.
 * Wrapping is deliberate: a translated label that no longer fits drops to a
 * second line of keys rather than squeezing the row's neighbours.
 */
export function KeyRow(
  { align = "start", share, wide, children }: {
    align?: "start" | "center" | "end";
    /** The keys share the row in equal parts and never wrap. */
    share?: true;
    /** Spans its container, so a grown item can push the keys to the end. */
    wide?: boolean;
    children?: React.ReactNode;
  },
) {
  const row = (
    <Box
      wrap={!share}
      align="center"
      justify={align}
      gap={8}
      minHeight={36}
      width={wide ? "100%" : undefined}
    >
      {children}
    </Box>
  );
  if (!share) return row;
  return (
    <KeyStripContext.Provider value={{ share: true }}>
      {row}
    </KeyStripContext.Provider>
  );
}

type IconSource =
  /** A pixel icon from the register's own set, /icons/95/. */
  | { name: string; src?: never }
  /** Any other bitmap by path: the HUD's /icons/*.png, a toolbox icon. */
  | { src: string; name?: never };

type IconProps =
  & IconSource
  & {
    /** Square slot in UI pixels: inherited from the key, otherwise small (20px). */
    size?: keyof typeof ICON_SIZES | number;
    /** Source pixels per art pixel for an enlarged pixel master. */
    artScale?: number;
    /** Keep a bitmap that is not square at its own aspect inside the box. */
    contain?: boolean;
    /** At half strength: one of a row of marks that is not lit, or the mark
     *  beside a figure that is still zero. */
    dimmed?: boolean;
  };

/**
 * A pixel icon, rendered crisp at the register's size. In a dead key it is
 * stippled and drained of its hue, which would otherwise survive the stipple
 * and keep a dead key looking live.
 */
export function Icon(
  { name, src, size, artScale, contain, dimmed }: IconProps,
) {
  const key = useContext(KeyContext);
  const side = typeof size === "string"
    ? ICON_SIZES[size]
    : size ?? key?.iconSize ?? ICON_SIZES.small;
  const dead = key?.dead ?? false;
  return (
    <Image
      source={(src ?? `/icons/95/${name}.png`) as PixelSource}
      width={side}
      height={side}
      artScale={artScale}
      integerScale
      contain={contain}
      stipple={dead}
      grayscale={dead}
      opacity={dimmed ? 0.5 : undefined}
      // Set in a line of words it centres on them; in a key it is a part.
      inline={{ align: "middle" }}
    />
  );
}
