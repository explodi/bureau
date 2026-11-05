import { assertEquals } from "@std/assert";
import type { ReactNode } from "react";
import { Button } from "./Bureau.tsx";
import { ListRow } from "./List.tsx";
import {
  createNativeRoot,
  type NativeNode,
  nativeNodes,
} from "./primitives/reconciler.ts";

function keysIn(element: ReactNode): number {
  const root = createNativeRoot(() => {});
  root.renderSync(element);
  const keys =
    [...nativeNodes()].filter((node: NativeNode) =>
      node.props.role === "button"
    ).length;
  root.renderSync(null);
  return keys;
}

const remove = <Button size="small" variant="danger" mark="close" />;

Deno.test("a row keeps its actions out of sight until it is chosen", () => {
  assertEquals(
    keysIn(<ListRow actions={remove}>Station</ListRow>),
    0,
  );
});

Deno.test("a selected row shows its actions", () => {
  assertEquals(
    keysIn(
      <ListRow selected actions={remove}>Station</ListRow>,
    ),
    1,
  );
});
