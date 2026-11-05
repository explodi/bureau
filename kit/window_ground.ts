import { createContext } from "react";

/**
 * True inside a tabbed window, whose ground is one step darker than chrome:
 * the ground a notebook's strip sits on. A part that paints the window's
 * ground — the loader that stands in for a whole body — paints this one.
 */
export const TabbedGround = createContext(false);
