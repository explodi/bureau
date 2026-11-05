// Standard Xinput button mapping (matches most modern controllers)
export enum GamepadButton {
  A = 0, // Bottom button (confirm)
  B = 1, // Right button (cancel)
  X = 2, // Left button
  Y = 3, // Top button
  LB = 4, // Left bumper
  RB = 5, // Right bumper
  LT = 6, // Left trigger
  RT = 7, // Right trigger
  BACK = 8, // Back/Select button
  START = 9, // Start button
  L_STICK = 10, // Left stick press
  R_STICK = 11, // Right stick press
  DPAD_UP = 12, // D-pad up
  DPAD_DOWN = 13, // D-pad down
  DPAD_LEFT = 14, // D-pad left
  DPAD_RIGHT = 15, // D-pad right
  L4 = 16, // Steam Deck upper-left back grip
  R4 = 17, // Steam Deck upper-right back grip
  L5 = 18, // Steam Deck lower-left back grip
  R5 = 19, // Steam Deck lower-right back grip
}

// Analog stick axes (standard mapping)
export enum GamepadAxis {
  LEFT_X = 0, // Left stick horizontal (-1 = left, 1 = right)
  LEFT_Y = 1, // Left stick vertical (-1 = up, 1 = down)
  RIGHT_X = 2, // Right stick horizontal
  RIGHT_Y = 3, // Right stick vertical
}

/** One controller as the shell reads it, in the standard mapping. */
export type GamepadSnapshot = {
  /** Unique for this connection, even when two pads share a product name. */
  id: string;
  /** Product name; old `pad:<name>` preferences continue to match it. */
  name?: string;
  family?: PadFamily;
  source?: PadSource;
  labels?: (PadLabel | null)[];
  steamHandle?: string;
  /** macOS switches its entire raw/Steam source without matching device names. */
  sourceEpoch?: number;
  /** Native sample identity; relative mouse deltas are consumed once. */
  sequence?: number;
  actions?: Record<string, number | PadAnalogValue>;
  origins?: Record<string, PadOrigin[]>;
  /** Each button's value, 0 to 1, by GamepadButton. */
  buttons: number[];
  /** Each axis, -1 to 1, by GamepadAxis. */
  axes: number[];
};

export type PadFamily =
  | "xbox"
  | "playstation"
  | "nintendo"
  | "steam-deck"
  | "steam-controller"
  | "generic";
export type PadSource = "sdl" | "gamecontroller" | "steam";
export type PadLabel = string;
export type PadSet = "menu" | "city";
export type PadLayer =
  | "placing"
  | "map"
  | "panel"
  | "panel_navigation"
  | "notification"
  | "tutorial";
export type PadContext = { set: PadSet; layers: PadLayer[] };
export type PadAnalogValue = {
  x: number;
  y: number;
  mode: "absolute_mouse" | "joystick_move";
};
export type PadOrigin = { label?: PadLabel; image?: string; name: string };
