import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "./i18n/i18n.ts";
import { host } from "bureau/host";
import {
  GamepadPriority,
  useGamepadFrame,
  usePadRecovery,
} from "./input/useGamepad.ts";
import { MessageBox } from "./MessageBox.tsx";

/** A lost controller suspends the city until a deliberate input acknowledges it. */
export function ControllerDisconnectNotice(
  { onResume }: { onResume: () => void },
) {
  const { t } = useTranslation("controller");
  const resumed = useRef(false);
  const resume = useCallback(() => {
    if (resumed.current) return;
    resumed.current = true;
    onResume();
  }, [onResume]);
  usePadRecovery(true);
  useGamepadFrame((input) => {
    if (input.wasPressed("menu_confirm")) resume();
  }, { priority: GamepadPriority.MODAL + 25 });
  useEffect(() => {
    const stopKeys = host.captureKeys((key) => {
      if (key.phase === "down" && !key.repeat) resume();
      return true;
    }, true);
    const stopPointer = host.observeOutside(() => [], resume);
    return () => {
      stopKeys();
      stopPointer();
    };
  }, [resume]);
  return (
    <MessageBox
      severity="information"
      title={t("disconnected")}
      message={t("reconnect")}
      onDismiss={resume}
      buttons={[{ label: t("resume"), isDefault: true, onSelect: resume }]}
    />
  );
}
