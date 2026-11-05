/**
 * Gamepad system overview
 *
 * - One GamepadManager reads the shell's pads once a frame (tickGamepad).
 * - A shared frame dispatcher fans out input by priority.
 * - Button presses are consumed per frame so only one handler reacts.
 * - Hooks register handlers instead of starting their own polling loops.
 * - The input mode turns "gamepad" on real pad activity and "touch" on a
 *   touch; real mouse activity turns it back to "mouse".
 * - The host hears whether a pad drives input (host.setGamepadConnected):
 *   while one does, focus wears the pad's band.
 *
 * This keeps gamepad behavior centralized and avoids racing poll loops.
 */

import { platform } from "platform";
import { getFocusedNode, host, type HostNode } from "bureau/host";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { type ActionAnalog, GamepadButton, GamepadManager } from "./Gamepad.ts";
import type {
  GamepadSnapshot,
  PadContext,
  PadLayer,
  PadSet,
} from "./pad_types.ts";
import { PAD_LAYER_ORDER, type PadAction } from "bureau/pad_actions";
import { labelsOf } from "./pad_glyphs.ts";
import {
  getGamepadOptions,
  getGamepadSelection,
  subscribeGamepadOptions,
  subscribeGamepadSelection,
} from "./gamepadPreferences.ts";
import { navigateDirection } from "./spatialNavigation.ts";

export const GamepadPriority = {
  MODAL: 100,
  UI: 80,
  GLOBAL: 60,
  GAMEPLAY: 20,
} as const;

export type GamepadControl = PadAction | GamepadButton;
export type GamepadFrameInput = {
  connected: boolean;
  pad: GamepadSnapshot | null;
  deltaSeconds: number;
  isPressed: (control: GamepadControl) => boolean;
  isHeld: (action: PadAction) => boolean;
  wasPressed: (control: GamepadControl) => boolean;
  wasReleased: (control: GamepadControl) => boolean;
  analog: (action: PadAction) => ActionAnalog;
  value: (action: PadAction) => number;
  getLeftStick: () => { x: number; y: number };
  getRightStick: () => { x: number; y: number };
  getButtonValue: (button: GamepadButton) => number;
};

type GamepadFrameHandler = (input: GamepadFrameInput) => void;

type FrameHandlerEntry = {
  id: number;
  priority: number;
  handler: GamepadFrameHandler;
};

const DEFAULT_FRAME_PRIORITY: number = GamepadPriority.GLOBAL;

// Singleton GamepadManager instance shared across all hooks
let sharedGamepadManager: GamepadManager | null = null;
let activeUsers = 0;
let updateUnsubscribe: (() => void) | null = null;
let selectionUnsubscribe: (() => void) | null = null;
let optionsUnsubscribe: (() => void) | null = null;
let nextFrameHandlerId = 0;
const frameHandlers: FrameHandlerEntry[] = [];
// Per-frame button consumption so only one handler reacts to a press.
const consumedButtons = new Set<string>();
const lostPadListeners = new Set<() => void>();
let padRecoveryUsers = 0;
let inputModeCleanup: (() => void) | null = null;
let controllerListener: (pad: GamepadSnapshot | null) => void = () => {};
/** Hears each frame which pad drives the game, for a game's own records. */
export function setControllerListener(
  listener: (pad: GamepadSnapshot | null) => void,
): void {
  controllerListener = listener;
}
declare global {
  /** The numbered, coloured face buttons, for a pad labelled that way. */
  var __ALT_XINPUT_GLYPHS: boolean | undefined;
}

export type InputMode = "mouse" | "gamepad" | "touch";
/** A Steam Deck is a pad in hand from the first frame, unless turned off. */
const defaultInputMode = (): InputMode => {
  if (platform.shell.identity?.platform === "ios") return "touch";
  const deckPadOn = platform.shell.isSteamDeck &&
    getGamepadSelection().mode !== "off";
  return deckPadOn ? "gamepad" : "mouse";
};
let currentInputMode: InputMode = defaultInputMode();
/**
 * Prompts stay on the pad from its first input until it disconnects: a key
 * pressed on the keyboard meanwhile does not strip every glyph.
 */
let padPromptsHeld = currentInputMode === "gamepad";
const inputModeCallbacks = new Set<() => void>();

const isGamepadConnected = (): boolean =>
  sharedGamepadManager?.isConnected() ?? false;

