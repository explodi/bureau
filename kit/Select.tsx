import { CONTROL_METRICS } from "./tokens.ts";
import { getFocusedNode, host, type HostNode } from "bureau/host";
import {
  Box,
  type KeyEvent,
  Layer,
  type LayerAnchor,
  Scroll,
  Text,
} from "bureau/primitives";
/**
 * Select — the register's pop-up list, for mouse, keyboard and gamepad.
 *
 * The kit owns the list and its input handling, so a mouse, a keyboard and a
 * gamepad all reach every option the same way. The look is OPENSTEP's
 * pop-up: one raised key with a handle at its right end.
 *
 * Gamepad model:
 *   - Closed + focused: A (or Enter/Space/click) opens the listbox. The value
 *     never cycles in place: the bumpers belong to tab strips and the D-pad
 *     to form navigation.
 *   - Open: D-pad/stick up/down moves the highlight. A (or Enter/Space/click
 *     on option) commits. B (or Escape) cancels.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  GamepadPriority,
  useGamepadFrame,
  usePadContext,
} from "./input/useGamepad.ts";
import { playKitSound } from "./sounds.ts";
import { markPopoverOpen } from "./popoverState.ts";

export type SelectOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  disabled?: boolean;
  id?: string;
  navigationGrid?: string;
  onOpenChange?: (open: boolean) => void;
  /**
   * Stretch the key across its container instead of sizing it to the widest
   * option. A pop-up in a form column reads as a field and takes the column's
   * width; a pop-up beside a label stays shrink-to-fit, as OPENSTEP sized it.
   */
  fill?: boolean;
}

// WHY: parent dialog's nav registers at MODAL; popover input must outrank it.
const POPOVER_PRIORITY: number = GamepadPriority.MODAL + 20;

