/**
 * The Bureau meter — every bar the mayor's computer draws, in one component.
 *
 * The register had ten of these and no two agreed: four track bevels, eight
 * heights, three fill inks, and clamping that ranged from both ends to neither.
 * Worse, the three shapes the kit's own progress bar could not express — a
 * two-sided bar, weighted bands, a track with markers posted on it — were each
 * hand-rolled by the window that needed them, which is why the power grid
 * carries four bars that look like nothing else in the game.
 *
 * The four modes below are those shapes, and they are the whole interface:
 *
 *   determinate  one fill, the plain quantity
 *   segmented    the fill divided into blocks — the chunked 3.x look when the
 *                blocks come from the value, weighted bands when the caller
 *                names them
 *   diverging    two quantities meeting at a divide (approve / disapprove)
 *   marked       a fill plus posts on the track: thresholds, goals, you-are-here
 *
 * Everything else is one prop: `tone` for a verdict, `fill` for a colour that
 * is data, `size` for the four heights the register uses, `label`/`readout` for
 * the head row, `hint` for the status-bar help this register uses instead of
 * tooltips. All the arithmetic lives in ./meter_math.ts, so no value reaching
 * a box here can be negative, past the end of the track, or NaN.
 *
 * The track is the register's sunken well on the chrome's own ground, and its
 * rail — inside the well's 3px gutter — is the one coordinate space for the
 * fills and the posts, so a post at 40% and a fill of 40% end at one pixel.
 */
import React, { createContext, useContext, useId } from "react";
import { Box, type Ink, Text } from "bureau/primitives";
import type { Tone } from "./Bureau.tsx";
import { useBoxHint } from "./bureau_status.ts";
import { bandFitsLabel, meterPercent, segmentWidths } from "./meter_math.ts";
import type { Recipe, ThemeInk, TypeStyleName } from "./tokens.ts";

export type MeterMode =
  | "determinate"
  | "segmented"
  | "diverging"
  | "marked";

/** 14px inline, 20px default, 28px for markers and bands, 48px for a headline. */
export type MeterSize = "small" | "medium" | "large" | "hero";

/** One weighted band of a segmented track. */
export type MeterSegment = {
  /** Relative size. Raw counts are fine — the bands are normalised together. */
  weight: number;
  /** Drawn inside the band when the band is wide enough to hold it. */
  label?: React.ReactNode;
  tone?: Tone;
  /** A colour that is data rather than a verdict — a census category, an
   *  energy bracket: a palette or role ink. */
  fill?: Ink;
};

/**
 * A post on the track. `threshold` is the value you are measured against,
 * `goal` the one you are aiming at, `current` where you stand right now.
 */
export type MeterMarker = {
  /** In the meter's own units, not percent. */
  at: number;
  /** Shown in the legend under the track. Without one the post is unexplained,
   *  so it is also what decides whether a legend is drawn at all. */
  label?: React.ReactNode;
  kind?: "threshold" | "goal" | "current";
};

