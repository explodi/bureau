import { assertEquals } from "@std/assert";
import {
  firstSelectable,
  lastSelectable,
  matchesAccelerator,
  mnemonicOf,
  nextSelectable,
  parseShortcut,
} from "./menu_keys.ts";

function stroke(
  code: string,
  modifiers: Partial<
    { control: boolean; meta: boolean; shift: boolean; alt: boolean }
  > = {},
) {
  return {
    code,
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...modifiers,
  };
}

Deno.test("mnemonicOf takes the first letter", () => {
  assertEquals(mnemonicOf("File"), "f");
});

Deno.test("mnemonicOf lowercases", () => {
  assertEquals(mnemonicOf("Edit"), "e");
});

Deno.test("mnemonicOf follows the translated label", () => {
  assertEquals(mnemonicOf("Archivo"), "a");
});

Deno.test("mnemonicOf has no mnemonic for a non-latin title", () => {
  assertEquals(mnemonicOf("ファイル"), null);
});

Deno.test("parseShortcut reads a letter accelerator", () => {
  assertEquals(parseShortcut("Ctrl+S"), {
    code: "KeyS",
    ctrl: true,
    shift: false,
    alt: false,
  });
});

Deno.test("parseShortcut reads a digit accelerator", () => {
  assertEquals(parseShortcut("Ctrl+1"), {
    code: "Digit1",
    ctrl: true,
    shift: false,
    alt: false,
  });
});

Deno.test("parseShortcut reads two modifiers", () => {
  assertEquals(parseShortcut("Ctrl+Shift+P"), {
    code: "KeyP",
    ctrl: true,
    shift: true,
    alt: false,
  });
});

Deno.test("parseShortcut rejects a function key", () => {
  assertEquals(parseShortcut("F1"), null);
});

Deno.test("parseShortcut rejects a named key", () => {
  assertEquals(parseShortcut("Ctrl+Enter"), null);
});

Deno.test("Ctrl+S matches a Ctrl+S stroke", () => {
  assertEquals(
    matchesAccelerator(
      parseShortcut("Ctrl+S")!,
      stroke("KeyS", { control: true }),
    ),
    true,
  );
});

Deno.test("Ctrl+S matches Cmd+S so macOS players get a save", () => {
  assertEquals(
    matchesAccelerator(
      parseShortcut("Ctrl+S")!,
      stroke("KeyS", { meta: true }),
    ),
    true,
  );
});

Deno.test("Ctrl+S does not match a bare S", () => {
  assertEquals(
    matchesAccelerator(parseShortcut("Ctrl+S")!, stroke("KeyS")),
    false,
  );
});

Deno.test("Ctrl+S does not match Ctrl+Shift+S, which is a dev hotkey", () => {
  assertEquals(
    matchesAccelerator(
      parseShortcut("Ctrl+S")!,
      stroke("KeyS", { control: true, shift: true }),
    ),
    false,
  );
});

Deno.test("Ctrl+S does not match another letter", () => {
  assertEquals(
    matchesAccelerator(
      parseShortcut("Ctrl+S")!,
      stroke("KeyZ", { control: true }),
    ),
    false,
  );
});

const rows = [{ label: "Save" }, {}, { label: "Print" }, { label: "Exit" }];

Deno.test("firstSelectable finds the first labelled row", () => {
  assertEquals(firstSelectable(rows), 0);
});

Deno.test("firstSelectable skips a leading separator", () => {
  assertEquals(firstSelectable([{}, { label: "Save" }]), 1);
});

Deno.test("lastSelectable finds the last labelled row", () => {
  assertEquals(lastSelectable(rows), 3);
});

Deno.test("lastSelectable skips a trailing separator", () => {
  assertEquals(lastSelectable([{ label: "Save" }, {}]), 0);
});

Deno.test("moving down skips a separator", () => {
  assertEquals(nextSelectable(rows, 0, 1), 2);
});

Deno.test("moving up skips a separator", () => {
  assertEquals(nextSelectable(rows, 2, -1), 0);
});

Deno.test("moving down past the end wraps to the first row", () => {
  assertEquals(nextSelectable(rows, 3, 1), 0);
});

Deno.test("moving up past the start wraps to the last row", () => {
  assertEquals(nextSelectable(rows, 0, -1), 3);
});

Deno.test("moving down from no highlight lands on the first row", () => {
  assertEquals(nextSelectable(rows, -1, 1), 0);
});

Deno.test("moving up from no highlight lands on the last row", () => {
  assertEquals(nextSelectable(rows, -1, -1), 3);
});
