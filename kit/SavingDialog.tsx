import { usePadContext } from "./input/useGamepad.ts";
import { Box, Layer, Text } from "bureau/primitives";
import { getFocusedNode, host, type HostNode } from "bureau/host";
import { platform } from "platform";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { PAD_ACTION_NAMES } from "bureau/pad_actions";
import { GamepadPriority, useGamepadFrame } from "./input/useGamepad.ts";
import { markPopoverOpen } from "./popoverState.ts";
import { Window } from "./Bureau.tsx";

/** A blocking save window. Without onDone it stays until the caller unmounts it. */

// The bar fills slightly faster than the dialog lives, so it is never caught
// mid-fill at the moment the window disappears.
const BEAT_MS = 900;

export function SavingDialog(
  { title, message, onDone }: {
    title: string;
    message: string;
    /** Only for an already completed save: play the 900 ms beat, then call back. */
    onDone?: () => void;
  },
) {
  const pending = onDone === undefined;
  usePadContext("menu", true, GamepadPriority.MODAL + 30);
  const messageId = useId();
  const dialogRef = useRef<HostNode | null>(null);
  useLayoutEffect(() => {
    const previousFocus = getFocusedNode();
    host.focus(dialogRef.current, true);
    // A save cannot activate a shortcut in the city underneath.
    const stopKeys = host.captureKeys(() => true, true);
    return () => {
      stopKeys();
      if (previousFocus && host.connected(previousFocus)) {
        host.focus(previousFocus, true);
      }
    };
  }, []);
  // Tell the dialog underneath to pause its own gamepad navigation: nothing in
  // here is focusable, and a D-pad press should not move a control the player
  // can no longer see.
  useEffect(() => markPopoverOpen(), []);

  // Consume shortcuts as well as confirm/cancel while the save owns input.
  useGamepadFrame(
    (input) => {
      if (!input.connected) return;
      for (const action of PAD_ACTION_NAMES) input.wasPressed(action);
    },
    { enabled: true, priority: GamepadPriority.MODAL + 30 },
  );

  // The beat starts once, on mount: callers pass a fresh onDone every render,
  // and a parent re-rendering faster than BEAT_MS (a 500 ms day on fast speed)
  // would otherwise restart it forever.
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    if (pending) return;
    const timer = platform.timers.setTimeout(
      () => onDoneRef.current?.(),
      BEAT_MS,
    );
    return () => platform.timers.clearTimeout(timer);
  }, [pending]);

  return (
    // Above the modal scrim: it has to cover whichever window asked for it.
    <Layer stacking="blocking" cover>
      <Box
        nodeRef={(node) => {
          dialogRef.current = node;
        }}
        role="dialog"
        busy={pending}
        windowBusy
        focusable
        tabStop={false}
        chrome="light"
        look="veil"
        width="100%"
        height="100%"
        align="center"
        justify="center"
      >
        <Window
          id="bureau-saving-window"
          title={title}
          layout={{ width: 340, maxWidth: "100%" }}
        >
          <Box direction="column" gap={12} padding={16}>
            <Text id={messageId} typeStyle="ui-13-solid">{message}</Text>
            {
              /* Sunken outer rail; the classic chunked fill grows over 800ms
                 of the window's 900, so it is full before the window goes.
                 An in-flight save has no measurable share, so its bar sways. */
            }
            <Box
              role="progressbar"
              height={26}
              padding={2}
              fill="light"
              surface="well"
              overflow="hidden"
            >
              <Box
                height="100%"
                // The fill's keyframes take a share of the full rail.
                width={pending ? "35%" : "100%"}
                shrink={0}
                pattern="progress-blocks"
                animation={pending
                  ? "bureau-saving-pending"
                  : "bureau-saving-fill"}
              />
            </Box>
          </Box>
        </Window>
      </Box>
    </Layer>
  );
}