type MeterProps = {
  /** In the meter's own units: a fraction by default, months or kWh if you
   *  move `min`/`max`. Held inside those bounds before it is drawn. */
  value: number;
  min?: number;
  max?: number;
  mode?: MeterMode;
  /** The fill's verdict colour. For a colour that is data, use `fill`. */
  tone?: Tone;
  size?: MeterSize;
  label?: React.ReactNode;
  /** The reading at the right of the head row: "3.4 of 6 months", "62%". */
  readout?: React.ReactNode;
  /** `segmented` only. Omit for the chunked look driven by `value`. */
  segments?: readonly MeterSegment[];
  /** `diverging` only: the opposing quantity. The two split the track between
   *  them, so raw counts and percentages both work. */
  counterValue?: number;
  counterTone?: Tone;
  /** `diverging` only: print each side's share inside its own fill. */
  showShares?: boolean;
  /** Posts on the track. They are drawn in every mode — `marked` is simply the
   *  name for a plain fill that carries them, and an import-tier track is
   *  `segmented` bands with a `current` post standing on top of them. */
  markers?: readonly MeterMarker[];
  /** A meter that has stopped advancing rather than one sitting at zero. */
  paused?: boolean;
  /**
   * `capacity`: filling up is pressure — beds, desks, a sector's headroom —
   * so the fill turns to the harm ink once it passes `warnAt`. A meter where
   * filling up is the point (a goal, a set of trophies) says `tone="good"`
   * and needs no variant.
   */
  variant?: "capacity";
  /** The fraction of the track past which a capacity meter reads as harm. */
  warnAt?: number;
  /**
   * Print the reading INSIDE the track, over the fill, instead of in a head
   * row. For a bar laid beside its label in a row of them, where a head row
   * would double the row's height.
   */
  readoutInside?: boolean;
  /** A colour that is data: a palette or role ink. */
  fill?: Ink;
  /**
   * `row` lays label, reading and track on one line, the label a third of the
   * row and the reading a fixed column, so a breakdown's rows align.
   * `split` sets the label and reading beside the track, three parts to two:
   * a progress line in a header.
   */
  layout?: "stacked" | "row" | "split";
  /** Status-bar help, shown while the meter is hovered or focused. */
  hint?: string;
};

const TRACK_HEIGHTS: Record<MeterSize, number> = {
  small: 14,
  medium: 20,
  large: 28,
  hero: 48,
};
/** The gutter between the well's bevel and the fill inside it. */
const TRACK_INSET = 3;

/**
 * The register's four verdict FILLS — a bar is a coloured area with type
 * over it, which is a fill's job, not an ink's — and the knockout legible on
 * each. The neutral pair is the default because a reading also overhangs the
 * empty track, and a caller's data colour names no knockout at all.
 */
const TONE_FILLS: Record<Tone, ThemeInk> = {
  neutral: "meter-ink",
  good: "fill-good",
  warn: "fill-warn",
  bad: "fill-bad",
};
const TONE_KNOCKOUTS: Record<Tone, ThemeInk> = {
  neutral: "knockout-neutral",
  good: "knockout-good",
  warn: "knockout-warn",
  bad: "knockout-bad",
};

type Post = "threshold" | "goal" | "current";
/**
 * Each post is a hairline plus its own opposite hairline, which keeps it
 * visible on top of a fill of any colour. "You are here" stands proud of the
 * rail, over the bevel, because it reads against the bands rather than as one
 * of them.
 */
const POSTS: Record<
  Post,
  { width: number; fill: ThemeInk; surface: Recipe; overhang: number }
> = {
  threshold: {
    width: 2,
    fill: "ink",
    surface: "meter-post-threshold",
    overhang: 0,
  },
  goal: { width: 3, fill: "goal", surface: "meter-post-goal", overhang: 0 },
  current: {
    width: 3,
    fill: "paper",
    surface: "ink-outline-thin",
    overhang: 4,
  },
};
const POST_KEYS: Record<Post, { fill: ThemeInk; surface: Recipe }> = {
  threshold: { fill: "ink", surface: "meter-key-threshold" },
  goal: { fill: "goal", surface: "meter-key-goal" },
  current: { fill: "paper", surface: "ink-outline-thin" },
};

/** A meter inside an inspector's well borrows that well's ground. */
export const MeterOnWell = createContext(false);

/** What every fill on one meter is drawn with. */
type FillContext = {
  paused: boolean;
  size: MeterSize;
  /** The meter's own data colour, or its tone's fill. */
  fill: Ink;
  knockout: ThemeInk;
};

