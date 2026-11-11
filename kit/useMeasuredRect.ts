import { useLayoutEffect, useState } from "react";
import { host, type HostNode } from "bureau/host";
import { keepMeasure } from "./measured_state.ts";

/** A box's size in its own pixels: the room a picture or a plot in it gets. */
export interface MeasuredSize {
  width: number;
  height: number;
}

/**
 * A box's size, re-read whenever its layout changes: for a picture or a plot
 * sized by the room its column leaves. In its own pixels, so a box that a
 * `scaleBelow` box draws smaller still gets sizes it lays out in. Null until
 * the box has been laid out; the measure lands before paint.
 */
export function useMeasuredRect(): [
  (node: HostNode | null) => void,
  MeasuredSize | null,
] {
  const [node, setNode] = useState<HostNode | null>(null);
  const [size, setSize] = useState<MeasuredSize | null>(null);
  useLayoutEffect(() => {
    if (!node) return;
    const update = () => {
      const next = measuredSize(node);
      setSize((last) => keepMeasure(last, next));
    };
    update();
    return host.observeLayout(update);
  }, [node]);
  return [setNode, size];
}

/** A node's size in its own pixels, the units it is given sizes in. */
export function measuredSize(node: HostNode): MeasuredSize {
  const rect = host.measure(node);
  return { width: rect.width / rect.scale, height: rect.height / rect.scale };
}
