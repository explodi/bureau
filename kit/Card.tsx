/**
 * The inspector card's parts: the 280px paper card at the dock's corner that
 * reads out whatever is selected or armed (a building, a stop, a park, a
 * tool), and the same rows set smaller in the hint plate under a building
 * tool's name.
 *
 *   Card            the card: paper in the register's frame
 *     CardTitle     the black instrument header across its top
 *     CardSubtitle  the building's own name under a company's
 *     CardStatus    one verdict line in its tone (Closed, Vacant, ...)
 *     CardNote      a sentence of copy
 *     CardCaption   the small figures under a verdict
 *     CardRow       a label and its figure, in two columns
 *     CardAction    a full-width key under the figures
 *
 * Rows read their density from the nearest <CardDensity>: the card's by
 * default, `hint` inside the plate.
 */
import { createContext, type ReactNode, useContext } from "react";
import { Box, type Ink, Text } from "bureau/primitives";
import { useHintDevice } from "./input/useGamepad.ts";
import { useTranslation } from "./i18n/i18n.ts";
import { Mark } from "./Mark.tsx";
import type { PadAction } from "bureau/pad_actions";
import { Button, type Tone } from "./Bureau.tsx";
import { InputPrompt } from "./InputPrompt.tsx";
import { type ThemeInk, type TypeStyleName, WIDGET_WIDTH } from "./tokens.ts";
import { useNodeHint } from "./useNodeHint.ts";

type Density = "card" | "hint";

/** The inspector's title dismisses its current tool or selection. */
export const CardDismissContext = createContext<(() => void) | undefined>(
  undefined,
);

const DENSITY = createContext<Density>("card");

/**
 * The row rhythm of each density: label column, figure gap, type, and the
 * type of a figure that is a list, its lines set solid.
 */
const ROW_METRICS: Record<
  Density,
  {
    labelWidth: number;
    figureGap: number;
    typeStyle: TypeStyleName;
    listStyle: TypeStyleName;
  }
> = {
  card: {
    labelWidth: 130,
    figureGap: 16,
    typeStyle: "text-chrome",
    listStyle: "ui-14-solid",
  },
  hint: {
    labelWidth: 130,
    figureGap: 15,
    typeStyle: "ui-12-loose",
    listStyle: "ui-12-solid",
  },
};

/** One line of a `lines` figure: its own ink, explained on its own hover. */
export type CardLine = { text: string; ink: Ink; hint: ReactNode };

const TONE_INKS: Record<Tone, ThemeInk> = {
  neutral: "ink-neutral",
  good: "ink-good",
  warn: "ink-warn",
  bad: "ink-bad",
};

/** Rows inside set at this density; `hint` is the plate's smaller rhythm. */
export function CardDensity(
  { density, children }: { density: Density; children: ReactNode },
) {
  return <DENSITY.Provider value={density}>{children}</DENSITY.Provider>;
}

/**
 * The card. Its width is fixed so it holds still as the player clicks between
 * buildings, whatever the copy inside runs to.
 */
export function Card({ children }: { children: ReactNode }) {
  return (
    <Box
      id="toolbox-config"
      direction="column"
      width={WIDGET_WIDTH}
      padding={[0, 12, 12, 12]}
      fill="paper"
      surface="frame"
      ink="ink"
    >
      {children}
    </Box>
  );
}

/** The header, bled to the card's edges over its side padding. */
export function CardTitle({ children }: { children: ReactNode }) {
  const dismiss = useContext(CardDismissContext);
  const inputMode = useHintDevice();
  const { t } = useTranslation("common");
  return (
    <Box
      align="center"
      minHeight={33}
      margin={[0, -12, 12, -12]}
      fill="titlebar"
      surface="titlebar"
      ink="titlebar-text"
    >
      {dismiss && (
        <Box
          id="toolconfig-dismiss"
          role="button"
          label={t("deselect")}
          look="instrument-back"
          width={33}
          shrink={0}
          alignSelf="stretch"
          align="center"
          justify="center"
          focusable
          feedback="cancel"
          onPress={dismiss}
        >
          {inputMode === "gamepad"
            ? <InputPrompt action="city_cancel" />
            : <Mark mark="close" />}
        </Box>
      )}
      <Box grow={1} minWidth={0} padding={[6, 12]}>
        <Text typeStyle="ui-14-caps-title">{children}</Text>
      </Box>
    </Box>
  );
}

