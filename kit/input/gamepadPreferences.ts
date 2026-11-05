/**
 * Which controller drives the game — persisted, cached, and reactive.
 *
 * Modelled on cameraPreferences.ts: a module-level cache backs a synchronous
 * getter (read every tick by GamepadManager) while the setter writes through to
 * the preferences and notifies subscribers, so the manager and the settings UI
 * both react to a change without a reload.
 *
 * Persisted form (a single string under SELECTION_KEY):
 *   - absent / "auto" → auto-detect (the default)
 *   - "off"           → ignore every controller
 *   - "pad:<name>"    → pin the pad the shell reports by that name
 */

import { DEFAULT_GAMEPAD_SELECTION, type GamepadSelection } from "./Gamepad.ts";
import { platform } from "platform";

// Numbers because a player's saved settings already sit under these keys.
const SELECTION_KEY = "42";
const OPTIONS_KEY = "70";

function readStored(key: string): string | null {
  try {
    return platform.storage.persistent.getItem(key);
  } catch {
    return null;
  }
}

const OFF_VALUE = "off";
const DEVICE_PREFIX = "pad:";

/** The player's choice as the preference stores it. */
export function decodeGamepadSelection(
  stored: string | null,
): GamepadSelection {
  if (stored === null || stored === "" || stored === "auto") {
    return DEFAULT_GAMEPAD_SELECTION;
  }
  if (stored === OFF_VALUE) return { mode: "off" };
  if (stored.startsWith(DEVICE_PREFIX)) {
    const deviceId = stored.slice(DEVICE_PREFIX.length);
    if (deviceId) return { mode: "device", deviceId };
  }
  // Unrecognised (corrupt or from a newer build) — fall back to the safe
  // default rather than leaving input in an undefined state.
  return DEFAULT_GAMEPAD_SELECTION;
}

function encode(selection: GamepadSelection): string {
  switch (selection.mode) {
    case "off":
      return OFF_VALUE;
    case "device":
      return DEVICE_PREFIX + selection.deviceId;
    case "auto":
      return "auto";
  }
}

let cached: GamepadSelection = decodeGamepadSelection(
  readStored(SELECTION_KEY),
);

const subscribers = new Set<() => void>();

export function getGamepadSelection(): GamepadSelection {
  return cached;
}

export function setGamepadSelection(selection: GamepadSelection): void {
  cached = selection;
  // Auto is the default: clear the key so "no preference" round-trips to auto
  // and old saves stay clean.
  if (selection.mode === "auto") {
    platform.storage.persistent.removeItem(SELECTION_KEY);
  } else {
    platform.storage.persistent.setItem(SELECTION_KEY, encode(selection));
  }
  for (const notify of subscribers) notify();
}

/**
 * Subscribe to selection changes. Returns an unsubscribe function.
 */
export function subscribeGamepadSelection(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export type PadPromptStyle =
  | "auto"
  | "xbox"
  | "playstation"
  | "nintendo"
  | "steam-deck"
  | "numbered";
export type GamepadOptions = {
  promptStyle: PadPromptStyle;
  confirm: "bottom" | "right";
  cursorSpeed: number;
  panSpeed: number;
  zoomSpeed: number;
  invertPan: boolean;
};

export const DEFAULT_GAMEPAD_OPTIONS: GamepadOptions = {
  promptStyle: "auto",
  confirm: "bottom",
  cursorSpeed: 1,
  panSpeed: 1,
  zoomSpeed: 1,
  invertPan: false,
};

function normalizedOptions(value: Partial<GamepadOptions>): GamepadOptions {
  const styles: PadPromptStyle[] = [
    "auto",
    "xbox",
    "playstation",
    "nintendo",
    "steam-deck",
    "numbered",
  ];
  const speed = (number: unknown): number =>
    typeof number === "number" && Number.isFinite(number)
      ? Math.min(3, Math.max(0.25, number))
      : 1;
  return {
    promptStyle: styles.includes(value.promptStyle as PadPromptStyle)
      ? value.promptStyle!
      : "auto",
    confirm: value.confirm === "right" ? "right" : "bottom",
    cursorSpeed: speed(value.cursorSpeed),
    panSpeed: speed(value.panSpeed),
    zoomSpeed: speed(value.zoomSpeed),
    invertPan: value.invertPan === true,
  };
}

function loadOptions(): GamepadOptions {
  try {
    const stored = JSON.parse(
      readStored(OPTIONS_KEY) ?? "{}",
    );
    return normalizedOptions(stored ?? {});
  } catch {
    return { ...DEFAULT_GAMEPAD_OPTIONS };
  }
}

let options = loadOptions();
const optionSubscribers = new Set<() => void>();

export function getGamepadOptions(): GamepadOptions {
  return options;
}

export function setGamepadOptions(change: Partial<GamepadOptions>): void {
  options = normalizedOptions({ ...options, ...change });
  platform.storage.persistent.setItem(OPTIONS_KEY, JSON.stringify(options));
  for (const notify of optionSubscribers) notify();
}

export function subscribeGamepadOptions(callback: () => void): () => void {
  optionSubscribers.add(callback);
  return () => optionSubscribers.delete(callback);
}
