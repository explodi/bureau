import { clientPath, isClientSource, lintScope } from "./bureau_lint_scope.ts";
import { BEVELS, type Look, LOOKS } from "./tokens.ts";

/**
 * A key's raised face says "press me" (the design system's R23), so only
 * something that presses wears it. The faces come from the token document:
 * every recipe drawn as the key's, and every look that wears one at rest.
 */
function linesOf(recipe: string): unknown {
  const lines = BEVELS[recipe as keyof typeof BEVELS];
  return typeof lines === "string" ? linesOf(lines) : lines;
}
const KEY_FACE = JSON.stringify(linesOf("raised"));
const KEY_RECIPES = new Set(
  Object.keys(BEVELS).filter((recipe) =>
    JSON.stringify(linesOf(recipe)) === KEY_FACE
  ),
);
const KEY_LOOKS = new Set(
  Object.entries(LOOKS as Record<string, Look>)
    .filter(([, look]) => KEY_RECIPES.has(String(look.rest.surface)))
    .map(([name]) => name),
);

/** The string an attribute is set to, when it is written as one. */
function stringValue(
  element: Deno.lint.JSXOpeningElement,
  name: string,
): string | undefined {
  for (const attribute of element.attributes) {
    if (attribute.type !== "JSXAttribute") continue;
    if (attribute.name.type !== "JSXIdentifier") continue;
    if (attribute.name.name !== name) continue;
    const value = attribute.value?.type === "JSXExpressionContainer"
      ? attribute.value.expression
      : attribute.value;
    return value?.type === "Literal" && typeof value.value === "string"
      ? value.value
      : undefined;
  }
  return undefined;
}

function hasAttribute(element: Deno.lint.JSXOpeningElement, name: string) {
  return element.attributes.some((attribute) =>
    attribute.type === "JSXAttribute" &&
    attribute.name.type === "JSXIdentifier" && attribute.name.name === name
  );
}

export const raisedRule: Deno.lint.Rule = {
  create(context) {
    const file = clientPath(context.filename);
    // The kit's keys are where the face is worn; the catalog shows it bare.
    const showsFaces = lintScope().showcases.some((place) => place.test(file));
    if (!isClientSource(file) || showsFaces) return {};
    return {
      JSXOpeningElement(node) {
        // A spread may carry the press; the rule reads what is written.
        const spreads = node.attributes.some((attribute) =>
          attribute.type === "JSXSpreadAttribute"
        );
        if (spreads) return;
        const keyRecipe = KEY_RECIPES.has(stringValue(node, "surface") ?? "");
        const keyLook = KEY_LOOKS.has(stringValue(node, "look") ?? "");
        const presses = hasAttribute(node, "onPress") ||
          hasAttribute(node, "onHoldChange");
        if (!(keyRecipe || keyLook) || presses) return;
        context.report({
          node,
          message: "A key's raised face on something that does not press.",
          hint:
            "Raised bevels are for controls: use a kit key, or a flat look such as a plate or a well.",
        });
      },
    };
  },
};
