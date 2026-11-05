import { DB32, type PaletteName } from "./tokens.ts";

/**
 * The readable ink for text on a palette fill, by WCAG relative luminance and
 * contrast ratio: a light fill (yellow, pink, sky blue) takes the dark ink and
 * a dark one (indigo) the light ink, so a list row filled with a bus line's
 * colour stays legible whatever hue it carries.
 */
export function contrastingTextColor(
  fill: `db32-${PaletteName}`,
): "db32-white" | "db32-valhalla" {
  const hex = DB32[fill.slice("db32-".length) as PaletteName].slice(1);
  const channel = (h: string) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(hex.slice(0, 2)) +
    0.7152 * channel(hex.slice(2, 4)) +
    0.0722 * channel(hex.slice(4, 6));
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack
    ? "db32-white"
    : "db32-valhalla";
}