const tellHostConnection = () => {
  host.setGamepadConnected(isGamepadConnected());
};

const setInputMode = (mode: InputMode) => {
  if (mode === "gamepad") padPromptsHeld = true;
  if (currentInputMode === mode) return;
  currentInputMode = mode;
  inputModeCallbacks.forEach((callback) => callback());
  host.setInputMode(mode);
};

const bindInputModeListeners = () => {
  if (inputModeCleanup) return;
  host.setInputMode(currentInputMode);
  inputModeCleanup = platform.input.activity.subscribe(setInputMode);
};

const sortFrameHandlers = () => {
  frameHandlers.sort((a, b) => {
    const priorityDelta = b.priority - a.priority;
    if (priorityDelta !== 0) return priorityDelta;
    return a.id - b.id;
  });
};

const createFrameInput = (gamepad: GamepadManager): GamepadFrameInput => ({
  connected: gamepad.isConnected(),
  pad: gamepad.getActiveGamepad(),
  deltaSeconds: gamepad.getDeltaSeconds(),
  isPressed: (control) =>
    typeof control === "string"
      ? gamepad.isHeld(control)
      : gamepad.isButtonPressed(control),
  isHeld: (action) => gamepad.isHeld(action),
  wasPressed: (control) => {
    const keys = typeof control === "string"
      ? gamepad.actionControlKeys(control)
      : [`button:${control}`];
    if (keys.some((key) => consumedButtons.has(key))) return false;
    const pressed = typeof control === "string"
      ? gamepad.wasPressed(control)
      : gamepad.isButtonJustPressed(control);
    if (!pressed) return false;
    for (const key of keys) consumedButtons.add(key);
    return true;
  },
  wasReleased: (control) =>
    typeof control === "string"
      ? gamepad.wasReleased(control)
      : gamepad.isButtonJustReleased(control),
  analog: (action) => gamepad.analog(action),
  value: (action) => gamepad.value(action),
  getLeftStick: () => gamepad.getLeftStick(),
  getRightStick: () => gamepad.getRightStick(),
  getButtonValue: (button) => gamepad.getButtonValue(button),
});

const dispatchFrameHandlers = () => {
  if (!sharedGamepadManager) return;

  consumedButtons.clear();
  const input = createFrameInput(sharedGamepadManager);
  controllerListener(input.pad);

  if (sharedGamepadManager.hasActiveInput()) setInputMode("gamepad");

  for (const entry of frameHandlers) {
    // The city's frame loop runs every handler before it moves the camera:
    // one that throws must not stop the rest, nor the camera.
    try {
      entry.handler(input);
    } catch (error) {
      reportFrameHandlerThrow(entry, error);
    }
  }
};

let frameHandlerThrowReported = false;

/** Once a session: a handler throws every frame once it throws at all. */
function reportFrameHandlerThrow(entry: FrameHandlerEntry, error: unknown) {
  if (frameHandlerThrowReported) return;
  frameHandlerThrowReported = true;
  platform.log.error("[gamepad] a frame handler threw:", error);
  platform.report.captureException(error, {
    tags: { source: "gamepadFrameHandler", priority: entry.priority },
  });
}

/**
 * A controller-selection change takes effect on the next tick: choosing "off"
 * disconnects the pad, which restores the mouse cursor and the keyboard's
 * focus ring; pinning a pad drops any other pad that was driving input.
 */
const applyGamepadSelection = () => {
  sharedGamepadManager?.setSelection(
    padRecoveryUsers > 0 ? { mode: "auto" } : getGamepadSelection(),
  );
};

const ensureGamepadManager = (): GamepadManager => {
  if (sharedGamepadManager) return sharedGamepadManager;

  sharedGamepadManager = new GamepadManager();
  // Apply the saved choice before the first poll so launch honours it.
  sharedGamepadManager.setSelection(
    padRecoveryUsers > 0 ? { mode: "auto" } : getGamepadSelection(),
  );
  sharedGamepadManager.setConfirmPreference(getGamepadOptions().confirm);
  applyPadContext();
  sharedGamepadManager.onActivePadLost(() => {
    for (const listener of lostPadListeners) listener();
  });

  sharedGamepadManager.onConnect(tellHostConnection);
  sharedGamepadManager.onDisconnect(() => {
    tellHostConnection();
    padPromptsHeld = false;
    setInputMode(defaultInputMode());
  });

  const unsubscribeFrames = sharedGamepadManager.onUpdate(
    dispatchFrameHandlers,
  );
  const unsubscribeView = sharedGamepadManager.onUpdate(refreshPadView);
  updateUnsubscribe = () => {
    unsubscribeFrames();
    unsubscribeView();
  };
  bindInputModeListeners();
  selectionUnsubscribe = subscribeGamepadSelection(applyGamepadSelection);
  optionsUnsubscribe = subscribeGamepadOptions(() => {
    sharedGamepadManager?.setConfirmPreference(getGamepadOptions().confirm);
  });
  // A reloaded engine finds the host as the last one left it.
  tellHostConnection();

  return sharedGamepadManager;
};

