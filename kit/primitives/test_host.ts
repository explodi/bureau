// The `bureau/host` Deno's tests import (root deno.json): an inert host with
// nothing on screen, so kit modules load and render without the native view.
// A test that needs another answer installs its own with installHost.
import { type Host, installHost } from "./host.ts";

let scale = 1;
const nothing = () => () => {};
const noRect = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  scale: 1,
};

const testHost: Host = {
  find: () => null,
  measure: () => noRect,
  focusables: () => [],
  navigable: () => [],
  isNavigable: () => false,
  focus() {},
  afterLayout: nothing,
  blur() {},
  contains: () => false,
  connected: () => false,
  toolbar: () => null,
  scrollIntoView() {},
  scrollBy() {},
  horizontalScroller: () => null,
  control: () => null,
  press() {},
  setControlValue() {},
  selectText() {},
  captureKeys: nothing,
  observeKeyHold: nothing,
  observeKeys: nothing,
  measureText: () => 0,
  viewport: () => ({
    left: 0,
    top: 0,
    width: 1920 / scale,
    height: 1080 / scale,
  }),
  observeLayout: nothing,
  observeCursor: nothing,
  contentExtent: () => ({
    width: 0,
    height: 0,
    contentWidth: 0,
    contentHeight: 0,
  }),
  observeOutside: nothing,
  markNavigable: nothing,
  setScale(next) {
    scale = next;
  },
  setInputMode() {},
  setGamepadConnected() {},
  setCancelKey() {},
  observeFeedback: nothing,
  setLanguage() {},
  placeLayer() {},
};

installHost(testHost);

export * from "./host.ts";
