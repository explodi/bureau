import { assertEquals } from "@std/assert";
import type { ReactNode } from "react";
import { type PlotCommand, type ScrollOffset, Text } from "bureau/primitives";
import {
  createNativeRoot,
  type NativeNode,
  nativeNodes,
} from "./primitives/reconciler.ts";
import {
  InstrumentBody,
  InstrumentFooter,
  InstrumentHeader,
  InstrumentScoreHeader,
} from "./Instrument.tsx";
import { ListRow } from "./List.tsx";
import { useInstrumentStack } from "./instrument_stack.ts";

/** Renders one element, reads what it drew, then clears it away. */
function drawn<T>(element: ReactNode, read: (nodes: NativeNode[]) => T): T {
  const root = createNativeRoot(() => {});
  root.renderSync(element);
  const result = read([...nativeNodes()]);
  root.renderSync(null);
  return result;
}

const barHeight = (nodes: NativeNode[]) =>
  nodes.find((node) => node.props.surface === "titlebar")?.props.height;

const inkOf = (text: string) => (nodes: NativeNode[]) =>
  nodes.find((node) => node.children.some((child) => child.text === text))
    ?.props.ink;

Deno.test("a compact header is the 33px bar", () => {
  assertEquals(
    drawn(<InstrumentHeader heading="Police" />, barHeight),
    33,
  );
});

Deno.test("a compact header stays 33px with a back key", () => {
  assertEquals(
    drawn(
      <InstrumentHeader heading="Buy buses" back={() => {}} />,
      barHeight,
    ),
    33,
  );
});

Deno.test("back navigation is one full-height header compartment with an engraved mark", () => {
  assertEquals(
    drawn(
      <InstrumentHeader heading="Lines" back={() => {}} />,
      (nodes) => {
        const back = nodes.find((node) =>
          node.props.look === "instrument-back"
        );
        const plot = nodes.find((node) => node.type === "bureau-plot");
        const commands = plot?.props.commands as PlotCommand[] | undefined;
        return {
          role: back?.props.role,
          width: back?.props.width,
          alignSelf: back?.props.alignSelf,
          feedback: back?.props.feedback,
          mark: commands?.[0]?.kind,
          pictures: nodes.filter((node) => node.type === "bureau-image").length,
        };
      },
    ),
    {
      role: "button",
      width: 33,
      alignSelf: "stretch",
      feedback: "cancel",
      mark: "engraving",
      pictures: 0,
    },
  );
});

Deno.test("a disclosure engraving leaves the whole row as its only press target", () => {
  assertEquals(
    drawn(
      <ListRow as="button" chevron onClick={() => {}}>
        Line 2
      </ListRow>,
      (nodes) => ({
        buttons: nodes.filter((node) => node.props.role === "button").length,
        pressTargets: nodes.filter((node) => node.props.onPress !== undefined)
          .length,
        plotWidth: nodes.find((node) => node.type === "bureau-plot")?.props
          .width,
        pictures: nodes.filter((node) => node.type === "bureau-image").length,
      }),
    ),
    { buttons: 1, pressTargets: 1, plotWidth: 16, pictures: 0 },
  );
});

Deno.test("a score header is 44px before its badge loads", () => {
  assertEquals(
    drawn(
      <InstrumentScoreHeader heading="Transport" facts={[]} />,
      barHeight,
    ),
    44,
  );
});

Deno.test("a readout footer is 33px high", () => {
  assertEquals(
    drawn(
      <InstrumentFooter>
        <Text>Parkland coverage</Text>
      </InstrumentFooter>,
      (nodes) =>
        nodes.find((node) => node.props.surface === "plate")?.props.height,
    ),
    33,
  );
});

Deno.test("a footer keeps a gutter between its readout and its key", () => {
  assertEquals(
    drawn(
      <InstrumentFooter actionable>
        <Text>0 stations built</Text>
        <Text>Done</Text>
      </InstrumentFooter>,
      (nodes) => nodes.find((node) => node.props.height === 44)?.props.gap,
    ),
    12,
  );
});

Deno.test("a fact without a tone is a reading in the soft ink", () => {
  assertEquals(
    drawn(
      <InstrumentScoreHeader
        heading="Transport"
        facts={[{ text: "62% coverage" }]}
      />,
      inkOf("62% coverage"),
    ),
    "dark",
  );
});

Deno.test("a toned fact is a verdict in its tone's ink", () => {
  assertEquals(
    drawn(
      <InstrumentScoreHeader
        heading="Line 2"
        facts={[{ text: "1 station" }, { text: "Needs 2+", tone: "warn" }]}
      />,
      inkOf("Needs 2+"),
    ),
    "ink-warn",
  );
});

Deno.test("a scrambled header keeps its heading readable", () => {
  assertEquals(
    drawn(
      <InstrumentScoreHeader
        heading="Transport"
        facts={[{ text: "62% coverage" }]}
        scrambled
      />,
      (nodes) =>
        nodes.some((node) =>
          node.children.some((child) => child.text === "Transport")
        ),
    ),
    true,
  );
});

Deno.test("a scrambled header glitches its facts", () => {
  assertEquals(
    drawn(
      <InstrumentScoreHeader
        heading="Transport"
        facts={[{ text: "62% coverage" }]}
        scrambled
      />,
      (nodes) =>
        nodes.some((node) =>
          node.children.some((child) => child.text === "62% coverage")
        ),
    ),
    false,
  );
});

/** An instrument whose root shows one tab's body, as the transport panel's. */
function TabbedInstrument({ tab }: { tab: string }) {
  const stack = useInstrumentStack();
  return (
    <InstrumentBody key={tab} memory={stack.memory(tab)}>
      <Text>{tab}</Text>
    </InstrumentBody>
  );
}

const body = () =>
  [...nativeNodes()].find((node) => node.type === "bureau-scroll")!;

const scrollBodyTo = (offset: ScrollOffset) =>
  (body().props.onScroll as (offset: ScrollOffset) => void)(offset);

Deno.test("a tab reopens at the scroll it was left at", () => {
  const root = createNativeRoot(() => {});
  root.renderSync(<TabbedInstrument tab="lines" />);
  scrollBodyTo({ x: 0, y: 120 });
  root.renderSync(<TabbedInstrument tab="stations" />);
  root.renderSync(<TabbedInstrument tab="lines" />);
  const offset = body().props.offset;
  root.renderSync(null);
  assertEquals(offset, { x: 0, y: 120 });
});

Deno.test("another tab opens at its own top", () => {
  const root = createNativeRoot(() => {});
  root.renderSync(<TabbedInstrument tab="lines" />);
  scrollBodyTo({ x: 0, y: 120 });
  root.renderSync(<TabbedInstrument tab="stations" />);
  const offset = body().props.offset;
  root.renderSync(null);
  assertEquals(offset, { x: 0, y: 0 });
});