export function Meter({
  value,
  min = 0,
  max = 1,
  mode = "determinate",
  tone = "neutral",
  size = "medium",
  label,
  readout,
  segments,
  counterValue = 0,
  counterTone = "bad",
  showShares = false,
  markers,
  paused = false,
  variant,
  warnAt = 0.8,
  readoutInside = false,
  fill,
  layout = "stacked",
  hint,
}: MeterProps) {
  const hintProps = useBoxHint(hint);
  const onWell = useContext(MeterOnWell);
  const labelId = useId();

  const percent = meterPercent(value, min, max);
  const legend = markers?.filter((marker) => marker.label !== undefined) ?? [];

  const isPastWarning = variant === "capacity" && percent / 100 > warnAt;
  const fillTone: Tone = isPastWarning ? "bad" : tone;
  const hasHead = label !== undefined ||
    (readout !== undefined && !readoutInside);
  const isRow = layout === "row";
  const isSplit = layout === "split";

  // A paused meter withholds the caller's data colour: frozen, it drains to
  // the disabled grey like every band on it.
  const fills: FillContext = {
    paused,
    size,
    fill: paused ? "ink-disabled" : fill ?? TONE_FILLS[fillTone],
    knockout: TONE_KNOCKOUTS[fillTone],
  };

  const labelNode = label !== undefined && (
    <MeterLabel id={labelId} paused={paused} layout={layout}>
      {label}
    </MeterLabel>
  );
  const readoutNode = readout !== undefined && !readoutInside && (
    <MeterReadout layout={layout}>{readout}</MeterReadout>
  );

  const track = (
    <Box
      role="progressbar"
      height={TRACK_HEIGHTS[size]}
      padding={TRACK_INSET}
      fill={onWell ? undefined : "meter-track"}
      look={onWell ? "meter-well" : undefined}
      surface={onWell ? undefined : "well"}
    >
      <Box grow={1} basis="auto">
        <MeterFills
          mode={mode}
          percent={percent}
          segments={segments}
          value={value}
          counterValue={counterValue}
          counterTone={counterTone}
          showShares={showShares}
          fills={fills}
        />
      </Box>
      {readout !== undefined && readoutInside && (
        <Box
          position="absolute"
          inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
          align="center"
          padding={[0, 0, 0, TRACK_INSET + 8]}
          passThrough
        >
          <Text
            typeStyle="ui-14-figures-solid"
            ink={fills.knockout}
            shadow={{ ink: "ink", offset: 1 }}
            nowrap
          >
            {readout}
          </Text>
        </Box>
      )}
      {markers?.map((marker, index) => (
        <MeterPost
          key={index}
          kind={marker.kind ?? "threshold"}
          percent={meterPercent(marker.at, min, max)}
        />
      ))}
    </Box>
  );

  const legendNode = legend.length > 0 && (
    <Box wrap gap={[6, 14]} ink="ink-neutral">
      {legend.map((marker, index) => {
        const key = POST_KEYS[marker.kind ?? "threshold"];
        return (
          <Box key={index} align="center" gap={5}>
            <Box
              width={10}
              height={3}
              shrink={0}
              fill={key.fill}
              surface={key.surface}
              hidden
            />
            <Text typeStyle="ui-14-solid">{marker.label}</Text>
          </Box>
        );
      })}
    </Box>
  );

  if (isRow) {
    return (
      <Box {...hintProps} align="center" gap={[6, 8]} ink="ink">
        {labelNode}
        {readoutNode}
        <Box direction="column" grow={1} basis={0}>{track}</Box>
        {legendNode}
      </Box>
    );
  }
  if (isSplit) {
    // Shares of the row after the gap, three parts to two: the track's
    // padding sits inside its share rather than adding to it.
    return (
      <Box {...hintProps} align="center" gap={12} ink="ink">
        <Box grow={3} basis={0} align="baseline" justify="between" gap={8}>
          {labelNode}
          {readoutNode}
        </Box>
        <Box direction="column" grow={2} basis={0}>{track}</Box>
      </Box>
    );
  }
  return (
    <Box {...hintProps} direction="column" gap={6} ink="ink">
      {hasHead && (
        <Box align="baseline" justify="between" gap={8}>
          {labelNode}
          {readoutNode}
        </Box>
      )}
      {track}
      {legendNode}
    </Box>
  );
}

