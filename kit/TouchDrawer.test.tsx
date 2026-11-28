import { assertEquals } from "@std/assert";
import { TouchDrawer } from "./TouchDrawer.tsx";
import { createNativeRoot, nativeNodes } from "./primitives/reconciler.ts";

const SECTIONS = [
  { id: "shops", label: "Shops" },
  { id: "farms", label: "Farms" },
];

type Drawn = Partial<Parameters<typeof TouchDrawer>[0]>;

/** The nodes of a drawer on its second tool of three, but for `changes`. */
function drawn(changes: Drawn = {}) {
  const root = createNativeRoot(() => {});
  root.renderSync(
    <TouchDrawer
      title="Buildings"
      name="House"
      picture={null}
      place={{ index: 1, count: 3 }}
      onStep={() => {}}
      onTake={() => {}}
      onClose={() => {}}
      {...changes}
    />,
  );
  const nodes = [...nativeNodes()];
  root.renderSync(null);
  return nodes;
}

function node(nodes: ReturnType<typeof drawn>, id: string) {
  return nodes.find((candidate) => candidate.props.id === id);
}

Deno.test("the forward key steps on a tool", () => {
  const steps: number[] = [];
  const nodes = drawn({ onStep: (direction) => steps.push(direction) });
  (node(nodes, "touch-drawer-forward")!.props.onPress as () => void)();
  assertEquals(steps, [1]);
});

Deno.test("the back key steps back a tool", () => {
  const steps: number[] = [];
  const nodes = drawn({ onStep: (direction) => steps.push(direction) });
  (node(nodes, "touch-drawer-back")!.props.onPress as () => void)();
  assertEquals(steps, [-1]);
});

Deno.test("a drawer of one tool has dead step keys", () => {
  const nodes = drawn({ place: { index: 0, count: 1 } });
  assertEquals(
    {
      back: node(nodes, "touch-drawer-back")!.props.disabled,
      forward: node(nodes, "touch-drawer-forward")!.props.disabled,
    },
    { back: true, forward: true },
  );
});

Deno.test("the page says which tool of how many it shows", () => {
  const counter = drawn().find((candidate) => candidate.text === "2 / 3");
  assertEquals(counter?.text, "2 / 3");
});

Deno.test("a drawer of one tool counts nothing", () => {
  const nodes = drawn({ place: { index: 0, count: 1 } });
  const counter = nodes.find((candidate) => candidate.text === "1 / 1");
  assertEquals(counter, undefined);
});

Deno.test("the picture is the key that takes the tool", () => {
  let taken = 0;
  const nodes = drawn({ onTake: () => taken++ });
  (node(nodes, "touch-drawer-take")!.props.onPress as () => void)();
  assertEquals(taken, 1);
});

Deno.test("the picture of a tool the city may take is a live key", () => {
  assertEquals(node(drawn(), "touch-drawer-take")!.props.disabled, false);
});

Deno.test("a withheld tool's picture is a dead key", () => {
  const nodes = drawn({ withheld: true });
  assertEquals(node(nodes, "touch-drawer-take")!.props.disabled, true);
});

Deno.test("the close key closes the drawer", () => {
  let closed = 0;
  const nodes = drawn({ onClose: () => closed++ });
  (node(nodes, "touch-drawer-close")!.props.onPress as () => void)();
  assertEquals(closed, 1);
});

Deno.test("a drawer with sections wears a tab for each", () => {
  const nodes = drawn({ tabs: SECTIONS, activeTab: "farms" });
  assertEquals(
    {
      shops: node(nodes, "touch-drawer-tabs-shops")?.props.selected,
      farms: node(nodes, "touch-drawer-tabs-farms")?.props.selected,
    },
    { shops: false, farms: true },
  );
});

Deno.test("a tab's press asks for its section", () => {
  const asked: string[] = [];
  const nodes = drawn({
    tabs: SECTIONS,
    activeTab: "farms",
    onSelectTab: (id) => asked.push(id),
  });
  (node(nodes, "touch-drawer-tabs-shops")!.props.onPress as () => void)();
  assertEquals(asked, ["shops"]);
});

Deno.test("a drawer with no sections wears no tabs", () => {
  assertEquals(node(drawn(), "touch-drawer-tabs"), undefined);
});

Deno.test("a drawer with one section wears no tabs", () => {
  const nodes = drawn({ tabs: [SECTIONS[0]!], activeTab: "shops" });
  assertEquals(node(nodes, "touch-drawer-tabs"), undefined);
});
