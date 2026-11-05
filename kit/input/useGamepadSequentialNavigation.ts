/**
 * Simple sequential navigation for vertical forms
 *
 * UP/DOWN moves focus between controls in document order, and A presses the
 * focused button or check.
 * Much simpler than spatial navigation - no 2D distance calculations needed.
 * Use this for Settings, forms, and other vertical layouts.
 * Direction input uses the D-pad or a deliberate left stick tilt
 * (with a threshold to avoid drift).
 *
 * A toolbar is the one horizontal row in such a form: LEFT/RIGHT walk its
 * keys, as they do in a spatial window, and UP/DOWN step past it as one stop.
 * Outside a toolbar LEFT/RIGHT stay free for editing values
 * (useGamepadFormControls).
 */

import { useRef } from "react";
import { getFocusedNode, host, type HostNode } from "bureau/host";
import {
  GamepadPriority,
  useGamepad,
  useGamepadFrame,
  usePadContext,
} from "./useGamepad.ts";

interface SequentialNavigationOptions {
  onCancel?: () => void;
  gridId?: string;
  enabled?: boolean;
  priority?: number;
}

type Direction = "up" | "down" | "left" | "right";

/** Where a press moves focus from `current`, or undefined to stay put. */
function nextFocus(
  elements: HostNode[],
  current: HostNode | null,
  direction: Direction,
): HostNode | undefined {
  const currentIndex = current ? elements.indexOf(current) : -1;
  const row = current && currentIndex >= 0 ? host.toolbar(current) : null;
  const rowItems = row
    ? elements.filter((element) => host.contains(row, element))
    : [];

  if (direction === "left" || direction === "right") {
    if (!row) return undefined;
    const step = direction === "right" ? 1 : -1;
    return rowItems[(current ? rowItems.indexOf(current) : -1) + step];
  }

  // From inside a row, Up/Down leave from its first or last key.
  const rowEnd = direction === "up"
    ? rowItems[0]
    : rowItems[rowItems.length - 1];
  const fromIndex = rowEnd ? elements.indexOf(rowEnd) : currentIndex;
  let nextIndex: number;
  if (direction === "up") {
    nextIndex = fromIndex <= 0 ? elements.length - 1 : fromIndex - 1;
  } else {
    nextIndex = fromIndex >= elements.length - 1 ? 0 : fromIndex + 1;
  }
  const target = elements[nextIndex];
  // Entering a row from above or below lands on its first key.
  const targetRow = target ? host.toolbar(target) : null;
  if (!targetRow) return target;
  return elements.find((element) => host.contains(targetRow, element));
}

export function useGamepadSequentialNavigation(
  options: SequentialNavigationOptions = {},
) {
  const { connected } = useGamepad();
  const { onCancel, gridId, enabled = true, priority } = options;
  usePadContext("menu", enabled, priority ?? GamepadPriority.UI);
  const lastNavigationTimeRef = useRef(0);

  useGamepadFrame(
    (input) => {
      if (!input.connected) return;

      const REPEAT_DELAY = 250;
      const now = Date.now();

      if (onCancel && input.wasPressed("menu_back")) {
        onCancel();
      }

      const focused = getFocusedNode();
      const control = focused ? host.control(focused) : null;
      const pressable = control?.kind === "button" || control?.kind === "check";
      if (focused && pressable && input.wasPressed("menu_confirm")) {
        host.press(focused);
      }

      const canNavigate = now - lastNavigationTimeRef.current >= REPEAT_DELAY;
      if (!canNavigate) return;

      const direction: Direction | null = input.isHeld("menu_up")
        ? "up"
        : input.isHeld("menu_down")
        ? "down"
        : input.isHeld("menu_left")
        ? "left"
        : input.isHeld("menu_right")
        ? "right"
        : null;
      if (!direction) return;

      const elements = host.navigable(gridId, true);
      if (elements.length === 0) return;
      const target = nextFocus(
        elements,
        getFocusedNode(),
        direction,
      );
      if (!target) return;

      host.focus(target);
      lastNavigationTimeRef.current = now;
    },
    { enabled, priority: priority ?? GamepadPriority.UI },
  );

  return { connected };
}
