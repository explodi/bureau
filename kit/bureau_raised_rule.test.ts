import { assertEquals } from "@std/assert";
import { raisedRule } from "./bureau_raised_rule.ts";

function check(source: string, file = "src/Program.tsx") {
  return Deno.lint.runPlugin(
    { name: "bureau", rules: { "raised-faces-press": raisedRule } },
    file,
    source,
  ).map((diagnostic) => diagnostic.message);
}

const RAISED = "A key's raised face on something that does not press.";

Deno.test("raised faces - the key recipe on a box that does not press", () => {
  assertEquals(check('<Box surface="raised" padding={8} />'), [RAISED]);
});

Deno.test("raised faces - a key look on a box that does not press", () => {
  assertEquals(check('<Box look="key" />'), [RAISED]);
  assertEquals(check('<Box look={"card-key"} />'), [RAISED]);
});

Deno.test("raised faces - a box that presses or holds may wear one", () => {
  assertEquals(check('<Box look="key" onPress={open} />'), []);
  assertEquals(check('<Box surface="raised" onHoldChange={hold} />'), []);
});

Deno.test("raised faces - flat looks, and spreads that may carry the press", () => {
  assertEquals(check('<Box look="well" surface="plate" />'), []);
  assertEquals(check('<Box look="key" {...keyProps} />'), []);
});

Deno.test("raised faces - the kit's keys and the catalog's specimens", () => {
  assertEquals(
    check('<Box look="key" />', "bureau/kit/Bureau.tsx"),
    [],
  );
  assertEquals(
    check(
      '<Box surface="raised" />',
      "kit/Primitives.tsx",
    ),
    [],
  );
});
