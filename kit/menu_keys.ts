/*
 * The keyboard semantics of a Win95 menu bar, with no host in them, so they
 * can be tested directly (a .test.ts in this repo cannot import a .tsx).
 */

/**
 * Alt mnemonic for a menu title: its first letter, when that letter is a-z.
 * Titles are already translated when they reach us, so Spanish "Archivo" is
 * Alt+A — which is what the underline under its first character promises.
 * Non-latin titles have no mnemonic, and the underline is suppressed too.
 */
export function mnemonicOf(label: string): string | null {
  const first = label.trim().charAt(0).toLowerCase();
  return /^[a-z]$/.test(first) ? first : null;
}

export type Accelerator = {
  /** A KeyboardEvent.code, so the binding survives keyboard layouts. */
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
};

/**
 * "Ctrl+S", "Ctrl+Shift+P", "Ctrl+1" into something matchable. Letters and
 * digits only: the game binds F1-F12 behind nothing but a form-field check, so
 * a function-key accelerator would fight it.
 */
export function parseShortcut(shortcut: string): Accelerator | null {
  const parts = shortcut.split("+").map((part) => part.trim());
  const key = parts.pop() ?? "";
  const code = /^[a-z]$/i.test(key)
    ? `Key${key.toUpperCase()}`
    : /^[0-9]$/.test(key)
    ? `Digit${key}`
    : null;
  if (!code) return null;
  const has = (name: string) =>
    parts.some((part) => part.toLowerCase() === name);
  return { code, ctrl: has("ctrl"), shift: has("shift"), alt: has("alt") };
}

/** The pressed key, as much of one as an accelerator needs to compare against. */
export type KeyStroke = {
  code: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
};

export function matchesAccelerator(
  accelerator: Accelerator,
  stroke: KeyStroke,
): boolean {
  // Cmd counts as Ctrl: the menu prints "Ctrl+S" for period accuracy, but a
  // player on a Mac reaches for Cmd+S and should get a save, not a page save.
  const ctrlPressed = stroke.control || stroke.meta;
  return stroke.code === accelerator.code &&
    ctrlPressed === accelerator.ctrl &&
    stroke.shift === accelerator.shift &&
    stroke.alt === accelerator.alt;
}

/** Rows a highlight can land on. A row with no label is a separator. */
type Row = { label?: string };

export function firstSelectable(rows: readonly Row[]): number {
  const index = rows.findIndex((row) => row.label);
  return index < 0 ? 0 : index;
}

export function lastSelectable(rows: readonly Row[]): number {
  for (let index = rows.length - 1; index >= 0; index--) {
    if (rows[index]?.label) return index;
  }
  return 0;
}

/** The next labelled row in `delta`'s direction, wrapping and skipping rules. */
export function nextSelectable(
  rows: readonly Row[],
  from: number,
  delta: 1 | -1,
): number {
  const count = rows.length;
  if (count === 0) return 0;
  let index = from < 0 ? (delta === 1 ? -1 : 0) : from;
  for (let step = 1; step <= count; step++) {
    index = (index + delta + count) % count;
    if (rows[index]?.label) return index;
  }
  return from;
}
