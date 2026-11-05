/**
 * An instrument's views as a stack. With nothing pushed the instrument shows
 * its root (its tabs); each view the player opens from there is pushed on
 * top and replaces the root until it is popped. Back is one rule everywhere:
 * the header's back key, Esc and the pad's Back action each pop one level.
 *
 *   const stack = useInstrumentStack<PushedView>({ gamepadEnabled });
 *   stack.top          // the view on screen, or null at the root
 *   stack.push(view)   // open a view
 *   stack.replace(view) // the view on top, swapped in place
 *   stack.pop()        // back one level (the header's `back` prop)
 *   stack.memory("lines") // where the player left a tab, to reopen it there
 *
 * Esc is the game's: `host.observeKeys` hands every key to every listener
 * and nothing consumes it, so the game's Esc chain calls
 * `stepBackInstrument()` before it clears a selection or leaves the map
 * layer. An instrument with somewhere to go back to registers itself there.
 */

import { useCallback, useEffect, useState } from "react";
import type { ScrollOffset } from "bureau/primitives";
import { playKitSound } from "./sounds.ts";
import { useGamepadFrame, usePadSet } from "./input/useGamepad.ts";
import { INSTRUMENT_PAD_PRIORITY } from "./instrument_pad.ts";

/** The pop of every instrument that has a view pushed, latest last. */
const openStacks: Array<() => void> = [];

/** Makes `pop` the first thing Esc undoes, until the returned call. */
export function registerInstrumentBack(pop: () => void): () => void {
  openStacks.push(pop);
  return () => {
    const index = openStacks.lastIndexOf(pop);
    if (index >= 0) openStacks.splice(index, 1);
  };
}

/** Whether an instrument has a view pushed: the next Esc is its Back, and
 * nothing else's. */
export function isInstrumentViewPushed(): boolean {
  return openStacks.length > 0;
}

/** Pops the latest instrument with a view pushed. False when none has one,
 *  so the caller's Esc moves on to its next dismissal. */
export function stepBackInstrument(): boolean {
  const pop = openStacks.at(-1);
  if (!pop) return false;
  pop();
  return true;
}

/**
 * Where the player left one of the instrument's views: how far its body was
 * scrolled and the pad's row. The view keeps both as the player moves and
 * reads them as it opens again, after another tab or a pushed view.
 */
export type ViewMemory = {
  scroll: ScrollOffset;
  row: number;
  keepScroll: (offset: ScrollOffset) => void;
  keepRow: (row: number) => void;
};

export type InstrumentStack<View> = {
  top: View | null;
  depth: number;
  push: (view: View) => void;
  /** Swaps the top view for another, so Back still returns past both. */
  replace: (view: View) => void;
  pop: () => void;
  /** Back to the root at once: the subject of every pushed view is gone. */
  popAll: () => void;
  /** A view's memory, the same object for as long as the instrument is open. */
  memory: (view: string) => ViewMemory;
};

export function useInstrumentStack<View>(
  { gamepadEnabled = true }: { gamepadEnabled?: boolean } = {},
): InstrumentStack<View> {
  const [views, setViews] = useState<View[]>([]);
  const depth = views.length;
  const padSet = usePadSet();

  const push = useCallback((view: View) => {
    setViews((current) => [...current, view]);
  }, []);
  const replace = useCallback((view: View) => {
    setViews((current) => [...current.slice(0, -1), view]);
  }, []);
  const pop = useCallback(() => {
    setViews((current) => current.slice(0, -1));
  }, []);
  const popAll = useCallback(() => setViews([]), []);
  const [memory] = useState(createViewMemories);

  const hasPushedView = depth > 0;
  useEffect(() => {
    if (!hasPushedView) return;
    return registerInstrumentBack(pop);
  }, [hasPushedView, pop]);

  // Instruments consume Back before the map-layer selector can close the map.
  useGamepadFrame(
    (input) => {
      if (!gamepadEnabled || !input.connected || !hasPushedView) return;
      if (!input.wasPressed(padSet === "city" ? "map_back" : "menu_back")) {
        return;
      }
      playKitSound("cancel");
      pop();
    },
    { priority: INSTRUMENT_PAD_PRIORITY },
  );

  return {
    top: views.at(-1) ?? null,
    depth,
    push,
    replace,
    pop,
    popAll,
    memory,
  };
}

function createViewMemories(): (view: string) => ViewMemory {
  const memories = new Map<string, ViewMemory>();
  return (view) => {
    const kept = memories.get(view);
    if (kept) return kept;
    const memory: ViewMemory = {
      scroll: { x: 0, y: 0 },
      row: 0,
      keepScroll: (offset) => {
        memory.scroll = offset;
      },
      keepRow: (row) => {
        memory.row = row;
      },
    };
    memories.set(view, memory);
    return memory;
  };
}
