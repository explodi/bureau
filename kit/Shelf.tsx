/**
 * Shelf — the dock's drawer for a finger. A tooltip is read by hovering,
 * and a finger never hovers, so a drawer opened by touch takes the dock's
 * place as one row of its keys, and the chosen key's card stands above it
 * carrying what the tooltip would have said, with the key that acts on it.
 *
 * The row scrolls under a swipe; the arrow keys either side step it a page.
 * A tap chooses; only the card's action key builds or opens. Keys the city
 * may not use yet stand after the rest, and can still be chosen to read why.
 */

import React, { useLayoutEffect, useRef, useState } from "react";
import { host, type HostNode } from "bureau/host";
import { Box, Scroll, Text } from "bureau/primitives";
import { useTranslation } from "./i18n/i18n.ts";
import { Button, CloseButton } from "./Bureau.tsx";

export interface ShelfItem {
  key: string;
  icon: React.ReactNode;
  /** Not usable yet: shelved after the rest. */
  withheld?: boolean;
  /** Something new behind it, as the dock's badge says. */
  badge?: React.ReactNode;
}

export interface ShelfAction {
  label: string;
  onPress: () => void;
}

/** The strip's and the card's ids: what a tutor's bubble keeps clear of. */
export const SHELF_ID = "bureau-shelf";
export const SHELF_CARD_ID = "bureau-shelf-card";

/** The key edge, the gap between keys and the strip's inset: the drawer's. */
const KEY_SIZE = 44;
const KEY_GAP = 5;
const STRIP_INSET = 4;
/** Air between the card and the strip, and the card and the safe area's side. */
const CARD_GAP = 6;
const SAFE_GUTTER = 16;
/** 350px of text and the 12px insets either side, as the floating hint. */
const CARD_MAX_WIDTH = 374;

/** The usable keys first, then the withheld, each in the drawer's order. */
export function shelfOrder<T extends { withheld?: boolean }>(
  items: readonly T[],
): T[] {
  const usable = items.filter((item) => !item.withheld);
  const withheld = items.filter((item) => item.withheld);
  return [...usable, ...withheld];
}

/**
 * The card's left edge, in the shelf's pixels: centred over its key, but
 * kept a gutter inside the safe area, whose sides are in the shelf's frame.
 */
export function cardLeft(
  place: {
    keyCentre: number;
    cardWidth: number;
    shelfLeft: number;
    safeLeft: number;
    safeRight: number;
  },
): number {
  const centred = place.keyCentre - place.cardWidth / 2;
  const leftmost = place.safeLeft + SAFE_GUTTER - place.shelfLeft;
  const rightmost = place.safeRight - SAFE_GUTTER - place.cardWidth -
    place.shelfLeft;
  return Math.max(leftmost, Math.min(centred, rightmost));
}

interface CardPlace {
  left: number;
  bottom: number;
}

interface StepsOpen {
  back: boolean;
  forward: boolean;
}

