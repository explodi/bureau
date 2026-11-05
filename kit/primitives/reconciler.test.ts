import { assertEquals } from "@std/assert";
import { createElement } from "react";
import { createNativeRoot, nativeNodes } from "./reconciler.ts";
import { type MutationStream, Op } from "./ops.ts";
import { Field, Scroll, Text } from "./primitives.ts";

const box = (props: Record<string, unknown>, ...children: unknown[]) =>
  createElement("bureau-box", props, ...(children as []));

Deno.test("React commits a literal tree as one native stream", () => {
  const commits: MutationStream[] = [];
  const root = createNativeRoot((stream) => commits.push(stream));
  root.renderSync(box({ fill: "db32-black" }, "Cash"));

  assertEquals(commits.length, 1);
  assertEquals(Array.from(commits[0]!.operations), [
    Op.Create,
    2,
    0,
    Op.Props,
    2,
    1,
    Op.Text,
    1,
    2,
    Op.Append,
    2,
    1,
    Op.Append,
    0,
    2,
  ]);
  assertEquals(commits[0]!.strings, [
    "bureau-box",
    '{"fill":"db32-black"}',
    "Cash",
  ]);
});

Deno.test("React sends only changed props and text on update", () => {
  const commits: MutationStream[] = [];
  const root = createNativeRoot((stream) => commits.push(stream));
  root.renderSync(box({ fill: "db32-black", grow: 1 }, "Cash"));
  root.renderSync(box({ fill: "db32-white", grow: 1 }, "Debt"));

  assertEquals(Array.from(commits[1]!.operations), [
    Op.Text,
    1,
    0,
    Op.Props,
    2,
    1,
  ]);
  assertEquals(commits[1]!.strings, [
    "Debt",
    '{"fill":"db32-white"}',
  ]);
});

Deno.test("removed nodes are destroyed and their ids are reused", () => {
  const commits: MutationStream[] = [];
  const root = createNativeRoot((stream) => commits.push(stream));
  root.renderSync(box({}, "Cash"));
  root.renderSync(null);
  root.renderSync(box({}, "Debt"));

  assertEquals(Array.from(commits[1]!.operations), [
    Op.Remove,
    0,
    2,
    Op.Destroy,
    1,
    Op.Destroy,
    2,
  ]);
  assertEquals(Array.from(commits[2]!.operations), [
    Op.Create,
    1,
    0,
    Op.Text,
    2,
    1,
    Op.Append,
    1,
    2,
    Op.Append,
    0,
    1,
  ]);
});

Deno.test("an event id calls its current JavaScript handler", () => {
  const presses: string[] = [];
  const root = createNativeRoot(() => {});
  root.renderSync(box({ onPress: () => presses.push("first") }));
  root.dispatch(1, "onPress");
  root.renderSync(box({ onPress: () => presses.push("second") }));
  root.dispatch(1, "onPress");
  root.renderSync(null);
  root.dispatch(1, "onPress");

  assertEquals(presses, ["first", "second"]);
});

Deno.test("a Scroll's header crosses as its first child, held at the top", () => {
  const commits: MutationStream[] = [];
  const root = createNativeRoot((stream) => commits.push(stream));
  root.renderSync(
    createElement(Scroll, { header: "Name", scrollbar: "reserved" }, "Row"),
  );

  assertEquals(commits[0]!.strings, [
    "bureau-scroll",
    '{"scrollbar":"reserved"}',
    "bureau-box",
    '{"direction":"column","shrink":0,"__scrollHeader":true}',
    "Name",
    "Row",
  ]);
  const scroll = nativeNodes().find((node) => node.type === "bureau-scroll")!;
  assertEquals(scroll.children.map((child) => child.type), [
    "bureau-box",
    "#text",
  ]);
});

Deno.test("a range Field crosses its value and bounds as given", () => {
  const commits: MutationStream[] = [];
  const root = createNativeRoot((stream) => commits.push(stream));
  root.renderSync(
    createElement(Field, {
      value: "0.7",
      kind: "range",
      min: 0,
      max: 1,
      step: 0.1,
    }),
  );

  assertEquals(commits[0]!.strings, [
    "bureau-field",
    '{"value":"0.7","kind":"range","min":0,"max":1,"step":0.1}',
  ]);
});

Deno.test("a fitted Text crosses its minimum size and complete label", () => {
  const commits: MutationStream[] = [];
  const root = createNativeRoot((stream) => commits.push(stream));
  root.renderSync(
    createElement(Text, {
      typeStyle: "ui-13-segment-solid",
      fit: { minSize: 10 },
    }, "Umweltverschmutzung"),
  );

  assertEquals(commits[0]!.strings, [
    "bureau-text",
    '{"typeStyle":"ui-13-segment-solid","fit":{"minSize":10}}',
    "Umweltverschmutzung",
  ]);
  root.renderSync(null);
});