/**
 * Tick the gamepad system. Call this once per frame from the main render loop.
 * This consolidates gamepad polling into the main animation loop for better performance.
 */
export const tickGamepad = (): void => {
  sharedGamepadManager?.tick();
};

/**
 * Ticks the gamepad every frame while `enabled`, for a screen up while no
 * title screen or city view runs its render loop (the loading curtain before
 * the city view mounts, the fatal error alert). Only one loop may tick at a
 * time: two in one frame run the edge detection twice and can swallow a
 * button release.
 */
export function useGamepadDriver(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let frameId = platform.frame.request(function tick() {
      tickGamepad();
      frameId = platform.frame.request(tick);
    });
    return () => platform.frame.cancel(frameId);
  }, [enabled]);
}

const acquireGamepadManager = (): GamepadManager => {
  activeUsers += 1;
  return ensureGamepadManager();
};

const releaseGamepadManager = (): void => {
  activeUsers = Math.max(0, activeUsers - 1);
  if (activeUsers > 0) return;

  updateUnsubscribe?.();
  updateUnsubscribe = null;
  selectionUnsubscribe?.();
  selectionUnsubscribe = null;
  optionsUnsubscribe?.();
  optionsUnsubscribe = null;

  sharedGamepadManager = null;
  refreshPadView();
  controllerListener(null);
  tellHostConnection();
  inputModeCleanup?.();
  inputModeCleanup = null;
  setInputMode(defaultInputMode());
};

const registerGamepadFrameHandler = (
  handler: GamepadFrameHandler,
  priority: number = DEFAULT_FRAME_PRIORITY,
) => {
  const id = nextFrameHandlerId++;
  frameHandlers.push({ id, priority, handler });
  sortFrameHandlers();
  acquireGamepadManager();

  return () => {
    const index = frameHandlers.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      frameHandlers.splice(index, 1);
    }
    releaseGamepadManager();
  };
};

/**
 * Hook for accessing gamepad input in React components
 *
 * Uses a shared singleton GamepadManager to avoid creating multiple polling loops.
 *
 * Usage:
 *   const { gamepad, connected } = useGamepad();
 *
 *   if (gamepad.isButtonJustPressed(GamepadButton.A)) {
 *     // Handle A button press
 *   }
 */
// The connection is the shared manager's, so the hooks read it through
// useSyncExternalStore: the snapshot is taken during render — no mount-time
// setState to catch a manager that only came alive when this subscriber
// acquired it. It is taken once a tick, and a subscriber is told only when
// it changed: a connection, a disconnection, a switch of pad or of its
// labels. A tick with nothing new costs one comparison, not one per prompt
// on screen.
type PadView = {
  connected: boolean;
  id: string | null;
  promptPad: GamepadSnapshot | null;
  /** The prompt pad's labels and origins, as one comparable string. */
  promptIdentity: string;
};
let padView: PadView = {
  connected: false,
  id: null,
  promptPad: null,
  promptIdentity: "",
};
const padViewListeners = new Set<() => void>();

const refreshPadView = () => {
  const manager = sharedGamepadManager;
  const connected = manager?.isConnected() ?? false;
  const id = manager && connected ? manager.getActiveGamepadId() : null;
  const pad = manager?.getActiveGamepad() ?? null;
  const promptIdentity = pad
    ? JSON.stringify([
      pad.id,
      pad.name,
      pad.family,
      pad.source,
      pad.labels,
      pad.origins,
    ])
    : "";
  const unchanged = connected === padView.connected && id === padView.id &&
    promptIdentity === padView.promptIdentity;
  if (unchanged) return;
  const promptPad = promptIdentity === padView.promptIdentity
    ? padView.promptPad
    : pad;
  padView = { connected, id, promptPad, promptIdentity };
  for (const listener of padViewListeners) listener();
};

