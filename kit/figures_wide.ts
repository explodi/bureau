import { useTranslation } from "./i18n/i18n.ts";
import { host } from "bureau/host";
import type { TypeStyle } from "bureau/primitives";

/**
 * The width of `count` figures ("0") set in `typeStyle`, in UI pixels: a
 * measure for copy that wraps at a number of characters.
 */
export function useFiguresWide(typeStyle: TypeStyle, count: number): number {
  // A figure's width follows the language's face: a language change renders
  // the caller again, which measures again.
  useTranslation();
  return count * host.measureText(typeStyle, "0");
}
