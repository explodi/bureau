/**
 * The tooltip's positioning: the direct-move channel for the app's single
 * global tooltip, the viewport-clamped placement maths, and the hook a
 * component uses to run a tooltip of its own. <Hint> (Hint.tsx) is
 * the plate.
 *
 * Direct-move channel: Game.tsx's mouse-move callback calls
 * `updateHintPositionDirect`, which moves the plate's layer through the host
 * without going through React.
 *
 * Why bypass React: mouse move fires at ~60 Hz while a tooltip is visible.
 * Running setState → reconciliation → diff → commit just to move one layer is
 * wasteful — we know exactly which layer to move.
 *
 * Only the `<Hint isGlobal>` instance registers here. Local-use
 * `<Hint>` callers (charts via `useLocalHint`) do NOT register — their
 * positions flow through React props, and letting them touch this channel
 * would cause the global tooltip's mouse-move writes to move the wrong layer.
 */
import { host, type HostNode } from "bureau/host";
import React from "react";

export type HintLayout = { w: number; h: number };

/**
 * Element anchor (unscaled UI px). When set, the tooltip is positioned
 * outside the rect (preferring below; flipping above with a gap from the
 * rect's top edge when there isn't space below) instead of using the
 * cursor-style offset. Avoids the overlap that occurs when a cursor anchor
 * at rect.bottom flips against a bottom-of-viewport toolbar (the flipped
 * `bottom - h - gap` lands inside the element).
 */
export interface HintAnchor {
  topY: number;
  bottomY: number;
  centerX: number;
}

/** What a tooltip shows and where; `useLocalHint` holds one of these. */
export interface HintState {
  visible: boolean;
  content: React.ReactNode;
  x: number;
  y: number;
}

let globalHintLayer: HostNode | null = null;
let globalHintLayout: HintLayout | null = null;

/** The global tooltip announces its layer (and measured size) while shown. */
export function registerGlobalHint(layer: HostNode, layout: HintLayout) {
  globalHintLayer = layer;
  globalHintLayout = layout;
}

export function unregisterGlobalHint() {
  globalHintLayer = null;
  globalHintLayout = null;
}

export function updateHintPositionDirect(x: number, y: number): void {
  const layer = globalHintLayer;
  const layout = globalHintLayout;
  if (!layer || !layout) return;
  const place = cursorPlacement(x, y, layout.w, layout.h);
  host.placeLayer(layer, place.left, place.top);
}

const EDGE = 8;

/** The safe area's edges in UI pixels; a fallback while it has no size yet. */
function screenEdges() {
  const area = host.viewport();
  const width = area.width || 1920;
  const height = area.height || 1080;
  return {
    left: area.left + EDGE,
    top: area.top + EDGE,
    right: area.left + width - EDGE,
    bottom: area.top + height - EDGE,
  };
}

/**
 * Where a plate `w`×`h` goes beside the cursor at (x, y): below-right of it,
 * flipped to the other side where it would overflow, and held 8px inside the
 * safe area. Points and places are in the frame `host.measure` reports.
 */
export function cursorPlacement(
  x: number,
  y: number,
  w: number,
  h: number,
): { left: number; top: number } {
  const edges = screenEdges();
  const gap = 15;
  let left = x + gap + w > edges.right ? x - w - gap : x + gap;
  let top = y + gap + h > edges.bottom ? y - h - gap : y + gap;
  if (left + w > edges.right) left = edges.right - w;
  if (left < edges.left) left = edges.left;
  if (top + h > edges.bottom) top = edges.bottom - h;
  if (top < edges.top) top = edges.top;
  return { left, top };
}

/**
 * Element-anchored variant: the plate OUTSIDE the rect (below by default,
 * flipped above with a gap from `topY` when below would overflow),
 * horizontally centred on `centerX` and clamped to the viewport. The flip
 * uses the rect's TOP edge so the tooltip never overlaps the anchor — the
 * flaw of using the cursor-style placement for an icon at the bottom of the
 * screen.
 */
export function anchorPlacement(
  anchor: HintAnchor,
  w: number,
  h: number,
): { left: number; top: number } {
  const edges = screenEdges();
  const gap = 8;
  const fitsBelow = anchor.bottomY + gap + h <= edges.bottom;
  let top = fitsBelow ? anchor.bottomY + gap : anchor.topY - h - gap;
  if (top + h > edges.bottom) top = edges.bottom - h;
  if (top < edges.top) top = edges.top;
  let left = anchor.centerX - w / 2;
  if (left + w > edges.right) left = edges.right - w;
  if (left < edges.left) left = edges.left;
  return { left, top };
}

/**
 * useLocalHint - Self-contained hook for components that manage their own
 * tooltip (the charts — most UI uses the global Game.tsx tooltip). Points are
 * UI pixels from the viewport's top-left.
 */
export function useLocalHint() {
  const [tooltip, setTooltip] = React.useState<HintState>({
    visible: false,
    content: null,
    x: 0,
    y: 0,
  });

  function showTooltip(
    point: { x: number; y: number },
    content: React.ReactNode,
  ) {
    setTooltip({ visible: true, content, x: point.x, y: point.y });
  }

  function hideTooltip() {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }

  return { tooltip, showTooltip, hideTooltip };
}
