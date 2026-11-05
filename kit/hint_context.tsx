import { createContext, type ReactNode, useContext } from "react";
import type { HostNode } from "bureau/host";

export interface HintActions {
  showTooltip: (x: number, y: number, content: ReactNode) => void;
  // Anchor the tooltip below a node's box (bottom-center). Preferred over
  // showTooltip's raw coordinates for hover and focus: a pad's focus has no
  // cursor, and the tooltip doesn't jitter as the cursor moves inside the
  // node. Raw coordinates are for the 3D scene and for charts whose anchor
  // moves inside the plot.
  showTooltipAtNode(node: HostNode, content: ReactNode): void;
  hideTooltip: () => void;
  updateTooltipPosition: (x: number, y: number) => void;
}

const TooltipContext = createContext<HintActions | null>(null);

export const HintProvider = TooltipContext.Provider;

/** The hint actions, or null outside a provider: a key that may show a hint. */
export function useOptionalHintActions(): HintActions | null {
  return useContext(TooltipContext);
}

export function useHintActions(): HintActions {
  const ctx = useContext(TooltipContext);
  if (!ctx) {
    throw new Error("useHintActions must be used within a HintProvider");
  }
  return ctx;
}
