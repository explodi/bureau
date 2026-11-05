import { assertEquals } from "@std/assert";
import {
  isInstrumentViewPushed,
  registerInstrumentBack,
  stepBackInstrument,
} from "./instrument_stack.ts";

Deno.test("Esc with no instrument view pushed is left to the game", () => {
  assertEquals(stepBackInstrument(), false);
});

Deno.test("Esc pops the instrument that has a view pushed", () => {
  const pops: string[] = [];
  const unregister = registerInstrumentBack(() => pops.push("transport"));
  assertEquals(stepBackInstrument(), true);
  assertEquals(pops, ["transport"]);
  unregister();
});

Deno.test("Esc pops the latest instrument first", () => {
  const pops: string[] = [];
  const unregisterOuter = registerInstrumentBack(() => pops.push("outer"));
  const unregisterInner = registerInstrumentBack(() => pops.push("inner"));
  stepBackInstrument();
  assertEquals(pops, ["inner"]);
  unregisterInner();
  unregisterOuter();
});

Deno.test("an instrument back at its root no longer takes Esc", () => {
  const unregister = registerInstrumentBack(() => {});
  unregister();
  assertEquals(stepBackInstrument(), false);
});

Deno.test("an instrument with a view pushed holds the next Esc", () => {
  const unregister = registerInstrumentBack(() => {});
  assertEquals(isInstrumentViewPushed(), true);
  unregister();
});

Deno.test("with every instrument at its root, Esc is the city's again", () => {
  const unregister = registerInstrumentBack(() => {});
  unregister();
  assertEquals(isInstrumentViewPushed(), false);
});
