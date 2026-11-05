import { platformRule } from "./bureau_platform_rule.ts";
import { programRule } from "./bureau_program_rule.ts";
import { raisedRule } from "./bureau_raised_rule.ts";
import { clientPath, isClientSource, lintScope } from "./bureau_lint_scope.ts";

/**
 * Bureau's lint rules: the design decisions the types cannot see, checked
 * where the markup is written. deno.json loads this plugin, so the
 * editor, the pre-commit hook and CI all run it.
 */

/** The keys whose face a program writes as children. */
const KEYS = new Set(["Button", "HoldButton", "HudKey"]);

/**
 * Characters that draw a symbol rather than spell a word, in the order of the
 * ranges below: the × that stands in for a close cross, then the Unicode
 * blocks Arrows, Miscellaneous Technical (the media keys), Geometric Shapes
 * through Dingbats, the two Supplemental Arrows, Miscellaneous Symbols and
 * Arrows, and emoji.
 */
const SYMBOL = /[×←-⇿⌀-⏿■-➿⟰-⟿⤀-⥿⬀-⯿\u{1F300}-\u{1FAFF}]/u;

/**
 * The key whose face shows a piece of text, given the text's ancestors, or
 * null when the text is anywhere else: prose, or a prop value such as a key's
 * own hint. The one prop that is a face is a segmented control's
 * segments, whose labels its keys show.
 */
function keyShowing(ancestors: Deno.lint.Node[]): string | null {
  for (const parent of ancestors.toReversed()) {
    if (parent.type === "JSXSpreadAttribute") return null;
    if (parent.type === "JSXAttribute") {
      const element = parent.parent.name;
      const isSegments = parent.name.name === "segments" &&
        element.type === "JSXIdentifier" && element.name === "Segmented";
      return isSegments ? "Segmented" : null;
    }
    if (parent.type !== "JSXElement") continue;
    const name = parent.openingElement.name;
    if (name.type === "JSXIdentifier" && KEYS.has(name.name)) return name.name;
  }
  return null;
}

const plugin: Deno.lint.Plugin = {
  name: "bureau",
  rules: {
    "engine-services-use-platform": platformRule,
    "raised-faces-press": raisedRule,
    "native-portable": programRule,
    "controller-input-uses-actions": {
      create(context) {
        const file = clientPath(context.filename);
        const ownsPhysicalInput = lintScope().physicalInput.some((owner) =>
          owner.test(file)
        );
        if (!isClientSource(file) || ownsPhysicalInput) return {};
        return {
          Identifier(node) {
            if (node.name !== "GamepadButton") return;
            context.report({
              node,
              message:
                "Physical controller buttons belong in the input catalog and resolver.",
              hint:
                'Use a PadAction with useGamepadFrame and InputPrompt, for example "menu_confirm".',
            });
          },
        };
      },
    },
    // Hermes has no alert or confirm, so the type check owns those; a modal
    // role outside the kit is a home-made dialog.
    "alerts-use-bureau": {
      create(context) {
        const ownsModalMarkup = ["MessageBox", "Dialog", "SavingDialog"].some(
          (owner) =>
            clientPath(context.filename) ===
              `${lintScope().kit}${owner}.tsx`,
        );
        if (ownsModalMarkup) return {};
        return {
          JSXAttribute(node) {
            const value = node.value?.type === "JSXExpressionContainer"
              ? node.value.expression
              : node.value;
            const role = value?.type === "Literal" ? value.value : null;
            const isModalRole = node.name.name === "role" &&
              (role === "dialog" || role === "alertdialog");
            if (!isModalRole) return;
            context.report({
              node,
              message:
                "Use MessageBox for alerts or Dialog for program windows; the kit owns modal markup.",
            });
          },
        };
      },
    },
    // A symbol on a key is a mark, cut into the face in the CD player's inks.
    // A typed one is flat, a different shape on every platform, and ▶ is the
    // music player's play mark.
    "symbols-are-marks": {
      create(context) {
        function check(node: Deno.lint.Node, text: string) {
          const symbol = text.match(SYMBOL)?.[0];
          if (symbol === undefined) return;
          const key = keyShowing(context.sourceCode.getAncestors(node));
          if (key === null) return;
          context.report({
            node,
            message: `A typed "${symbol}" on a ${key}'s face.`,
            hint:
              'A symbol is a mark, as in <Button mark="right">; a picture is an icon among the children.',
          });
        }
        return {
          JSXText(node) {
            check(node, node.value);
          },
          Literal(node) {
            if (typeof node.value === "string") check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.cooked);
          },
        };
      },
    },
  },
};

export default plugin;
