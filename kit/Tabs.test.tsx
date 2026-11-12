import { assertEquals } from "@std/assert";
import { Tabs } from "./Tabs.tsx";
import { createNativeRoot, nativeNodes } from "./primitives/reconciler.ts";

const SHEETS = [
  { id: "general", label: "General" },
  { id: "graphics", label: "Graphics" },
];

function drawnStrip() {
  const root = createNativeRoot(() => {});
  root.renderSync(
    <Tabs id="sheets" tabs={SHEETS} activeId="general" onSelect={() => {}} />,
  );
  const nodes = [...nativeNodes()];
  root.renderSync(null);
  return nodes;
}

Deno.test("a filed tab answers the pointer as tall as the open one", () => {
  const nodes = drawnStrip();
  const open = nodes.find((node) => node.props.id === "sheets-general");
  const filed = nodes.find((node) => node.props.id === "sheets-graphics");
  assertEquals(
    { open: open?.props.height, filed: filed?.props.height },
    { open: 33, filed: 33 },
  );
});

Deno.test("a filed tab's card stands 4px lower than the open one's", () => {
  const cards = drawnStrip().filter((node) => node.props.slant !== undefined);
  // The open tab paints last, over both its neighbours.
  assertEquals(
    cards.map((card) => (card.props.inset as { top: number }).top),
    [4, 0],
  );
});
