import { usePadContext } from "./input/useGamepad.ts";
import type React from "react";
import { useEffect, useId, useRef } from "react";
import {
  Box,
  type KeyEvent,
  type Layout,
  Scroll,
  Text,
} from "bureau/primitives";
import { useTranslation } from "./i18n/i18n.ts";
import { host, type HostNode } from "bureau/host";
import {
  GamepadPriority,
  useGamepadFocusedHorizontalScroll,
  useGamepadScroll,
  useGamepadSpatialNavigation,
} from "./input/useGamepad.ts";
import { useGamepadSequentialNavigation } from "./input/useGamepadSequentialNavigation.ts";
import { CloseButton, TitleBar } from "./Bureau.tsx";
import { Scrim, SCRIM_MARGIN } from "./Scrim.tsx";
import { TabbedGround } from "./window_ground.ts";
import { manageDialogFocus, trapDialogTab } from "./dialog_focus.ts";
import { useAnyPopoverOpen } from "./popoverState.ts";

/*
 * The modal window every program and page opens in: a scrim over the city, a
 * Bureau frame, the kit's title bar with its close key, and one scrolling
 * body. It owns everything a window needs beyond its looks — focus capture
 * and return, Tab wrapping, Escape, and the gamepad's spatial or sequential
 * navigation over whatever the body renders — so a program never rewrites
 * any of it.
 *
 * WHY the bar is the kit's component and not a heading the program draws:
 * chrome does not bend to the program inside it. A newspaper sets its
 * headings in the masthead's serif, and the window's name must not follow.
 *
 * `tabbed` says the body is a <Notebook>, and drops the window's ground
 * one step to the ground the tab strip sits on — a tabbed window is darker
 * than the tab that is open. WHY the ground is the WINDOW's and not the
 * notebook's: a program lays things ABOVE the strip — a menu bar, a row of
 * readouts, an alert — and if the step starts at the notebook those stay
 * chrome grey while the notebook alone goes dark, the "floating grey
 * rectangle pasted across the window" the notebook warns about.
 * `tabbed` is deliberately the same word on <Window>, so a window
 * moving to its own frame is a component swap and not an API redesign.
 *
 * `footer` is the window's key row — a Back key, the one default action —
 * pinned on a plate UNDER the scrolling body. WHY the dialog owns it: the
 * body is the only scroll container, so a program that put its keys at the
 * end of the body watched them scroll away under a long list, and the three
 * that needed them pinned each re-fought the body's flex layout to get an
 * inner scroller. A window with a footer keeps the keys in reach at every
 * body height; the pad walks them like any other control in the window.
 */
type DialogProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Keys pinned under the body. Pass one <KeyRow> per end — the row
   * lays them out at the left and right edges, the way the era set a
   * dialog's Back and OK — or a single row to gather them at the left.
   */
  footer?: React.ReactNode;
  id?: string;
  trademarkSymbol?: true;
  navigationType?: "spatial" | "sequential";
  tabbed?: true;
  /**
   * A fixed width in UI pixels, still no wider than the desk, or a share of
   * the desk.
   */
  width?: number | `${number}%`;
  /** The widest the window grows, in UI pixels, in place of the kit's 800. */
  maxWidth?: number;
  /**
   * A fixed height in UI pixels, no taller than nine tenths of the desk, for
   * a window whose views must not resize it as the player switches them.
   */
  height?: number;
  /** In UI pixels. */
  minHeight?: number;
  maxHeight?: number;
  /** `flush`: no padding and no scrolling; the program lays out its own Scroll.
   *  `snug`: padded, with only a group's space over a first line that is the
   *  program's own heading. */
  body?: "padded" | "flush" | "snug";
  /** The padded body's air above its first line, in place of 20px. */
  bodyTop?: number;
  /** `good`: the title bar in the good ink, a spreadsheet's green. */
  titlebar?: "standard" | "good";
};

/** A snug body's air over its first line: a group's space. */
const SNUG_TOP = 12;
/** The whole desk, the scrim inside its margin: a window that cannot have the
 *  size it asks for takes all of it. */
export const DESK = "100%";
/** Every window opens this wide unless it asks for another width. */
const WINDOW_MAX_WIDTH = 800;

function dialogSize(
  size: Pick<
    DialogProps,
    "width" | "maxWidth" | "height" | "minHeight" | "maxHeight"
  >,
): Layout {
  const box: Layout = {
    width: DESK,
    maxWidth: WINDOW_MAX_WIDTH,
    maxHeight: DESK,
  };
  // A fixed width is the desk's, no wider than asked: set as the width and
  // capped by the desk, it would centre at its full width and stand off
  // centre once the cap shrinks it.
  if (typeof size.width === "number") box.maxWidth = size.width;
  else if (size.width) box.width = size.width;
  if (size.maxWidth !== undefined) box.maxWidth = size.maxWidth;
  if (size.height !== undefined) box.height = size.height;
  // A window no taller than the desk, whatever it asks for.
  const desk = host.viewport().height - 2 * SCRIM_MARGIN;
  if (size.minHeight !== undefined) {
    box.minHeight = Math.min(size.minHeight, desk);
  }
  if (size.maxHeight !== undefined) {
    box.maxHeight = Math.min(size.maxHeight, desk);
  }
  return box;
}

