import { assertEquals } from "@std/assert";
import plugin from "./bureau_lint_plugin.ts";

function lint(source: string): string[] {
  return Deno.lint.runPlugin(plugin, "key.tsx", source).map((diagnostic) =>
    diagnostic.message
  );
}

const KIT_MODAL =
  "Use MessageBox for alerts or Dialog for program windows; the kit owns modal markup.";

Deno.test("alerts-use-bureau - a home-made error dialog", () => {
  assertEquals(lint('<Box role="alertdialog" />'), [KIT_MODAL]);
});

Deno.test("alerts-use-bureau - a home-made information modal", () => {
  assertEquals(lint('<Box role={"dialog"} />'), [KIT_MODAL]);
});

Deno.test("alerts-use-bureau - the shared alert", () => {
  assertEquals(lint('<MessageBox severity="error" />'), []);
});

Deno.test("alerts-use-bureau - modal markup belongs to the kit", () => {
  assertEquals(
    Deno.lint.runPlugin(
      plugin,
      "kit/MessageBox.tsx",
      '<Window role="dialog" />',
    ),
    [],
  );
});

function portable(source: string, file = "src/view.tsx"): string[] {
  return Deno.lint.runPlugin(plugin, file, source).map((diagnostic) =>
    diagnostic.message
  );
}

Deno.test("native-portable - an element made by name", () => {
  assertEquals(
    portable('createElement("div"); jsx(`h${level}`, {});'),
    [
      "Bureau element: the client runs only in Hermes.",
      "Bureau element: the client runs only in Hermes.",
    ],
  );
});

Deno.test("native-portable - a component made by call", () => {
  assertEquals(portable("createElement(Glyph, { button });"), []);
});

Deno.test("native-portable - the primitives make the native elements", () => {
  assertEquals(
    portable(
      'createElement("bureau-box", props);',
      "kit/primitives/primitives.ts",
    ),
    [],
  );
});

Deno.test("native-portable - hyphenated props on a kit component and a primitive", () => {
  assertEquals(
    portable('<><Button aria-disabled /><Box data-id="x" /></>'),
    [
      "Bureau hyphenated-prop: the client runs only in Hermes.",
      "Bureau hyphenated-prop: the client runs only in Hermes.",
    ],
  );
});

Deno.test("native-portable - a comment that switches the type check off", () => {
  assertEquals(
    portable(`
    // @ts-ignore: the gate would see this
    const a = 1;
    const prose = "@ts-ignore in a string is not a directive";
  `),
    ["Bureau type-escape: the client runs only in Hermes."],
  );
});

Deno.test("native-portable - formatting outside the formatters", () => {
  assertEquals(
    portable(`
    new Intl.NumberFormat();
    window["Intl"].DateTimeFormat();
    city.name.localeCompare(other.name);
    // Intl.NumberFormat in a comment
  `),
    [
      "Bureau intl: the client runs only in Hermes.",
      "Bureau intl: the client runs only in Hermes.",
      "Bureau intl: the client runs only in Hermes.",
    ],
  );
});

Deno.test("native-portable - the formatters may use Intl", () => {
  assertEquals(
    portable("new Intl.NumberFormat();", "bureau/kit/i18n/format.ts"),
    [],
  );
});

Deno.test("native-portable - an SVG file is a picture the view draws", () => {
  assertEquals(
    portable('const a = "/logo.svg"; const b = `/icons/${name}.svg`;'),
    [],
  );
});

Deno.test("native-portable - SVG data URLs, static and computed", () => {
  assertEquals(
    portable(
      'const a = "data:image/svg+xml;base64,AA"; const b = `data:image/svg+xml,${svg}`;',
    ),
    [
      "Bureau svg-reference: the client runs only in Hermes.",
      "Bureau svg-reference: the client runs only in Hermes.",
    ],
  );
});

Deno.test("native-portable - covers the client, not its tests or tools", () => {
  const element = 'createElement("div");';
  assertEquals(portable(element, "src/view.test.tsx"), []);
  assertEquals(portable(element, "tools/tool.ts"), []);
  assertEquals(portable(element, "website/src/view.tsx"), []);
  assertEquals(
    portable(element, new URL("../src/view.tsx", import.meta.url).pathname)
      .length,
    1,
  );
});

Deno.test("symbols-are-marks - a typed arrow beside a key's label", () => {
  assertEquals(lint(`<Button>◀ Back</Button>`), [
    `A typed "◀" on a Button's face.`,
  ]);
});

Deno.test("symbols-are-marks - a typed cross as a key's whole face", () => {
  assertEquals(lint(`<Button hint="Close">×</Button>`), [
    `A typed "×" on a Button's face.`,
  ]);
});

Deno.test("symbols-are-marks - a symbol in a string child", () => {
  assertEquals(lint(`<Button>{t("start")} {"▶"}</Button>`), [
    `A typed "▶" on a Button's face.`,
  ]);
});

Deno.test("symbols-are-marks - a symbol nested in a hold key's span", () => {
  assertEquals(
    lint(`<HoldButton><span>→</span></HoldButton>`),
    [`A typed "→" on a HoldButton's face.`],
  );
});

Deno.test("symbols-are-marks - a symbol in a segment's label", () => {
  assertEquals(
    lint(`<Segmented segments={[{ id: "a", label: "Name ▲" }]} />`),
    [`A typed "▲" on a Segmented's face.`],
  );
});

Deno.test("symbols-are-marks - a segmented control's hint may hold one", () => {
  assertEquals(
    lint(`<Segmented hint="Sort ↑" segments={[]} />`),
    [],
  );
});

Deno.test("symbols-are-marks - a key's own hint may hold one", () => {
  assertEquals(lint(`<Button hint="Next →" mark="right" />`), []);
});

Deno.test("symbols-are-marks - prose outside a key may hold one", () => {
  assertEquals(lint(`<p>read at a glance → dark instrument</p>`), []);
});

Deno.test("symbols-are-marks - a label's own punctuation passes", () => {
  assertEquals(lint(`<Button>Why this figure?</Button>`), []);
});
