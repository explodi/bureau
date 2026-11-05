/**
 * The platform under `deno test`: Deno's timers, no pads, and storage in a map.
 * A test swaps it with `installPlatform`.
 */
import type { KitPlatform } from "./platform.ts";

const items = new Map<string, string>();

export const testPlatform: KitPlatform = {
  storage: {
    persistent: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
      removeItem: (key) => void items.delete(key),
    },
  },
  timers: {
    setTimeout: (callback, delayMs) => Number(setTimeout(callback, delayMs)),
    clearTimeout: (id) => clearTimeout(id),
  },
  frame: {
    request: (callback) =>
      Number(setTimeout(() => callback(performance.now()), 16)),
    cancel: (id) => clearTimeout(id),
  },
  capabilities: { clipboard: false, foldsMapPanels: false },
  clipboard: { writeText: () => Promise.resolve() },
  assets: { text: () => Promise.resolve(null) },
  shell: { identity: undefined, isSteamDeck: false },
  log: { error: () => {} },
  report: { captureException: () => {} },
  input: {
    activity: { subscribe: () => () => {} },
    gamepads: {
      read: () => [],
      setContext: () => {},
      showKeyboard: () => Promise.resolve(false),
      dismissKeyboard: () => {},
    },
  },
};

let installed = testPlatform;

export const platform: KitPlatform = new Proxy({} as KitPlatform, {
  get: (_target, property) => Reflect.get(installed, property),
});

export function installPlatform(next: KitPlatform): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}