const subscribeToGamepadConnection = (onStoreChange: () => void) => {
  acquireGamepadManager();
  padViewListeners.add(onStoreChange);
  return () => {
    padViewListeners.delete(onStoreChange);
    releaseGamepadManager();
  };
};

const getConnectedSnapshot = (): boolean => padView.connected;
const getActiveGamepadIdSnapshot = (): string | null => padView.id;

const subscribeToInputMode = (onStoreChange: () => void) => {
  acquireGamepadManager();
  inputModeCallbacks.add(onStoreChange);
  return () => {
    inputModeCallbacks.delete(onStoreChange);
    releaseGamepadManager();
  };
};

/**
 * The device the player is using, as the interface shows it: the mouse until
 * the input listeners are bound.
 */
export function activeInputDevice(): InputMode {
  return inputModeCleanup ? currentInputMode : "mouse";
}

/**
 * The device prompts are drawn for: the pad once it has been used, until it
 * disconnects; otherwise the device used last.
 */
export function useHintDevice(): InputMode {
  const mode = useSyncExternalStore(
    subscribeToInputMode,
    () => currentInputMode,
  );
  const { connected } = useGamepad();
  return connected && padPromptsHeld ? "gamepad" : mode;
}

/** The device the player is using right now, outside React. */
export const getInputMode = (): InputMode => currentInputMode;

export function useGamepad() {
  const connected = useSyncExternalStore(
    subscribeToGamepadConnection,
    getConnectedSnapshot,
  );
  const gamepadId = useSyncExternalStore(
    subscribeToGamepadConnection,
    getActiveGamepadIdSnapshot,
  );

  return {
    gamepad: sharedGamepadManager,
    connected,
    gamepadId,
  };
}

/**
 * Every connected pad (ignoring the active selection), for the settings UI's
 * controller picker.
 */
export const listConnectedGamepads = (): Array<
  { index: number; id: string; name: string }
> =>
  platform.input.gamepads.read().map((pad, index) => ({
    index,
    id: pad.id,
    name: pad.name ?? pad.id,
  }));

const getPromptPad = (): GamepadSnapshot | null => padView.promptPad;
export function useActiveGamepad(): GamepadSnapshot | null {
  return useSyncExternalStore(subscribeToGamepadConnection, getPromptPad);
}
export function usePadLabels(): string[] {
  const pad = useActiveGamepad();
  const options = useSyncExternalStore(
    subscribeGamepadOptions,
    getGamepadOptions,
  );
  const style = globalThis.__ALT_XINPUT_GLYPHS
    ? "numbered"
    : options.promptStyle;
  return labelsOf(pad, style, options.confirm);
}

/** Only a vanished active device fires this; choosing Off or another pad does not. */
export function onActiveGamepadLost(listener: () => void): () => void {
  acquireGamepadManager();
  lostPadListeners.add(listener);
  return () => {
    lostPadListeners.delete(listener);
    releaseGamepadManager();
  };
}

/** A disconnect notice accepts another pad without rewriting the saved pin. */
export function usePadRecovery(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    acquireGamepadManager();
    padRecoveryUsers++;
    applyGamepadSelection();
    return () => {
      padRecoveryUsers--;
      applyGamepadSelection();
      releaseGamepadManager();
    };
  }, [enabled]);
}

