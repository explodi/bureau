import React, { useLayoutEffect, useRef } from "react";
import { host, type HostNode } from "bureau/host";
import { Box, Layer, Text } from "bureau/primitives";
import {
  anchorPlacement,
  cursorPlacement,
  type HintAnchor,
  type HintLayout,
  type HintState,
  registerGlobalHint,
  unregisterGlobalHint,
} from "./bureau_hint_channel.ts";

// The direct-move channel (`updateHintPositionDirect`), the placement maths
// and `useLocalHint` live in bureau_hint_channel.ts.

interface HintProps extends HintState {
  anchor?: HintAnchor | null;
  /**
   * When true, this instance registers with the direct-move channel used by
   * `updateHintPositionDirect`. There must be at most one `isGlobal` tooltip
   * mounted at a time (the app-level one in Game.tsx). Local tooltips from
   * `useLocalHint` leave this false.
   */
  isGlobal?: boolean;
}

/**
 * The floating hint: the one readout on the machine that follows the
 * pointer. Bureau routes a window's help into its status bar, and inside a
 * window a floating plate is banned. The map has no status bar — the cursor's
 * readout (a tile's cost, a building's facts, "press A to place") IS the
 * map's hint channel — so the plate exists for the city and the HUD, and it is
 * an INSTRUMENT: it wears the dark chrome, framed the way the panels are, one
 * ring and a hard shadow. It appears at once: a fade read as a web page.
 *
 * - On mount / content change: measure the plate once, cache its size, place
 *   its layer.
 * - On every mouse move: `updateHintPositionDirect(x, y)` moves the layer
 *   through the host. No setState, no reconciliation, no render.
 * - On visibility / content change: React re-renders, measure runs again.
 */
export function Hint(
  { visible, content, x, y, anchor = null, isGlobal = false }: HintProps,
) {
  const layer = useRef<HostNode | null>(null);
  const plate = useRef<HostNode | null>(null);
  // The plate stays mounted across hide/show cycles (`visible` flips its
  // opacity), so its nodes are not created again each time the cursor moves
  // between a valid and an invalid tile. It still re-measures when its
  // CONTENT changes.
  const lastContentRef = useRef<React.ReactNode>(null);
  // Measuring lays the tree out, so it happens only when the content changes.
  const layoutRef = useRef<HintLayout | null>(null);

  // Every render: the layer resets its own place when it renders.
  useLayoutEffect(() => {
    const layerNode = layer.current;
    const plateNode = plate.current;
    if (!layerNode || !plateNode) return;
    if (!visible) {
      if (isGlobal) unregisterGlobalHint();
      // The next show re-measures: the content may change while hidden.
      layoutRef.current = null;
      host.placeLayer(layerNode, -9999, -9999);
      return;
    }
    const contentChanged = lastContentRef.current !== content;
    lastContentRef.current = content;
    if (contentChanged || !layoutRef.current) {
      const rect = host.measure(plateNode);
      layoutRef.current = { w: rect.width, h: rect.height };
    }
    const layout = layoutRef.current;
    // Element-anchored tooltips ignore mousemove (the anchor is a static
    // rect), so they stay off the direct-move channel, which is meant for
    // cursor-following tooltips only.
    if (isGlobal && !anchor) registerGlobalHint(layerNode, layout);
    const place = anchor
      ? anchorPlacement(anchor, layout.w, layout.h)
      : cursorPlacement(x, y, layout.w, layout.h);
    host.placeLayer(layerNode, place.left, place.top);
  });
  useLayoutEffect(() => () => {
    if (isGlobal) unregisterGlobalHint();
  }, [isGlobal]);

  return (
    <Layer
      stacking="popup"
      passThrough
      nodeRef={(node) => {
        layer.current = node;
      }}
    >
      <Box
        id={isGlobal ? "bureau-hint" : undefined}
        nodeRef={(node) => {
          plate.current = node;
        }}
        direction="column"
        // 350px of text and the 12px insets either side.
        maxWidth={374}
        padding={[8, 12]}
        chrome="dark"
        fill="face"
        surface="toast"
        ink="ink"
        typeStyle="ui-15-loose"
        opacity={visible ? 1 : 0}
        passThrough
      >
        <Text>{content}</Text>
      </Box>
    </Layer>
  );
}
