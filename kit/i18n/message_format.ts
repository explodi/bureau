import { formatNumber, type NumberFormatOptions } from "./format.ts";
import { PluralRules } from "./plural_rules.ts";

export type MessageValues = Readonly<Record<string, unknown>>;
type BlockKind = "select" | "plural" | "selectordinal";
type NumberStyle = "decimal" | "integer" | "percent" | "currency";

export type MessageNode =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "pound" }
  | { readonly kind: "argument"; readonly name: string }
  | {
    readonly kind: "number";
    readonly name: string;
    readonly style: NumberStyle;
  }
  | {
    readonly kind: BlockKind;
    readonly name: string;
    readonly offset: number;
    readonly cases: ReadonlyMap<string, readonly MessageNode[]>;
  };

export interface MessageFormatOptions {
  /** A missing translated plural category is untranslated, even with an `other`. */
  requirePluralCase?: boolean;
}

export class MessageSyntaxError extends Error {
  constructor(message: string, readonly position: number) {
    super(`${message} at position ${position}`);
    this.name = "MessageSyntaxError";
  }
}

const parsedMessages = new Map<string, readonly MessageNode[]>();
const argumentName = /^[\p{L}\p{N}_$]+$/u;
const selectKey = /^[\p{L}\p{N}_-]+$/u;
const exactKey = /^=-?[0-9]+(?:\.[0-9]+)?$/;
const pluralCategories = new Set([
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
]);

/** Strict ICU syntax: argument names, quoting and plural offsets. */
export function parseMessage(source: string): readonly MessageNode[] {
  const cached = parsedMessages.get(source);
  if (cached) return cached;
  let at = 0;

  function fail(message: string, position = at): never {
    throw new MessageSyntaxError(message, position);
  }

  function skipSpace(): void {
    while (at < source.length && /\s/.test(source[at]!)) at++;
  }

  function token(): string {
    const start = at;
    while (at < source.length && !",{}".includes(source[at]!)) at++;
    return source.slice(start, at).trim();
  }

  function readArgument(depth: number): MessageNode {
    const start = at++;
    const name = token();
    if (!argumentName.test(name)) fail("Invalid argument name", start);
    if (source[at] === "}") {
      at++;
      return { kind: "argument", name };
    }
    if (source[at++] !== ",") fail("Unclosed argument", start);
    const kind = token();
    if (kind === "number") {
      let style = "decimal";
      if (source[at] === ",") {
        at++;
        style = token();
      }
      if (!["decimal", "integer", "percent", "currency"].includes(style)) {
        fail("Unsupported number style; pass preformatted text", start);
      }
      if (source[at++] !== "}") fail("Unclosed number argument", start);
      return { kind, name, style: style as NumberStyle };
    }
    if (kind !== "select" && kind !== "plural" && kind !== "selectordinal") {
      fail(`Unsupported argument type ${kind}; pass preformatted text`, start);
    }
    if (source[at++] !== ",") fail("A block needs cases", start);
    skipSpace();
    let offset = 0;
    const isPlural = kind !== "select";
    if (isPlural) {
      const match = /^offset:\s*([0-9]+)/.exec(source.slice(at));
      if (match) {
        offset = Number(match[1]);
        at += match[0].length;
        if (!Number.isSafeInteger(offset)) fail("Invalid plural offset", start);
        skipSpace();
      }
    }
    const cases = new Map<string, readonly MessageNode[]>();
    while (at < source.length && source[at] !== "}") {
      const caseStart = at;
      const key = token();
      const validKey = isPlural
        ? pluralCategories.has(key) || exactKey.test(key)
        : selectKey.test(key);
      if (!validKey) fail("Invalid case key", caseStart);
      if (cases.has(key)) fail(`Duplicate case ${key}`, caseStart);
      if (source[at++] !== "{") fail("A case needs text in braces", caseStart);
      cases.set(key, readMessage(true, isPlural, depth + 1));
      if (source[at++] !== "}") fail("Unclosed case", caseStart);
      skipSpace();
    }
    if (source[at++] !== "}") fail("Unclosed block", start);
    if (!cases.has("other")) fail("A block needs an other case", start);
    return { kind, name, offset, cases };
  }

  function readMessage(
    nested: boolean,
    inPlural: boolean,
    depth: number,
  ): readonly MessageNode[] {
    if (depth > 100) fail("Message nesting is too deep");
    const nodes: MessageNode[] = [];
    let text = "";
    function flush(): void {
      if (text) nodes.push({ kind: "text", value: text });
      text = "";
    }
    while (at < source.length) {
      const char = source[at]!;
      if (char === "}") {
        if (!nested) fail("Unmatched closing brace");
        break;
      }
      if (char === "{") {
        flush();
        nodes.push(readArgument(depth));
        continue;
      }
      if (char === "#" && inPlural) {
        flush();
        nodes.push({ kind: "pound" });
        at++;
        continue;
      }
      const next = source[at + 1];
      if (char === "'" && next === "'") {
        text += "'";
        at += 2;
        continue;
      }
      const quoted = char === "'" &&
        (next === "{" || next === "}" || (next === "#" && inPlural));
      if (!quoted) {
        text += char;
        at++;
        continue;
      }
      // An unclosed apostrophe quote extends to the end, as in FormatJS.
      at++;
      while (at < source.length) {
        const quotedChar = source[at++];
        if (quotedChar !== "'") {
          text += quotedChar;
          continue;
        }
        if (source[at] !== "'") break;
        text += "'";
        at++;
      }
    }
    flush();
    return nodes;
  }

  const nodes = readMessage(false, false, 0);
  parsedMessages.set(source, nodes);
  return nodes;
}

