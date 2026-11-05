import {
  GamepadAxis,
  GamepadButton,
  type GamepadSnapshot,
  type PadFamily,
  type PadLabel,
} from "./pad_types.ts";
import type { PadPromptStyle } from "./gamepadPreferences.ts";
import { confirmAction } from "./Gamepad.ts";
import {
  defaultActionButton,
  PAD_ACTIONS,
  type PadAction,
  type PadActionDefinition,
} from "bureau/pad_actions";

export type PadGlyph =
  | { kind: "image"; source: string; name: string }
  | { kind: "keycap"; label: string; name: string };
const XBOX_LABELS = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "LeftStick",
  "RightStick",
  "DpadUp",
  "DpadDown",
  "DpadLeft",
  "DpadRight",
  "L4",
  "R4",
  "L5",
  "R5",
];

export function labelsOf(
  pad: GamepadSnapshot | null,
  style: PadPromptStyle = "auto",
  confirm: "bottom" | "right" = "bottom",
): PadLabel[] {
  const family = style === "auto" ? pad?.family ?? "xbox" : style;
  const labels = [...XBOX_LABELS];
  if (family === "playstation") {
    labels.splice(
      0,
      10,
      "Cross",
      "Circle",
      "Square",
      "Triangle",
      "L1",
      "R1",
      "L2",
      "R2",
      "TouchpadPress",
      "Options",
    );
    labels.splice(
      16,
      4,
      "EdgeLeftBack",
      "EdgeRightBack",
      "EdgeLeftFn",
      "EdgeRightFn",
    );
  } else if (family === "nintendo") {
    labels.splice(
      0,
      10,
      "B",
      "A",
      "Y",
      "X",
      "L",
      "R",
      "ZL",
      "ZR",
      "Minus",
      "Plus",
    );
  } else if (family === "steam-deck") {
    labels.splice(4, 4, "L1", "R1", "L2", "R2");
  } else if (family === "steam-controller") {
    labels.splice(16, 2, "LeftGrip", "RightGrip");
  } else if (family === "numbered") {
    labels.splice(0, 4, "3", "1", "4", "2");
  }
  if (style === "auto") {
    pad?.labels?.forEach((label, index) => {
      if (label) labels[index] = label;
    });
  }
  if (confirm === "right") [labels[0], labels[1]] = [labels[1]!, labels[0]!];
  return labels;
}

const SOURCES: Record<string, string> = {
  A: "xbox-a",
  B: "xbox-b",
  X: "xbox-x",
  Y: "xbox-y",
  Cross: "playstation-cross",
  Circle: "playstation-circle",
  Square: "playstation-square",
  Triangle: "playstation-triangle",
  LB: "xbox-lb",
  RB: "xbox-rb",
  LT: "xbox-lt",
  RT: "xbox-rt",
  L1: "l1",
  R1: "r1",
  L2: "l2",
  R2: "r2",
  OptionsSymbol: "xbox-menu",
  View: "xbox-view",
  Menu: "xbox-menu",
  Create: "playstation-create",
  LeftStick: "xbox-ls",
  RightStick: "xbox-rs",
  DpadUp: "dpad-solid-up",
  DpadDown: "dpad-solid-down",
  DpadLeft: "dpad-solid-left",
  DpadRight: "dpad-solid-right",
  Dpad: "xbox-dpad",
  Minus: "nintendo-minus",
  Plus: "nintendo-plus",
  Touchpad: "playstation-touchpad",
  TouchpadPress: "playstation-touchpad-press",
};
const NAMES: Record<string, string> = {
  LeftStick: "Left stick",
  RightStick: "Right stick",
  DpadUp: "D-pad up",
  DpadDown: "D-pad down",
  DpadLeft: "D-pad left",
  DpadRight: "D-pad right",
  LeftTrackpad: "Left trackpad",
  RightTrackpad: "Right trackpad",
  LeftTrackpadPress: "Press left trackpad",
  RightTrackpadPress: "Press right trackpad",
  Touchpad: "Touchpad",
  TouchpadPress: "Press touchpad",
  EdgeLeftBack: "Left back button",
  EdgeRightBack: "Right back button",
  EdgeLeftFn: "Left Fn",
  EdgeRightFn: "Right Fn",
  LeftGrip: "Left grip",
  RightGrip: "Right grip",
};
const LEGENDS: Record<string, string> = {
  Share: "SHARE",
  Options: "OPTIONS",
  EdgeLeftBack: "LB",
  EdgeRightBack: "RB",
  EdgeLeftFn: "L Fn",
  EdgeRightFn: "R Fn",
  LeftGrip: "L grip",
  RightGrip: "R grip",
};

export function glyphFor(
  label: PadLabel,
  family: PadFamily | PadPromptStyle = "xbox",
): PadGlyph {
  const name = NAMES[label] ?? label;
  let source = SOURCES[label];
  if (family === "numbered") {
    source =
      ({ "3": "alt-a", "1": "alt-b", "4": "alt-x", "2": "alt-y" } as Record<
        string,
        string
      >)[label] ?? source;
  }
  if (family === "nintendo" && ["A", "B", "X", "Y"].includes(label)) {
    source = `face-nintendo-${label.toLowerCase()}`;
  }
  if (
    ["LeftTrackpad", "RightTrackpad", "LeftTrackpadPress", "RightTrackpadPress"]
      .includes(label)
  ) {
    const model = family === "steam-controller"
      ? "steam-controller-2015"
      : "steam-deck";
    const side = label.startsWith("Left") ? "left" : "right";
    source = `${model}-${side}-trackpad${
      label.endsWith("Press") ? "-press" : ""
    }`;
  }
  return source
    ? { kind: "image", source: `/icons/controller-${source}.png`, name }
    : { kind: "keycap", label: LEGENDS[label] ?? label, name };
}

export function glyphsForAction(
  action: PadAction,
  pad: GamepadSnapshot | null,
  style: PadPromptStyle = "auto",
  confirm: "bottom" | "right" = "bottom",
): PadGlyph[] {
  const nativeAction = confirmAction(action, confirm);
  const origins = pad?.origins?.[nativeAction];
  if (origins?.length) {
    return origins.map((origin) => {
      if (origin.label) {
        if (style === "auto" || origin.label.includes("Trackpad")) {
          return glyphFor(origin.label, pad?.family);
        }
        const physical = labelsOf(pad).indexOf(origin.label);
        const label = physical < 0
          ? origin.label
          : labelsOf(null, style)[physical] ?? origin.label;
        return glyphFor(label, style);
      }
      if (origin.image) {
        return { kind: "image", source: origin.image, name: origin.name };
      }
      return { kind: "keycap", label: origin.name, name: origin.name };
    });
  }
  if (
    pad?.source === "steam" && (pad.actions || pad.origins)
  ) {
    return [];
  }
  const button = defaultActionButton(action);
  if (button !== undefined) {
    return [
      glyphFor(
        labelsOf(pad, style, confirm)[button]!,
        style === "auto" ? pad?.family : style,
      ),
    ];
  }
  const axes = (PAD_ACTIONS[action] as PadActionDefinition).axes;
  if (axes?.[0] === GamepadAxis.LEFT_X) return [glyphFor("LeftStick")];
  if (axes?.[0] === GamepadAxis.RIGHT_X) return [glyphFor("RightStick")];
  return [{ kind: "keycap", label: "—", name: "Unbound" }];
}

export function labelForButton(
  button: GamepadButton,
  pad: GamepadSnapshot | null,
  style: PadPromptStyle,
): PadLabel {
  return labelsOf(pad, style)[button] ?? "Button";
}
