import { getFocusedNode, host, type HostNode } from "bureau/host";
import { Box, type KeyEvent, Layer, Scroll, Text } from "bureau/primitives";
/*
 * MenuBar — a working pull-down menu bar for the game's diegetic
 * Windows 3.x/95 windows (the Microslop suite).
 *
 * Why a component and not four spans: a menu bar reads like a row of labels
 * and is actually seven input contracts, every one of which this game gets
 * wrong by default.
 *   - Hovering a second title while one menu is open has to switch menus.
 *   - The keyboard needs its own arrow navigation and Alt mnemonics: Tab
 *     walks a window's fields, not its menus.
 *   - Escape has to be consumed here, or the game's own Escape handling in
 *     Game.tsx closes the whole window instead of the menu.
 *   - The pull-down has to be a Layer: the window clips its body, and a
 *     Layer draws over it, placed from the title's rectangle in UI pixels.
 *   - A gamepad has to out-rank the host dialog's own cancel handler, or B
 *     closes the window rather than the menu.
 *   - Accelerators must dispatch the same action as the item that prints them,
 *     so the printed "Ctrl+S" can never drift from what Ctrl+S does.
 * A window declares its menus; all of the above lives in here.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PadAction } from "bureau/pad_actions";
import {
  GamepadPriority,
  useGamepadFrame,
  useHintDevice,
  usePadContext,
} from "./input/useGamepad.ts";
import { playKitSound } from "./sounds.ts";
import { InputPrompt } from "./InputPrompt.tsx";
import { markPopoverOpen, useAnyPopoverOpen } from "./popoverState.ts";
import {
  firstSelectable,
  lastSelectable,
  matchesAccelerator,
  mnemonicOf,
  nextSelectable,
  parseShortcut,
} from "./menu_keys.ts";
import { useStatus } from "./bureau_status.ts";

export type MenuItem = {
  /** Omit the label for a separator rule. */
  label?: string;
  onSelect?: () => void;
  /** Greyed out and inert, but still highlightable — as in Windows. */
  disabled?: boolean;
  /**
   * Accelerator, printed right-aligned AND bound: "Ctrl+S", "Ctrl+Shift+P",
   * "Ctrl+1". Ctrl matches the Command key too, so macOS players get the
   * shortcut they expect. Function keys are deliberately unsupported — the
   * game binds F1-F12 without a dialog guard.
   */
  shortcut?: string;
  /**
   * A controller button that fires this item from anywhere in the window, bound
   * on the same terms as `shortcut`. While the pad is in use its glyph REPLACES
   * the printed key, so the menu only ever shows the input the player is holding.
   * Reserve it for the one or two items worth a dedicated button: A, B, LB and RB
   * are already spoken for (activate, cancel, and stepping a number field).
   */
  gamepadButton?: PadAction;
  /** Help line shown in the enclosing <StatusBar> while highlighted. */
  hint?: string;
  /** Leading ✓ mark: a checked toggle, or the live member of a radio set. */
  checked?: boolean;
};

export type Menu = {
  label: string;
  items: MenuItem[];
};

type MenuBarProps = {
  menus: Menu[];
  /**
   * The host dialog's id, so the titles join its gamepad navigation grid the
   * same way its other controls do.
   */
  gridId?: string;
};

// WHY above MODAL: the host InfoDialog registers its own cancel at MODAL and
// Game.tsx closes the info window on B at GLOBAL. An open pull-down has to
// consume B before either of them.
const MENU_PRIORITY: number = GamepadPriority.MODAL + 20;

// One shared empty list, so "no menu open" is the same value every render and
// the effects keyed on `items` stay quiet while the bar is closed.
const NO_ITEMS: MenuItem[] = [];

