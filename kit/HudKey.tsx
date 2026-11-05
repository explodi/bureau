/**
 * The HUD key: a 32–33px icon in a 44px key for speed, gifts, map layers
 * and the phone receiver at the corners of the city. Button
 * owns its bevel, translucent face and interaction states; this component
 * adds the picture and optional gamepad glyph.
 *
 * With a pad connected the host hands it the face button that fires it, and
 * the glyph floats above the key where the eye lands before the thumb moves.
 *
 * The keys sit in a <HudKeyRow>, one per corner. The row is pointer-
 * transparent so the gap between keys stays the map's; the keys themselves
 * take pointer events back.
 */
import React from "react";
import type { HostNode } from "bureau/host";
import type { PadAction } from "bureau/pad_actions";
import { InputPrompt } from "./InputPrompt.tsx";
import { Button, type ButtonProps } from "./Bureau.tsx";
import { ToolboxIcon } from "./ToolboxIcon.tsx";
import { CONTROL_METRICS } from "./tokens.ts";
import { Box, Image, Layer, type PixelSource, Text } from "bureau/primitives";

/** How far a corner's key stands in from the window's side. */
const HUD_CORNER_INSET = 6;

/** The room one corner key takes from the window's side: what a strip
 *  across the bottom, the toolbox's shelf, leaves it. */
export const HUD_CORNER_WIDTH = HUD_CORNER_INSET + CONTROL_METRICS.large.height;

/** A corner of the map: its keys centred 28px up, where the toolbox's tiles
 *  centre too. */
export function HudKeyRow(
  { side, children }: { side: "left" | "right"; children: React.ReactNode },
) {
  const anchor = side === "left"
    ? { kind: "screen" as const, bottom: 0, left: HUD_CORNER_INSET }
    : { kind: "screen" as const, bottom: 0, right: HUD_CORNER_INSET };
  return (
    <Layer anchor={anchor} stacking="hud" passThrough>
      <Box
        chrome="dark"
        align="center"
        height={56}
        gap={10}
        passThrough
      >
        {children}
      </Box>
    </Layer>
  );
}

export type HudKeyProps =
  & Omit<ButtonProps, "variant" | "size" | "mark">
  & {
    /** The key's picture. A toolbox pixel icon (`/toolbox/pixel/…`) draws as
     *  pixel art at 32px; any other picture is drawn at 33px. */
    icon: string;
    /** The face button that fires this key, shown above it while a pad is
     *  connected. Omit to show nothing. */
    glyph?: PadAction;
    /** The picture rattles, as a phone's receiver does while it rings. */
    ringing?: boolean;
  };

/** The picture keeps clear of the bevel; only the content moves when pressed. */
function HudKeyPicture(
  { icon, dead }: { icon: string; dead: boolean },
) {
  // A dead tool's picture is knocked out on the stipple, as every dead
  // picture on a key is.
  const toolArt = icon.startsWith("/toolbox/pixel/");
  if (toolArt && !dead) return <ToolboxIcon src={icon} shadow />;
  if (toolArt) {
    return (
      <Image
        source={icon as PixelSource}
        width={32}
        height={32}
        grayscale
        stipple
        hidden
      />
    );
  }
  return (
    <Image
      source={icon as PixelSource}
      width={33}
      height={33}
      contain
      grayscale={dead}
      stipple={dead}
      shadow={dead ? undefined : { ink: "db32-black", offset: 1 }}
      hidden
    />
  );
}

export const HudKey = React.forwardRef<HostNode, HudKeyProps>(
  function HudKey(
    { icon, glyph, ringing, tooltip, disabled, children, ...rest },
    ref,
  ) {
    const picture = <HudKeyPicture icon={icon} dead={Boolean(disabled)} />;
    return (
      <Button
        {...rest}
        ref={ref}
        disabled={disabled}
        // A dead key explains nothing, but still hides a hint it showed live.
        tooltipShows={!disabled}
        tooltip={tooltip}
        variant="hud"
        size="large"
        flush
      >
        {ringing ? <Box animation="bureau-ring">{picture}</Box> : picture}
        {glyph !== undefined && (
          // The pad glyph floats above the key, out of the picture's way.
          <Box
            position="absolute"
            inset={{ top: -18, left: 0, right: 0 }}
            justify="center"
            align="center"
            passThrough
            hidden
          >
            {/* Set in the key's 15px words, so its 1.1em is theirs. */}
            <Text typeStyle="ui-15-solid">
              <InputPrompt action={glyph} />
            </Text>
          </Box>
        )}
        {children}
      </Button>
    );
  },
);