export function Shelf(
  { title, items, chosen, onChoose, card, action, onClose }: {
    /** The drawer's name, for the node tree. */
    title: string;
    items: readonly ShelfItem[];
    /** The chosen key's `key`; the first key when it names none. */
    chosen: string | null;
    onChoose: (key: string) => void;
    /** What the chosen key's tooltip says. */
    card: React.ReactNode;
    /** The chosen key's act; none while it is withheld. */
    action?: ShelfAction;
    onClose: () => void;
  },
) {
  const { t } = useTranslation("common");
  const shelved = shelfOrder(items);
  const chosenKey = shelved.some((item) => item.key === chosen)
    ? chosen
    : shelved[0]?.key ?? null;

  const shelf = useRef<HostNode | null>(null);
  const scroller = useRef<HostNode | null>(null);
  const plate = useRef<HostNode | null>(null);
  const keys = useRef(new Map<string, HostNode>());
  // Where the row stands, so the card follows its key as the row scrolls.
  const [scrolledTo, setScrolledTo] = useState(0);
  const [place, setPlace] = useState<CardPlace | null>(null);
  const [steps, setSteps] = useState<StepsOpen>({
    back: false,
    forward: false,
  });

  // Measured after every commit: the card's text, the chosen key and the
  // row's scroll all move it. Each state changes only when its value does.
  useLayoutEffect(() => {
    const shelfNode = shelf.current;
    const scrollNode = scroller.current;
    const plateNode = plate.current;
    const keyNode = chosenKey === null ? null : keys.current.get(chosenKey);
    if (!shelfNode || !scrollNode) return;

    const extent = host.contentExtent(scrollNode);
    const back = scrolledTo > 0;
    const forward = scrolledTo + extent.width < extent.contentWidth - 1;
    if (back !== steps.back || forward !== steps.forward) {
      setSteps({ back, forward });
    }

    if (!plateNode || !keyNode) return;
    const shelfRect = host.measure(shelfNode);
    const keyRect = host.measure(keyNode);
    const plateRect = host.measure(plateNode);
    const safe = host.viewport();
    const left = cardLeft({
      keyCentre: keyRect.left + keyRect.width / 2 - shelfRect.left,
      cardWidth: plateRect.width,
      shelfLeft: shelfRect.left,
      safeLeft: safe.left,
      safeRight: safe.left + safe.width,
    });
    const bottom = shelfRect.height + CARD_GAP;
    if (place?.left !== left || place?.bottom !== bottom) {
      setPlace({ left, bottom });
    }
  });

  // Arrows only for a row that overflows: a drawer that fits has nowhere to go.
  const scrolls = steps.back || steps.forward;

  function step(direction: -1 | 1) {
    const scrollNode = scroller.current;
    if (!scrollNode) return;
    const { width } = host.contentExtent(scrollNode);
    // A page less one key, so the key at the edge stays in sight.
    const page = Math.max(KEY_SIZE, width - KEY_SIZE - KEY_GAP);
    host.scrollBy(scrollNode, direction * page, 0);
  }

  return (
    <Box
      nodeRef={(node) => {
        shelf.current = node;
      }}
      id={SHELF_ID}
      label={title}
      shrink={1}
      minWidth={0}
      surface="drawer"
      padding={STRIP_INSET}
      gap={KEY_GAP}
      align="center"
    >
      {scrolls && (
        <Button
          id="bureau-shelf-back"
          mark="left"
          disabled={!steps.back}
          onPress={() => step(-1)}
        />
      )}
      <Scroll
        nodeRef={(node) => {
          scroller.current = node;
        }}
        axis="horizontal"
        scrollbar="hidden"
        shrink={1}
        minWidth={0}
        onScroll={(offset) => setScrolledTo(offset.x)}
      >
        <Box gap={KEY_GAP}>
          {shelved.map((item) => (
            <Button
              key={item.key}
              ref={(node: HostNode | null) => {
                if (node) keys.current.set(item.key, node);
                else keys.current.delete(item.key);
              }}
              variant="drawer"
              latched={item.key === chosenKey}
              onPress={() => onChoose(item.key)}
            >
              {item.icon}
              {item.badge}
            </Button>
          ))}
        </Box>
      </Scroll>
      {scrolls && (
        <Button
          id="bureau-shelf-forward"
          mark="right"
          disabled={!steps.forward}
          onPress={() => step(1)}
        />
      )}
      <CloseButton label={t("close")} onPress={onClose} />

      {chosenKey !== null && (
        <Box
          nodeRef={(node) => {
            plate.current = node;
          }}
          id={SHELF_CARD_ID}
          position="absolute"
          inset={{ left: place?.left ?? 0, bottom: place?.bottom ?? 0 }}
          // Unseen until it is measured over its key.
          opacity={place ? 1 : 0}
          direction="column"
          gap={8}
          maxWidth={CARD_MAX_WIDTH}
          padding={[8, 12]}
          fill="face"
          surface="toast"
          ink="ink"
          typeStyle="ui-15-loose"
        >
          <Text>{card}</Text>
          {action && (
            <Box justify="end">
              <Button onPress={action.onPress}>
                {action.label}
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
