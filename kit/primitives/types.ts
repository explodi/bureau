import type { ReactNode } from "react";
import type { HostNode } from "./host.ts";

import type {
  Animation,
  LAYERS,
  LookName,
  PaletteInk,
  Pattern,
  PrintInk,
  Recipe,
  ThemeInk,
  TypeStyleName,
} from "../tokens.ts";

export type { Animation, Recipe };
export type Length = number | `${number}%`;
/** A role ink follows the chrome; palette and print inks are the same in both. */
export type Ink = ThemeInk | PaletteInk | PrintInk;
export type Look = LookName;
export type TypeStyle = TypeStyleName;
export type StackingLevel = (typeof LAYERS)[number];
/**
 * The roles the native view acts on and the capture harness waits for. The
 * pad's A presses a focused button or check (dialog navigation owns it), and
 * the arrows move along a toolbar. A pressable box with no role is a button
 * too, tabs, segments and sheet rows included;
 * "none" keeps one whose owner claims the pad's A itself (a menu item, a
 * pop-up's trigger, an option) from being pressed as one.
 */
export type Role =
  | "button"
  | "cell"
  | "checkbox"
  | "dialog"
  | "heading"
  | "listitem"
  | "none"
  | "progressbar"
  | "radio"
  | "toolbar";

/** What the native view and the capture harness read of a node beyond its
 * looks: no accessibility layer reads more. */
/** The host's named cursors: what a box can ask the pointer to look like. */
export type Cursor =
  | "pointer"
  | "text"
  | "move"
  | "grab"
  | "crosshair"
  | "ew-resize"
  | "ns-resize"
  | "not-allowed";

export interface Access {
  /** Semantic name retained in the native node tree, independent of its art. */
  label?: string;
  nodeRef?: (node: HostNode | null) => void;
  id?: string;
  role?: Role;
  /** Still loading: the capture harness waits for it to clear. */
  busy?: boolean;
  /** The window's wait cursor; any visible true overrides false. Advisory only. */
  windowBusy?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  selected?: boolean;
  pressed?: boolean;
  /** Out of reach: no focus, no press, while something covers it. */
  inert?: boolean;
}

export interface Layout {
  direction?: "row" | "column" | "row-reverse" | "column-reverse";
  wrap?: boolean;
  grow?: number;
  shrink?: number;
  basis?: Length | "auto";
  width?: Length;
  height?: Length;
  minWidth?: Length;
  minHeight?: Length;
  maxWidth?: Length;
  maxHeight?: Length;
  padding?:
    | number
    | readonly [number, number]
    | readonly [number, number, number, number];
  margin?:
    | number
    | "auto"
    | readonly [number | "auto", number | "auto"]
    | readonly [
      number | "auto",
      number | "auto",
      number | "auto",
      number | "auto",
    ];
  gap?: number | readonly [row: number, column: number];
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  alignSelf?: "auto" | "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  /** `sticky` holds the box at its inset while its Scroll moves under it. */
  position?: "relative" | "absolute" | "sticky";
  inset?: { top?: number; right?: number; bottom?: number; left?: number };
  overflow?: "visible" | "hidden";
}

export interface KeyEvent {
  key: string;
  code: string;
  phase: "down" | "up";
  repeat: boolean;
  shift: boolean;
  control: boolean;
  alt: boolean;
  meta: boolean;
}

