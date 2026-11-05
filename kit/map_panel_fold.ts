/**
 * Where a screen is too small for a map's legend and its instrument together
 * (the iPad, iPhone and Android editions), one of them folds: the legend into
 * an "i" key, the instrument into its header. Pressing the folded one opens
 * it and folds the other. A view with only one of them never folds it, and
 * every view with both opens on its instrument.
 */
import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { platform } from "platform";

export type MapPanel = "legend" | "instrument";

export type MapPanels = {
  /** The platform folds a panel while both are up. */
  folds: boolean;
  legends: number;
  instruments: number;
  /** The panel that stands open while both are up. */
  open: MapPanel;
};

/** Whether `panel` stands folded among `panels`. */
export function isFolded(panel: MapPanel, panels: MapPanels): boolean {
  const bothUp = panels.legends > 0 && panels.instruments > 0;
  return panels.folds && bothUp && panels.open !== panel;
}

const mounted = { legend: 0, instrument: 0 };
let open: MapPanel = "instrument";
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function folded(panel: MapPanel): boolean {
  return isFolded(panel, {
    folds: platform.capabilities.foldsMapPanels,
    legends: mounted.legend,
    instruments: mounted.instrument,
    open,
  });
}

/**
 * The fold of a map panel while it is up. `takesPart` false leaves it out: a
 * legend with nothing to key, an instrument laid in a page.
 */
export function useMapPanelFold(
  panel: MapPanel,
  takesPart = true,
): { folded: boolean; unfold: () => void } {
  useLayoutEffect(() => {
    if (!takesPart) return;
    mounted[panel]++;
    changed();
    return () => {
      mounted[panel]--;
      if (mounted[panel] === 0) open = "instrument";
      changed();
    };
  }, [panel, takesPart]);
  const isPanelFolded = useSyncExternalStore(
    subscribe,
    () => takesPart && folded(panel),
  );
  const unfold = useCallback(() => {
    open = panel;
    changed();
  }, [panel]);
  return { folded: isPanelFolded, unfold };
}
