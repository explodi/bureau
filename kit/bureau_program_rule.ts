import { clientPath, isClientSource, lintScope } from "./bureau_lint_scope.ts";

/**
 * What the native type check cannot see in a client source: a comment that
 * switches it off, an element made by name, a prop it never checks, a
 * formatter Hermes lacks and an SVG data URL the native view cannot draw.
 */

/** The primitives, which make the native view's elements by name. */
const ELEMENT_FACTORIES = new Set(["createElement", "jsx", "jsxs", "jsxDEV"]);
const TYPE_ESCAPE = /@ts-(?:ignore|nocheck|expect-error)\b/;
const LOCALIZED_METHODS = new Set([
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
  "localeCompare",
  "toLocaleLowerCase",
  "toLocaleUpperCase",
]);
const HINTS: Record<string, string> = {
  "type-escape":
    "Fix the type: the gate checks the client without the DOM, and a directive hides what it would find.",
  "element": "Use Bureau primitives and the kit.",
  "hyphenated-prop":
    "TypeScript checks no hyphenated prop, so the native view never gets it; use the component's typed prop.",
  "intl":
    "Hermes has no Intl: format through the kit's i18n/format.ts and its peers.",
  "svg-reference":
    "The native view draws an SVG only from its file (an Image's .svg source), never a data URL.",
};

function propertyName(node: Deno.lint.MemberExpression): string {
  const property = node.property;
  if (!node.computed && property.type === "Identifier") return property.name;
  return property.type === "Literal" ? String(property.value) : "";
}

/** An element made by name: `createElement("div")`, `jsx("span")`. */
function makesElement(node: Deno.lint.CallExpression): boolean {
  const callee = node.callee;
  const name = callee.type === "Identifier"
    ? callee.name
    : callee.type === "MemberExpression"
    ? propertyName(callee)
    : "";
  const tag = node.arguments[0];
  const stringTag = tag?.type === "Literal" && typeof tag.value === "string";
  const templateTag = tag?.type === "TemplateLiteral";
  return ELEMENT_FACTORIES.has(name) && (stringTag || templateTag);
}

export const programRule: Deno.lint.Rule = {
  create(context) {
    const file = clientPath(context.filename);
    if (!isClientSource(file)) return {};
    const formats = lintScope().formatModules.has(file);

    function record(kind: string, at: Deno.lint.Node | Deno.lint.Range) {
      context.report({
        ...(Array.isArray(at) ? { range: at } : { node: at }),
        message: `Bureau ${kind}: the client runs only in Hermes.`,
        hint: HINTS[kind],
      });
    }

    function svgReferences(value: string, node: Deno.lint.Node) {
      for (const _match of value.matchAll(/image\/svg\+xml/gi)) {
        record("svg-reference", node);
      }
    }

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (TYPE_ESCAPE.test(comment.value)) {
            record("type-escape", comment.range);
          }
        }
      },
      JSXAttribute(node) {
        const name = node.name;
        if (name.type === "JSXIdentifier" && name.name.includes("-")) {
          record("hyphenated-prop", node);
        }
      },
      Literal(node) {
        if (typeof node.value === "string") svgReferences(node.value, node);
      },
      TemplateElement(node) {
        svgReferences(node.cooked, node);
      },
      Identifier(node) {
        if (formats || node.name !== "Intl") return;
        const parent = node.parent;
        const isMember = parent.type === "MemberExpression" &&
          parent.property === node && !parent.computed;
        const isKey = parent.type === "Property" && parent.key === node &&
          !parent.computed && !parent.shorthand;
        if (isMember || isKey) return;
        record("intl", node);
      },
      CallExpression(node) {
        if (
          file !== `${lintScope().kit}primitives/primitives.ts` &&
          makesElement(node)
        ) {
          record("element", node);
        }
        const callee = node.callee;
        if (formats || callee.type !== "MemberExpression") return;
        if (LOCALIZED_METHODS.has(propertyName(callee))) record("intl", node);
      },
      MemberExpression(node) {
        const object = node.object;
        const isGlobal = object.type === "Identifier" &&
          (object.name === "globalThis" || object.name === "window");
        if (formats || !isGlobal) return;
        if (propertyName(node) === "Intl") record("intl", node);
      },
    };
  },
};
