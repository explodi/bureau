import {
  clientPath,
  isClientSource,
  isNativePlatform,
  lintScope,
} from "./bureau_lint_scope.ts";

/** The native program's engine gives these (bureau/src/js/host.cpp);
 * the platform wraps them, so programs can be tested on fake time. */
const ENGINE_SERVICES = new Set([
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
]);
const GLOBALS = new Set(["window", "globalThis", "self"]);

// Only the city host and the pad draw every frame (plan Z7); the UI moves
// through the kit's animations and Text's count, never a React render a frame.
function propertyName(node: Deno.lint.MemberExpression): string {
  const property = node.property;
  if (!node.computed && property.type === "Identifier") return property.name;
  return property.type === "Literal" ? String(property.value) : "";
}

function isPlatformFrame(node: Deno.lint.Node): boolean {
  return node.type === "MemberExpression" &&
    node.object.type === "Identifier" && node.object.name === "platform" &&
    propertyName(node) === "frame";
}

/** Whether an identifier reads the global of that name, not a property,
 * key, declaration or type of the same name. */
function readsGlobal(node: Deno.lint.Identifier): boolean {
  const parent = node.parent;
  if (parent.type.startsWith("TS") || parent.type.startsWith("Import")) {
    return false;
  }
  const isProperty = parent.type === "MemberExpression" &&
    parent.property === node;
  const isKey = parent.type === "Property" && parent.key === node &&
    !parent.shorthand;
  const isDeclared = (parent.type === "VariableDeclarator" ||
    parent.type === "FunctionDeclaration" ||
    parent.type === "FunctionExpression") && parent.id === node;
  const isMethod = parent.type === "MethodDefinition";
  return !isProperty && !isKey && !isDeclared && !isMethod;
}

export const platformRule: Deno.lint.Rule = {
  create(context) {
    const file = clientPath(context.filename);
    if (!isClientSource(file)) return {};
    const ownsFrames = lintScope().frameOwners.some((owner) =>
      owner.test(file)
    );
    const wrapsEngine = isNativePlatform(file);

    function reportEngineService(node: Deno.lint.Node, name: string) {
      if (wrapsEngine) return;
      context.report({
        node,
        message: `The engine's ${name} belongs behind the platform.`,
        hint: "Use platform.timers or platform.frame.",
      });
    }

    // A cast global object reaches any shell bridge past the type check,
    // whether used in place or through an alias.
    function reportCastGlobal(
      node: Deno.lint.Node,
      expression: Deno.lint.Node,
    ) {
      const isGlobal = expression.type === "Identifier" &&
        GLOBALS.has(expression.name);
      if (!isGlobal) return;
      context.report({
        node,
        message: `A cast ${expression.name} reaches past the platform.`,
        hint:
          "Add the service to the platform, or declare a developer hook's global with its type.",
      });
    }

    return {
      TSAsExpression(node) {
        reportCastGlobal(node, node.expression);
      },
      TSTypeAssertion(node) {
        reportCastGlobal(node, node.expression);
      },
      Identifier(node) {
        if (ENGINE_SERVICES.has(node.name) && readsGlobal(node)) {
          reportEngineService(node, node.name);
        }
      },
      MemberExpression(node) {
        const name = propertyName(node);
        const object = node.object;
        const isFrameLoop = isPlatformFrame(object) &&
          (name === "request" || name === "cancel");
        if (isFrameLoop && !ownsFrames) {
          context.report({
            node,
            message:
              `platform.frame.${name} belongs to the city host and the pad.`,
            hint:
              "Animate with the kit's animations or Text's count; wait for layout with host.afterLayout or a paint with platform.lifecycle.afterPaint.",
          });
          return;
        }
        const isGlobal = object.type === "Identifier" &&
          GLOBALS.has(object.name);
        if (isGlobal && ENGINE_SERVICES.has(name)) {
          reportEngineService(node, name);
        }
      },
    };
  },
};
