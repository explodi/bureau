/**
 * The Bureau host: what the kit asks of the screen, asked of Bureau
 * Native's view through `__native` (src/js/view_bridge.cpp).
 * Nodes are the reconciler's; the view knows them by id. The host's listeners
 * are kept here, and the view's events reach them through `handleHostEvent`.
 */
import { platform } from "platform";
import type {} from "../native_globals.ts";
import type { KeyEvent, TypeStyle } from "./types.ts";
import { type NativeNode, nativeNode } from "./reconciler.ts";

export type HostNode = NativeNode;

/** A rectangle on the screen, in UI pixels from the window's corner. */
export interface HostViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HostRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  /**
   * UI pixels on the screen per pixel the node lays out in: 1 unless a box
   * that scales what it holds down (`scaleBelow`) holds it. A size handed
   * back to the node, a plot's or a column's, is the measure divided by it.
   */
  scale: number;
}

/** A number field is open-ended unless it sets its ends; a slider is not. */
export type HostControl =
  | { kind: "button" | "check" | "text"; disabled: boolean }
  | {
    kind: "number" | "range";
    disabled: boolean;
    value: string;
    min: number;
    max: number;
    step: number;
  };

/** A point on the screen, in UI pixels. */
export interface CursorPoint {
  x: number;
  y: number;
}

export type FeedbackCue = "accept" | "cancel" | "click" | "move";

export interface Host {
  find(id: string): HostNode | null;
  /** Rectangles use UI pixels. */
  measure(node: HostNode): HostRect;
  focusables(root: HostNode, visibleOnly?: boolean): HostNode[];
  navigable(gridId?: string, sequential?: boolean): HostNode[];
  isNavigable(node: HostNode): boolean;
  focus(node: HostNode | null | undefined, preventScroll?: boolean): void;
  /** Calls once the pending commit is laid out: to focus what it mounted. */
  afterLayout(callback: () => void): () => void;
  blur(node: HostNode | null | undefined): void;
  contains(root: HostNode, node: HostNode | null): boolean;
  connected(node: HostNode): boolean;
  toolbar(node: HostNode): HostNode | null;
  scrollIntoView(node: HostNode | null | undefined): void;
  scrollBy(node: HostNode, x: number, y: number): void;
  horizontalScroller(root: HostNode, from: HostNode): HostNode | null;
  control(node: HostNode): HostControl | null;
  press(node: HostNode): void;
  setControlValue(node: HostNode, value: string): void;
  selectText(node: HostNode | null): void;
  captureKeys(
    handle: (key: KeyEvent) => boolean,
    exclusive?: boolean,
  ): () => void;
  /**
   * Reports a key held down anywhere, without consuming it: true on its first
   * press, false on release or when the window loses the keyboard.
   */
  observeKeyHold(key: string, update: (held: boolean) => void): () => void;
  /**
   * Keys pressed and released that no control consumed, as they leave the
   * UI: the game's shortcuts. `typing` is true while a text entry has focus.
   * Returning true consumes the key.
   */
  observeKeys(
    handle: (key: KeyEvent, typing: boolean) => boolean,
  ): () => void;
  /** How wide `text` sets on one line in a type style, in UI pixels. */
  measureText(style: TypeStyle, text: string): number;
  /**
   * The safe area: the screen less a phone's notch, home indicator and
   * keyboard, where the UI may stand. In the frame `measure` reports, so its
   * corner is the insets.
   */
  viewport(): HostViewport;
  /** Calls back after each layout that moved or resized anything. */
  observeLayout(update: () => void): () => void;
  /**
   * Calls back at once with the pointer's position on the screen, and again
   * each time it moves: a hint that follows the pointer across a wide target.
   */
  observeCursor(update: (point: CursorPoint) => void): () => void;
  /**
   * The node's own box against what it lays out, in its own pixels: content
   * wider than `width` overflows it.
   */
  contentExtent(node: HostNode): {
    width: number;
    height: number;
    contentWidth: number;
    contentHeight: number;
  };
  observeOutside(
    nodes: () => readonly (HostNode | null)[],
    press: () => void,
  ): () => void;
  markNavigable(node: HostNode, gridId?: string): () => void;
  setScale(scale: number): void;
  setInputMode(mode: "mouse" | "touch" | "gamepad"): void;
  setGamepadConnected(connected: boolean): void;
  /**
   * A second key every listener hears as Escape, outside text fields: a
   * `KeyboardEvent.code`, or "Mouse4" and "Mouse5" for the side buttons.
   * Empty for none.
   */
  setCancelKey(code: string): void;
  /**
   * The sound each press of a button asks for (its `feedback`, or its look's),
   * and "move" for each pad move of focus onto a navigable control.
   */
  observeFeedback(play: (cue: FeedbackCue) => void): () => void;
  /** The language the interface is written in, for its type. */
  setLanguage(language: string): void;
  /**
   * Moves a layer (a Layer's node) to (x, y) UI pixels, in the frame
   * `measure` reports, without a render, its box laid out as if it stood
   * there: a hint that follows the pointer.
   */
  placeLayer(node: HostNode, x: number, y: number): void;
}

