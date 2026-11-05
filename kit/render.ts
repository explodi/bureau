/**
 * A game's UI, mounted: what its bundle's entry calls once.
 *
 *   import { render } from "bureau/kit/render.ts";
 *   render(<App />);
 */
// MUST stay first: the engine's globals and the platform, before anything reads
// them.
import "platform";
import type { ReactNode } from "react";
import { handleHostEvent } from "bureau/host";
import { createNativeRoot } from "./primitives/reconciler.ts";

declare global {
  var __nativeDispatch:
    | ((node: number, handler: string, args: string) => unknown)
    | undefined;
}

interface NativeCommits {
  commit(operations: Int32Array, strings: string[]): boolean;
}

export function render(
  element: ReactNode,
  options: {
    /** Past every error boundary; rethrown to the engine without this. */
    onUncaughtError?: (error: unknown) => void;
  } = {},
): void {
  const native = globalThis.__native as unknown as NativeCommits;
  const root = createNativeRoot(
    (stream) => native.commit(stream.operations, stream.strings),
    options.onUncaughtError,
  );
  // The view's calls into React: a node's handler by its id, or (node 0) the
  // host's own listeners.
  globalThis.__nativeDispatch = (node, handler, args) => {
    const values = JSON.parse(args) as unknown[];
    if (node !== 0) return root.dispatch(node, handler, ...values) ?? null;
    return handleHostEvent(handler, values) ?? null;
  };
  root.render(element);
}
