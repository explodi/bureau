import { createElement } from "react";
import { createNativeRoot } from "bureau/kit/primitives/reconciler.ts";

declare global {
  var __bureauCommit: (commit: string) => void;
}

const root = createNativeRoot((stream) => {
  globalThis.__bureauCommit(JSON.stringify({
    operations: Array.from(stream.operations),
    strings: stream.strings,
  }));
});

setTimeout(() => {
  root.renderSync(createElement("bureau-box", { id: "literal" }, "Cash"));
}, 0);