export function Dialog(
  {
    title,
    onClose,
    children,
    footer,
    id,
    trademarkSymbol,
    navigationType = "spatial",
    tabbed,
    width,
    maxWidth,
    height,
    minHeight,
    maxHeight,
    body = "padded",
    bodyTop,
    titlebar = "standard",
  }: DialogProps,
) {
  const { t } = useTranslation("common");
  usePadContext("menu", true, GamepadPriority.MODAL);
  const dialogRef = useRef<HostNode | null>(null);
  const contentRef = useRef<HostNode | null>(null);
  const footerRef = useRef<HostNode | null>(null);
  const generatedTitleId = useId();
  const titleId = id ? `${id}-title` : generatedTitleId;

  const useSpatialNav = navigationType === "spatial";
  const useSequentialNav = navigationType === "sequential";
  // WHY: A custom popover (e.g. the Select listbox) owns input while
  // open. Pausing the dialog's own nav prevents DPAD/stick races that would
  // move focus out from under the popover.
  const popoverOpen = useAnyPopoverOpen();

  useGamepadSpatialNavigation({
    onCancel: onClose,
    gridId: id,
    enabled: useSpatialNav && !popoverOpen,
    priority: GamepadPriority.MODAL,
  });

  useGamepadSequentialNavigation({
    onCancel: onClose,
    gridId: id,
    enabled: useSequentialNav && !popoverOpen,
    priority: GamepadPriority.MODAL,
  });

  useGamepadScroll(contentRef);
  useGamepadFocusedHorizontalScroll(contentRef, !popoverOpen);

  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    return manageDialogFocus({
      root,
      body: () => contentRef.current,
      footer: () => footerRef.current,
      gridId: id,
    });
  }, [id]);

  const handleKey = (key: KeyEvent) => {
    if (key.phase !== "down") return false;
    if (key.key === "Escape") {
      // A control's open Layer, such as Select's list, owns Escape.
      if (popoverOpen) return false;
      onClose();
      return true;
    }
    if (key.key !== "Tab" || !dialogRef.current) return false;
    const programRoots = [contentRef.current, footerRef.current].filter(
      (node) => node !== null,
    );
    return trapDialogTab(dialogRef.current, programRoots, key.shift);
  };

  const bodyLayout: Layout = {
    direction: "column",
    grow: 1,
    shrink: 1,
    basis: "auto",
    minHeight: 0,
  };

  return (
    <Scrim>
      <TabbedGround.Provider value={Boolean(tabbed)}>
        <Box
          nodeRef={(node) => {
            dialogRef.current = node;
          }}
          id={id}
          role="dialog"
          // The window itself takes focus when its body has nothing focusable
          // (a read-only report), and draws no ring: a ring around a whole
          // window reads as a selection of the window, which is not a thing here.
          focusable
          tabStop={false}
          look={tabbed ? "dialog-tabbed" : "dialog"}
          direction="column"
          overflow="hidden"
          {...dialogSize({ width, maxWidth, height, minHeight, maxHeight })}
          onKey={handleKey}
        >
          <TitleBar
            title={
              <>
                {title}
                {trademarkSymbol && (
                  <Text typeStyle="system-18-title-solid">™</Text>
                )}
              </>
            }
            titleId={titleId}
            identity={titlebar === "good" ? "good" : undefined}
          >
            <CloseButton label={t("close")} navigable onPress={onClose} />
          </TitleBar>
          {body === "flush"
            ? (
              <Box
                {...bodyLayout}
                nodeRef={(node) => {
                  contentRef.current = node;
                }}
                overflow="hidden"
              >
                {children}
              </Box>
            )
            : (
              <Scroll
                {...bodyLayout}
                nodeRef={(node) => {
                  contentRef.current = node;
                }}
                padding={[
                  bodyTop ?? (body === "snug" ? SNUG_TOP : 20),
                  20,
                  20,
                  20,
                ]}
              >
                {children}
              </Scroll>
            )}
          {footer !== undefined && (
            <Box
              nodeRef={(node) => {
                footerRef.current = node;
              }}
              wrap
              align="center"
              justify="between"
              gap={8}
              shrink={0}
              padding={8}
              look="panel"
            >
              {footer}
            </Box>
          )}
        </Box>
      </TabbedGround.Provider>
    </Scrim>
  );
}
