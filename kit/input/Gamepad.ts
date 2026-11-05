/** Selects one pad, conditions its input and resolves action edges once per frame. */
import { platform } from "platform";
import {
  GamepadAxis,
  GamepadButton,
  type GamepadSnapshot,
  type PadContext,
} from "./pad_types.ts";
import {
  actionButtons,
  actionIsActive,
  PAD_ACTION_NAMES,
  PAD_ACTIONS,
  PAD_HOLD_MS,
  type PadAction,
} from "bureau/pad_actions";
export {
  GamepadAxis,
  GamepadButton,
  type GamepadSnapshot,
} from "./pad_types.ts";

export type GamepadSelection =
  | { mode: "auto" }
  | { mode: "off" }
  | { mode: "device"; deviceId: string };
export const DEFAULT_GAMEPAD_SELECTION: GamepadSelection = { mode: "auto" };
export type RawPadButton = GamepadButton;
export type ActionAnalog = { x: number; y: number; mode: "stick" | "delta" };
interface ButtonState {
  pressed: boolean;
  justPressed: boolean;
  justReleased: boolean;
}
const DEAD_ZONE = 0.15;
const PRESS_THRESHOLD = 0.5;
const ACTIVE_THRESHOLD = 0.3;
const ZERO_ANALOG: ActionAnalog = { x: 0, y: 0, mode: "stick" };
const RELEASED: ButtonState = {
  pressed: false,
  justPressed: false,
  justReleased: false,
};

const hasActivity = (pad: GamepadSnapshot): boolean => {
  if (pad.buttons.some((value) => value > PRESS_THRESHOLD)) return true;
  if (pad.axes.some((value) => Math.abs(value) > ACTIVE_THRESHOLD)) return true;
  return Object.values(pad.actions ?? {}).some((value) => {
    if (typeof value === "number") return value > PRESS_THRESHOLD;
    const threshold = value.mode === "absolute_mouse" ? 0 : ACTIVE_THRESHOLD;
    return Math.abs(value.x) > threshold || Math.abs(value.y) > threshold;
  });
};

export function resolveActiveGamepadIndex(
  gamepads: readonly GamepadSnapshot[],
  selection: GamepadSelection,
  previousIndex: number | null,
): number | null {
  if (selection.mode === "off") return null;
  if (selection.mode === "device") {
    const pinned = gamepads.findIndex((pad) =>
      (pad.name ?? pad.id) === selection.deviceId ||
      pad.id === selection.deviceId
    );
    return pinned < 0 ? null : pinned;
  }
  const previous = previousIndex === null ? undefined : gamepads[previousIndex];
  if (previous && hasActivity(previous)) return previousIndex;
  const active = gamepads.findIndex(hasActivity);
  if (active >= 0) return active;
  if (previous) return previousIndex;
  return gamepads.length ? 0 : null;
}

function conditionedStick(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length <= DEAD_ZONE) return { x: 0, y: 0 };
  const scale = (Math.min(length, 1) - DEAD_ZONE) / (1 - DEAD_ZONE) / length;
  return { x: x * scale, y: y * scale };
}

export function confirmAction(
  action: PadAction,
  confirm: "bottom" | "right",
): PadAction {
  if (confirm === "bottom") return action;
  if (action === "menu_confirm") return "menu_back";
  if (action === "menu_back") return "menu_confirm";
  if (action === "city_use") return "city_cancel";
  if (action === "city_cancel") return "city_use";
  if (action === "map_choose") return "map_back";
  if (action === "map_back") return "map_choose";
  return action;
}

export class GamepadManager {
  private pad: GamepadSnapshot | null = null;
  private selection: GamepadSelection = DEFAULT_GAMEPAD_SELECTION;
  private confirm: "bottom" | "right" = "bottom";
  private context: PadContext = { set: "menu", layers: [] };
  private buttons = new Map<GamepadButton, ButtonState>();
  private buttonValues = new Map<GamepadButton, number>();
  private axes = [0, 0, 0, 0];
  private previousAxes = [0, 0, 0, 0];
  private actionStates = new Map<PadAction, ButtonState>();
  private actionValues = new Map<PadAction, number>();
  private analogValues = new Map<PadAction, ActionAnalog>();
  private previousAnalog = new Map<PadAction, ActionAnalog>();
  private onConnectCallback?: () => void;
  private onDisconnectCallback?: () => void;
  private onLostCallback?: () => void;
  private selectionChanged = false;
  private updates = new Set<() => void>();
  private previousTime: number | null = null;
  private frameSeconds = 1 / 60;
  private viewStarted: number | null = null;
  private suppressEdges = false;
  private lastSequence: number | undefined;

  onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }
  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }
  onUpdate(callback: () => void): () => void {
    this.updates.add(callback);
    return () => this.updates.delete(callback);
  }
  onActivePadLost(callback: () => void): void {
    this.onLostCallback = callback;
  }
  setSelection(selection: GamepadSelection): void {
    if (JSON.stringify(selection) !== JSON.stringify(this.selection)) {
      this.selectionChanged = true;
    }
    this.selection = selection;
  }
  setConfirmPreference(confirm: "bottom" | "right"): void {
    if (this.confirm === confirm) return;
    this.confirm = confirm;
    this.clearInput();
  }
  setContext(context: PadContext): void {
    const same = this.context.set === context.set &&
      this.context.layers.join() === context.layers.join();
    if (same) return;
    this.context = { set: context.set, layers: [...context.layers] };
    this.clearInput();
  }
  getContext(): PadContext {
    return this.context;
  }

  tick(now = performance.now()): void {
    this.frameSeconds = this.previousTime === null
      ? 1 / 60
      : Math.min(0.1, Math.max(0, (now - this.previousTime) / 1000));
    this.previousTime = now;
    const pads = platform.input.gamepads.read(true);
    const previousId = this.pad?.id;
    const previousIndex = previousId
      ? pads.findIndex((pad) => pad.id === previousId)
      : -1;
    const index = resolveActiveGamepadIndex(
      pads,
      this.selection,
      previousIndex < 0 ? null : previousIndex,
    );
    const next = index === null ? null : pads[index] ?? null;
    const previous = this.pad;
    const policyChanged = previous?.sourceEpoch !== undefined &&
      next?.sourceEpoch !== undefined &&
      previous.sourceEpoch !== next.sourceEpoch;
    const sameSteamDevice = previous?.steamHandle !== undefined &&
      previous.steamHandle === next?.steamHandle;
    const sourceChanged = previous?.source !== next?.source &&
      (previous?.source === "steam" || next?.source === "steam");
    const sourceHandoff = sourceChanged && (policyChanged || sameSteamDevice);
    const lostActivePad = previous !== null && previousIndex < 0 &&
      !sourceHandoff;
    const changed = next?.id !== previousId;
    const wasConnected = this.pad !== null;
    if (changed) this.clearInput();
    this.pad = next;
    if (lostActivePad && !this.selectionChanged) this.onLostCallback?.();
    this.selectionChanged = false;
    if (lostActivePad || (wasConnected && !next)) this.onDisconnectCallback?.();
    if (!wasConnected && next) this.onConnectCallback?.();
    if (next) {
      // First contact may be the player's confirm press; later hand-offs cannot
      // turn a button held on the old device into a new press on another.
      if (!wasConnected) this.suppressEdges = false;
      this.updateButtons(next.buttons);
      this.updateAxes(next.axes);
      this.updateActions(next, now);
      this.lastSequence = next.sequence;
      this.suppressEdges = false;
    }
    for (const callback of this.updates) callback();
  }

  private clearInput(): void {
    this.buttons.clear();
    this.buttonValues.clear();
    this.axes = [0, 0, 0, 0];
    this.previousAxes = [0, 0, 0, 0];
    this.actionStates.clear();
    this.actionValues.clear();
    this.analogValues.clear();
    this.previousAnalog.clear();
    this.viewStarted = null;
    this.lastSequence = undefined;
    this.suppressEdges = true;
  }

  private edge(pressed: boolean, previous: boolean): ButtonState {
    return {
      pressed,
      justPressed: !this.suppressEdges && pressed && !previous,
      justReleased: !this.suppressEdges && !pressed && previous,
    };
  }
  private updateButtons(values: number[]): void {
    for (let button = 0; button <= GamepadButton.R5; button++) {
      let source = button;
      if (this.confirm === "right" && button === GamepadButton.A) {
        source = GamepadButton.B;
      } else if (this.confirm === "right" && button === GamepadButton.B) {
        source = GamepadButton.A;
      }
      const raw = Math.max(0, Math.min(1, values[source] ?? 0));
      const trigger = button === GamepadButton.LT ||
        button === GamepadButton.RT;
      const value = trigger ? Math.max(0, (raw - 0.1) / 0.9) : raw;
      this.buttonValues.set(button, value);
      this.buttons.set(
        button,
        this.edge(
          value > PRESS_THRESHOLD,
          this.buttons.get(button)?.pressed ?? false,
        ),
      );
    }
  }
  private updateAxes(values: number[]): void {
    const left = conditionedStick(values[0] ?? 0, values[1] ?? 0);
    const right = conditionedStick(values[2] ?? 0, values[3] ?? 0);
    this.previousAxes = this.axes;
    this.axes = [left.x, left.y, right.x, right.y];
  }

  private updateActions(pad: GamepadSnapshot, now: number): void {
    const view = this.buttons.get(GamepadButton.BACK) ?? RELEASED;
    if (view.justPressed && this.context.set === "city") this.viewStarted = now;
    const viewDuration = this.viewStarted === null ? 0 : now - this.viewStarted;
    const viewTap = view.justReleased && this.viewStarted !== null &&
      viewDuration < PAD_HOLD_MS;
    const viewHold = view.pressed && this.viewStarted !== null &&
      viewDuration >= PAD_HOLD_MS;
    const repeatedSample = pad.sequence !== undefined &&
      pad.sequence === this.lastSequence;
    this.previousAnalog = this.analogValues;
    this.analogValues = new Map();
    for (const action of PAD_ACTION_NAMES) {
      const definition = PAD_ACTIONS[action];
      let value = 0;
      let analog: ActionAnalog = ZERO_ANALOG;
      const active = pad.actions
        ? definition.set === this.context.set &&
          (!definition.layer || this.context.layers.includes(definition.layer))
        : actionIsActive(action, this.context.set, this.context.layers);
      if (active && pad.actions) {
        const native = pad.actions[
          confirmAction(action, this.confirm)
        ];
        if (typeof native === "number") value = native;
        else if (native) {
          const delta = native.mode === "absolute_mouse";
          const vector = delta ? native : conditionedStick(native.x, native.y);
          analog = {
            x: delta && repeatedSample ? 0 : vector.x,
            y: delta && repeatedSample ? 0 : vector.y,
            mode: delta ? "delta" : "stick",
          };
        }
      } else if (active) {
        value = Math.max(
          0,
          ...actionButtons(action, this.context.set, this.context.layers).map((
            button,
          ) => this.getButtonValue(button)),
        );
        if (definition.axes) {
          analog = {
            x: this.getAxis(definition.axes[0]),
            y: this.getAxis(definition.axes[1]),
            mode: "stick",
          };
        }
        if (definition.direction) {
          const stick = this.getLeftStick();
          const directions = {
            up: -stick.y,
            down: stick.y,
            left: -stick.x,
            right: stick.x,
          };
          if (directions[definition.direction] > ACTIVE_THRESHOLD) value = 1;
        }
        if (definition.activation === "tap") value = viewTap ? 1 : 0;
        if (definition.activation === "hold") value = viewHold ? 1 : 0;
      }
      this.actionValues.set(action, value);
      this.analogValues.set(action, analog);
      this.actionStates.set(
        action,
        this.edge(
          value > PRESS_THRESHOLD,
          this.actionStates.get(action)?.pressed ?? false,
        ),
      );
    }
    if (view.justReleased) this.viewStarted = null;
  }

  /** Alias actions cannot spend the same physical press twice. */
  actionControlKeys(action: PadAction): string[] {
    const origins = this.pad?.origins?.[
      confirmAction(action, this.confirm)
    ];
    if (origins?.length) {
      return origins.map((origin) =>
        `origin:${origin.label ?? origin.image ?? origin.name}`
      );
    }
    const definition = PAD_ACTIONS[action];
    const pressed = definition.buttons?.filter((button) =>
      this.isButtonPressed(button)
    );
    const buttons = pressed?.length ? pressed : definition.buttons;
    if (buttons?.length) return buttons.map((button) => `button:${button}`);
    return [`action:${action}`];
  }

  isButtonPressed(button: GamepadButton): boolean {
    return this.buttons.get(button)?.pressed ?? false;
  }
  isButtonJustPressed(button: GamepadButton): boolean {
    return this.buttons.get(button)?.justPressed ?? false;
  }
  isButtonJustReleased(button: GamepadButton): boolean {
    return this.buttons.get(button)?.justReleased ?? false;
  }
  getButtonValue(button: GamepadButton): number {
    return this.buttonValues.get(button) ?? 0;
  }
  getAxis(axis: GamepadAxis): number {
    return this.axes[axis] ?? 0;
  }
  getLeftStick(): { x: number; y: number } {
    return { x: this.axes[0]!, y: this.axes[1]! };
  }
  getRightStick(): { x: number; y: number } {
    return { x: this.axes[2]!, y: this.axes[3]! };
  }
  isConnected(): boolean {
    return this.pad !== null;
  }
  getActiveGamepadId(): string | null {
    return this.pad?.id ?? null;
  }
  getActiveGamepad(): GamepadSnapshot | null {
    return this.pad;
  }
  getDeltaSeconds(): number {
    return this.frameSeconds;
  }
  wasPressed(action: PadAction): boolean {
    return this.actionStates.get(action)?.justPressed ?? false;
  }
  wasReleased(action: PadAction): boolean {
    return this.actionStates.get(action)?.justReleased ?? false;
  }
  isHeld(action: PadAction): boolean {
    return this.actionStates.get(action)?.pressed ?? false;
  }
  value(action: PadAction): number {
    return this.actionValues.get(action) ?? 0;
  }
  analog(action: PadAction): ActionAnalog {
    return this.analogValues.get(action) ?? ZERO_ANALOG;
  }

  hasActiveInput(): boolean {
    if (
      [...this.buttons.values(), ...this.actionStates.values()].some((state) =>
        state.justPressed
      )
    ) return true;
    if (this.suppressEdges) return false;
    if (
      this.axes.some((value, axis) =>
        Math.abs(value) > ACTIVE_THRESHOLD &&
        Math.abs(this.previousAxes[axis] ?? 0) <= ACTIVE_THRESHOLD
      )
    ) return true;
    for (const [action, value] of this.analogValues) {
      const previous = this.previousAnalog.get(action) ?? ZERO_ANALOG;
      const moving = Math.hypot(value.x, value.y);
      if (value.mode === "delta" && moving > 0) return true;
      if (
        moving > ACTIVE_THRESHOLD &&
        Math.hypot(previous.x, previous.y) <= ACTIVE_THRESHOLD
      ) return true;
    }
    return false;
  }
}
