/**
 * TouchDrawer — the dock's drawer for a finger. A tooltip is read by
 * hovering, and a finger never hovers, so a drawer opened by touch takes the
 * dock's place and shows one of its tools at a time, with everything the
 * tooltip would have said printed in the open: the tool's name, its copy
 * across the page and its figures under it. The tool's picture is the key
 * that takes it, the biggest key on the page.
 *
 * The arrow keys either side step through the tools. A drawer that files its
 * tools under sections wears them as folder tabs, and the arrows step through
 * the open tab's tools alone.
 */

import type React from "react";
import { Box, Text } from "bureau/primitives";
import { useTranslation } from "./i18n/i18n.ts";
import { Button, CloseButton } from "./Bureau.tsx";
import { type Tab, Tabs } from "./Tabs.tsx";

/** The drawer's id: what a tutor's bubble keeps clear of. */
export const TOUCH_DRAWER_ID = "touch-drawer";

/** As wide as a phone held sideways leaves between its corner keys. */
export const TOUCH_DRAWER_MAX_WIDTH = 720;

/** The page's inset, and the air between its columns. */
const PAGE_INSET = 8;
const COLUMN_GAP = 10;
/** The picture's key: 96px of art, three screen pixels to each of its own,
 *  and the key's face round it. */
const PICTURE_KEY_SIZE = 96 + 2 * 8;
/** The figures' column: room for a card row's longest label beside its
 *  figure, and no wider, so the two still read as one line. */
const FIGURES_WIDTH = 340;
/** A drawer key's edge, and the compact close key's hit area. */
const KEY_SIZE = 44;
const CLOSE_SIZE = 36;
/** Tall enough that the close key clears the arrow centred under it. */
const PAGE_MIN_HEIGHT = 2 * (CLOSE_SIZE + 6) + KEY_SIZE;
/** How far an arrow stands off the page's foot: centred in the shortest
 *  page, and no higher in a taller one, so it holds still under a thumb
 *  that steps through pages of different heights. */
const ARROW_LIFT = (PAGE_MIN_HEIGHT - KEY_SIZE) / 2;

/** The tool on show's place among the tools its arrows step through. */
export interface TouchDrawerPlace {
  /** From 0. */
  index: number;
  count: number;
}

export function TouchDrawer<TabId extends string>(
  {
    title,
    tabs = [],
    activeTab,
    onSelectTab,
    name,
    picture,
    place,
    onStep,
    figures,
    onTake,
    withheld = false,
    onClose,
    children,
  }: {
    /** The drawer's name, for the node tree. */
    title: string;
    /** The drawer's sections; fewer than two draw no strip. */
    tabs?: readonly Tab<TabId>[];
    activeTab?: TabId;
    onSelectTab?: (id: TabId) => void;
    /** The tool on show: its name and its picture, with any badge it wears. */
    name: React.ReactNode;
    picture: React.ReactNode;
    /** The picture pressed: the tool is taken. */
    onTake: () => void;
    /** The city may not take the tool yet: its picture stands dead. */
    withheld?: boolean;
    place: TouchDrawerPlace;
    /** Back or forward one tool, round the ends. */
    onStep: (direction: -1 | 1) => void;
    /** The tool's rows of figures, set under its copy. */
    figures?: React.ReactNode;
    onClose: () => void;
    /** The tool's copy, a line each: what it is, and what the player
     *  should know of it. */
    children?: React.ReactNode;
  },
) {
  const { t } = useTranslation("common");
  const filed = tabs.length > 1 && activeTab !== undefined;
  const steps = place.count > 1;

  return (
    <Box
      id={TOUCH_DRAWER_ID}
      label={title}
      direction="column"
      grow={1}
      shrink={1}
      minWidth={0}
    >
      {filed && (
        <Box padding={[0, PAGE_INSET]}>
          <Tabs
            id="touch-drawer-tabs"
            ground="paper"
            tabs={tabs}
            activeId={activeTab}
            onSelect={(id) => onSelectTab?.(id)}
          />
        </Box>
      )}
      <Box
        id="touch-drawer-page"
        // An instrument's ground, as the tool's card wears: paper in a frame.
        // The keys on it are the only raised faces.
        fill="paper"
        surface="frame"
        ink="ink"
        padding={PAGE_INSET}
        gap={COLUMN_GAP}
        align="center"
        minHeight={PAGE_MIN_HEIGHT + 2 * PAGE_INSET}
      >
        <Box alignSelf="end" shrink={0} padding={[0, 0, ARROW_LIFT, 0]}>
          <Button
            id="touch-drawer-back"
            variant="drawer"
            mark="left"
            disabled={!steps}
            onPress={() => onStep(-1)}
          />
        </Box>
        <Button
          id="touch-drawer-take"
          variant="drawer"
          layout={{
            width: PICTURE_KEY_SIZE,
            height: PICTURE_KEY_SIZE,
            minHeight: PICTURE_KEY_SIZE,
            shrink: 0,
          }}
          disabled={withheld}
          onPress={onTake}
        >
          {picture}
        </Button>
        <Box
          direction="column"
          grow={1}
          shrink={1}
          basis={0}
          minWidth={0}
          alignSelf="stretch"
          gap={6}
        >
          <Box align="baseline" gap={COLUMN_GAP}>
            <Box direction="column" grow={1} shrink={1} minWidth={0}>
              <Text typeStyle="text">{name}</Text>
            </Box>
            {steps && (
              <Text typeStyle="ui-12-caption" ink="ink-neutral" nowrap>
                {`${place.index + 1} / ${place.count}`}
              </Text>
            )}
          </Box>
          {children && (
            <Box direction="column" gap={4} typeStyle="text-chrome">
              {children}
            </Box>
          )}
          {figures && (
            <Box
              id="touch-drawer-figures"
              direction="column"
              width={FIGURES_WIDTH}
              shrink={1}
              minWidth={0}
            >
              {figures}
            </Box>
          )}
        </Box>
        <Box alignSelf="end" shrink={0} padding={[0, 0, ARROW_LIFT, 0]}>
          <Button
            id="touch-drawer-forward"
            variant="drawer"
            mark="right"
            disabled={!steps}
            onPress={() => onStep(1)}
          />
        </Box>
        {/* In the page's corner, centred over the forward key's column. */}
        <Box
          position="absolute"
          inset={{
            top: PAGE_INSET - 4,
            right: PAGE_INSET + (KEY_SIZE - CLOSE_SIZE) / 2,
          }}
        >
          <CloseButton
            id="touch-drawer-close"
            label={t("close")}
            onPress={onClose}
          />
        </Box>
      </Box>
    </Box>
  );
}