export function MenuBar(
  { menus, gridId }: MenuBarProps,
) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [measuredDropdownStyle, setMeasuredDropdownStyle] = useState<
    { left: number; top: number; maxHeight: number } | null
  >(null);
  const titleRefs = useRef<Array<HostNode | null>>([]);
  const dropdownRef = useRef<HostNode | null>(null);
  const setStatus = useStatus();
  const anyPopoverOpen = useAnyPopoverOpen();
  const inputMode = useHintDevice();
  const showGamepadHints = inputMode === "gamepad";

  const open = openIndex !== null;
  usePadContext("menu", open, MENU_PRIORITY);
  const items = open ? menus[openIndex]?.items ?? NO_ITEMS : NO_ITEMS;
  // Only meaningful while a menu is open; deriving it here closes the
  // pull-down in the same render as openIndex, with no reset effect.
  const dropdownStyle = open ? measuredDropdownStyle : null;

  // Another dialog (an About box, a confirmation) owns the keyboard while it is
  // up. Our own pull-down also registers as a popover, so exclude that case.
  const keysBlocked = !open && anyPopoverOpen;

  // Read through refs, never through the closure: a caller building `menus`
  // inline (which the interface invites) hands over a new array every render,
  // and a keydown listener that depended on it would be torn down and re-added
  // on every keystroke in the host window. The refs are written in a layout
  // effect — current before any handler can fire — rather than in render, so
  // a render React discards never leaks into them.
  const menusRef = useRef(menus);
  const openIndexRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    menusRef.current = menus;
    openIndexRef.current = openIndex;
  }, [menus, openIndex]);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    const wasOpen = openIndexRef.current;
    setOpenIndex(null);
    setStatus("");
    if (restoreFocus && wasOpen !== null) {
      host.focus(titleRefs.current[wasOpen]);
    }
  }, [setStatus]);

  /**
   * `highlightFirst` is what separates a mouse from a keyboard, as in Windows:
   * clicking a title drops the menu with nothing highlighted until the pointer
   * lands on a row, while a key or a D-pad arms the first row immediately.
   */
  const openMenu = useCallback((index: number, highlightFirst: boolean) => {
    const menu = menusRef.current[index];
    if (!menu) return;
    setOpenIndex(index);
    setHighlight(highlightFirst ? firstSelectable(menu.items) : -1);
    playKitSound("select");
  }, []);

  const runItem = useCallback((item: MenuItem | undefined) => {
    if (!item?.label || item.disabled) return;
    closeMenu(false);
    item.onSelect?.();
  }, [closeMenu]);

  // Mnemonics and accelerators. Both are read off the same `menus` array that
  // prints them, so the "Ctrl+S" on a row can never drift from what Ctrl+S does.
  useEffect(() => {
    if (keysBlocked) return;
    const handle = (event: KeyEvent) => {
      const menus = menusRef.current;
      const pressedLetter = event.code.startsWith("Key")
        ? event.code.slice(3).toLowerCase()
        : null;

      if (event.alt && !event.control && !event.meta && pressedLetter) {
        const index = menus.findIndex(
          (menu) => mnemonicOf(menu.label) === pressedLetter,
        );
        if (index >= 0) {
          if (openIndexRef.current === index) closeMenu(true);
          else openMenu(index, true);
          return true;
        }
      }

      for (const menu of menus) {
        for (const item of menu.items) {
          if (!item.shortcut || !item.label) continue;
          const accelerator = parseShortcut(item.shortcut);
          if (!accelerator || !matchesAccelerator(accelerator, event)) continue;
          if (item.disabled) {
            playKitSound("deny");
            return true;
          }
          closeMenu(false);
          item.onSelect?.();
          return true;
        }
      }
      return false;
    };
    return host.captureKeys(handle);
  }, [closeMenu, keysBlocked, openMenu]);

  useEffect(() => {
    if (!open) return;
    return markPopoverOpen();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStatus(items[highlight]?.hint ?? "");
  }, [open, items, highlight, setStatus]);

  // Pin the pull-down under its title; the host measures in UI pixels.
  useLayoutEffect(() => {
    if (openIndex === null) return;
    const place = () => {
      const title = titleRefs.current[openIndex];
      if (!title) return;
      const rect = host.measure(title);
      const bottom = rect.bottom;
      setMeasuredDropdownStyle({
        left: rect.left,
        top: bottom,
        maxHeight: host.viewport().height - bottom - 16,
      });
    };
    place();
    const title = titleRefs.current[openIndex];
    if (title) return host.observeLayout(place);
  }, [openIndex]);

  useEffect(() => {
    if (!open) return;
    return host.observeOutside(
      () => [dropdownRef.current, ...titleRefs.current],
      () => closeMenu(false),
    );
  }, [open, closeMenu]);

  const step = useCallback((delta: 1 | -1) => {
    setHighlight((current) => nextSelectable(items, current, delta));
  }, [items]);

  const switchMenu = useCallback((delta: 1 | -1) => {
    if (openIndex === null) return;
    const count = menus.length;
    openMenu((openIndex + delta + count) % count, true);
  }, [openIndex, menus.length, openMenu]);

  // Controller accelerators. Registered above the UI band on purpose: START is
  // bound ungated to the top bar's menu (TopBar.tsx), so an item that wants it
  // has to consume it first.
  useGamepadFrame(
    (input) => {
      if (!input.connected) return;
      for (const menu of menusRef.current) {
        for (const item of menu.items) {
          if (item.gamepadButton == null || !item.label) continue;
          if (!input.wasPressed(item.gamepadButton)) continue;
          if (item.disabled) {
            playKitSound("deny");
            return;
          }
          closeMenu(false);
          item.onSelect?.();
          return;
        }
      }
    },
    { enabled: !keysBlocked, priority: MENU_PRIORITY },
  );

  // Gamepad, closed: A on a focused title opens its menu with the first row
  // already armed. The host dialog's navigation would otherwise reach the title
  // and A-click it, which is the MOUSE gesture — it drops the menu with nothing
  // highlighted and costs the player an extra D-pad press. Claiming A above the
  // dialog's own handler is the only way to tell the two apart.
  useGamepadFrame(
    (input) => {
      if (!input.connected) return;
      const index = titleRefs.current.findIndex((title) =>
        title === getFocusedNode()
      );
      if (index < 0) return;
      if (input.wasPressed("menu_confirm")) openMenu(index, true);
      else if (input.wasPressed("menu_left")) {
        host.focus(
          titleRefs.current[(index - 1 + menus.length) % menus.length],
        );
      } else if (input.wasPressed("menu_right")) {
        host.focus(titleRefs.current[(index + 1) % menus.length]);
      }
    },
    { enabled: !open, priority: MENU_PRIORITY },
  );

  // Gamepad, open: the pull-down owns every button it uses. B has to be
  // consumed here or InfoDialog's cancel (MODAL) and Game's info-window close
  // (GLOBAL) would shut the whole window instead of the menu.
  useGamepadFrame(
    (input) => {
      if (!input.connected) return;
      if (input.wasPressed("menu_back")) {
        closeMenu(true);
        return;
      }
      if (input.wasPressed("menu_confirm")) {
        // A with nothing armed yet arms the first row rather than doing nothing,
        // so a stray press is never a dead end.
        if (highlight < 0) setHighlight(firstSelectable(items));
        else runItem(items[highlight]);
        return;
      }
      if (input.wasPressed("menu_up")) step(-1);
      else if (input.wasPressed("menu_down")) step(1);
      else if (input.wasPressed("menu_left")) switchMenu(-1);
      else if (input.wasPressed("menu_right")) switchMenu(1);
    },
    { enabled: open, priority: MENU_PRIORITY },
  );

  const handleKey = (key: KeyEvent, index: number): boolean => {
    if (key.phase !== "down") return false;
    switch (key.key) {
      case "Escape":
        if (!open) return false;
        // Without this the game's Escape handling closes the whole window.
        closeMenu(true);
        return true;
      case "ArrowLeft":
      case "ArrowRight": {
        const delta = key.key === "ArrowRight" ? 1 : -1;
        if (open) switchMenu(delta);
        else {
          const next = (index + delta + menus.length) % menus.length;
          host.focus(titleRefs.current[next]);
        }
        return true;
      }
      case "ArrowDown":
      case "ArrowUp":
        if (!open) openMenu(index, true);
        else step(key.key === "ArrowDown" ? 1 : -1);
        return true;
      case "Enter":
      case " ":
        if (open) runItem(items[highlight]);
        else openMenu(index, true);
        return true;
      case "Home":
      case "End":
        if (!open) return false;
        setHighlight(
          key.key === "Home" ? firstSelectable(items) : lastSelectable(items),
        );
        return true;
    }
    return false;
  };

  return (
    <Box
      align="stretch"
      shrink={0}
      fill="face"
      surface="menubar-rule"
    >
      {menus.map((menu, index) => {
        const mnemonic = mnemonicOf(menu.label);
        const isOpen = openIndex === index;
        return (
          <Box
            key={menu.label}
            nodeRef={(node) => {
              titleRefs.current[index] = node;
            }}
            role="none"
            // Declared, not stamped: the window skips controls that already
            // carry their navigation, which leaves the roving stop ours.
            navigable
            navigationGrid={gridId}
            focusable
            tabStop={openIndex === null || isOpen}
            look={isOpen ? "menubar-title-open" : "menubar-title"}
            align="center"
            padding={[0, 12]}
            height={36}
            minHeight={36}
            minWidth={36}
            onPress={() => isOpen ? closeMenu(true) : openMenu(index, false)}
            onHoverChange={(inside) => {
              if (inside && open && !isOpen) openMenu(index, false);
            }}
            onKey={(key) => handleKey(key, index)}
          >
            {
              /* One run, so the row can't split "File" into two boxes and
                the mnemonic underline stays glued to its word. */
            }
            <Text typeStyle="ui-16-menu-solid" nowrap>
              {mnemonic
                ? (
                  <Text typeStyle="ui-16-menu-solid-underline">
                    {menu.label.charAt(0)}
                  </Text>
                )
                : null}
              {mnemonic ? menu.label.slice(1) : menu.label}
            </Text>
          </Box>
        );
      })}
      {openIndex !== null && dropdownStyle && (
        <Layer
          anchor={{
            kind: "screen",
            left: dropdownStyle.left,
            top: dropdownStyle.top,
          }}
          stacking="popup"
        >
          <Box
            nodeRef={(node) => {
              dropdownRef.current = node;
            }}
            direction="column"
            look="pulldown-plate"
            // The pull-down's size is its rows', inside its 2px plate.
            minWidth={204}
            maxHeight={dropdownStyle.maxHeight + 4}
            padding={2}
            onKey={(key) => handleKey(key, openIndex)}
          >
            <Scroll
              direction="column"
              grow={1}
              minHeight={0}
              scrollbar="hidden"
            >
              {items.map((item, index) =>
                item.label
                  ? (
                    <MenuRow
                      key={`${item.label}-${index}`}
                      item={item}
                      highlighted={index === highlight}
                      showGamepadHints={showGamepadHints}
                      onHighlight={() => setHighlight(index)}
                      onRun={() => runItem(item)}
                    />
                  )
                  : (
                    <Box
                      key={`separator-${index}`}
                      height={2}
                      margin={[3, 2]}
                      shrink={0}
                      surface="etched-horizontal"
                    />
                  )
              )}
            </Scroll>
          </Box>
        </Layer>
      )}
    </Box>
  );
}