export interface BoxProps extends Layout, Access {
  surface?: Recipe;
  fill?: Ink;
  /** A stateful look from the token document; `surface` and `fill` add to it. */
  look?: Look;
  /** The ink its text inherits. */
  ink?: Ink;
  /** The type style its text inherits, as a Text's runs inherit theirs: a
   *  panel's voice. */
  typeStyle?: TypeStyle;
  /** A pattern on its ground, under its bevel and its content. */
  pattern?: Pattern;
  /**
   * A folder tab: its sides lean in this many pixels toward its top. Its fill
   * and its surface's top line, which runs over the top and down both sides,
   * follow the slant; its foot stays open.
   */
  slant?: number;
  opacity?: number;
  /**
   * Set in a line of text as one box, at the line's middle (a field among a
   * sheet's words) or on its baseline (a figure after a title).
   */
  inline?: { align: "middle" | "baseline" };
  chrome?: "light" | "dark";
  pressed?: boolean;
  /** Drawn held down for as long as the host holds it: a pad button kept down. */
  held?: boolean;
  selected?: boolean;
  disabled?: boolean;
  focusable?: boolean;
  /**
   * False: focusable by the pad and the host only, never by Tab, as the
   * other keys of a roving strip are.
   */
  tabStop?: boolean;
  /** The sound a press plays in place of the click; `none` sounds itself. */
  feedback?: "accept" | "cancel" | "click" | "none";
  /** A stop on the pad's walk through a window; `navigationGrid` names its grid. */
  navigable?: boolean;
  navigationGrid?: string;
  hitSlop?: number;
  passThrough?: boolean;
  /** The pointer's look over the box, where the host draws one: the
   * innermost box under the pointer that names a cursor decides. */
  cursor?: Cursor;
  animation?: Animation;
  /** How long the animation waits before it starts: a deal's stagger. */
  animationDelayMs?: number;
  /** How long one run takes, where the caller sets it: a hold's fill. */
  animationDurationMs?: number;
  /**
   * When layout moves the box in its parent, it glides there from where it
   * was drawn over this many milliseconds, slowing as it arrives, with all it
   * holds: a tab strip that slides to centre the open tab, a selection bar
   * that runs between rows. A move during a glide sets off from where the box
   * is drawn then. A box glides only when it moves: it appears in place, and
   * a scroll or a move of its parent carries it at once. Under reduced motion
   * it stands in its new place at once.
   */
  glideMs?: number;
  onPress?: (press: Press) => void;
  /** The secondary button (a right click) let go over the box: a context
   * menu's. The innermost box that has one hears it. */
  onSecondaryPress?: (press: Press) => void;
  /** The middle button let go over the box: a tab's close. */
  onMiddlePress?: (press: Press) => void;
  /**
   * The press as it is held: true when the primary pointer, Space or Enter
   * goes down on the box, false when it lets go there or the press is lost
   * (`released` says which), for a key that acts while it is held.
   */
  onHoldChange?: (held: boolean, released: boolean) => void;
  /**
   * The pointer entered or left the box. Inside a Scroll, a finger enters only
   * once it lifts without travelling or rests for 250 ms: a scroll enters
   * nothing. Hover and focus both wait for that.
   */
  onHoverChange?: (inside: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
  onKey?: (key: KeyEvent) => boolean;
  /**
   * A pointer pressed on the box and moved: its travel since the press, as it
   * moves and when it lets go. A drag past 8px is not also a press.
   */
  onDrag?: (drag: Drag) => void;
  /** The pointer's place over the box as it moves, in its pixels from the
   *  box's top-left corner: a chart's reading follows it. */
  onHoverMove?: (point: { x: number; y: number }) => void;
  /**
   * The design size, in UI pixels, what it holds lays out at when its content
   * box is smaller along a side it names: the content keeps that size and is
   * drawn scaled down to fit, never up, so a slide keeps its composition in a
   * window too short for it. Past the tighter side, the content takes the
   * extra room the scale gives it. The box's own size comes from its props
   * and its parent, never from what it holds. Inside, measures, drags and
   * scrolling are in the content's own pixels (`HostRect.scale`).
   */
  scaleBelow?: { width?: number; height?: number };
  children?: ReactNode;
}

/** How a box was pressed. */
export interface Press {
  /**
   * A finger (or a stylus) rather than a mouse, a key or a pad: no hover came
   * first, so a tooltip was never read.
   */
  touch: boolean;
  /** The modifiers the pointer held; none for a key or a pad. */
  shift?: boolean;
  control?: boolean;
  alt?: boolean;
  meta?: boolean;
  /** The second (or later) press of the same box in quick succession: a
   * double click is 2. Absent for a single press. */
  count?: number;
}

export interface Drag {
  phase: "move" | "end";
  x: number;
  y: number;
  /** A finger rather than a mouse or a pen. */
  touch: boolean;
}

/** Formatting is data so the native host can update a value without JS. */
export interface TextFormat {
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Thousands set apart with commas, as the game writes figures: 12,345. */
  grouped?: boolean;
  /** US dollars, as the game writes prices: -$1,234, and $0.50 under one. */
  money?: boolean;
  /** With `money`, past a million abbreviated: $7.45m, $1.20b. */
  compact?: boolean;
}
export interface TextBinding {
  field: string;
  format?: TextFormat;
}
export interface TextCount {
  from: number;
  to: number;
  durationMs: number;
  format?: TextFormat;
}
interface TextStyle extends Access {
  typeStyle?: TypeStyle;
  ink?: Ink;
  /**
   * `justify` spreads a line at its spaces only; `justify-characters` also
   * between the characters of text set without spaces (Chinese, Japanese).
   */
  align?: "start" | "center" | "end" | "justify" | "justify-characters";
  /** A fitted size: the type style's size and line height times this. */
  scale?: number;
  /** One line, reducing type in whole UI pixels down to `minSize`, then
   * ellipsizing. Never enlarges type; inline pictures keep their size. */
  fit?: { minSize: number };
  /** One line however wide, overflowing rather than clipped. */
  nowrap?: boolean;
  /** A hard shadow of the glyphs, `offset` pixels down and right. */
  shadow?: { ink: Ink; offset: number };
  lines?: number;
  ellipsis?: boolean;
  /** Keep the text's own line breaks and runs of spaces. */
  preserveBreaks?: boolean;
  /** Break a word that is wider than its line anywhere. */
  breakAnywhere?: boolean;
  /**
   * Set on a plate in its line, as a stamp is: the plate's fill and recipe,
   * its padding [y, x] and the space after it, centred on the line.
   */
  plate?: {
    fill: Ink;
    surface: Recipe;
    padding: readonly [number, number];
    trailing: number;
  };
}
export type TextProps =
  & TextStyle
  & (
    | { children?: ReactNode; binding?: never; count?: never }
    | { binding: TextBinding; children?: never; count?: never }
    | { count: TextCount; children?: never; binding?: never }
  );

/**
 * A PNG, or an SVG drawn in the palette's colours: a DB32 colour solid, a
 * MICRO64 one past it as a dither of two (tokens.ts MICRO64_DITHERS), crisp
 * at any size (bureau/src/view/vector.h).
 */
export type PixelSource =
  | `${string}.png`
  | `${string}.svg`
  | `data:image/png;base64,${string}`;
export interface ImageProps extends Access {
  source: PixelSource;
  /** The same picture at twice its pixels, drawn instead on a 2x screen. */
  source2x?: PixelSource;
  /** A size left out follows the picture's aspect ratio. */
  width?: number;
  height?: number;
  pixelScale?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Filtered, not pixelated: a picture drawn at another size than its pixels. */
  smooth?: boolean;
  /**
   * Pixel art kept at this many pixels per art pixel (the toolbox keeps its
   * icons at 4). Drawn smaller than its source, on an uneven number of device
   * pixels per art pixel, it is sampled smoothly, so every art pixel keeps
   * one width.
   */
  artScale?: number;
  /**
   * Centre the largest whole device-pixel multiple of the source's art pixels
   * inside this layout slot. `artScale` names enlarged pixel-art sources.
   * Always sample nearest. If even 1× cannot fit, retain the fitted image size.
   */
  integerScale?: boolean;
  tint?: Ink;
  grayscale?: boolean;
  /** Half its pixels knocked out on the stipple: a dead key's picture. */
  stipple?: boolean;
  /** Centred in the room its parent gives it, by equal margins: a tile's
   *  icon. */
  centered?: boolean;
  /** Drawn at this share of its strength over what lies under it: a tool
   *  the city cannot use right now, see-through. */
  opacity?: number;
  /** Fitted whole inside its box, its own proportions kept. */
  contain?: boolean;
  /**
   * Set in a line of text, as an icon before a word: where it sits on the
   * line (`middle`, or pixels above the baseline) and the space after it.
   */
  inline?: { align: "middle" | number; trailing?: number };
  /** A hard drop shadow, `offset` pixels down and right. */
  shadow?: { ink: Ink; offset: number };
  /**
   * The picture's shape alone: `grey` in the disabled ink's grey (a goal not
   * yet earned), `black` in solid black (a gift not yet discovered).
   */
  silhouette?: "grey" | "black";
  /** A one-art-pixel (2px) rim of ink at the sides and below. */
  rim?: Ink;
  /** A one-pixel line of ink round the picture's shape: a chosen tool. */
  outline?: Ink;
  /** Its contrast cut to 0.3, toward grey: a tool behind a lock. */
  washedOut?: boolean;
  /**
   * The source is a vertical strip of `count` frames, each `frameMs` long,
   * played on a loop; width and height are one frame's.
   */
  frames?: { count: number; frameMs: number };
}
export interface ScrollOffset {
  x: number;
  y: number;
}
export interface ScrollProps extends Layout, Access {
  axis?: "horizontal" | "vertical" | "both";
  /** `reserved`: shown only when there is something to scroll, while its
   *  room is always kept, so content never reflows as the bar comes and goes. */
  scrollbar?: "auto" | "always" | "hidden" | "reserved";
  /** The ground its content scrolls over, and the bevel framing it: a well. */
  fill?: Ink;
  surface?: Recipe;
  offset?: ScrollOffset;
  onScroll?: (offset: ScrollOffset) => void;
  /** Held at the top of the view while the content scrolls under it. */
  header?: ReactNode;
  /** A stop for the keyboard and the pad, so a long list can be scrolled. */
  focusable?: boolean;
  children?: ReactNode;
}
export interface FieldProps extends Layout, Access {
  value: string;
  /**
   * `range`: a slider between `min` and `max`, in steps of `step`.
   * `multiline`: lines of text that scroll, such as a report to copy.
   */
  kind?: "text" | "number" | "range" | "multiline";
  /** The value's type; the field's own when left out. */
  typeStyle?: TypeStyle;
  ink?: Ink;
  align?: "start" | "center" | "end";
  /** Drawn by the cell it stands in: no paper, no well and no ring of its own. */
  bare?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocusChange?: (focused: boolean) => void;
  onKey?: (key: KeyEvent) => boolean;
}
export type Point = readonly [x: number, y: number];
export type PlotCommand =
  | { kind: "move"; x: number; y: number }
  /** Consecutive lines in one ink and width join into one polyline. */
  | { kind: "line"; x: number; y: number; ink: Ink; width?: number }
  | { kind: "dash"; lengths: readonly number[] }
  | {
    kind: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
    ink: Ink;
  }
  | {
    kind: "polygon";
    points: readonly Point[];
    ink: Ink;
    /** A see-through fill: the ink at this share over what lies under it. */
    opacity?: number;
    /** An outline over the fill, solid, its corners rounded. */
    stroke?: { ink: Ink; width: number };
    /** Whole device pixels, no anti-aliasing: a pixel is in when its centre
     *  is, so a 45° edge stays an even staircase at every UI scale. */
    crisp?: true;
  }
  /**
   * Art cut into a face as OPENSTEP cut it: a shadowed wall inside the edges
   * facing the top-left light, a lit wall outside the others, the floor
   * between. Walls are whole device pixels at every UI scale. Native only.
   */
  | {
    kind: "engraving";
    paths: readonly (readonly Point[])[];
    shadow: Ink;
    floor: Ink;
    lit: Ink;
  }
  /** A figure on a chart: its line box centred on y, and `align` (centre by
   *  default) saying which part of the run stands on x. */
  | {
    kind: "text";
    x: number;
    y: number;
    text: string;
    ink: Ink;
    typeStyle: TypeStyle;
    align?: "start" | "center" | "end";
  }
  | {
    kind: "wedge";
    x: number;
    y: number;
    radius: number;
    start: number;
    end: number;
    ink: Ink;
    /** Cut out to this radius: a slice of a ring. */
    innerRadius?: number;
    /** A line round the slice's edge, centred on it. */
    stroke?: { ink: Ink; width: number };
  }
  | {
    kind: "image";
    source: PixelSource;
    x: number;
    y: number;
    width: number;
    height: number;
  };
export interface PlotProps extends Access {
  width: number;
  height: number;
  commands: readonly PlotCommand[];
  /** Knocked back with the stipple a dead control's label takes. */
  stipple?: boolean;
}
/** A screen anchor pins the layer's box at distances from the viewport's edges. */
export type LayerAnchor =
  | {
    /** A measured street name, repeated and turned by the native camera. */
    kind: "street";
    run: number;
    points: readonly { x: number; y: number; z: number }[];
    size: "regular" | "small";
  }
  | {
    kind: "world";
    x: number;
    y: number;
    z: number;
    centered?: boolean;
    /** Overlapping labels in this group keep the first visible one. */
    crowdGroup?: string;
  }
  | { kind: "cursor" }
  | {
    kind: "screen";
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
export interface LayerProps extends Access {
  rootId?: string;
  children?: ReactNode;
  anchor?: LayerAnchor;
  offset?: ScrollOffset;
  passThrough?: boolean;
  /** Draws above layers of a lower level; none keeps the order of mounting. */
  stacking?: StackingLevel;
  /**
   * Spans its whole root, so a child can fill the screen. On the screen, a
   * box that fills it, or a bar that spans its width or height, reaches past
   * the safe area to the screen's edges on the sides it shares with it, while
   * what it holds stays inside.
   */
  cover?: boolean;
  /**
   * Held to the screen itself rather than to its root: a panel that stays
   * put over the city whatever moves under it.
   */
  pinned?: boolean;
}
