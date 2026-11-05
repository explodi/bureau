/**
 * The pad on the map. In map mode the `map` layer
 * claims every face button, the D-pad and the bumpers, so nothing of build
 * mode answers there, and the instrument's view on screen holds them:
 *
 *   LB / RB     the map layer (MapLayerSelector)
 *   ← / →       the view's tabs (Segmented); without tabs, its one value
 *   ↑ / ↓       the view's list, past its ends the body's scroll
 *   A           the list's row; in a cursor view, the map under the cursor
 *   X           deletes the list's row, where a row can go
 *   Y           the footer's main key (InstrumentMainKey)
 *   B           back one view (useInstrumentStack); nothing at the root
 *   LT / RT     zoom; the right stick pans; View leaves the map
 *   left stick  the cursor, only in a cursor view (useMapCursor)
 *
 * A view assembled from these parts is pad-operated without code of its own:
 *
 *   const cursor = useInstrumentPadList({
 *     count: rows.length,
 *     enabled: gamepadEnabled,
 *     onChoose: (index) => ...,        // A; omitted, A is left to the map
 *     onDelete: (index) => ...,        // X: remove, sell
 *     chosen: selectedIndex,           // a click elsewhere moves the cursor
 *     memory: stack.memory("lines"),   // reopens on the row it was left on
 *   });
 *   <ListRow selected={cursor === index} ...>
 *
 * `cursor` follows the active input device, so a mouse player never sees the
 * band. It clamps when the list shrinks under it (a sale, a removal).
 */

import { useEffect, useRef, useState } from "react";
import { host, type HostNode } from "bureau/host";
import {
  createDpadStepper,
  GamepadPriority,
  useGamepad,
  useGamepadFrame,
  useHintDevice,
} from "./input/useGamepad.ts";
import type { ViewMemory } from "./instrument_stack.ts";

/** About a line of readouts per step of the D-pad. */
const SCROLL_STEP_PX = 48;

/** The instruments' priority, above the map-layer selector's and the map's. */
export const INSTRUMENT_PAD_PRIORITY = GamepadPriority.UI + 5;

export function useInstrumentPadList(
  { count, enabled = true, chosen, onChoose, onDelete, onMove, body, memory }: {
    count: number;
    enabled?: boolean;
    /** The row chosen elsewhere (a click on the row or on the map), which the
     * cursor goes to; null or -1 while none is. */
    chosen?: number | null;
    onChoose?: (index: number) => void;
    onDelete?: (index: number) => void;
    /** The cursor moved onto a row: the camera can follow it there. */
    onMove?: (index: number) => void;
    /** Scrolled by ↑/↓ past the list's ends, and by them alone without one. */
    body?: { current: HostNode | null };
    memory?: ViewMemory;
  },
): number | null {
  const { connected } = useGamepad();
  const device = useHintDevice();
  const [index, setIndex] = useState(() => memory?.row ?? 0);
  const dpadStep = useRef(createDpadStepper()).current;
  // A row chosen elsewhere moves the cursor once, when it is chosen; the pad
  // moves it on from there.
  const [followed, setFollowed] = useState(chosen);
  const chosenRow = chosen !== undefined && chosen !== null && chosen >= 0
    ? chosen
    : null;
  if (chosen !== followed) {
    setFollowed(chosen);
    if (chosenRow !== null) setIndex(chosenRow);
  }
  useEffect(() => {
    if (chosenRow !== null) memory?.keepRow(chosenRow);
  }, [chosenRow, memory]);
  const lastIndex = Math.max(0, count - 1);
  const cursor = Math.min(index, lastIndex);

  useGamepadFrame(
    (input) => {
      if (!enabled || !input.connected) return;
      const up = dpadStep(input, "map_up", "up");
      const down = dpadStep(input, "map_down", "down");
      const atTop = count === 0 || cursor === 0;
      const atBottom = count === 0 || cursor === lastIndex;
      const scroller = body?.current;
      if (scroller && up && atTop) host.scrollBy(scroller, 0, -SCROLL_STEP_PX);
      if (scroller && down && atBottom) {
        host.scrollBy(scroller, 0, SCROLL_STEP_PX);
      }
      if (count === 0) return;

      let next = cursor;
      if (up) next = Math.max(0, cursor - 1);
      else if (down) next = Math.min(lastIndex, cursor + 1);
      if (next !== cursor) {
        setIndex(next);
        memory?.keepRow(next);
        onMove?.(next);
      }
      if (onChoose && input.wasPressed("map_choose")) onChoose(cursor);
      if (onDelete && input.wasPressed("map_delete")) onDelete(cursor);
    },
    { priority: INSTRUMENT_PAD_PRIORITY },
  );

  return enabled && connected && device === "gamepad" ? cursor : null;
}

/** The views on screen that work on the map, by registration. */
const cursorViews = new Set<number>();
const cursorListeners = new Set<() => void>();
let nextCursorView = 0;

/**
 * Declares a cursor view: one whose job is on the map (placing a station,
 * joining one to a line, picking a police station, reading the air), while
 * `active`. Only then does the pad's left stick move a cursor on the map and
 * its A act under it; elsewhere on the map the cursor is hidden, so it never
 * promises an A that does nothing.
 */
export function useMapCursor(active = true): void {
  useEffect(() => {
    if (!active) return;
    const id = nextCursorView++;
    cursorViews.add(id);
    for (const listener of cursorListeners) listener();
    return () => {
      cursorViews.delete(id);
      for (const listener of cursorListeners) listener();
    };
  }, [active]);
}

/** Whether a cursor view is on screen (useMapCursor). */
export function isMapCursorWanted(): boolean {
  return cursorViews.size > 0;
}

export function subscribeMapCursor(listener: () => void): () => void {
  cursorListeners.add(listener);
  return () => {
    cursorListeners.delete(listener);
  };
}
