import { useState } from "react";
import {
  Text,
  type TextCount,
  type TextFormat,
  type TypeStyle,
} from "bureau/primitives";
import { TEMPOS } from "./tokens.ts";

const WHOLE_NUMBER: TextFormat = { decimals: 0 };

/** The count from `from` to `value`; a fall snaps unless it is animated. */
function countTo(
  from: number,
  value: number,
  formatKey: string,
  animateOnDecrease: boolean,
): TextCount {
  const rises = value > from;
  const falls = value < from;
  const counts = rises || (falls && animateOnDecrease);
  return {
    from: counts ? from : value,
    to: value,
    durationMs: counts ? TEMPOS.fill : 0,
    format: JSON.parse(formatKey) as TextFormat,
  };
}

/**
 * A number that counts toward `value` over the fill tempo. The host counts
 * it (Text `count`), so a new value costs one React render, never one a
 * frame: funds change every sim tick, and a top bar re-rendered at 60 Hz was
 * a tenth of the renderer's main thread.
 *
 * It counts from the last value it was given, so a count interrupted by the
 * next one starts again from the figure it was heading to.
 */
export function AnimatedNumber({
  value,
  format = WHOLE_NUMBER,
  animateOnDecrease = false,
  typeStyle,
}: {
  value: number;
  /** How the figure is printed as it counts: a whole number by default. */
  format?: TextFormat;
  /** A fall snaps to its figure unless this is set. */
  animateOnDecrease?: boolean;
  /** The figure's type; the line's it stands in by default. */
  typeStyle?: TypeStyle;
}) {
  // A caller's format is often written inline; its contents, not its
  // identity, decide whether the count restarts.
  const formatKey = JSON.stringify(format);
  // The last render's inputs and the count they made, held as state and
  // replaced while rendering when an input changes: the count keeps its
  // identity otherwise, which is what lets the host run it undisturbed.
  const [shown, setShown] = useState(() => ({
    value,
    formatKey,
    animateOnDecrease,
    count: countTo(value, value, formatKey, animateOnDecrease),
  }));
  const valueChanged = shown.value !== value;
  const styleChanged = shown.formatKey !== formatKey ||
    shown.animateOnDecrease !== animateOnDecrease;
  if (valueChanged || styleChanged) {
    setShown({
      value,
      formatKey,
      animateOnDecrease,
      count: countTo(shown.value, value, formatKey, animateOnDecrease),
    });
  }
  return <Text typeStyle={typeStyle} count={shown.count} />;
}
