import { usePadContext } from "./input/useGamepad.ts";
import {
  Box,
  Field,
  type KeyEvent,
  Scroll,
  type StackingLevel,
  Text,
} from "bureau/primitives";
import { getFocusedNode, host, type HostNode } from "bureau/host";
/**
 * The shared modal for errors, warnings, information and confirmations.
 * Owns severity marks, optional copyable support details, default focus and
 * keyboard/gamepad actions so every alert can change its appearance together.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { platform } from "platform";
import { useTranslation } from "./i18n/i18n.ts";
import {
  GamepadPriority,
  useGamepadScroll,
  useGamepadSpatialNavigation,
} from "./input/useGamepad.ts";
import { markPopoverOpen } from "./popoverState.ts";
import { DESK } from "./Dialog.tsx";
import { Scrim } from "./Scrim.tsx";
import { KeyStripContext } from "./key_strip.ts";
import { Button, CloseButton, TitleBar, type Tone, Window } from "./Bureau.tsx";

/** The period's four message boxes: a fact, a caution, a failure, a choice. */
export type MessageSeverity =
  | "information"
  | "warning"
  | "error"
  | "question";

/** Severity marks share one tile; callers choose meaning, not artwork. */
const SEVERITY_GLYPH: Record<MessageSeverity, string> = {
  information: "i",
  warning: "!",
  error: "✕",
  question: "?",
};

/**
 * Each severity is a tone fill with its glyph knocked out of it. Information
 * and a question shared one colour in the period, the title bar's, and only
 * the glyph told them apart. Caution's knockout is black, which is also how
 * the period drew it: a black mark on a warm ground.
 */
const SEVERITY_TILE = {
  information: { fill: "titlebar", ink: "titlebar-text" },
  question: { fill: "titlebar", ink: "titlebar-text" },
  warning: { fill: "fill-warn", ink: "knockout-warn" },
  error: { fill: "fill-bad", ink: "knockout-bad" },
} as const;

export type MessageBoxButton = {
  label: React.ReactNode;
  /** A destructive action uses the red face and bevel. */
  variant?: "default" | "danger";
  /** Colours only the label on an ordinary key. */
  tone?: Tone;
  onSelect: () => void;
  /** The key Enter fires and focus starts on. */
  isDefault?: boolean;
};

// Alerts interrupt program windows; the saving beat at MODAL+30 still blocks them.
const MESSAGE_BOX_PRIORITY: number = GamepadPriority.MODAL + 20;

/** Dialog keys are wider than the kit's 33px minimum; the row spaces them. */
const ACTION_KEYS = { minWidth: 88, flush: true } as const;

/**
 * How wide the box grows: room for a picture beside the message, or for a
 * report to copy, past the plain box's 500px.
 */
function widestBox(wide: boolean, details: boolean): number {
  if (details) return 620;
  return wide ? 560 : 500;
}

/** The severity mark: a glyph on a 32px tile, bevelled in highlight and ink. */
function SeverityTile({ severity }: { severity: MessageSeverity }) {
  const tile = SEVERITY_TILE[severity];
  return (
    <Box
      width={32}
      height={32}
      shrink={0}
      justify="center"
      surface="severity-tile"
      fill={tile.fill}
      ink={tile.ink}
      hidden
    >
      <Text typeStyle="ui-22-tile-solid" align="center">
        {SEVERITY_GLYPH[severity]}
      </Text>
    </Box>
  );
}

