import { assertEquals } from "@std/assert";
import type { ReactNode } from "react";
import { TextField } from "./TextField.tsx";
import {
  createNativeRoot,
  type NativeNode,
  nativeNodes,
} from "./primitives/reconciler.ts";

/** The type style the field's input is set in. */
function inputStyle(element: ReactNode): unknown {
  const root = createNativeRoot(() => {});
  root.renderSync(element);
  const field = [...nativeNodes()].find((node: NativeNode) =>
    node.type === "bureau-field"
  );
  root.renderSync(null);
  return field?.props.typeStyle;
}

Deno.test("a name being typed is capitalized", () => {
  assertEquals(
    inputStyle(<TextField value="newtown" placeholder="Up to 16" capitalize />),
    "ui-16-capitalize-solid",
  );
});

Deno.test("an empty name's placeholder keeps its own case", () => {
  assertEquals(
    inputStyle(<TextField value="" placeholder="Up to 16" capitalize />),
    "ui-16-solid",
  );
});
