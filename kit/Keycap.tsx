import { InputGlyph, type InputGlyphSize } from "./InputGlyph.tsx";

/** Keyboard keys share the same dimensions and chrome as controller labels. */
export function Keycap({
  label,
  size = "hint",
  waiting,
  unbound,
}: {
  label: string;
  size?: Exclude<InputGlyphSize, "toolbar">;
  waiting?: boolean;
  unbound?: boolean;
}) {
  return (
    <InputGlyph
      glyph={{ kind: "keycap", label, name: label }}
      size={size}
      waiting={waiting}
      unbound={unbound}
    />
  );
}
