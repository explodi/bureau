/**
 * The actions a controller drives: what the kit's controls answer to. A game
 * with more maps `bureau/pad_actions` to a table of its own, spreading these
 * groups in, and the kit and its types then read that table.
 */
import {
  GamepadAxis,
  GamepadButton,
  type PadLayer,
  type PadSet,
} from "./pad_types.ts";

export type PadActionDefinition = {
  set: PadSet;
  layer?: PadLayer;
  kind: "button" | "analog" | "trigger";
  title: string;
  mode?: "absolute_mouse" | "joystick_move";
  buttons?: readonly GamepadButton[];
  axes?: readonly [GamepadAxis, GamepadAxis];
  direction?: "up" | "down" | "left" | "right";
  activation?: "tap" | "hold";
};

export const PAD_HOLD_MS = 300;

export const padButton = (
  set: PadSet,
  title: string,
  buttons: GamepadButton[],
  extra: Partial<PadActionDefinition> = {},
): PadActionDefinition => ({ set, title, buttons, kind: "button", ...extra });

export const padAnalog = (
  set: PadSet,
  title: string,
  axes: [GamepadAxis, GamepadAxis],
  mode: "absolute_mouse" | "joystick_move" = "joystick_move",
): PadActionDefinition => ({ set, title, axes, mode, kind: "analog" });

export const MENU_PAD_ACTIONS = {
  menu_up: padButton("menu", "Move up", [GamepadButton.DPAD_UP], {
    direction: "up",
  }),
  menu_down: padButton("menu", "Move down", [GamepadButton.DPAD_DOWN], {
    direction: "down",
  }),
  menu_left: padButton("menu", "Move left", [GamepadButton.DPAD_LEFT], {
    direction: "left",
  }),
  menu_right: padButton("menu", "Move right", [GamepadButton.DPAD_RIGHT], {
    direction: "right",
  }),
  menu_confirm: padButton("menu", "Confirm", [GamepadButton.A]),
  menu_back: padButton("menu", "Back", [GamepadButton.B]),
  menu_secondary: padButton("menu", "Secondary action", [GamepadButton.X]),
  menu_tertiary: padButton("menu", "Additional action", [GamepadButton.Y]),
  menu_tab_previous: padButton("menu", "Previous tab", [GamepadButton.LB]),
  menu_tab_next: padButton("menu", "Next tab", [GamepadButton.RB]),
  menu_scroll: padAnalog("menu", "Scroll", [
    GamepadAxis.RIGHT_X,
    GamepadAxis.RIGHT_Y,
  ]),
  menu_start: padButton("menu", "Game menu", [GamepadButton.START]),
} as const satisfies Record<string, PadActionDefinition>;

/** What uses and backs out of things while the game has the controller. */
export const PLAY_PAD_ACTIONS = {
  city_use: padButton("city", "Select or place", [GamepadButton.A]),
  city_cancel: padButton("city", "Cancel", [GamepadButton.B]),
} as const satisfies Record<string, PadActionDefinition>;

/** An instrument's keys over the game: its layer claims every face button, the
 * D-pad and the bumpers, so no binding of the game's answers beneath it. */
export const MAP_PAD_ACTIONS = {
  map_left: padButton("city", "Previous tab", [GamepadButton.DPAD_LEFT], {
    layer: "map",
  }),
  map_right: padButton("city", "Next tab", [GamepadButton.DPAD_RIGHT], {
    layer: "map",
  }),
  map_up: padButton("city", "Previous item", [GamepadButton.DPAD_UP], {
    layer: "map",
  }),
  map_down: padButton("city", "Next item", [GamepadButton.DPAD_DOWN], {
    layer: "map",
  }),
  map_choose: padButton("city", "Choose or place", [GamepadButton.A], {
    layer: "map",
  }),
  map_back: padButton("city", "Back", [GamepadButton.B], { layer: "map" }),
  map_delete: padButton("city", "Delete item", [GamepadButton.X], {
    layer: "map",
  }),
  map_main: padButton("city", "Main action", [GamepadButton.Y], {
    layer: "map",
  }),
} as const satisfies Record<string, PadActionDefinition>;

export const PANEL_PAD_ACTIONS = {
  panel_up: padButton("city", "Move panel focus up", [GamepadButton.DPAD_UP], {
    layer: "panel_navigation",
  }),
  panel_down: padButton(
    "city",
    "Move panel focus down",
    [GamepadButton.DPAD_DOWN],
    { layer: "panel_navigation" },
  ),
  panel_left: padButton(
    "city",
    "Move panel focus left",
    [GamepadButton.DPAD_LEFT],
    { layer: "panel_navigation" },
  ),
  panel_right: padButton("city", "Move panel focus right", [
    GamepadButton.DPAD_RIGHT,
  ], { layer: "panel_navigation" }),
  panel_secondary: padButton("city", "Panel secondary action", [
    GamepadButton.X,
  ], { layer: "panel" }),
  panel_tertiary: padButton("city", "Panel additional action", [
    GamepadButton.Y,
  ], { layer: "panel" }),
} as const satisfies Record<string, PadActionDefinition>;

/**
 * Layer precedence is independent of React's child-first effect order. The
 * map lies lowest: a card opened on it lays its own keys over the map's while
 * it is up.
 */
export const PAD_LAYER_ORDER: PadLayer[] = [
  "map",
  "panel",
  "panel_navigation",
  "placing",
  "notification",
  "tutorial",
];

/** What a table of actions answers, for whichever table a game maps. */
export function padActionLookups<Action extends string>(
  table: Record<Action, PadActionDefinition>,
) {
  const names = Object.keys(table) as Action[];

  function actionIsActive(
    action: Action,
    set: PadSet,
    layers: readonly PadLayer[],
  ): boolean {
    const definition = table[action];
    return definition.set === set &&
      (!definition.layer || layers.includes(definition.layer));
  }

  /** A layer masks only its physical bindings, preserving alternate back grips. */
  function actionButtons(
    action: Action,
    set: PadSet,
    layers: readonly PadLayer[],
  ): readonly GamepadButton[] {
    if (!actionIsActive(action, set, layers)) return [];
    const definition = table[action];
    const rank = definition.layer ? layers.lastIndexOf(definition.layer) : -1;
    return (definition.buttons ?? []).filter((button) =>
      !names.some((other) => {
        const candidate = table[other];
        if (!candidate.layer || candidate.set !== set) return false;
        if (layers.lastIndexOf(candidate.layer) <= rank) return false;
        return candidate.buttons?.includes(button);
      })
    );
  }

  function defaultActionButton(action: Action): GamepadButton | undefined {
    return table[action].buttons?.[0];
  }

  return {
    PAD_ACTION_NAMES: names,
    actionIsActive,
    actionButtons,
    defaultActionButton,
  };
}

export const PAD_ACTIONS = {
  ...MENU_PAD_ACTIONS,
  ...PLAY_PAD_ACTIONS,
  ...MAP_PAD_ACTIONS,
  ...PANEL_PAD_ACTIONS,
};

export type PadAction = keyof typeof PAD_ACTIONS;

export const {
  PAD_ACTION_NAMES,
  actionIsActive,
  actionButtons,
  defaultActionButton,
} = padActionLookups(PAD_ACTIONS);
