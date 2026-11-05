/**
 * What the kit asks of the machine. The kit imports it as the bare specifier
 * `platform`, which a game's import map resolves: to native_platform.ts here,
 * or to a platform of the game's own that offers at least this.
 */
import type { GamepadSnapshot, PadContext } from "./input/pad_types.ts";

export type Unsubscribe = () => void;

export interface KitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface KitPlatform {
  readonly storage: { readonly persistent: KitStorage };
  readonly timers: {
    setTimeout(callback: () => void, delayMs?: number): number;
    clearTimeout(id: number | undefined): void;
  };
  readonly frame: {
    request(callback: (time: number) => void): number;
    cancel(id: number): void;
  };
  readonly capabilities: {
    readonly clipboard: boolean;
    /** The screen is too small for a legend and an instrument together. */
    readonly foldsMapPanels: boolean;
  };
  readonly clipboard: { writeText(value: string): Promise<void> };
  readonly assets: { text(path: string): Promise<string | null> };
  readonly shell: {
    /** Where the game runs; `platform: "ios"` opens with touch prompts. */
    readonly identity: { readonly platform: string } | undefined;
    /** A pad in hand from the first frame. */
    readonly isSteamDeck: boolean | undefined;
  };
  readonly log: { error(message: string, ...details: unknown[]): void };
  readonly report: {
    captureException(error: unknown, details?: object): unknown;
  };
  readonly input: {
    readonly activity: {
      subscribe(listener: (mode: "mouse" | "touch") => void): Unsubscribe;
    };
    readonly gamepads: {
      read(consumeDeltas?: boolean): readonly GamepadSnapshot[];
      setContext(context: PadContext): void;
      /** A platform's own on-screen keyboard; false when it has none. */
      showKeyboard(
        rect: { x: number; y: number; width: number; height: number },
      ): Promise<boolean>;
      dismissKeyboard(): void;
    };
  };
}
