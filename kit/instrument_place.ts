import { createContext } from "react";

/**
 * Where a part stands in a map instrument (Instrument.tsx): `none`
 * outside one, `body` anywhere inside one, `footer` in its bottom strip,
 * whose keys carry 12px labels. Keys and empty states read it.
 */
export const InstrumentPlace = createContext<
  "none" | "body" | "footer"
>("none");