let focusedNode: HostNode | null = null;
const focusListeners = new Set<(node: HostNode | null) => void>();

/** Focus notifications keep the walk in JavaScript. */
export function notifyFocus(node: HostNode | null): void {
  focusedNode = node;
  for (const listener of focusListeners) listener(node);
}

/** Hears every move of focus, with the newly focused node (null: none). */
export function subscribeFocus(
  listener: (node: HostNode | null) => void,
): () => void {
  focusListeners.add(listener);
  return () => {
    focusListeners.delete(listener);
  };
}

export function getFocusedNode(): HostNode | null {
  return focusedNode;
}

/** The view's half of the bridge, as the host calls it. */
interface NativeView {
  measure(node: number): [number, number, number, number, number] | null;
  focusables(root: number, visibleOnly: boolean): number[];
  navigable(grid: string, sequential: boolean): number[];
  isNavigable(node: number): boolean;
  focus(node: number, preventScroll: boolean): void;
  blur(node: number): void;
  contains(root: number, node: number): boolean;
  connected(node: number): boolean;
  toolbar(node: number): number;
  scrollIntoView(node: number): void;
  scrollBy(node: number, x: number, y: number): void;
  horizontalScroller(root: number, from: number): number;
  control(node: number): string;
  press(node: number): void;
  setControlValue(node: number, value: string): void;
  selectText(node: number): void;
  measureText(style: string, text: string): number;
  viewport(): [left: number, top: number, width: number, height: number];
  contentExtent(node: number): string;
  markNavigable(node: number, grid: string, on: boolean): void;
  find(id: string): number;
  placeLayer(node: number, x: number, y: number): void;
  setScale(scale: number): void;
  setInputMode(mode: string): void;
  setGamepadConnected(connected: boolean): void;
  setCancelKey(code: string): void;
  setLanguage(language: string): void;
  pointer(): [number, number];
}

/** Absent under Deno's tests, whose host never reaches the view. */
const view = globalThis.__native as unknown as NativeView;

const idOf = (node: HostNode | null | undefined): number => node ? node.id : 0;
const nodesOf = (ids: number[]): HostNode[] =>
  ids.map((id) => nativeNode(id)).filter((node): node is NativeNode =>
    node !== null
  );

const EMPTY: HostRect = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  scale: 1,
};

const capture: Array<{
  handle: (key: KeyEvent) => boolean;
  exclusive: boolean;
}> = [];
const observed = new Set<(key: KeyEvent, typing: boolean) => boolean>();
const holds = new Set<(key: KeyEvent) => void>();
const layoutListeners = new Set<() => void>();
const cursorFollowers = new Set<(point: CursorPoint) => void>();
const outside = new Set<
  { nodes: () => readonly (HostNode | null)[]; press: () => void }
>();
const feedback = new Set<(cue: FeedbackCue) => void>();

function heard<T>(set: Set<T>, item: T): () => void {
  set.add(item);
  return () => {
    set.delete(item);
  };
}

/** The view sends a number field's ends only when it sets them. */
type ViewControl =
  | { kind: "button" | "check" | "text"; disabled: boolean }
  | {
    kind: "number" | "range";
    disabled: boolean;
    value: string;
    min?: number;
    max?: number;
    step: number;
  };

function readControl(json: string): HostControl | null {
  const control = JSON.parse(json) as ViewControl | null;
  if (control === null) return null;
  const stepped = "step" in control;
  if (!stepped) return control;
  return {
    ...control,
    min: control.min ?? -Infinity,
    max: control.max ?? Infinity,
  };
}

/**
 * The view's events for the host's own listeners (node 0's handlers): the
 * answer the view waits for, or undefined when the event is not the host's.
 */
export function handleHostEvent(name: string, args: unknown[]): unknown {
  switch (name) {
    case "__focus":
      notifyFocus(nativeNode(args[0] as number));
      return null;
    case "__captureKeys": {
      const key = args[0] as KeyEvent;
      let handled = false;
      for (const listener of [...capture]) {
        if (!listener.handle(key)) continue;
        handled = true;
        if (listener.exclusive) break;
      }
      return handled;
    }
    case "__observeKeys": {
      const [key, typing] = args as [KeyEvent, boolean];
      let handled = false;
      for (const listener of [...observed]) {
        if (listener(key, typing)) handled = true;
      }
      return handled;
    }
    case "__keyHold": {
      const key = args[0] as KeyEvent;
      for (const listener of [...holds]) listener(key);
      return undefined;
    }
    case "__layout":
      for (const listener of [...layoutListeners]) listener();
      return null;
    case "__cursor": {
      const point = args[0] as CursorPoint;
      for (const follower of [...cursorFollowers]) follower(point);
      return null;
    }
    case "__pointerDown": {
      const chain = args[0] as number[];
      for (const listener of [...outside]) {
        const inside = listener.nodes().some((node) =>
          node !== null && chain.includes(idOf(node))
        );
        if (!inside) listener.press();
      }
      return undefined;
    }
    case "__feedback":
      for (const play of [...feedback]) play(args[0] as FeedbackCue);
      return null;
  }
  return undefined;
}

