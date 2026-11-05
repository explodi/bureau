import {
  type Animation,
  Box,
  Image,
  type PixelSource,
} from "bureau/primitives";

interface ToolboxIconProps {
  /** The icon's pixel art, kept at four times its 32 art pixels:
   *  `/toolbox/pixel/<name>.png`. */
  src: string;
  /** UI pixels. 32, 64 and 96 show every art pixel exactly at 1× and 2×, 16 at 2× only. */
  size?: number;
  /** Drained of colour, for a thing switched off. */
  grayscale?: boolean;
  /** The one hard shadow NeXT's icons cast onto their tile. */
  shadow?: boolean;
  /** The chosen drawer tool's green outline. */
  outlined?: boolean;
  /** A tool behind a lock: washed out, over any other look. */
  locked?: boolean;
  /** A tool the city cannot use right now: faded. */
  faded?: boolean;
  /** The picture moves inside its key: a ringing receiver. */
  animation?: Animation;
}

/**
 * A toolbox icon drawn as pixel art, at a fixed UI size so it scales with the
 * UI like everything around it, centred in the room its key gives it. One
 * look at a time: locked, then grayscale, then the outline, then the shadow.
 */
export function ToolboxIcon(
  {
    src,
    size = 32,
    grayscale,
    shadow,
    outlined,
    locked,
    faded,
    animation,
  }: ToolboxIconProps,
) {
  const isGray = !locked && Boolean(grayscale);
  const isOutlined = !locked && !grayscale && Boolean(outlined);
  const hasShadow = !locked && !grayscale && !outlined && Boolean(shadow);
  // The picture is itself the box its key centres, as its pixels land on
  // whole device pixels only where it is placed directly.
  const picture = (
    <Image
      source={src as PixelSource}
      width={size}
      height={size}
      artScale={4}
      centered={!animation}
      opacity={faded ? 0.4 : undefined}
      washedOut={locked}
      grayscale={isGray}
      outline={isOutlined ? "db32-green-lime" : undefined}
      shadow={hasShadow ? { ink: "db32-black", offset: 1 } : undefined}
    />
  );
  if (!animation) return picture;
  return (
    <Box
      width={size}
      height={size}
      shrink={0}
      margin="auto"
      animation={animation}
    >
      {picture}
    </Box>
  );
}
