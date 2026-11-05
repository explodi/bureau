import { type ReactNode, useCallback } from "react";
import { useHintActions } from "./hint_context.tsx";
import type { HostNode } from "./primitives/host.ts";

/**
 * Hover and focus that drive the floating hint (<Hint>) from a primitive
 * `Box`: spread `{...tip(content)}` on the box. Focus mirrors hover so a pad
 * gets the same hints as the mouse. Inside a window, help goes to the status
 * bar instead (`useBoxHint`).
 */
export function useNodeHint() {
  const { showTooltipAtNode, hideTooltip } = useHintActions();
  return useCallback(
    (content: ReactNode) => {
      let anchor: HostNode | null = null;
      const show = (shown: boolean) => {
        if (!shown || !anchor) return hideTooltip();
        showTooltipAtNode(anchor, content);
      };
      return {
        nodeRef: (node: HostNode | null) => {
          anchor = node;
        },
        onHoverChange: (inside: boolean) => show(inside),
        onFocusChange: (focused: boolean) => show(focused),
      };
    },
    [showTooltipAtNode, hideTooltip],
  );
}
