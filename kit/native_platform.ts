/**
 * The platform a game gets without writing one: timers and frames from the
 * engine, assets and the log through `__native` (src/js/ui.cpp), controllers as
 * bureau::Ui::gamepads sends them. Settings last as long as the program, until a
 * game adds `storageGet`, `storageSet` and `storageRemove` to `__native`; the
 * clipboard works once it adds `setClipboard`.
 */
import "./native_globals.ts";
import type { GamepadSnapshot } from "./input/pad_types.ts";
import type { KitPlatform, KitStorage } from "./platform.ts";

interface Native {
  log(level: string, text: string): void;
  /** Reads off the interface's thread and calls `done` with the file, or
   * null when there is none. */
  assetText(path: string, done: (text: string | null) => void): void;
  setClipboard?(text: string): void;
  storageGet?(key: string): string | null;
  storageSet?(key: string, value: string): void;
  storageRemove?(key: string): void;
}

declare global {
  var __nativeGamepads: ((json: string) => void) | undefined;
}

const native = globalThis.__native as unknown as Native;

const session = new Map<string, string>();
const storage: KitStorage = {
  getItem: (key) => native.storageGet?.(key) ?? session.get(key) ?? null,
  setItem(key, value) {
    if (native.storageSet) native.storageSet(key, value);
    else session.set(key, value);
  },
  removeItem(key) {
    native.storageRemove?.(key);
    session.delete(key);
  },
};

let gamepads: GamepadSnapshot[] = [];
globalThis.__nativeGamepads = (json) => {
  gamepads = JSON.parse(json);
};

export const platform: KitPlatform = {
  storage: { persistent: storage },
  timers: {
    setTimeout: (callback, delayMs) => Number(setTimeout(callback, delayMs)),
    clearTimeout: (id) => clearTimeout(id),
  },
  frame: {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  },
  capabilities: {
    clipboard: native.setClipboard !== undefined,
    foldsMapPanels: false,
  },
  clipboard: {
    writeText: (value) => {
      native.setClipboard?.(value);
      return Promise.resolve();
    },
  },
  assets: {
    text: (path) => new Promise((resolve) => native.assetText(path, resolve)),
  },
  shell: { identity: undefined, isSteamDeck: false },
  log: {
    error: (message, ...details) =>
      native.log("error", [message, ...details].map(String).join(" ")),
  },
  report: {
    captureException: (error) => native.log("report", String(error)),
  },
  input: {
    activity: { subscribe: () => () => {} },
    gamepads: {
      read: () => gamepads,
      setContext: () => {},
      showKeyboard: () => Promise.resolve(false),
      dismissKeyboard: () => {},
    },
  },
};