export function CardSubtitle({ children }: { children: ReactNode }) {
  return (
    <Box direction="column" padding={[0, 0, 5, 0]}>
      <Text typeStyle="ui-16-capitalize-card">{children}</Text>
    </Box>
  );
}

/** The card's one verdict; a hint, when given, explains it on hover. */
export function CardStatus(
  { tone, hint, children }: {
    tone?: Tone;
    hint?: ReactNode;
    children: ReactNode;
  },
) {
  const tip = useNodeHint();
  return (
    <Box direction="column" padding={[0, 0, 4, 0]} {...(hint ? tip(hint) : {})}>
      <Text typeStyle="text-chrome" ink={tone ? TONE_INKS[tone] : undefined}>
        {children}
      </Text>
    </Box>
  );
}

/** A sentence of copy; `narrow` keeps it off the card's right edge. */
export function CardNote(
  { tone, narrow, children }: {
    tone?: Tone;
    narrow?: boolean;
    children: ReactNode;
  },
) {
  return (
    <Box
      direction="column"
      maxWidth={narrow ? 300 : undefined}
      padding={[0, 0, 8, 0]}
    >
      <Text typeStyle="text-chrome" ink={tone ? TONE_INKS[tone] : undefined}>
        {children}
      </Text>
    </Box>
  );
}

/** The arithmetic under a verdict, a size down and in the quiet ink. */
export function CardCaption({ children }: { children: ReactNode }) {
  return (
    <Box direction="column" padding={[0, 0, 8, 0]}>
      <Text typeStyle="ui-12-caption" ink="ink-neutral">{children}</Text>
    </Box>
  );
}

/**
 * A label and its figure. The figure stands right-aligned in the rest of the
 * row, or is a `meter` 80px wide against the right edge, centred on the
 * label's line, or `lines`: a solid list, each line in its own ink. A `tone`
 * inks the figure; a `hint` explains the row on hover, a `figureHint` just
 * the figure.
 */
export function CardRow(
  { label, figure = "text", tone, hint, figureHint, lines = [], children }: {
    label: ReactNode;
    figure?: "text" | "meter" | "lines";
    tone?: Tone;
    hint?: ReactNode;
    figureHint?: ReactNode;
    lines?: readonly CardLine[];
    children?: ReactNode;
  },
) {
  const density = useContext(DENSITY);
  const metrics = ROW_METRICS[density];
  const tip = useNodeHint();
  const figureHintProps = figureHint ? tip(figureHint) : {};
  const figureColumn = (content: ReactNode) => (
    <Box
      direction="column"
      grow={2}
      padding={[0, 0, 0, metrics.figureGap]}
    >
      {content}
    </Box>
  );
  return (
    <Box {...(hint ? tip(hint) : {})}>
      <Box direction="column" minWidth={metrics.labelWidth}>
        <Text typeStyle={metrics.typeStyle}>{label}</Text>
      </Box>
      {figure === "meter" && (
        <Box
          direction="column"
          width={80}
          shrink={0}
          alignSelf="center"
          margin={[0, 0, 0, "auto"]}
          {...figureHintProps}
        >
          {children}
        </Box>
      )}
      {figure === "text" && figureColumn(
        <Box direction="column" {...figureHintProps}>
          <Text
            typeStyle={metrics.typeStyle}
            align="end"
            ink={tone ? TONE_INKS[tone] : undefined}
          >
            {children}
          </Text>
        </Box>,
      )}
      {figure === "lines" && figureColumn(
        lines.map((line, index) => (
          <Box key={index} direction="column" {...tip(line.hint)}>
            <Text typeStyle={metrics.listStyle} ink={line.ink} align="end">
              {line.text}
            </Text>
          </Box>
        )),
      )}
    </Box>
  );
}

/**
 * A full-width key stacked under the figures: view the company, open the
 * triage board, remodel. `padButton` prints the pad's button for it first.
 */
export function CardAction(
  { padButton, disabled, progress, onPress, children }: {
    padButton?: PadAction;
    disabled?: boolean;
    /** The action under way, from 0 to 1 (Button's `progress`). */
    progress?: number;
    onPress: () => void;
    children: ReactNode;
  },
) {
  return (
    <Box direction="column" padding={[8, 0, 0, 0]}>
      <Button
        fill
        disabled={disabled}
        progress={progress}
        onPress={onPress}
      >
        {padButton !== undefined && (
          <>
            <InputPrompt action={padButton} />
            {" "}
          </>
        )}
        {children}
      </Button>
    </Box>
  );
}
