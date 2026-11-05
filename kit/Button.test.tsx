import { assertEquals } from "@std/assert";
import type { ReactNode } from "react";
import type { PlotCommand } from "bureau/primitives";
import { Button, Icon } from "./Bureau.tsx";
import { InputPrompt } from "./InputPrompt.tsx";
import {
  createNativeRoot,
  type NativeNode,
  nativeNodes,
} from "./primitives/reconciler.ts";

function drawn<T>(element: ReactNode, read: (nodes: NativeNode[]) => T): T {
  const root = createNativeRoot(() => {});
  root.renderSync(element);
  const result = read([...nativeNodes()]);
  root.renderSync(null);
  return result;
}

Deno.test("a small destructive mark has a 33px face and an expanded hit area", () => {
  assertEquals(
    drawn(
      <Button size="small" variant="danger" mark="minus" />,
      (nodes) => {
        const button = nodes.find((node) => node.props.role === "button");
        const commands = nodes.find((node) => node.type === "bureau-plot")
          ?.props
          .commands as PlotCommand[] | undefined;
        const art = commands?.[0];
        return {
          width: button?.props.width,
          height: button?.props.height,
          hitSlop: button?.props.hitSlop,
          look: button?.props.look,
          art: art?.kind,
          floor: art?.kind === "engraving" ? art.floor : undefined,
          pictures: nodes.filter((node) => node.type === "bureau-image").length,
        };
      },
    ),
    {
      width: 33,
      height: 33,
      hitSlop: 2,
      look: "key-danger",
      art: "engraving",
      floor: "engraving-danger-floor",
      pictures: 0,
    },
  );
});

Deno.test("replacing a small destructive mark with a pad glyph keeps its square", () => {
  assertEquals(
    drawn(
      <Button size="small" variant="danger">
        <InputPrompt action="panel_secondary" device="gamepad" />
      </Button>,
      (nodes) => {
        const button = nodes.find((node) => node.props.role === "button");
        return {
          width: button?.props.width,
          height: button?.props.height,
          look: button?.props.look,
          glyph: nodes.find((node) => node.type === "bureau-image")?.props
            .source,
        };
      },
    ),
    {
      width: 33,
      height: 33,
      look: "key-danger",
      glyph: "/icons/controller-xbox-x.png",
    },
  );
});

Deno.test("compact mark keys are 28px and standard mark keys are 33px", () => {
  assertEquals(
    drawn(
      <>
        <Button id="compact" size="compact" mark="close" />
        <Button id="standard" mark="close" />
      </>,
      (nodes) => ({
        compact: nodes.find((node) => node.props.id === "compact")?.props.width,
        standard: nodes.find((node) => node.props.id === "standard")?.props
          .width,
      }),
    ),
    { compact: 28, standard: 33 },
  );
});

Deno.test("a bad label tone keeps an ordinary face rather than a destructive face", () => {
  assertEquals(
    drawn(
      <Button tone="bad">Review warning</Button>,
      (nodes) => nodes.find((node) => node.props.role === "button")?.props.look,
    ),
    "key-bad",
  );
});

Deno.test("a disabled danger mark returns to the neutral engraving material", () => {
  assertEquals(
    drawn(
      <Button variant="danger" mark="close" disabled />,
      (nodes) => {
        const commands = nodes.find((node) => node.type === "bureau-plot")
          ?.props.commands as PlotCommand[] | undefined;
        const art = commands?.[0];
        return art?.kind === "engraving"
          ? [art.shadow, art.floor, art.lit]
          : undefined;
      },
    ),
    ["engraving-disabled", "engraving-disabled", "engraving-lit"],
  );
});

Deno.test("a good key cuts its mark in the good tone's green", () => {
  assertEquals(
    drawn(
      <Button variant="hud" tone="good" mark="hammer" />,
      (nodes) => {
        const commands = nodes.find((node) => node.type === "bureau-plot")
          ?.props.commands as PlotCommand[] | undefined;
        const art = commands?.[0];
        return art?.kind === "engraving"
          ? [art.shadow, art.floor, art.lit]
          : undefined;
      },
    ),
    ["engraving-good-shadow", "engraving-good-floor", "engraving-good-lit"],
  );
});

Deno.test("a disabled good mark returns to the neutral engraving material", () => {
  assertEquals(
    drawn(
      <Button variant="hud" tone="good" mark="hammer" disabled />,
      (nodes) => {
        const commands = nodes.find((node) => node.type === "bureau-plot")
          ?.props.commands as PlotCommand[] | undefined;
        const art = commands?.[0];
        return art?.kind === "engraving"
          ? [art.shadow, art.floor, art.lit]
          : undefined;
      },
    ),
    ["engraving-disabled", "engraving-disabled", "engraving-lit"],
  );
});

function buttonBox(element: ReactNode) {
  return drawn(element, (nodes) => {
    const button = nodes.find((node) => node.props.role === "button");
    return { width: button?.props.width, gap: button?.props.gap };
  });
}

Deno.test("a mark beside a pad glyph widens the key and stands a glyph's gap away", () => {
  assertEquals(
    buttonBox(
      <Button mark="left">
        <InputPrompt action="menu_tab_previous" device="gamepad" />
      </Button>,
    ),
    { width: undefined, gap: 7.5 },
  );
});

Deno.test("a mark alone keeps its square key", () => {
  assertEquals(buttonBox(<Button mark="left" />), {
    width: 33,
    gap: undefined,
  });
});

Deno.test("a pad glyph stands a glyph's gap from its word", () => {
  assertEquals(
    buttonBox(
      <Button>
        <InputPrompt action="menu_back" device="gamepad" />
        Back
      </Button>,
    ),
    { width: undefined, gap: 7.5 },
  );
});

Deno.test("a pad glyph in a fragment stands a glyph's gap from its word", () => {
  // The fragment is the case under test: a caller's glyph wrapped with a space.
  const glyphAndSpace = (
    <>
      <InputPrompt action="menu_back" device="gamepad" />
      {" "}
    </>
  );
  assertEquals(
    buttonBox(<Button>{glyphAndSpace}Back</Button>),
    { width: undefined, gap: 7.5 },
  );
});

Deno.test("a toolbar key reserves 20px for whole-pixel art inside its 33px face", () => {
  assertEquals(
    drawn(
      <Button variant="toolbar">
        <Icon name="printer" />
      </Button>,
      (nodes) => {
        const button = nodes.find((node) => node.props.role === "button");
        const icon = nodes.find((node) => node.type === "bureau-image");
        return {
          width: button?.props.width,
          height: button?.props.height,
          iconWidth: icon?.props.width,
          iconHeight: icon?.props.height,
          integerScale: icon?.props.integerScale,
        };
      },
    ),
    {
      width: 33,
      height: 33,
      iconWidth: 20,
      iconHeight: 20,
      integerScale: true,
    },
  );
});
