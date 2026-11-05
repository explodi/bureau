/**
 * Which keys an action's on-screen prompt shows, as `KeyEvent.code`s. The kit
 * knows its own menu keys; a game with bindings hands it a source for the rest.
 */
import type { PadAction } from "bureau/pad_actions";

const MENU_KEYS: Partial<Record<string, readonly string[]>> = {
  menu_confirm: ["Enter"],
  menu_back: ["Escape"],
  menu_start: ["Escape"],
  menu_up: ["ArrowUp"],
  menu_down: ["ArrowDown"],
  menu_left: ["ArrowLeft"],
  menu_right: ["ArrowRight"],
  city_cancel: ["Escape"],
};

export interface KeyboardPromptSource {
  /** The action's keys, or nothing to fall back on the menu's. */
  codesOf(action: PadAction): readonly string[] | undefined;
  /** Hears the bindings change; answers how to stop. */
  subscribe(listener: () => void): () => void;
}

let source: KeyboardPromptSource | undefined;

export function setKeyboardPromptSource(next: KeyboardPromptSource): void {
  source = next;
}

export function keyboardCodes(action: PadAction): readonly string[] {
  return source?.codesOf(action) ?? MENU_KEYS[action] ?? [];
}

export function subscribeKeyboardPrompts(listener: () => void): () => void {
  return source?.subscribe(listener) ?? (() => {});
}

/**
 * The readable name of a `KeyEvent.code`: "Q", "Arrow Up". An unusual key (an
 * international layout, a function key) keeps its code.
 */
export function formatKeyCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code.startsWith("Mouse")) return `Mouse ${code.slice(5)}`;
  switch (code) {
    case "Space":
      return "Space";
    case "Enter":
      return "Enter";
    case "Tab":
      return "Tab";
    case "Backquote":
      return "`";
    case "Minus":
      return "-";
    case "Equal":
      return "=";
    case "BracketLeft":
      return "[";
    case "BracketRight":
      return "]";
    case "Backslash":
      return "\\";
    case "Semicolon":
      return ";";
    case "Quote":
      return "'";
    case "Comma":
      return ",";
    case "Period":
      return ".";
    case "Slash":
      return "/";
    default:
      return code;
  }
}
