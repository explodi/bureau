/**
 * The three states every program on the mayor's computer needs and none of them
 * shared: it has nothing to show, it could not fetch anything, or it is still
 * fetching.
 *
 * All three take their copy as `children` and an optional quieter second line
 * as `help`. That one decision is what made twelve hand-rolled renderings
 * collapse into three: GiftShop's designed error is a loud message plus a help
 * line, Census's empty is a heading plus a description, and the rest are a
 * single line — the same shape with `help` left off.
 *
 * Two shapes, not three. An EMPTY state is a centred column — icon over copy
 * over an action — because it stands in for a whole missing body. An ERROR is
 * a row with a tone tile at the left, because a failure has a severity and the
 * tile is what carries it. Loading borrows the empty state's column.
 *
 * The message is the loud line and the help is the quiet one. Weight is NOT
 * what separates them — bold is inert on the pixel faces — so the difference
 * is carried by size and ink.
 */
import React, { useContext } from "react";
import { Box, Image, type PixelSource, Text } from "bureau/primitives";
import { Icon, type Tone } from "./Bureau.tsx";
import { useFiguresWide } from "./figures_wide.ts";
import { InstrumentPlace } from "./instrument_place.ts";
import { TabbedGround } from "./window_ground.ts";

/**
 * Shown in place of a body that has no rows yet: a fresh city's census, a
 * sheet with no unlocked levers, a bank with no loans. Vertically centred,
 * because text that fills the body but is pinned to its top reads as a
 * layout bug.
 *
 * It paints no surface of its own, because in most of the places it stands,
 * the container already has a ground; one that replaces a framed table sits
 * in a <Well>.
 */
export function EmptyState(
  { icon, help, action, children }: {
    /** The message. Required, so the block can never render a blank line. */
    children: React.ReactNode;
    /** A picture over the copy: a <Icon>, at the message box's 32px,
     *  or the HUD's 48px in an instrument, read at map distance. */
    icon?: React.ReactNode;
    /** A quieter second line under the message. */
    help?: React.ReactNode;
    /** Usually a <Button> pointing at whatever would fill this body. */
    action?: React.ReactNode;
  },
) {
  const messageWidth = useFiguresWide("ui-18", 44);
  const helpWidth = useFiguresWide("ui-15-relaxed", 36);
  // A map instrument is read from further away: its picture is 48px.
  const place = useContext(InstrumentPlace);
  const inInstrument = place !== "none";
  const unsized = React.isValidElement<{ size?: number }>(icon) &&
    icon.type === Icon && icon.props.size === undefined;
  const picture = unsized
    ? React.cloneElement(icon, { size: inInstrument ? 48 : 32 })
    : icon;
  return (
    <Box
      direction="column"
      align="center"
      justify="center"
      gap={12}
      padding={24}
      grow={1}
      shrink={1}
      basis="auto"
      ink="ink-neutral"
    >
      {picture && <Box shrink={0} hidden>{picture}</Box>}
      {
        /* A centred column sizes its children to their measure, not to the
          body: the full width makes a long message wrap in a narrow one. */
      }
      <Box width="100%" maxWidth={messageWidth}>
        <Text typeStyle="ui-18" ink="ink" align="center">{children}</Text>
      </Box>
      {help && (
        <Box width="100%" maxWidth={helpWidth}>
          <Text typeStyle="ui-15-relaxed" align="center">{help}</Text>
        </Box>
      )}
      {action}
    </Box>
  );
}

/** The one place tone is visible: colour on the tile, never on the copy. */
const ERROR_TILES = {
  neutral: { fill: "fill-neutral", ink: "knockout-neutral" },
  good: { fill: "fill-good", ink: "knockout-good" },
  warn: { fill: "fill-warn", ink: "knockout-warn" },
  bad: { fill: "fill-bad", ink: "knockout-bad" },
} as const;

/**
 * A failure, with the severity carried by a coloured tile at the left, on
 * white paper cut into the chrome.
 *
 * Its role is `alert`: a load failure that swaps into the body tells a screen
 * reader at once.
 */
export function ErrorState(
  { icon = "!", tone = "bad", help, code, action, children }: {
    /** What failed. Required, so the block can never render a blank line. */
    children: React.ReactNode;
    /** The glyph or picture in the tone tile. Defaults to the era's "!". */
    icon?: React.ReactNode;
    tone?: Tone;
    /** A quieter second line — what the player can do about it. */
    help?: React.ReactNode;
    /** The machine's own words: a status code, a stack line. Set in mono. */
    code?: React.ReactNode;
    /** Usually a <Button> that retries. */
    action?: React.ReactNode;
  },
) {
  const tile = ERROR_TILES[tone];
  return (
    <Box
      look="well"
      ink="ink"
      align="center"
      gap={14}
      padding={[18, 16]}
    >
      <Box
        width={32}
        height={32}
        shrink={0}
        align="center"
        justify="center"
        surface="ink-ring"
        fill={tile.fill}
        ink={tile.ink}
        hidden
      >
        {typeof icon === "string"
          ? <Text typeStyle="mono-22-solid">{icon}</Text>
          : icon}
      </Box>
      <Box direction="column" grow={1} shrink={1} basis="auto" minWidth={0}>
        <Text typeStyle="ui-18">{children}</Text>
        {help && (
          <Box margin={[4, 0, 0, 0]}>
            <Text typeStyle="ui-15-relaxed" ink="ink-neutral">{help}</Text>
          </Box>
        )}
        {code && (
          <Box margin={[6, 0, 0, 0]}>
            <Text typeStyle="mono-14-solid" ink="dark">{code}</Text>
          </Box>
        )}
      </Box>
      {action && <Box shrink={0}>{action}</Box>}
    </Box>
  );
}

/**
 * The wait. Covers a program's body while its first fetch is in flight, on
 * the window's ground: chrome, or a tabbed window's darker step, so the window
 * does not change colour the moment the report lands.
 *
 * The copy is optional: silence is better than the wrong language, and the
 * hourglass says the same thing without words.
 */
export function LoadingState(
  { children, fill }: {
    children?: React.ReactNode;
    /** Take the rest of a flex column, so a reserved height stays centred. */
    fill?: boolean;
  },
) {
  const tabbed = useContext(TabbedGround);
  return (
    <Box
      busy
      direction="column"
      align="center"
      justify="center"
      gap={24}
      width="100%"
      height="100%"
      minHeight={200}
      padding={[60, 40]}
      fill={tabbed ? "notebook-ground" : "face"}
      ink="ink"
      grow={fill ? 1 : undefined}
      shrink={fill ? 1 : undefined}
      basis={fill ? "0%" : undefined}
    >
      <Image
        // The register's hourglass turns; its frames are the GIF's own.
        source={"/img/hourglass.gif" as PixelSource}
        width={48}
        height={48}
        hidden
      />
      {children && (
        <Text typeStyle="ui-18-solid" align="center">{children}</Text>
      )}
    </Box>
  );
}
