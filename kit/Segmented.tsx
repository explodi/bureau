import { CONTROL_METRICS, SEGMENT_METRICS } from "./tokens.ts";
/**
 * Segmented — OPENSTEP's radio matrix: one of N, drawn as equal keys
 * in a sunken track with the chosen one raised. An instrument renders it
 * between its header and its body (outside the body, so it never scrolls
 * away) to swap the sub-views of one map overlay — crime / patrol.
 *
 * WHY not <Tabs>: a notebook's strip cycles on LB/RB, and on the map
 * the bumpers cycle the map layers. In an instrument the strip turns on the
 * D-pad's left and right instead (the map standard, instrument_pad.ts),
 * wrapping, with their glyphs at its two ends; it needs no prop for it.
 */

import type React from "react";
import { useContext } from "react";
import { playKitSound } from "./sounds.ts";
import {
  useGamepad,
  useGamepadFrame,
  useHintDevice,
} from "./input/useGamepad.ts";
import { InputPrompt } from "./InputPrompt.tsx";
import { INSTRUMENT_PAD_PRIORITY } from "./instrument_pad.ts";
import { InstrumentPlace } from "./instrument_place.ts";
import { Box, Text } from "bureau/primitives";
import { Mark, type MarkName } from "./Mark.tsx";

/** 0.4em of the 13px label, less the 4px of air in the mark's box. */
const MARK_GAP = 0.4 * 13 - 4;

export type Segment<Id extends string> = {
  id: Id;
  label: React.ReactNode;
  /** The mark cut beside the label: a sort key's direction. */
  mark?: MarkName;
};

type SegmentedProps<Id extends string> = {
  segments: ReadonlyArray<Segment<Id>>;
  activeId: Id;
  onSelect: (id: Id) => void;
  /** Lets the parent hand the pad elsewhere (e.g. while a dialog is up). */
  gamepadEnabled?: boolean;
  /** False when the parent turns the keys from pad buttons of its own (LB/RB
   *  in Load City): the D-pad walk then skips them rather than stopping on a
   *  control the bumpers already drive. */
  padNavigable?: boolean;
  /** Spans the row it stands in, without the strip's own margins. */
  fill?: true;
};

export function Segmented<Id extends string>(
  {
    segments,
    activeId,
    onSelect,
    gamepadEnabled = true,
    padNavigable = true,
    fill,
  }: SegmentedProps<Id>,
) {
  const { connected: gamepadConnected } = useGamepad();
  const inputMode = useHintDevice();
  const showGamepadHints = inputMode === "gamepad";

  // Single activation path for mouse and pad, so the select beat sounds on
  // every actual view switch regardless of input device (feedback="none"
  // on the keys suppresses the delegated neutral click so the two don't stack).
  const activate = (id: Id) => {
    if (id !== activeId) playKitSound("select");
    onSelect(id);
  };

  const step = (by: number) => {
    const activeIndex = segments.findIndex((seg) => seg.id === activeId);
    const count = segments.length;
    const next = segments[(activeIndex + by + count) % count];
    if (next) activate(next.id);
  };
  const place = useContext(InstrumentPlace);
  const inInstrument = place !== "none";

  useGamepadFrame(
    (input) => {
      if (!gamepadEnabled || !input.connected) return;
      if (input.wasPressed("map_left")) step(-1);
      if (input.wasPressed("map_right")) step(1);
    },
    { priority: INSTRUMENT_PAD_PRIORITY, enabled: inInstrument },
  );

  const showEndGlyphs = inInstrument && showGamepadHints;
  const skippedByPad = gamepadConnected && !padNavigable;

  return (
    <Box
      look="segment-track"
      padding={2}
      margin={fill ? 0 : [inInstrument ? SEGMENT_METRICS.margin : 10, 12]}
      grow={fill ? 1 : undefined}
      shrink={0}
    >
      {segments.map((segment, index) => {
        const isActive = segment.id === activeId;
        const label = typeof segment.label === "string"
          ? (
            <Text
              typeStyle="ui-13-segment-solid"
              fit={{ minSize: 10 }}
              align="center"
            >
              {segment.label}
            </Text>
          )
          : segment.label;
        return (
          <Box
            key={segment.id}
            label={typeof segment.label === "string"
              ? segment.label
              : undefined}
            selected={isActive}
            look="segment"
            feedback="none"
            tabStop={!skippedByPad}
            onPress={() => activate(segment.id)}
            grow={1}
            shrink={1}
            basis="0%"
            align="center"
            justify="center"
            // A mark stands its 0.4em from the label, less its box's air.
            gap={segment.mark ? MARK_GAP : 6}
            minHeight={inInstrument
              ? SEGMENT_METRICS.height - 4
              : CONTROL_METRICS.standard.height}
            hitSlop={inInstrument ? SEGMENT_METRICS.hitSlop : undefined}
            minWidth={CONTROL_METRICS.standard.height}
            padding={[6, 8]}
          >
            {showEndGlyphs && index === 0 && <InputPrompt action="map_left" />}
            {label}
            {segment.mark && <Mark mark={segment.mark} />}
            {showEndGlyphs && index === segments.length - 1 && (
              <InputPrompt action="map_right" />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