let nextContextId = 0;
const padContexts = new Map<number, { set: PadSet; priority: number }>();
const padLayers = new Map<number, PadLayer>();
let lastNativeContext = "";
let activePadSet: PadSet = "menu";
const padSetListeners = new Set<() => void>();
const subscribePadSet = (listener: () => void) => {
  padSetListeners.add(listener);
  return () => {
    padSetListeners.delete(listener);
  };
};
export function usePadSet(): PadSet {
  return useSyncExternalStore(subscribePadSet, () => activePadSet);
}
function applyPadContext(): void {
  const ranked = [...padContexts].sort((a, b) =>
    b[1].priority - a[1].priority || b[0] - a[0]
  );
  const set = ranked[0]?.[1].set ?? "menu";
  if (activePadSet !== set) {
    activePadSet = set;
    for (const listener of padSetListeners) listener();
  }
  const requestedLayers = new Set(padLayers.values());
  const layers = set === "city"
    ? PAD_LAYER_ORDER.filter((layer) => requestedLayers.has(layer))
    : [];
  const context: PadContext = { set, layers };
  sharedGamepadManager?.setContext(context);
  const encoded = JSON.stringify(context);
  if (encoded === lastNativeContext) return;
  platform.input.gamepads.setContext(context);
  lastNativeContext = encoded;
}
export function usePadContext(
  set: PadSet,
  active = true,
  priority: number = GamepadPriority.UI,
): void {
  useEffect(() => {
    if (!active) return;
    const id = nextContextId++;
    padContexts.set(id, { set, priority });
    applyPadContext();
    return () => {
      padContexts.delete(id);
      applyPadContext();
    };
  }, [set, active, priority]);
}
export function usePadLayer(layer: PadLayer, active = true): void {
  useEffect(() => {
    if (!active) return;
    const id = nextContextId++;
    padLayers.set(id, layer);
    applyPadContext();
    return () => {
      padLayers.delete(id);
      applyPadContext();
    };
  }, [layer, active]);
}

export function useGamepadFrame(
  handler: (input: GamepadFrameInput) => void,
  options: { enabled?: boolean; priority?: number } = {},
) {
  const { enabled = true, priority = DEFAULT_FRAME_PRIORITY } = options;
  // Latest handler, so a caller passing a fresh closure every render never
  // re-registers. Written in a layout effect, not in render: frames run after
  // commit, and a render React discards must not leak its closure in here.
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    return registerGamepadFrameHandler(
      (input) => handlerRef.current(input),
      priority,
    );
  }, [enabled, priority]);
}

const REPEAT_DELAY = 250; // ms between repeats when holding direction
const FAST_REPEAT_DELAY = 100; // ms between repeats after the hold passes ACCELERATE_AFTER
const ACCELERATE_AFTER = 600; // ms of continuous hold before the cadence speeds up

/**
 * Hold-to-repeat button stepper for custom `useGamepadFrame` handlers that
 * walk a list with the D-pad (map panels' row selection). Same cadence as
 * useGamepadSpatialNavigation: one step on press, repeats every 250ms while
 * held, accelerating to 100ms after 600ms. Uses non-consuming `isPressed`
 * so the hold isn't eaten by lower-priority handlers' edge detection.
 *
 * Create one stepper per component (it holds the per-button hold timers):
 *   const dpadStep = useRef(createDpadStepper()).current;
 *   ...
 *   if (dpadStep(input, GamepadButton.DPAD_UP, "up")) moveUp();
 */
export function createDpadStepper(): (
  input: { isPressed: (button: GamepadControl) => boolean },
  button: GamepadControl,
  key: string,
) => boolean {
  const timers = new Map<string, { last: number; start: number }>();
  return (input, button, key) => {
    if (!input.isPressed(button)) {
      timers.delete(key);
      return false;
    }
    const now = Date.now();
    const entry = timers.get(key);
    if (!entry) {
      timers.set(key, { last: now, start: now });
      return true;
    }
    const delay = now - entry.start >= ACCELERATE_AFTER
      ? FAST_REPEAT_DELAY
      : REPEAT_DELAY;
    if (now - entry.last < delay) return false;
    entry.last = now;
    return true;
  };
}

/**
 * Hook for 2D spatial navigation with gamepad
 *
 * Automatically handles directional navigation based on visual element positions.
 * Works with any elements marked with data-nav-item attribute.
 * Directional input uses the D-pad or a deliberate left stick tilt.
 *
 * @param gridId - Optional grid identifier to scope navigation (data-nav-grid attribute)
 * @param options - Navigation options including confirm/cancel callbacks
 */
interface SpatialNavigationOptions {
  onConfirm?: () => void;
  onCancel?: () => void;
  gridId?: string;
  enabled?: boolean;
  priority?: number;
}

