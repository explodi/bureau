/**
 * The hint bus behind Bureau's status bar: the context <Frame> provides,
 * and the hooks controls write through. Bureau has NO floating tooltips; a
 * control's help text goes into its window's status bar while it is focused or
 * hovered (see Bureau.tsx for the why).
 */
import { createContext, useCallback, useContext, useMemo } from "react";

export type StatusContextValue = {
  hint: string;
  setHint: (next: string) => void;
};

export const StatusContext = createContext<
  StatusContextValue | null
>(null);

/**
 * Write a line into the enclosing <StatusBar>. Outside a <Frame>
 * the returned setter is a no-op, so a control can offer status help without
 * knowing whether its window has a status bar.
 */
export function useStatus(): (next: string) => void {
  const ctx = useContext(StatusContext);
  return useCallback((next: string) => ctx?.setHint(next), [ctx]);
}

/**
 * Props that route a primitive `Box`'s help text into the status bar while it
 * is hovered or focused: spread them onto the box.
 */
export function useBoxHint(hint?: string) {
  const setStatus = useStatus();
  return useMemo(() => {
    if (!hint) return {};
    return {
      focusable: true,
      onHoverChange: (inside: boolean) => setStatus(inside ? hint : ""),
      onFocusChange: (focused: boolean) => setStatus(focused ? hint : ""),
    } as const;
  }, [hint, setStatus]);
}