const numberStyles: Record<NumberStyle, NumberFormatOptions> = {
  decimal: {},
  integer: { maximumFractionDigits: 0 },
  percent: { style: "percent" },
  currency: { style: "currency", currency: "USD" },
};

/** Values are inserted once, never parsed again as message syntax. */
export function formatMessage(
  source: string,
  values: MessageValues,
  language: string,
  options: MessageFormatOptions = {},
): string {
  function valueOf(name: string): unknown {
    if (!Object.hasOwn(values, name) || values[name] === undefined) {
      throw new Error(`Missing message argument: ${name}`);
    }
    return values[name];
  }

  function numberOf(name: string): number {
    return Number(valueOf(name));
  }

  function render(nodes: readonly MessageNode[], pound?: number): string {
    let text = "";
    for (const node of nodes) {
      if (node.kind === "text") {
        text += node.value;
      } else if (node.kind === "pound") {
        text += formatNumber(pound!, language);
      } else if (node.kind === "argument") {
        text += String(valueOf(node.name) ?? "");
      } else if (node.kind === "number") {
        text += formatNumber(
          numberOf(node.name),
          language,
          numberStyles[node.style],
        );
      } else if (node.kind === "select") {
        const value = Object.hasOwn(values, node.name)
          ? values[node.name]
          : undefined;
        const selected = value === undefined
          ? undefined
          : node.cases.get(String(value));
        text += render(selected ?? node.cases.get("other")!);
      } else {
        const value = numberOf(node.name);
        const adjusted = value - node.offset;
        let selected = node.cases.get(`=${value}`);
        if (!selected) {
          const type = node.kind === "plural" ? "cardinal" : "ordinal";
          const category = new PluralRules(language, { type }).select(adjusted);
          selected = node.cases.get(category);
          if (!selected && options.requirePluralCase) {
            throw new Error(`Missing plural case ${category} for ${node.name}`);
          }
        }
        text += render(selected ?? node.cases.get("other")!, adjusted);
      }
    }
    return text;
  }

  return render(parseMessage(source));
}

export interface MessageArgument {
  name: string;
  kind: "argument" | "number" | BlockKind;
  cases?: readonly string[];
}

/** Includes arguments in every branch, for catalog checks and sample renders. */
export function messageArguments(source: string): MessageArgument[] {
  const argumentsFound: MessageArgument[] = [];
  function visit(nodes: readonly MessageNode[]): void {
    for (const node of nodes) {
      if (node.kind === "text" || node.kind === "pound") continue;
      if (node.kind === "argument" || node.kind === "number") {
        argumentsFound.push({ name: node.name, kind: node.kind });
        continue;
      }
      argumentsFound.push({
        name: node.name,
        kind: node.kind,
        cases: [...node.cases.keys()],
      });
      for (const branch of node.cases.values()) visit(branch);
    }
  }
  visit(parseMessage(source));
  return argumentsFound;
}
