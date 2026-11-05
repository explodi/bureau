/**
 * Tracks whether any gamepad-aware popover (e.g. the custom Select listbox) is
 * open. Parent navigation hooks (InfoDialog's sequential/spatial nav) read this
 * to pause while a popover owns input — otherwise their DPAD handlers would
 * race the popover's own handlers and move focus out from under the user.
 */

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let openCount = 0;

function notify() {
  for (const listener of listeners) listener();
}

export function markPopoverOpen(): () => void {
  openCount += 1;
  notify();
  return () => {
    openCount = Math.max(0, openCount - 1);
    notify();
  };
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): boolean {
  return openCount > 0;
}

export function useAnyPopoverOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
