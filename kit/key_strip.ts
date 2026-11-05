/** What a strip of keys tells the keys it holds. */
import { createContext } from "react";
import type { TypeStyle } from "bureau/primitives";

/**
 * The type a strip sets its keys' labels in, and how it spaces them: an
 * instrument's footer sets 12px labels, a message box's row wide flush keys,
 * a shared row equal parts.
 */
export const KeyStripContext = createContext<
  {
    typeStyle?: TypeStyle;
    share?: boolean;
    /** The narrowest a key in the strip is: a dialog's keys. */
    minWidth?: number;
    /** The strip spaces its keys itself, so a key keeps no side margins. */
    flush?: boolean;
  }
>({});

/** The end of the dock a tile closes, which draws that end of its frame. */
export function dockEndOf(
  index: number,
  count: number,
): "first" | "last" | undefined {
  if (index === 0) return "first";
  if (index === count - 1) return "last";
  return undefined;
}