export function Select<T extends string>(
  {
    value,
    onChange,
    options,
    disabled,
    id,
    navigationGrid,
    onOpenChange,
    fill,
  }: SelectProps<T>,
) {
  const triggerRef = useRef<HostNode | null>(null);
  const listboxRef = useRef<HostNode | null>(null);
  const optionRefs = useRef(new Map<number, HostNode>());

  const [open, setOpen] = useState(false);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  usePadContext("menu", open, POPOVER_PRIORITY);
  const currentIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [highlightIndex, setHighlightIndex] = useState(currentIndex);
  // The list is a Layer, drawn over the window rather than clipped by its
  // scrolling body, and placed from the trigger's measured rectangle each
  // layout while open. The placement means nothing while closed, so closing
  // drops it in the same render, with no reset effect.
  const [measuredListboxStyle, setMeasuredListboxStyle] = useState<
    { anchor: LayerAnchor; width: number; maxHeight: number } | null
  >(null);
  const listboxStyle = open ? measuredListboxStyle : null;

  const openList = useCallback(() => {
    if (disabled) return;
    playKitSound("open");
    setHighlightIndex(currentIndex);
    setOpen(true);
  }, [disabled, currentIndex]);

  const closeList = useCallback(() => {
    setOpen(false);
    host.focus(triggerRef.current);
  }, []);

  const commitIndex = useCallback((index: number) => {
    const option = options[index];
    if (!option) return;
    playKitSound("select"); // "set it" accent on choosing an option
    if (option.value !== value) onChange(option.value);
    setOpen(false);
    host.focus(triggerRef.current);
  }, [options, value, onChange]);

  useEffect(() => {
    if (!open) return;
    const release = markPopoverOpen();
    return release;
  }, [open]);

  // Pin the list's layer to the trigger. It opens upward when less than 200px
  // is left below and more is above, so the screen edge never crops it. Its
  // tallest is the room in that direction, so a long list scrolls inside
  // rather than being cut off.
  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      // The trigger's rectangle and the viewport are both in UI pixels.
      const rect = host.measure(trigger);
      const top = rect.top;
      const bottom = rect.bottom;
      const viewportH = host.viewport().height;
      const spaceBelow = viewportH - bottom;
      const spaceAbove = top;
      const openUpwards = spaceBelow < 200 && spaceAbove > spaceBelow;
      const margin = 8;
      // Long option lists (e.g. the stats picker with ~20 entries) would
      // otherwise expand to the full available space and bleed past the
      // viewport when the trigger sits high on the screen. Cap to 60% of the
      // viewport so the listbox always leaves room around it and scrolls
      // when there's more content than fits.
      const safeMax = Math.min(
        (openUpwards ? spaceAbove : spaceBelow) - margin,
        viewportH * 0.6,
      );
      const maxHeight = Math.max(120, safeMax);
      setMeasuredListboxStyle({
        anchor: openUpwards
          ? { kind: "screen", left: rect.left, bottom: viewportH - top }
          : { kind: "screen", left: rect.left, top: bottom },
        width: rect.width,
        maxHeight,
      });
    };
    updatePosition();
    const trigger = triggerRef.current;
    if (trigger) return host.observeLayout(updatePosition);
  }, [open]);

  // A press anywhere but the trigger and the list closes it; the trigger
  // toggles the list itself.
  useEffect(() => {
    if (!open) return;
    return host.observeOutside(
      () => [triggerRef.current, listboxRef.current],
      () => setOpen(false),
    );
  }, [open]);

  // Scroll highlighted option into view as the user navigates.
  useLayoutEffect(() => {
    if (!open) return;
    host.scrollIntoView(optionRefs.current.get(highlightIndex));
  }, [open, highlightIndex]);

  // Gamepad: closed — A opens the focused trigger. The trigger's role is
  // "none", so the pad's form controls never press it; it claims A above the
  // dialog's navigation so the dialog does not also confirm.
  useGamepadFrame(
    (input) => {
      if (!input.connected) return;
      if (getFocusedNode() !== triggerRef.current) return;
      if (input.wasPressed("menu_confirm")) openList();
    },
    { enabled: !open && !disabled, priority: POPOVER_PRIORITY },
  );

  // Gamepad: open — own all relevant input above MODAL priority.
  useGamepadFrame(
    (input) => {
      if (!input.connected) return;

      if (input.wasPressed("menu_back")) {
        closeList();
        return;
      }

      if (input.wasPressed("menu_confirm")) {
        commitIndex(highlightIndex);
        return;
      }

      const up = input.wasPressed("menu_up");
      const down = input.wasPressed("menu_down");

      if (up) {
        setHighlightIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
      } else if (down) {
        setHighlightIndex((i) => (i >= options.length - 1 ? 0 : i + 1));
      }
    },
    { enabled: open, priority: POPOVER_PRIORITY },
  );

  const handleKey = (key: KeyEvent) => {
    if (disabled || key.phase !== "down") return false;
    if (!open) {
      const opens = key.key === "Enter" || key.key === " " ||
        key.key === "ArrowDown" || key.key === "ArrowUp";
      if (opens) openList();
      return opens;
    }
    if (key.key === "Escape") {
      closeList();
      return true;
    }
    if (key.key === "ArrowDown") {
      setHighlightIndex((i) => (i >= options.length - 1 ? 0 : i + 1));
      return true;
    }
    if (key.key === "ArrowUp") {
      setHighlightIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
      return true;
    }
    if (key.key === "Enter" || key.key === " ") {
      commitIndex(highlightIndex);
      return true;
    }
    return false;
  };

  const optionId = (i: number) => `${id ?? "bureau-select"}-opt-${i}`;
  const label = (content: React.ReactNode) =>
    typeof content === "string"
      ? <Text typeStyle="ui-15-solid" lines={1} ellipsis>{content}</Text>
      : content;

  return (
    <Box
      maxWidth="100%"
      width={fill ? "100%" : undefined}
      height={CONTROL_METRICS.standard.height}
      shrink={fill ? undefined : 0}
    >
      <Box
        nodeRef={(node) => {
          triggerRef.current = node;
        }}
        id={id}
        role="none"
        look="select"
        // Pressing a pop-up IS opening it: the key stays down while its list
        // is up, the only thing tying the floating list back to its key.
        held={open}
        disabled={disabled}
        focusable
        navigable={navigationGrid !== undefined}
        navigationGrid={navigationGrid}
        align="center"
        gap={12}
        grow={fill ? 1 : undefined}
        minWidth={0}
        height={CONTROL_METRICS.standard.height}
        margin={[0, 1]}
        padding={[4, 16]}
        // Opening sounds itself (open2); closing by the key is the plain click.
        feedback="none"
        onPress={() => {
          if (!open) return openList();
          playKitSound("click");
          closeList();
        }}
        onKey={handleKey}
      >
        {
          /* Every label is laid out and only the current one shows, so the
            key is as wide as its widest option and never changes width when
            the value does: an OPENSTEP pop-up was sized to its longest item. */
        }
        <Box direction="column" grow={1} basis="0%" minWidth={0}>
          {options.map((option, i) => (
            <Box
              key={option.value}
              height={i === currentIndex ? undefined : 0}
              overflow="hidden"
              hidden={i !== currentIndex}
            >
              {label(option.label)}
            </Box>
          ))}
        </Box>
        <Box
          shrink={0}
          width={18}
          height={12}
          fill="face"
          surface={disabled
            ? "select-handle-dead"
            : open
            ? "select-handle-pressed"
            : "select-handle"}
          hidden
        />
      </Box>
      {open && listboxStyle && (
        <Layer anchor={listboxStyle.anchor} stacking="popup">
          <Box
            direction="column"
            look="pulldown-plate"
            // The list's size is its rows', inside its 2px plate.
            width={listboxStyle.width + 4}
            maxHeight={listboxStyle.maxHeight + 4}
            padding={2}
          >
            <Scroll
              nodeRef={(node) => {
                listboxRef.current = node;
              }}
              direction="column"
              grow={1}
              minHeight={0}
            >
              {options.map((option, i) => {
                const selected = option.value === value;
                const highlighted = i === highlightIndex;
                return (
                  <Box
                    key={option.value}
                    nodeRef={(node) => {
                      if (node) optionRefs.current.set(i, node);
                      else optionRefs.current.delete(i);
                    }}
                    id={optionId(i)}
                    role="none"
                    selected={selected}
                    look={highlighted ? "menu-row-highlighted" : "menu-row"}
                    align="center"
                    height={32}
                    padding={[0, 14]}
                    focusable={false}
                    onHoverChange={(inside) => {
                      if (inside) {
                        setHighlightIndex(i);
                      }
                    }}
                    onPress={() =>
                      commitIndex(i)}
                  >
                    {typeof option.label === "string"
                      ? <Text typeStyle="ui-15-solid">{option.label}</Text>
                      : option.label}
                  </Box>
                );
              })}
            </Scroll>
          </Box>
        </Layer>
      )}
    </Box>
  );
}