export function useGamepadSpatialNavigation(
  options: SpatialNavigationOptions = {},
) {
  const { connected } = useGamepad();
  const {
    onConfirm,
    onCancel,
    gridId,
    enabled = true,
    priority = GamepadPriority.UI,
  } = options;
  usePadContext("menu", enabled, priority);
  const lastInputTimeRef = useRef<Map<string, number>>(new Map());
  const pressStartTimeRef = useRef<Map<string, number>>(new Map());

  useGamepadFrame(
    (input) => {
      if (!input.connected) return;

      const now = Date.now();

      const canRepeat = (key: string): boolean => {
        const lastTime = lastInputTimeRef.current.get(key) ?? 0;
        const pressStart = pressStartTimeRef.current.get(key) ?? now;
        const heldMs = now - pressStart;
        const delay = heldMs >= ACCELERATE_AFTER
          ? FAST_REPEAT_DELAY
          : REPEAT_DELAY;
        return now - lastTime >= delay;
      };

      const markInput = (key: string) => {
        if (!lastInputTimeRef.current.has(key)) {
          pressStartTimeRef.current.set(key, now);
        }
        lastInputTimeRef.current.set(key, now);
      };

      const dpadUp = input.isHeld("menu_up");
      const dpadDown = input.isHeld("menu_down");
      const dpadLeft = input.isHeld("menu_left");
      const dpadRight = input.isHeld("menu_right");

      // Both raw-pad directions and Steam actions share one repeat cadence.
      const handleDpad = (
        direction: "up" | "down" | "left" | "right",
        pressed: boolean,
      ) => {
        if (!pressed) {
          lastInputTimeRef.current.delete(direction);
          pressStartTimeRef.current.delete(direction);
          return;
        }
        if (canRepeat(direction)) {
          navigateDirection(direction, gridId);
          markInput(direction);
        }
      };

      handleDpad("up", dpadUp);
      handleDpad("down", dpadDown);
      handleDpad("left", dpadLeft);
      handleDpad("right", dpadRight);

      const active = getFocusedNode();
      const control = active ? host.control(active) : null;

      const pressable = control?.kind === "button" || control?.kind === "check";
      const canConfirm = Boolean(onConfirm) || pressable;
      if (canConfirm && input.wasPressed("menu_confirm")) {
        if (active && pressable) host.press(active);
        onConfirm?.();
      }

      // Cancel (B button)
      if (onCancel && input.wasPressed("menu_back")) {
        onCancel();
      }
    },
    { enabled, priority },
  );

  return { connected };
}

/**
 * Hook for scrolling content with right analog stick
 *
 * Provides smooth, pressure-sensitive scrolling for any scrollable element.
 * Use this for dialogs, lists, or any content that needs gamepad scrolling.
 *
 * @param scrollableRef - React ref to the scrollable element (must have overflow)
 * @param enabled - Whether scrolling is enabled (default: true)
 *
 * Usage:
 *   const contentRef = useRef<HTMLDivElement>(null);
 *   useGamepadScroll(contentRef);
 *   return <div ref={contentRef} style={{ overflow: 'auto' }}>...</div>
 */
export function useGamepadScroll(
  scrollableRef: React.RefObject<HostNode | null>,
  enabled = true,
) {
  const { connected } = useGamepad();

  useGamepadFrame(
    (input) => {
      if (!input.connected || !scrollableRef.current) return;

      const y = input.analog("menu_scroll").y;
      if (y === 0) return;
      const pixelsPerSecond = 300 + Math.abs(y) * 900;
      host.scrollBy(
        scrollableRef.current,
        0,
        y * pixelsPerSecond * input.deltaSeconds,
      );
    },
    { enabled, priority: GamepadPriority.UI },
  );

  return { connected };
}

/**
 * Scroll the horizontally overflowing region that currently owns focus.
 *
 * Dialogs often contain wide tables inside their own overflow frame. The
 * right stick should move that frame, not the dialog's unrelated outer
 * content. Walking from focus toward the supplied root keeps this generic for
 * tables, tab strips, and any other nested horizontal scroller.
 */
export function useGamepadFocusedHorizontalScroll(
  rootRef: React.RefObject<HostNode | null>,
  enabled = true,
) {
  const { connected } = useGamepad();

  useGamepadFrame(
    (input) => {
      const root = rootRef.current;
      const activeElement = getFocusedNode();
      if (
        !input.connected ||
        !root ||
        !activeElement || !host.contains(root, activeElement)
      ) {
        return;
      }

      const x = input.analog("menu_scroll").x;
      if (x === 0) return;
      const scrollableElement = host.horizontalScroller(root, activeElement);
      if (!scrollableElement) return;
      const pixelsPerSecond = 300 + Math.abs(x) * 900;
      host.scrollBy(
        scrollableElement,
        x * pixelsPerSecond * input.deltaSeconds,
        0,
      );
    },
    { enabled, priority: GamepadPriority.UI },
  );

  return { connected };
}
