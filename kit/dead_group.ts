import { createContext } from "react";

/**
 * True inside a check group whose enabling box is clear: every control in it
 * is dead, its captions stippled, until the box is ticked again. The kit's
 * controls read it.
 */
export const DeadGroup = createContext(false);
