import {
  getGamepadOptions,
  subscribeGamepadOptions,
} from "./input/gamepadPreferences.ts";
import { useSyncExternalStore } from "react";
import { useTranslation } from "./i18n/i18n.ts";
import { type PadAction } from "bureau/pad_actions";
import { glyphsForAction } from "./input/pad_glyphs.ts";
import { useActiveGamepad, useHintDevice } from "./input/useGamepad.ts";
import {
  formatKeyCode,
  keyboardCodes,
  subscribeKeyboardPrompts,
} from "./input/keyboard_prompts.ts";
import {
  InputGlyph,
  type InputGlyphPart,
  type InputGlyphSize,
} from "./InputGlyph.tsx";

/** Resolves the binding each render; the kit owns how the result is drawn. */
export function InputPrompt({ action, size, device }: {
  action: PadAction;
  size?: InputGlyphSize;
  device?: "gamepad" | "keyboard";
}) {
  const { t } = useTranslation("controller");
  const pad = useActiveGamepad();
  const options = useSyncExternalStore(
    subscribeGamepadOptions,
    getGamepadOptions,
  );
  const hintDevice = useHintDevice();
  const keys = useSyncExternalStore(
    subscribeKeyboardPrompts,
    () => keyboardCodes(action).join("\n"),
  );
  // A connected pad keeps its glyphs: a key pressed for a moment must not
  // turn every prompt into the keycap of a different action.
  const followsPad = pad !== null || hintDevice === "gamepad";
  const followsKeyboard = device === "keyboard" ||
    (device === undefined && !followsPad);
  if (followsKeyboard && device === undefined && keys === "") return null;
  if (followsKeyboard) {
    const parts = keys.split("\n").filter(Boolean).map((
      code,
    ): InputGlyphPart => ({
      kind: "keycap",
      label: formatKeyCode(code),
      name: formatKeyCode(code),
    }));
    return (
      <InputGlyph
        glyph={parts.length
          ? parts
          : { kind: "keycap", label: t("unbound"), name: t("unbound") }}
        size={size}
        unbound={parts.length === 0}
      />
    );
  }

  const style = globalThis.__ALT_XINPUT_GLYPHS
    ? "numbered"
    : options.promptStyle;
  const resolved = glyphsForAction(action, pad, style, options.confirm)[0];
  const glyph = resolved ??
    { kind: "keycap" as const, label: t("unbound"), name: t("unbound") };
  const namedGlyph = {
    ...glyph,
    name: t(`controlNames.${glyph.name}`, { defaultValue: glyph.name }),
  };
  return (
    <InputGlyph
      glyph={namedGlyph}
      size={size}
      unbound={!resolved}
    />
  );
}
