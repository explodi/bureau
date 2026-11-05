import { assertEquals } from "@std/assert";
import { installPlatform } from "platform";
import { testPlatform } from "platform";
import {
  GamepadButton,
  GamepadManager,
  type GamepadSnapshot,
  resolveActiveGamepadIndex,
} from "./Gamepad.ts";
import {
  decodeGamepadSelection,
  getGamepadSelection,
  setGamepadSelection,
  subscribeGamepadSelection,
} from "./gamepadPreferences.ts";

// A pad as the shell reports it. `active` gives it a pressed A so it counts
// as "the pad in use".
const pad = (id: string, active = false): GamepadSnapshot => ({
  id,
  buttons: [active ? 1 : 0],
  axes: [0, 0],
});

/** Runs `run` while the shell reports `pads`, which it may change. */
function withShellPads(pads: GamepadSnapshot[], run: () => void): void {
  const restore = installPlatform({
    ...testPlatform,
    input: {
      ...testPlatform.input,
      gamepads: { ...testPlatform.input.gamepads, read: () => pads },
    },
  });
  try {
    run();
  } finally {
    restore();
  }
}

Deno.test("auto: falls back to the first connected pad when none is active", () => {
  assertEquals(
    resolveActiveGamepadIndex([pad("A")], { mode: "auto" }, null),
    0,
  );
});

Deno.test("auto: switches to whichever pad the player is actively using", () => {
  const pads = [pad("A"), pad("B", true)];
  assertEquals(resolveActiveGamepadIndex(pads, { mode: "auto" }, 0), 1);
});

Deno.test("auto: stays on the current pad while it's idle and connected", () => {
  const pads = [pad("A"), pad("B")];
  assertEquals(resolveActiveGamepadIndex(pads, { mode: "auto" }, 1), 1);
});

Deno.test("auto: two pads mirroring one input keep the current one", () => {
  const pads = [pad("Steam Virtual Gamepad", true), pad("Xbox", true)];
  assertEquals(resolveActiveGamepadIndex(pads, { mode: "auto" }, 1), 1);
});

Deno.test("auto: recovers to the first connected pad when the active one drops", () => {
  const pads = [pad("B")];
  assertEquals(resolveActiveGamepadIndex(pads, { mode: "auto" }, 1), 0);
});

Deno.test("off: ignores every pad, even an actively-pressed one", () => {
  assertEquals(
    resolveActiveGamepadIndex([pad("A", true)], { mode: "off" }, 0),
    null,
  );
});

Deno.test("device: pins the chosen pad and ignores a noisy other one", () => {
  // The flight stick (index 0) is spamming input; the pinned Xbox pad wins.
  const pads = [pad("flight-stick", true), pad("xbox")];
  assertEquals(
    resolveActiveGamepadIndex(pads, { mode: "device", deviceId: "xbox" }, 0),
    1,
  );
});

Deno.test("device: goes silent when the pinned pad is unplugged (no fallback)", () => {
  const pads = [pad("flight-stick", true)];
  assertEquals(
    resolveActiveGamepadIndex(pads, { mode: "device", deviceId: "xbox" }, null),
    null,
  );
});

Deno.test("a pin names a pad the shell reports", () => {
  assertEquals(decodeGamepadSelection("pad:Xbox Wireless Controller"), {
    mode: "device",
    deviceId: "Xbox Wireless Controller",
  });
});

Deno.test("setGamepadSelection round-trips through getGamepadSelection", () => {
  setGamepadSelection({ mode: "device", deviceId: "pad-1" });
  assertEquals(getGamepadSelection(), { mode: "device", deviceId: "pad-1" });
  setGamepadSelection({ mode: "auto" });
  assertEquals(getGamepadSelection(), { mode: "auto" });
});

Deno.test("subscribeGamepadSelection fires on change and stops after unsubscribe", () => {
  let count = 0;
  const unsubscribe = subscribeGamepadSelection(() => {
    count++;
  });
  setGamepadSelection({ mode: "off" });
  assertEquals(count, 1);
  unsubscribe();
  setGamepadSelection({ mode: "auto" });
  assertEquals(count, 1);
});

Deno.test("a pad the shell reports connects the manager once", () => {
  withShellPads([pad("xbox")], () => {
    const manager = new GamepadManager();
    let connections = 0;
    manager.onConnect(() => connections++);
    manager.tick();
    manager.tick();
    assertEquals(manager.isConnected(), true);
    assertEquals(manager.getActiveGamepadId(), "xbox");
    assertEquals(connections, 1);
  });
});

Deno.test("an unplugged pad disconnects the manager", () => {
  const pads = [pad("xbox")];
  withShellPads(pads, () => {
    const manager = new GamepadManager();
    let disconnections = 0;
    manager.onDisconnect(() => disconnections++);
    manager.tick();
    pads.pop();
    manager.tick();
    assertEquals(manager.isConnected(), false);
    assertEquals(manager.getActiveGamepadId(), null);
    assertEquals(disconnections, 1);
  });
});

Deno.test("choosing off disconnects a connected pad on the next tick", () => {
  withShellPads([pad("xbox")], () => {
    const manager = new GamepadManager();
    let disconnections = 0;
    manager.onDisconnect(() => disconnections++);
    manager.tick();
    manager.setSelection({ mode: "off" });
    manager.tick();
    assertEquals(manager.isConnected(), false);
    assertEquals(disconnections, 1);
  });
});

Deno.test("a press is just pressed for one tick, then held", () => {
  withShellPads([pad("xbox", true)], () => {
    const manager = new GamepadManager();
    manager.tick();
    assertEquals(manager.isButtonJustPressed(GamepadButton.A), true);
    manager.tick();
    assertEquals(manager.isButtonJustPressed(GamepadButton.A), false);
    assertEquals(manager.isButtonPressed(GamepadButton.A), true);
  });
});

Deno.test("the manager follows the pad the player reaches for", () => {
  const pads = [pad("deck"), pad("xbox")];
  withShellPads(pads, () => {
    const manager = new GamepadManager();
    manager.tick();
    assertEquals(manager.getActiveGamepadId(), "deck");
    pads[1] = pad("xbox", true);
    manager.tick();
    assertEquals(manager.getActiveGamepadId(), "xbox");
  });
});
