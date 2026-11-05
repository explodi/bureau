import { getFocusedNode, host, type HostNode } from "bureau/host";

interface DialogScope {
  root: HostNode;
  /** Read at each change: a window whose loading body gives way to its
   *  program's swaps the body's node. */
  body: () => HostNode | null;
  footer: () => HostNode | null;
  gridId?: string;
}

/** A loading body's first control takes focus unless the player has moved it. */
export function manageDialogFocus(scope: DialogScope): () => void {
  const previousFocus = getFocusedNode();
  const marked = new Map<HostNode, () => void>();
  let initialFocusSettled = false;
  let autoFocused: HostNode | null = null;
  let cancelFocus = () => {};

  const update = () => {
    cancelFocus();
    const body = scope.body();
    const bodyControls = body ? host.focusables(body) : [];
    const footer = scope.footer();
    const controls = [
      ...bodyControls,
      ...(footer ? host.focusables(footer) : []),
    ];
    const currentControls = new Set(controls);

    for (const [node, removeMarker] of marked) {
      if (host.contains(scope.root, node) && currentControls.has(node)) {
        continue;
      }
      removeMarker();
      marked.delete(node);
    }
    for (const node of controls) {
      if (!marked.has(node)) {
        marked.set(node, host.markNavigable(node, scope.gridId));
      }
    }
    if (initialFocusSettled) return;

    const bodyTarget = bodyControls[0];
    const target = bodyTarget ?? controls[0] ?? scope.root;
    // Hints need the committed layout before focus measures their anchor.
    cancelFocus = host.afterLayout(() => {
      const active = getFocusedNode();
      const playerMoved = active !== scope.root && active !== autoFocused &&
        host.contains(scope.root, active);
      if (playerMoved) {
        initialFocusSettled = true;
        return;
      }
      host.focus(target, true);
      autoFocused = target;
      initialFocusSettled = bodyTarget !== undefined;
    });
  };

  update();
  const stopObserving = host.observeLayout(update);
  return () => {
    stopObserving();
    cancelFocus();
    for (const removeMarker of marked.values()) removeMarker();
    const active = getFocusedNode();
    const ownsFocus = active === null || host.contains(scope.root, active);
    if (previousFocus && host.connected(previousFocus) && ownsFocus) {
      host.focus(previousFocus, true);
    }
  };
}

/** Returns true when Tab wraps, so the caller can consume the key. */
export function trapDialogTab(
  root: HostNode,
  programRoots: readonly HostNode[],
  backwards: boolean,
): boolean {
  const hasControls = programRoots.some((node) =>
    host.focusables(node).length > 0
  );
  if (!hasControls) {
    host.focus(root, true);
    return true;
  }
  const controls = host.focusables(root);
  const active = getFocusedNode();
  const index = active ? controls.indexOf(active) : -1;
  const escaped = index === -1;
  const atEnd = backwards ? index === 0 : index === controls.length - 1;
  if (!escaped && !atEnd) return false;
  const target = backwards ? controls.at(-1) : controls[0];
  if (target) host.focus(target, true);
  return true;
}
