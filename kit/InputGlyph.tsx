import { Fragment } from "react";
import {
  Box,
  Image,
  type PixelSource,
  Text,
  useInheritedTypeStyle,
} from "bureau/primitives";
import { INPUT_GLYPH_METRICS, TYPE_METRICS } from "./tokens.ts";

export type InputGlyphPart =
  | { kind: "image"; source: string; name: string }
  | { kind: "keycap"; label: string; name: string };

export type InputGlyphSize =
  | "toolbar"
  | "text"
  | "hint"
  | "legend"
  | "small"
  | "large";

/** One presentation for input symbols, text keys and chords, in copy or on a key. */
export function InputGlyph({
  glyph,
  size,
  waiting = false,
  unbound = false,
}: {
  glyph: InputGlyphPart | readonly InputGlyphPart[];
  size?: InputGlyphSize;
  waiting?: boolean;
  unbound?: boolean;
}) {
  const inherited = useInheritedTypeStyle();
  const metrics = INPUT_GLYPH_METRICS;
  const lineSize = TYPE_METRICS[inherited ?? "text-small"].size;
  const height = size
    ? metrics.sizes[size].height
    : lineSize * metrics.heightRatio;
  const labelSize = size
    ? metrics.sizes[size].label
    : lineSize * metrics.labelRatio;
  const labelStyle = unbound ? "keycap-large-unbound" : "keycap-large-sentence";
  const labelScale = labelSize / TYPE_METRICS[labelStyle].size;
  const parts: readonly InputGlyphPart[] = Array.isArray(glyph)
    ? glyph
    : [glyph as InputGlyphPart];
  const inline = inherited !== null;

  return (
    <Box
      inline={inline ? { align: "middle" } : undefined}
      align="center"
      gap={height * metrics.gapRatio}
      shrink={0}
      role="none"
      label={parts.map((part) => part.name).join(" + ")}
    >
      {parts.map((part, index) => (
        <Fragment key={`${index}:${part.name}`}>
          {index > 0 && (
            <Text typeStyle={labelStyle} scale={labelScale}>
              +
            </Text>
          )}
          {part.kind === "image"
            ? (
              <Image
                source={part.source as PixelSource}
                height={height}
                label={part.name}
              />
            )
            : (
              <Box
                look={unbound ? "keycap-unbound" : "keycap"}
                animation={waiting ? "bureau-keycap-blink" : undefined}
                align="center"
                justify="center"
                height={height}
                minWidth={height}
                padding={[0, height * metrics.paddingRatio]}
                label={part.name}
              >
                <Text typeStyle={labelStyle} scale={labelScale} nowrap>
                  {part.label}
                </Text>
              </Box>
            )}
        </Fragment>
      ))}
    </Box>
  );
}
