import { platform } from "platform";
import { GamepadPriority, useGamepadFrame } from "./input/useGamepad.ts";
import { GamepadKeyboard } from "./GamepadKeyboard.tsx";
import { getFocusedNode, host, type HostNode } from "bureau/host";
/**
 * TextField — the one editable cell of the mayor's computer.
 *
 * Every figure the player types into a governance window goes through here: a
 * tax rate, a public salary. The cell fixes the height, the ink, the depth, the
 * focus ring and whether the value can be selected at all.
 *
 * What the module owns, beyond rendering:
 *   - the alignment convention (figures right with tabular digits, prose left),
 *     derived from `type` so no call site has to state the obvious;
 *   - a press on the unit chrome ("$", "%") landing the caret in the value;
 *   - the status-bar hint, this register's replacement for a tooltip.
 *
 * The cell carries the sunken edge and the paper, so a prefix or suffix sits
 * INSIDE the frame with the value — "$ 1,200" is one edit cell, not a symbol
 * standing next to a box. It is 32px, not a sheet's usual 28px: the house
 * minimum for anything the player aims at is 32px, and this game is played on
 * a controller. The focus ring is the CELL's, drawn just inside its 2px
 * sunken edge, where it cannot strike through a right-aligned figure.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Field,
  type KeyEvent,
  Text,
  type TypeStyle,
} from "bureau/primitives";
import { useStatus } from "./bureau_status.ts";

const EDIT_KEYS = ["Backspace", "Tab", "ArrowLeft", "ArrowRight", "Delete"];

/** A digit, an editing key, or a copy-and-paste shortcut. */
function isDigitEditKey(key: KeyEvent) {
  const isShortcut = key.control || key.meta;
  return EDIT_KEYS.includes(key.key) || isShortcut || /^[0-9]$/.test(key.key);
}

/** The value's type: a figure lines up in tabular digits, a name capitalizes. */
function valueType(figures: boolean, capitalize: boolean): TypeStyle {
  if (figures) return "ui-16-figures-solid";
  return capitalize ? "ui-16-capitalize-solid" : "ui-16-solid";
}

export type TextFieldProps = {
  /** The value shown; a number shows as the input would print it. */
  value: string | number;
  type?: "text" | "number";
  /** Which edge the value sits against. Defaults from `type`: figures right,
   *  prose left. */
  align?: "left" | "center" | "right";
  /** The cell's width in UI pixels, still no wider than its container. */
  width?: number;
  /** Follows its column, but no wider than this, in UI pixels. */
  maxWidth?: number;
  /** Capitalizes each word of the value as it shows: a city's name. */
  capitalize?: true;
  /** Unit chrome printed inside the cell — "$" before, "%" after. */
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** Out of range or rejected: red ink and a red ring. The player keeps
   *  typing; the sheet decides what to do on save. */
  invalid?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Status-bar help while this field is focused or hovered. Requires a
   *  <Frame> ancestor; outside one, this is a no-op. */
  hint?: string;
  /** The value as typed, on every edit. */
  onValueChange?: (value: string) => void;
  /** Enter in the cell, with its value: what a form's submit was. */
  onEnter?: (value: string) => void;
  onFocusChange?: (focused: boolean) => void;
  /** A control the player has not looked at yet: a ring cycling the palette. */
  attention?: boolean;
  /** Set in a line of a sheet's text, at the line's middle, so the row
   *  keeps the line's baseline rather than the field's. */
  inline?: true;
  /** Digits only: every other key is refused, as a whole-dollar cell wants.
   *  Editing and clipboard keys still work. */
  digitsOnly?: boolean;
  /** Focus lands in the cell as it mounts. */
  autoFocus?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  placeholder?: string;
  id?: string;
};

const EDGES = { left: "start", center: "center", right: "end" } as const;