/**
 * The label: ink black against the reading's grey, which is what makes it the
 * heading (the pixel faces have one weight). A paused meter's label wears the
 * emboss every dead control in Bureau wears.
 */
function MeterLabel(
  { id, paused, layout, children }: {
    id: string;
    paused: boolean;
    layout: "stacked" | "row" | "split";
    children: React.ReactNode;
  },
) {
  const isRow = layout === "row";
  const isSplit = layout === "split";
  const typeStyle: TypeStyleName = isSplit ? "ui-15-snug" : "ui-15-solid";
  const text = (
    <Text
      id={id}
      typeStyle={typeStyle}
      ink={paused ? "ink-disabled" : "ink"}
      shadow={paused ? { ink: "light", offset: 1 } : undefined}
      breakAnywhere={isRow}
      lines={isSplit ? 1 : undefined}
      ellipsis={isSplit}
    >
      {children}
    </Text>
  );
  if (isRow) {
    return <Box direction="column" basis="32%" grow={0} shrink={0}>{text}</Box>;
  }
  return <Box direction="column">{text}</Box>;
}

/**
 * The reading: tabular figures, so a reading that ticks must not reflow its
 * neighbours, kept at the right edge even when it is the only thing in the
 * row — a meter is often unlabelled inside a table that already names it.
 */
function MeterReadout(
  { layout, children }: {
    layout: "stacked" | "row" | "split";
    children: React.ReactNode;
  },
) {
  const isRow = layout === "row";
  const isSplit = layout === "split";
  return (
    <Box
      direction="column"
      margin={isRow ? 0 : [0, 0, 0, "auto"]}
      basis={isRow ? 44 : undefined}
      grow={isRow ? 0 : undefined}
      shrink={isRow || isSplit ? 0 : undefined}
    >
      <Text
        typeStyle={isSplit ? "ui-14-figures-snug" : "ui-14-figures-solid"}
        ink="ink-neutral"
        align="end"
        nowrap={isSplit}
      >
        {children}
      </Text>
    </Box>
  );
}

/**
 * A post centred ON its value rather than starting at it, so a post at 100%
 * points at the end of the track and not past it. It lies over the rail —
 * inside the well's gutter — and above the fills and the reading.
 */
function MeterPost({ kind, percent }: { kind: Post; percent: number }) {
  const post = POSTS[kind];
  return (
    <Box
      position="absolute"
      inset={{
        top: TRACK_INSET - post.overhang,
        bottom: TRACK_INSET - post.overhang,
        left: TRACK_INSET,
        right: TRACK_INSET,
      }}
      passThrough
      hidden
    >
      <Box width={`${percent}%`} shrink={0} />
      <Box
        width={post.width}
        shrink={0}
        margin={[0, 0, 0, -1]}
        fill={post.fill}
        surface={post.surface}
      />
    </Box>
  );
}

/**
 * What actually lies along the rail. Split out because the four modes are four
 * different sets of children, and a component that renders its own chrome AND
 * branches four ways inside it is the kind of thing nobody can hold in their
 * head at once.
 */
