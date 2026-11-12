import { getFocusedNode, host, type HostNode } from "bureau/host";
/**
 * Bureau folder tabs — the strip that picks which sheet a program is showing.
 *
 * Folder tabs are the register's form for picking a sheet; a pressed toolbar
 * button stays a toolbar button and belongs to <Button>.
 *
 * What the strip owns, beyond the pixels:
 *
 *  - A roving tab stop. The whole strip is ONE tab stop and Arrow/Home/End move
 *    inside it, which is the WAI-ARIA model: a keyboard player need not tab
 *    through every sheet name to get past the strip.
 *  - LB/RB cycling — see the handler below for why its caveat is load-bearing.
 *  - Optional badges, so a sheet can say it wants attention while the player is
 *    reading a different one.
 *
 * THE TAB'S FORM is a trapezoid slanted 10px on both sides, Mac OS 8's tab
 * panel: an ink shape with the face laid a pixel inside it, open at the
 * bottom, so the open tab and the page read as one piece of card. The host
 * draws the card whole, a slanted box, at the screen's own pixels. Each tab is
 * pulled left by both its slants, so neighbours interlock the way filed card
 * does, and the open tab lies over both of its neighbours.
 *
 * Every tab is a standard control's height, and that whole box takes the
 * pointer. The card filed behind the page is drawn shorter at the box's foot,
 * so the strip stays one control tall while the open tab still stands above
 * the rest.
 */
import React, { useRef, useState } from "react";
import { Box, type Ink, type KeyEvent, Text } from "bureau/primitives";
import { CONTROL_METRICS, EFFECTS } from "./tokens.ts";
import {
  GamepadPriority,
  useGamepadFrame,
  useHintDevice,
} from "./input/useGamepad.ts";
import { InputPrompt } from "./InputPrompt.tsx";
import { useStatus } from "./bureau_status.ts";
import { cycledTabIndex, tabIndexForKey } from "./tab_keys.ts";

/** A mark on a tab for a sheet that wants attention while another one is open. */
export type TabBadge = {
  /** One or two characters — "!" or a count. More than that blows the chip. */
  mark: string;
  tone: "alert" | "notice";
};

export type Tab<Id extends string = string> = {
  id: Id;
  label: string;
  badge?: TabBadge;
  /** Status-bar line while this tab is hovered or focused. Needs a
   *  <Frame> ancestor; outside one it is a no-op. */
  hint?: string;
};

type TabsProps<Id extends string> = {
  /** Id of the strip. Every tab derives its own id from it. */
  id: string;
  tabs: readonly Tab<Id>[];
  activeId: Id;
  onSelect: (id: Id) => void;
};

/** The tab's slant, and how far each tab is pulled over the one before. */
const SLANT = 10;
const INTERLOCK = -(SLANT * 2) + 2;
const TAB_HEIGHT = CONTROL_METRICS.standard.height;
/** The open tab stands 4px taller than the card filed behind it. */
const FILED_CARD_DROP = 4;

const BADGE_TILES = {
  alert: { fill: "fill-alert", ink: "knockout-alert" },
  notice: { fill: "fill-notice", ink: "knockout-notice" },
} as const;

/**
 * The focus mark of a tab, cut to its card: the dotted rectangle four pixels
 * inside the tab, or the pad's band lining it, shows only inside the slanted
 * ends, which is its top run between the slants and its sides below where
 * they cross the slants.
 */
function TabFocusMark({ height }: { height: number }) {
  const topRunInset = SLANT - 1;
  const sidesFrom = Math.ceil(height * 0.65);
  return (
    <>
      <Box
        position="absolute"
        inset={{ top: 0, left: topRunInset, right: topRunInset }}
        height={EFFECTS.padFocus.backing}
        overflow="hidden"
        passThrough
      >
        <Box
          position="absolute"
          inset={{ top: 0, left: -topRunInset, right: -topRunInset }}
          height={height}
          look="tab-focus-mark"
        />
      </Box>
      <Box
        position="absolute"
        inset={{ top: sidesFrom, left: 0, right: 0, bottom: 0 }}
        overflow="hidden"
        passThrough
      >
        <Box
          position="absolute"
          inset={{ top: -sidesFrom, left: 0, right: 0 }}
          height={height}
          look="tab-focus-mark"
        />
      </Box>
    </>
  );
}