export function MessageBox(
  {
    severity,
    title,
    message,
    supportDetails,
    buttons,
    onDismiss,
    wide,
    mark,
    hostId = "ui-root",
    stacking,
  }: {
    severity: MessageSeverity;
    /**
     * Replaces the severity glyph, or removes it when `null`. A box whose
     * message leads with its own artwork — the bank's approval opens on a
     * photograph of the loan officers — would otherwise render a second,
     * smaller icon tile beside it and read as two competing marks.
     */
    mark?: React.ReactNode | null;
    title: string;
    message: React.ReactNode;
    /** Adds a selectable report and Copy details key without changing the default action. */
    supportDetails?: string;
    buttons: MessageBoxButton[];
    /** Fired by the close key, by Escape and by gamepad B. */
    onDismiss: () => void;
    /** Room for a picture beside the message. */
    wide?: boolean;
    /** The element the box opens in. A layer stacked above every other, such
     *  as the loading curtain, holds its own alerts, which would otherwise
     *  open behind it. */
    hostId?: string;
    /** Lifts the box above the windows that share the modal scrim, for an
     *  alert that must never be the one hidden behind them. */
    stacking?: StackingLevel;
  },
) {
  const { t } = useTranslation("common");
  usePadContext("menu", true, MESSAGE_BOX_PRIORITY);
  const gridId = useId();
  const titleId = `${gridId}-title`;
  const messageId = `${gridId}-message`;
  const reportId = `${gridId}-report`;
  const windowRef = useRef<HostNode | null>(null);
  const defaultKeyRef = useRef<HostNode | null>(null);
  const messageRef = useRef<HostNode | null>(null);
  const reportRef = useRef<HostNode | null>(null);
  const [copiedReport, setCopiedReport] = useState<string | null>(null);
  const hasSupportDetails = Boolean(supportDetails);
  const canCopyDetails = hasSupportDetails && platform.capabilities.clipboard;

  async function copyReport() {
    if (!supportDetails || !platform.capabilities.clipboard) return;
    host.focus(reportRef.current);
    host.selectText(reportRef.current);
    try {
      await platform.clipboard.writeText(supportDetails);
      setCopiedReport(supportDetails);
    } catch {
      // Selection still lets the player copy in shells without clipboard access.
      setCopiedReport(null);
    }
  }

  // Falling back to the first key defines the error away: a caller who marked
  // nothing still gets a focus target and something for Enter to fire.
  const defaultButton = buttons.find((button) => button.isDefault) ??
    buttons[0];

  useEffect(() => {
    const previousFocus = getFocusedNode();
    host.focus(defaultKeyRef.current);
    return () => {
      if (previousFocus && host.connected(previousFocus)) {
        host.focus(previousFocus, true);
      }
    };
  }, []);

  // Tell the window underneath to pause its own gamepad navigation, the way the
  // saving beat does: its D-pad handlers would otherwise race ours and move
  // focus onto a control the player can no longer see.
  useEffect(() => markPopoverOpen(), []);

  useGamepadSpatialNavigation({
    onCancel: onDismiss,
    gridId,
    priority: MESSAGE_BOX_PRIORITY,
  });

  useGamepadScroll(messageRef);

  /*
   * Stamp anything interactive the caller put in `message` so a pad can reach
   * it. The box's own keys carry their navigation literally, but a control
   * inside the message would otherwise be invisible to spatial navigation.
   * Only what this effect added is removed, so a control that declared its
   * own navigation keeps it.
   */
  useEffect(() => {
    const body = messageRef.current;
    if (!body) return;
    const unmark = host.focusables(body).map((control) =>
      host.markNavigable(control, gridId)
    );
    return () => unmark.forEach((release) => release());
  }, [gridId, message, supportDetails]);

  const handleKey = (key: KeyEvent) => {
    if (key.phase !== "down") return false;
    if (key.key === "Tab") {
      // A nested alert must not hand Tab back to the program underneath it.
      const root = windowRef.current;
      if (!root) return true;
      const controls = host.focusables(root, true);
      const active = getFocusedNode();
      const activeIndex = active ? controls.indexOf(active) : -1;
      const nextIndex = activeIndex + (key.shift ? -1 : 1);
      const wraps = activeIndex < 0 || nextIndex < 0 ||
        nextIndex >= controls.length;
      if (!wraps) return false;
      host.focus(key.shift ? controls.at(-1) : controls[0]);
      return true;
    }

    if (key.key === "Escape") {
      // Stop here. Both the program underneath and Game's document-level Escape
      // handler close on this key, so letting it through would dismiss the box
      // and the whole window it belongs to in one press.
      onDismiss();
      return true;
    }

    // A focused key owns Enter and presses itself, so an Enter that arrives
    // here came from elsewhere in the box: the default key claims it.
    if (key.key !== "Enter") return false;
    defaultButton?.onSelect();
    return true;
  };

  return (
    <Scrim rootId={hostId} stacking={stacking}>
      <Window
        ref={windowRef}
        // A stable handle for tooling: every box's id starts with it.
        id={`bureau-messagebox${gridId}`}
        onKey={handleKey}
        animation="bureau-messagebox-appear"
        layout={{
          width: DESK,
          maxWidth: widestBox(Boolean(wide), hasSupportDetails),
          maxHeight: DESK,
          // The message is the only part allowed to scroll; the frame's ring
          // is drawn outside the box, so clipping keeps it.
          overflow: "hidden",
        }}
      >
        <TitleBar title={title} titleId={titleId}>
          <CloseButton
            label={t("close")}
            navigable
            navigationGrid={gridId}
            onPress={onDismiss}
          />
        </TitleBar>

        <Box
          windowBusy={false}
          align={hasSupportDetails ? "start" : "center"}
          gap={14}
          minHeight={0}
          padding={20}
        >
          {mark === undefined && <SeverityTile severity={severity} />}
          {mark !== undefined && mark !== null && (
            <Box shrink={0} hidden>{mark}</Box>
          )}
          <Scroll
            nodeRef={(node) => {
              messageRef.current = node;
            }}
            direction="column"
            grow={1}
            shrink={1}
            basis="0%"
            minWidth={0}
            scrollbar="hidden"
          >
            <Box id={messageId} direction="column" look="message">
              {typeof message === "string"
                ? (
                  <Text typeStyle="ui-18-message" breakAnywhere>
                    {message}
                  </Text>
                )
                : message}
            </Box>
            {hasSupportDetails && (
              <Box direction="column" margin={[8, 0, 0, 0]}>
                {
                  /* A caption set in the message's own line. */
                }
                <Text typeStyle="ui-18-message">
                  <Text typeStyle="ui-18-label">{t("messageBox.details")}</Text>
                </Text>
                <Field
                  kind="multiline"
                  nodeRef={(node) => {
                    reportRef.current = node;
                  }}
                  id={reportId}
                  typeStyle="mono-15-report"
                  readOnly
                  value={supportDetails ?? ""}
                  width="100%"
                  height={200}
                  margin={[8, 0, 0, 0]}
                  padding={12}
                  onFocusChange={(focused) => {
                    if (focused) host.selectText(reportRef.current);
                  }}
                />
              </Box>
            )}
          </Scroll>
        </Box>

        <KeyStripContext.Provider value={ACTION_KEYS}>
          <Box wrap justify="end" gap={12} padding={[0, 20, 20, 20]}>
            {canCopyDetails && (
              <Button
                navigable
                navigationGrid={gridId}
                onPress={() => void copyReport()}
              >
                {t(
                  copiedReport === supportDetails
                    ? "messageBox.copied"
                    : "messageBox.copy",
                )}
              </Button>
            )}
            {buttons.map((button, index) => {
              const isDefault = button === defaultButton;
              return (
                <Button
                  key={index}
                  ref={isDefault ? defaultKeyRef : undefined}
                  variant={button.variant}
                  tone={button.tone}
                  // The sound follows intent, not colour: the default key
                  // commits the box, every other key backs out of it.
                  feedback={isDefault ? "accept" : "cancel"}
                  navigable
                  navigationGrid={gridId}
                  onPress={button.onSelect}
                >
                  {button.label}
                </Button>
              );
            })}
          </Box>
        </KeyStripContext.Provider>
      </Window>
    </Scrim>
  );
}