function MeterFills({
  mode,
  percent,
  segments,
  value,
  counterValue,
  counterTone,
  showShares,
  fills,
}: {
  mode: MeterMode;
  percent: number;
  segments?: readonly MeterSegment[];
  value: number;
  counterValue: number;
  counterTone: Tone;
  showShares: boolean;
  fills: FillContext;
}) {
  // The divide falls where the two quantities balance, so this branch works off
  // the raw pair rather than off `percent` — a diverging bar is always full,
  // and what moves is where the colours meet.
  if (mode === "diverging") {
    // The zero defaults are unreachable — two weights in, two widths out — and
    // are here only because indexed access is checked in this project.
    const [leadWidth = 0, counterWidth = 0] = segmentWidths([
      value,
      counterValue,
    ]);
    const counterFill: Ink = fills.paused
      ? "ink-disabled"
      : TONE_FILLS[counterTone];
    return (
      <>
        <Fill width={leadWidth} fill={fills.fill} justify="end">
          {showShares && bandFitsLabel(leadWidth) && (
            <FillLabel fills={fills} knockout={fills.knockout}>
              {Math.round(leadWidth)}%
            </FillLabel>
          )}
        </Fill>
        <Fill width={counterWidth} fill={counterFill} justify="start">
          {showShares && bandFitsLabel(counterWidth) && (
            <FillLabel fills={fills} knockout={TONE_KNOCKOUTS[counterTone]}>
              {Math.round(counterWidth)}%
            </FillLabel>
          )}
        </Fill>
      </>
    );
  }

  // Named bands are the only thing that can describe a track whose parts each
  // mean something — import tiers, the brackets of a stacked bar. The hairline
  // on a band's right edge is what separates it from the next.
  if (mode === "segmented" && segments) {
    const widths = segmentWidths(segments.map((segment) => segment.weight));
    return (
      <>
        {segments.map((segment, index) => {
          const width = widths[index] ?? 0;
          const toneFill = segment.tone ? TONE_FILLS[segment.tone] : undefined;
          const bandFill: Ink = fills.paused
            ? "ink-disabled"
            : segment.fill ?? toneFill ?? fills.fill;
          const knockout = segment.tone
            ? TONE_KNOCKOUTS[segment.tone]
            : fills.knockout;
          return (
            <Box
              key={index}
              width={`${width}%`}
              shrink={0}
              align="center"
              justify="center"
              overflow="hidden"
              fill={bandFill}
              surface="meter-band"
            >
              {segment.label !== undefined && bandFitsLabel(width) && (
                <FillLabel fills={fills} knockout={knockout}>
                  {segment.label}
                </FillLabel>
              )}
            </Box>
          );
        })}
      </>
    );
  }

  // Segmented with nobody naming the bands is the chunked 3.x look: 8px
  // blocks with the track showing through 2px between them, as many lit as
  // the value reaches.
  if (mode === "segmented") {
    return (
      <Fill width={percent} justify="start" stretch>
        {CHUNKS.map((index) => (
          <Box
            key={index}
            width={8}
            shrink={0}
            margin={[0, 2, 0, 0]}
            fill={fills.fill}
          />
        ))}
      </Fill>
    );
  }

  return <Fill width={percent} fill={fills.fill} justify="start" />;
}

/** Enough 10px blocks to cross the widest track the machine draws. */
const CHUNKS = Array.from({ length: 200 }, (_, index) => index);

function Fill(
  { width, fill, justify, stretch = false, children }: {
    width: number;
    fill?: Ink;
    justify: "start" | "end";
    /** Its children take the rail's height: the chunked fill's blocks. */
    stretch?: boolean;
    children?: React.ReactNode;
  },
) {
  return (
    <Box
      width={`${width}%`}
      shrink={0}
      align={stretch ? "stretch" : "center"}
      justify={justify}
      overflow="hidden"
      fill={fill}
    >
      {children}
    </Box>
  );
}

/**
 * Text drawn INSIDE a fill: the approval percentages, a bracket's name, in
 * the knockout its band is filled with and engraved with the register's hard
 * shadow so it survives the empty track too. Bands narrower than a tenth of
 * the track never get here (meter_math decides), and an ellipsis covers the
 * rest. The hero meter is the only one tall enough to grow its text.
 */
function FillLabel(
  { fills, knockout, children }: {
    fills: FillContext;
    knockout: ThemeInk;
    children: React.ReactNode;
  },
) {
  const isHero = fills.size === "hero";
  return (
    <Box
      direction="column"
      padding={[0, isHero ? 12 : 3]}
      overflow="hidden"
      minWidth={0}
    >
      <Text
        typeStyle={isHero ? "ui-18-solid" : "ui-15-solid"}
        ink={knockout}
        shadow={{ ink: "ink", offset: 1 }}
        lines={1}
        ellipsis
      >
        {children}
      </Text>
    </Box>
  );
}