const nativeHost: Host = {
  find: (id) => nativeNode(view.find(id)),
  measure(node) {
    const rect = view.measure(idOf(node));
    if (!rect) return EMPTY;
    const [left, top, width, height, scale] = rect;
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      scale,
    };
  },
  focusables: (root, visibleOnly = false) =>
    nodesOf(view.focusables(idOf(root), visibleOnly)),
  navigable: (gridId, sequential = false) =>
    nodesOf(view.navigable(gridId ?? "", sequential)),
  isNavigable: (node) => view.isNavigable(idOf(node)),
  focus: (node, preventScroll = false) => {
    if (node) view.focus(idOf(node), preventScroll);
  },
  // The view lays out at the end of every turn of the engine's loop, so the
  // next turn's first timer finds the commit laid out.
  afterLayout(callback) {
    const timer = platform.timers.setTimeout(callback, 0);
    return () => platform.timers.clearTimeout(timer);
  },
  blur: (node) => {
    if (node) view.blur(idOf(node));
  },
  contains: (root, node) =>
    node !== null && view.contains(idOf(root), idOf(node)),
  connected: (node) => view.connected(idOf(node)),
  toolbar: (node) => nativeNode(view.toolbar(idOf(node))),
  scrollIntoView: (node) => {
    if (node) view.scrollIntoView(idOf(node));
  },
  scrollBy: (node, x, y) => view.scrollBy(idOf(node), x, y),
  horizontalScroller: (root, from) =>
    nativeNode(view.horizontalScroller(idOf(root), idOf(from))),
  control: (node) => readControl(view.control(idOf(node))),
  press: (node) => view.press(idOf(node)),
  setControlValue: (node, value) => view.setControlValue(idOf(node), value),
  selectText: (node) => {
    if (node) view.selectText(idOf(node));
  },
  captureKeys(handle, exclusive = false) {
    const listener = { handle, exclusive };
    capture.push(listener);
    return () => {
      const index = capture.indexOf(listener);
      if (index >= 0) capture.splice(index, 1);
    };
  },
  observeKeyHold(key, update) {
    return heard(holds, (pressed: KeyEvent) => {
      if (pressed.key !== key) return;
      if (pressed.phase === "down" && !pressed.repeat) update(true);
      if (pressed.phase === "up") update(false);
    });
  },
  observeKeys: (handle) => heard(observed, handle),
  measureText: (style, text) => view.measureText(style, text),
  viewport() {
    const [left, top, width, height] = view.viewport();
    return { left, top, width, height };
  },
  observeLayout: (update) => heard(layoutListeners, update),
  observeCursor(update) {
    const [x, y] = view.pointer();
    update({ x, y });
    return heard(cursorFollowers, update);
  },
  contentExtent: (node) => JSON.parse(view.contentExtent(idOf(node))),
  observeOutside: (nodes, press) => heard(outside, { nodes, press }),
  markNavigable(node, gridId) {
    view.markNavigable(idOf(node), gridId ?? "", true);
    return () => view.markNavigable(idOf(node), gridId ?? "", false);
  },
  setScale: (scale) => view.setScale(scale),
  setInputMode: (mode) => view.setInputMode(mode),
  setGamepadConnected: (connected) => view.setGamepadConnected(connected),
  setCancelKey: (code) => view.setCancelKey(code),
  observeFeedback: (play) => heard(feedback, play),
  setLanguage: (language) => view.setLanguage(language),
  // The view places a layer from the safe area's corner.
  placeLayer(node, x, y) {
    const [left, top] = view.viewport();
    view.placeLayer(idOf(node), x - left, y - top);
  },
};

let installed: Host = nativeHost;

/**
 * The native host, which every program and kit module calls. A test swaps
 * in another with installHost; nothing installs the native one.
 */
export const host: Host = new Proxy({} as Host, {
  get: (_target, property) => Reflect.get(installed, property),
});

/** Answers a test's host calls with `next` until the returned restore. */
export function installHost(next: Host): () => void {
  const previous = installed;
  const previousFocus = focusedNode;
  installed = next;
  return () => {
    installed = previous;
    focusedNode = previousFocus;
  };
}