function TabKey(
  {
    stripId,
    tab,
    selected,
    tabStop,
    interlocks,
    leadingGlyph,
    trailingGlyph,
    nodeRef,
    onPress,
    onKey,
  }: {
    stripId: string;
    tab: Tab;
    selected: boolean;
    tabStop: boolean;
    interlocks: boolean;
    leadingGlyph?: React.ReactNode;
    trailingGlyph?: React.ReactNode;
    nodeRef: (node: HostNode | null) => void;
    onPress: () => void;
    onKey: (key: KeyEvent) => boolean;
  },
) {
  const setStatus = useStatus();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const drop = selected ? 0 : FILED_CARD_DROP;
  // Card filed behind the page lifts under the pointer; the open tab never
  // changes at all.
  const face: Ink = hovered && !selected ? "face-light" : "face";
  const { badge, hint } = tab;
  return (
    <Box
      nodeRef={nodeRef}
      id={`${stripId}-${tab.id}`}
      selected={selected}
      // The name is spelled out even without a badge: the bumper glyphs are
      // pictures with names of their own, which would join the tab's.
      focusable
      tabStop={tabStop}
      look="tab"
      ink="ink"
      align="center"
      gap={6}
      height={TAB_HEIGHT}
      minHeight={TAB_HEIGHT}
      minWidth={36}
      shrink={0}
      padding={[drop, SLANT + 14, 0, SLANT + 14]}
      margin={interlocks ? [0, 0, 0, INTERLOCK] : 0}
      onPress={onPress}
      onKey={onKey}
      onHoverChange={(inside) => {
        setHovered(inside);
        if (hint) setStatus(inside ? hint : "");
      }}
      onFocusChange={(inside) => {
        setFocused(inside);
        if (hint) setStatus(inside ? hint : "");
      }}
    >
      <Box
        position="absolute"
        inset={{ top: drop, left: 0, right: 0, bottom: 0 }}
        slant={SLANT}
        fill={face}
        surface="tab-top"
        passThrough
      >
        {
          // Any focus, not only one the keyboard moved: a bumper moves focus
          // from code, and the tab it lands on must show it.
          focused && <TabFocusMark height={TAB_HEIGHT - drop} />
        }
      </Box>
      {leadingGlyph}
      <Text typeStyle="ui-14-tab-solid" nowrap>{tab.label}</Text>
      {badge && (
        // A chip, not an icon: a bare mark on chrome reads as punctuation.
        <Box
          minWidth={18}
          height={18}
          padding={[0, 4]}
          align="center"
          justify="center"
          surface="ink-ring"
          fill={BADGE_TILES[badge.tone].fill}
          ink={BADGE_TILES[badge.tone].ink}
          hidden
        >
          <Text typeStyle="ui-12-solid">{badge.mark}</Text>
        </Box>
      )}
      {trailingGlyph}
    </Box>
  );
}