export const TextField = React.forwardRef<HostNode, TextFieldProps>(
  function TextField(
    {
      type = "text",
      align,
      width,
      maxWidth,
      capitalize,
      prefix,
      suffix,
      invalid,
      hint,
      disabled,
      onValueChange,
      onEnter,
      onFocusChange,
      attention,
      inline,
      digitsOnly,
      autoFocus,
      value,
      ...field
    },
    ref,
  ) {
    const status = useStatus();
    // A field with no hint of its own must not wipe what the window is saying.
    const showHint = (shown: boolean) => {
      if (hint) status(shown ? hint : "");
    };
    const inputRef = useRef<HostNode | null>(null);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const keyboardPending = useRef(false);
    const nativeKeyboardOpen = useRef(false);
    const mounted = useRef(true);
    const dismissNativeKeyboard = () => {
      if (!nativeKeyboardOpen.current) return;
      nativeKeyboardOpen.current = false;
      platform.input.gamepads.dismissKeyboard();
    };
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        dismissNativeKeyboard();
      };
    }, []);
    useGamepadFrame((input) => {
      const node = inputRef.current;
      if (
        !node || getFocusedNode() !== node || disabled || field.readOnly ||
        keyboardOpen || keyboardPending.current
      ) return;
      if (type === "number") return;
      const confirm = input.wasPressed("menu_confirm");
      const alternative = input.wasPressed("menu_tertiary");
      if (!confirm && !alternative) return;
      host.press(node);
      // A tablet's own keyboard opens for the focused field.
      const shell = platform.shell.identity?.platform;
      const tabletKeyboard = shell === "ios" || shell === "android";
      if (tabletKeyboard) return;
      const rect = host.measure(node);
      keyboardPending.current = true;
      void platform.input.gamepads.showKeyboard({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      }).catch(() => false).then((shown) => {
        nativeKeyboardOpen.current = shown;
        if (!mounted.current || getFocusedNode() !== node) {
          dismissNativeKeyboard();
          return;
        }
        if (!shown) setKeyboardOpen(true);
      }).finally(() => {
        keyboardPending.current = false;
      });
    }, { priority: GamepadPriority.MODAL + 5 });

    const isFigure = type === "number";
    const edge = align ?? (isFigure ? "right" : "left");
    const figures = edge === "right";

    useEffect(() => {
      if (autoFocus) host.focus(inputRef.current);
    }, [autoFocus]);

    const focusValue = () => {
      if (!disabled) host.focus(inputRef.current);
    };
    const affix = (content: React.ReactNode) => (
      <Box shrink={0} role="none" onPress={focusValue} focusable={false}>
        <Text
          typeStyle="ui-16-solid"
          ink={disabled ? "ink-disabled" : "ink-neutral"}
        >
          {content}
        </Text>
      </Box>
    );

    return (
      <>
        <Box
          look={invalid ? "field-cell-invalid" : "field-cell"}
          inline={inline ? { align: "middle" } : undefined}
          animation={attention ? "bureau-attention-rainbow-field" : undefined}
          align="center"
          gap={4}
          width={width ?? "100%"}
          maxWidth={width !== undefined ? "100%" : maxWidth}
          minWidth={width === undefined && maxWidth !== undefined
            ? 0
            : undefined}
          height={32}
          padding={[0, attention ? 10 : 8]}
          onHoverChange={showHint}
        >
          {prefix !== undefined && affix(prefix)}
          <Field
            {...field}
            value={String(value)}
            nodeRef={(node) => {
              inputRef.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            kind={type}
            bare
            disabled={disabled}
            typeStyle={valueType(figures, Boolean(capitalize))}
            ink={disabled ? "ink-disabled" : invalid ? "ink-bad" : "ink"}
            align={EDGES[edge]}
            grow={1}
            minWidth={0}
            height="100%"
            padding={[2, 0]}
            onChange={onValueChange}
            onSubmit={onEnter}
            onKey={(key) => Boolean(digitsOnly) && key.phase === "down" &&
              !isDigitEditKey(key)}
            onFocusChange={(focused) => {
              if (!focused) dismissNativeKeyboard();
              showHint(focused);
              onFocusChange?.(focused);
            }}
          />
          {suffix !== undefined && affix(suffix)}
        </Box>
        {keyboardOpen && (
          <GamepadKeyboard
            initialValue={String(value)}
            maxLength={field.maxLength}
            capitalize={Boolean(capitalize)}
            onSubmit={(next) => {
              setKeyboardOpen(false);
              onValueChange?.(next);
              host.focus(inputRef.current);
            }}
            onCancel={() => {
              setKeyboardOpen(false);
              host.focus(inputRef.current);
            }}
          />
        )}
      </>
    );
  },
);