/**
 * One command of a pull-down. Windows greyed a dead item and still let you
 * highlight it, so the player can read the accelerator and see for themselves
 * that it is unavailable.
 */
function MenuRow(
  { item, highlighted, showGamepadHints, onHighlight, onRun }: {
    item: MenuItem;
    highlighted: boolean;
    showGamepadHints: boolean;
    onHighlight: () => void;
    onRun: () => void;
  },
) {
  const dead = Boolean(item.disabled);
  const ink = highlighted
    ? (dead ? "rule" : "light")
    : (dead ? "rule-band" : "ink");
  const shortcutInk = dead
    ? "ink-disabled"
    : highlighted
    ? "face"
    : "ink-neutral";
  return (
    <Box
      role="none"
      fill={highlighted ? "titlebar" : undefined}
      ink={ink}
      align="center"
      gap={8}
      height={36}
      minHeight={36}
      shrink={0}
      padding={[0, 8]}
      focusable={false}
      onHoverChange={(inside) => {
        if (inside) onHighlight();
      }}
      onPress={onRun}
    >
      {
        /* A fixed slot, so labels line up whether or not a row carries a
          mark. The pixel face has no check, so the system face lends one. */
      }
      <Box width={14} shrink={0} hidden>
        <Text typeStyle="system-13-solid">{item.checked ? "✓" : ""}</Text>
      </Box>
      <Box grow={1} shrink={1} basis="auto">
        <Text typeStyle="ui-16-solid" nowrap>{item.label}</Text>
      </Box>
      <Box shrink={0} align="center" padding={[0, 0, 0, 24]} ink={shortcutInk}>
        {showGamepadHints && item.gamepadButton != null
          ? <InputPrompt action={item.gamepadButton} />
          : <Text typeStyle="mono-10-pill-solid">{item.shortcut ?? ""}</Text>}
      </Box>
    </Box>
  );
}