export function Tabs<Id extends string>(
  { id, tabs, activeId, onSelect }: TabsProps<Id>,
) {
  const inputMode = useHintDevice();
  const showGamepadHints = inputMode === "gamepad";
  const keys = useRef(new Map<Id, HostNode>());

  const selectedIndex = tabs.findIndex((tab) => tab.id === activeId);
  // -1 means the program is showing a sheet this strip does not list. The first
  // tab then holds the roving stop, so the strip is still reachable by Tab
  // instead of becoming a row nobody can enter.
  const rovingIndex = selectedIndex < 0 ? 0 : selectedIndex;

  const select = (nextId: Id, moveFocus: boolean) => {
    onSelect(nextId);
    // Focus follows a keyboard or bumper move, because the roving stop moves
    // with the selection and would otherwise be left on a tab nobody is on.
    // A pointer press leaves focus where the pointer put it.
    if (moveFocus) host.focus(keys.current.get(nextId));
  };

  const handleKey = (key: KeyEvent) => {
    if (key.phase !== "down") return false;
    const nextIndex = tabIndexForKey(key.key, rovingIndex, tabs.length);
    if (nextIndex === null) return false;
    const nextTab = tabs[nextIndex];
    if (nextTab) select(nextTab.id, true);
    return true;
  };

  // LB/RB flip the sheets, the way they cycle them in the bank and the toolbox
  // — but never while a text box has focus, because the same two bumpers are how
  // a pad steps the number inside one. Registered just below the form controls'
  // UI band so that hook keeps the bumpers whenever it is the one that needs
  // them; a strip of one has nothing to cycle and stays off the frame entirely.
  useGamepadFrame(
    (input) => {
      if (!input.connected) return;
      const focused = getFocusedNode();
      const control = focused ? host.control(focused) : null;
      const typing = control?.kind === "text" || control?.kind === "number";
      if (typing) return;

      // `wasPressed` consumes the button, so RB is asked first and LB only when
      // RB did not fire — asking both unconditionally would eat a press meant
      // for a lower-priority handler.
      const step = input.wasPressed("menu_tab_next")
        ? 1
        : input.wasPressed("menu_tab_previous")
        ? -1
        : 0;
      if (step === 0) return;

      const nextIndex = cycledTabIndex(rovingIndex, step, tabs.length);
      const nextTab = nextIndex === null ? undefined : tabs[nextIndex];
      if (nextTab) select(nextTab.id, true);
    },
    { enabled: tabs.length > 1, priority: GamepadPriority.UI - 10 },
  );

  const showBumperGlyphs = showGamepadHints && tabs.length > 1;
  const lastIndex = tabs.length - 1;
  const key = (tab: Tab<Id>, index: number) => (
    <TabKey
      key={tab.id}
      stripId={id}
      tab={tab}
      selected={tab.id === activeId}
      tabStop={index === rovingIndex}
      interlocks={index > 0}
      leadingGlyph={showBumperGlyphs && index === 0 && (
        <InputPrompt action="menu_tab_previous" />
      )}
      trailingGlyph={showBumperGlyphs && index === lastIndex && (
        <InputPrompt action="menu_tab_next" />
      )}
      nodeRef={(node) => {
        if (node) keys.current.set(tab.id, node);
        else keys.current.delete(tab.id);
      }}
      onPress={() => select(tab.id, false)}
      onKey={handleKey}
    />
  );

  // The open tab lies over both its neighbours. Boxes paint in the order they
  // come, so the tabs after it come before it, laid out to its right: the row
  // reads left to right while the open tab paints last.
  const before = selectedIndex < 0 ? tabs : tabs.slice(0, selectedIndex);
  const open = selectedIndex < 0 ? undefined : tabs[selectedIndex];
  const after = selectedIndex < 0 ? [] : tabs.slice(selectedIndex + 1);
  // The strip hangs a pixel over the page after it and paints over it, so the
  // open tab covers the page's rule: a sticky box stands above what follows
  // it, and with no inset it never moves.
  return (
    <Box
      id={id}
      position="sticky"
      align="end"
      shrink={0}
      margin={[0, 0, -1, 0]}
    >
      {before.map((tab, index) => key(tab, index))}
      {open && (
        <Box direction="row-reverse" align="end" shrink={0}>
          <Box align="end" shrink={0}>
            {after.map((tab, index) => key(tab, selectedIndex + 1 + index))}
          </Box>
          {key(open, selectedIndex)}
        </Box>
      )}
    </Box>
  );
}

/**
 * A notebook: one subject, several aspects of it.
 *
 * This is the canonical shape for a tabbed program on the mayor's computer. A
 * notebook is NOT navigation between unrelated screens — it is the payroll and
 * the workplaces that pay it, the grid and the market that supplies it. The
 * form says so: filed card in front of the page it is filed in.
 *
 * The strip sits on a ground one step darker than the page, so the page reads
 * as lifted and the unselected card as behind it. The page's top rule is the
 * line every tab is cut against; the strip hangs a pixel over it, so the open
 * tab's face covers the rule and the card behind it does not.
 */
export function Notebook<Id extends string>(
  { id, tabs, activeId, onSelect, children }:
    & TabsProps<Id>
    & { children: React.ReactNode },
) {
  const pageId = `${id}-page`;
  return (
    <Box
      direction="column"
      grow={1}
      shrink={1}
      basis="auto"
      minWidth={0}
      minHeight={0}
      fill="notebook-ground"
    >
      {
        /* The strip comes first, so Tab reaches the sheets before what is on
          them. */
      }
      <Box align="end" shrink={0} padding={[6, 8, 0, 8]}>
        <Tabs
          id={id}
          tabs={tabs}
          activeId={activeId}
          onSelect={onSelect}
        />
      </Box>
      <Box
        id={pageId}
        direction="column"
        grow={1}
        shrink={1}
        basis="auto"
        minWidth={0}
        minHeight={0}
        fill="face"
        surface="notebook-page"
      >
        {children}
      </Box>
    </Box>
  );
}
