/**
 * Bureau's check controls: the checkbox, the radio button, and the group that
 * makes a set of radios behave as one answer.
 *
 * Checkbox and radio live in one file because they are one control with two
 * marks: same click target, same disabled treatment. Win32 saw them the same
 * way — both are button styles and both answer BM_SETCHECK.
 *
 * The whole row is the control, as the era had it: the indicator, the label
 * and its description are one target, and the row carries the checkbox or
 * radio role, its checked state and the pad's navigation. A checkbox is a WELL
 * — where this register puts content rather than actions, and the tick is the
 * answer, not the button — with Mac OS 9's tick breaking out of its top right
 * corner. A radio is Motif's diamond: raised while unmarked, pressed in and
 * inked once marked. Both marks are Plots, drawn at the screen's own pixels so
 * they stay sharp at every UI scale: the tick anti-aliased like type, the
 * diamond crisp like the bevels.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Box,
  type Ink,
  Plot,
  type PlotCommand,
  type Point,
  Text,
} from "bureau/primitives";
import { host, type HostNode } from "bureau/host";
import { playKitSound } from "./sounds.ts";
import { useStatus } from "./bureau_status.ts";
import { DeadGroup } from "./dead_group.ts";

export type CheckProps = {
  checked?: boolean;
  disabled?: boolean;
  /** The label. Part of the click target, as the era had it. */
  children?: React.ReactNode;
  /** Brief context below the label, within the same click target. */
  description?: string;
  /** Status-bar help shown while this control is focused or hovered.
   *  Requires a <Frame> ancestor; outside one, this is a no-op. */
  hint?: string;
  /** The new state after each press. */
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
  /** A stop on the pad's walk through its window, in `navigationGrid`. */
  navigable?: boolean;
  navigationGrid?: string;
  /** An instrument's virtual pad cursor rests on this control: the dotted
   *  ring, and its row scrolled into view. */
  padCursor?: boolean;
};

/**
 * The caption over a setting's control: form type, and stippled with the
 * scale and the keys while its check group is switched off, as IRIX
 * stippled them.
 */
export function Caption(
  { id, reading, children }: {
    id?: string;
    /** A value the control reports (a player's track) rather than its name:
     *  set solid in the line's own weight. */
    reading?: true;
    children: React.ReactNode;
  },
) {
  const dead = useContext(DeadGroup);
  const typeStyle = reading
    ? (dead ? "ui-18-solid-stipple" : "ui-18-solid")
    : (dead ? "ui-18-label-stipple" : "ui-18-label");
  return (
    <Text id={id} typeStyle={typeStyle} ink={dead ? "ink" : undefined}>
      {children}
    </Text>
  );
}

/**
 * Mac OS 9's tick, thick at the elbow and thin at the tip, in a 26px square
 * whose top sits 6px above the well's, so the tick breaks out of its top
 * right corner.
 */
const TICK: readonly Point[] = [
  [3, 16],
  [6.5, 13.5],
  [9, 17.5],
  [20, 2],
  [22.5, 3.5],
  [10, 23],
  [7.5, 23],
];

function tickDrawing(ink: Ink): PlotCommand[] {
  return [{ kind: "polygon", points: TICK, ink }];
}

const TICK_LIVE = tickDrawing("ink");
const TICK_DEAD = tickDrawing("ink-disabled");

/** Motif's diamond on a 16px square: the whole diamond, its upper half laid
 *  over it, and the face inset 3px inside both. */
const DIAMOND: readonly Point[] = [[8, 0], [16, 8], [8, 16], [0, 8]];
const DIAMOND_UPPER: readonly Point[] = [[0, 8], [8, 0], [16, 8]];
const DIAMOND_FACE: readonly Point[] = [[8, 3], [13, 8], [8, 13], [3, 8]];

function diamondDrawing(
  { lower, upper, face }: { lower: Ink; upper: Ink; face: Ink },
): PlotCommand[] {
  return [
    { kind: "polygon", points: DIAMOND, ink: lower, crisp: true },
    { kind: "polygon", points: DIAMOND_UPPER, ink: upper, crisp: true },
    { kind: "polygon", points: DIAMOND_FACE, ink: face, crisp: true },
  ];
}

const DIAMOND_RAISED = diamondDrawing({
  lower: "mid",
  upper: "shade",
  face: "face",
});
const DIAMOND_PRESSED = diamondDrawing({
  lower: "shade",
  upper: "mid",
  face: "ink",
});

/** The checkbox's well, and the tick hanging from its corner when marked. */
function CheckBoxMark({ checked, dead }: { checked: boolean; dead: boolean }) {
  return (
    <Box
      width={20}
      height={20}
      shrink={0}
      surface="well"
      fill={dead ? "face" : "paper"}
      hidden
    >
      {checked && (
        <Box position="absolute" inset={{ top: -6, left: 0 }}>
          <Plot
            width={26}
            height={26}
            commands={dead ? TICK_DEAD : TICK_LIVE}
          />
        </Box>
      )}
    </Box>
  );
}

/**
 * Motif's radio: a bevelled diamond, raised while unmarked and pressed in and
 * inked once marked. The two edge bands swap colour with the state; the
 * upper half is the lit (or shaded) upper edges, the inner diamond the face.
 * It stands in the same 20px column a checkbox's well takes.
 */
function RadioMark({ checked }: { checked: boolean }) {
  return (
    <Box width={16} height={16} margin={2} shrink={0} hidden>
      <Plot
        width={16}
        height={16}
        commands={checked ? DIAMOND_PRESSED : DIAMOND_RAISED}
      />
    </Box>
  );
}

type CheckControlProps = CheckProps & {
  type: "checkbox" | "radio";
  controlRef?: React.ForwardedRef<HostNode>;
};

/** Hands the control's node to its public component's ref. A function, as
 *  the React Compiler skips a component that assigns through a prop. */
function forwardNode(
  ref: CheckControlProps["controlRef"],
  node: HostNode | null,
) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

/** Everything both controls share. The public components below differ only in
 *  which mark they ask for and, for the radio, how it finds its group. */
function CheckControl({
  type,
  controlRef,
  checked = false,
  disabled,
  children,
  description,
  hint,
  onCheckedChange,
  padCursor,
  ...access
}: CheckControlProps) {
  const setStatus = useStatus();
  const node = useRef<HostNode | null>(null);
  useEffect(() => {
    if (padCursor) host.scrollIntoView(node.current);
  }, [padCursor]);
  const groupDead = useContext(DeadGroup);
  const dead = Boolean(disabled) || groupDead;
  const showHint = (shown: boolean) => {
    if (hint) setStatus(shown ? hint : "");
  };
  const toggle = () => {
    const next = type === "radio" ? true : !checked;
    // A check control sounds itself, and directionally: marking is an accent,
    // clearing is a quiet click.
    if (next) playKitSound("select");
    else playKitSound("click");
    onCheckedChange?.(next);
  };

  return (
    <Box
      {...access}
      nodeRef={(next) => {
        node.current = next;
        forwardNode(controlRef, next);
      }}
      role={type}
      disabled={dead}
      focusable
      look="check"
      align={description ? "start" : "center"}
      gap={8}
      minHeight={36}
      padding={4}
      onPress={toggle}
      onHoverChange={showHint}
      onFocusChange={showHint}
    >
      {padCursor && (
        <Box
          position="absolute"
          inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
          look="pad-cursor"
          passThrough
          hidden
        />
      )}
      {type === "checkbox"
        ? <CheckBoxMark checked={checked} dead={dead} />
        : <RadioMark checked={checked} />}
      {children !== undefined && (
        <Box direction="column" minWidth={0}>
          <Text typeStyle={dead ? "ui-18-label-stipple" : "ui-18-label"}>
            {children}
          </Text>
          {description && (
            <Box margin={[2, 0, 0, 0]}>
              <Text
                typeStyle={dead ? "ui-12-snug-stipple" : "ui-12-snug"}
                ink={dead ? "ink" : "ink-neutral"}
              >
                {description}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export const Checkbox = React.forwardRef<HostNode, CheckProps>(
  function Checkbox(props, ref) {
    return <CheckControl {...props} type="checkbox" controlRef={ref} />;
  },
);

/**
 * An enable checkbox and the controls that depend on it, indented under its
 * label. While the box is clear the controls are dead and keep their values;
 * the enabling box itself always stays live.
 */
export function CheckboxGroup({
  label,
  checked,
  onCheckedChange,
  disabled,
  hint,
  children,
}: {
  label: React.ReactNode;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  const contentDead = Boolean(disabled) || !checked;
  return (
    <Box direction="column" minWidth={0}>
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        hint={hint}
      >
        {label}
      </Checkbox>
      <DeadGroup.Provider value={contentDead}>
        <Box
          direction="column"
          gap={12}
          minWidth={0}
          margin={[0, 0, 0, 32]}
          look={contentDead ? "dead-group" : undefined}
        >
          {children}
        </Box>
      </DeadGroup.Provider>
    </Box>
  );
}

/* ── Radios ──────────────────────────────────────────────────────────────── */

type RadioGroupContextValue = {
  value: string;
  select: (next: string) => void;
  disabled?: boolean;
};

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export type RadioProps =
  & Omit<CheckProps, "onCheckedChange">
  & {
    value: string;
    /** Outside a group: the radio was chosen. */
    onSelect?: () => void;
  };

export const Radio = React.forwardRef<HostNode, RadioProps>(
  function Radio(
    { checked, disabled, value, onSelect, ...rest },
    ref,
  ) {
    const group = useContext(RadioGroupContext);

    // Outside a group this is an ordinary controlled radio, so a screen that
    // already owns its form state does not have to adopt the group to get the
    // pixels.
    const selected = group ? group.value === value : checked;

    return (
      <CheckControl
        {...rest}
        type="radio"
        controlRef={ref}
        checked={selected}
        disabled={disabled ?? group?.disabled}
        onCheckedChange={() => {
          group?.select(value);
          onSelect?.();
        }}
      />
    );
  },
);

/**
 * The set a radio belongs to: it decides which one is marked, and reports the
 * new answer as the caller's own type rather than a bare string. Radios stack,
 * the way a pick-one list has always been read: down, not along.
 * The titled frame around a group, if the screen wants one, is a
 * <GroupBox>.
 */
export function RadioGroup<Value extends string>({
  value,
  onChange,
  disabled,
  direction,
  gap,
  wrap,
  children,
}: {
  value: Value;
  onChange: (next: Value) => void;
  disabled?: boolean;
  /** `row`: a two-answer question read along one line, as the Mac control
   *  panels set On and Off. `knobs`: a wrapping line of answers, a strip of
   *  knobs driving a specimen. */
  direction?: "row" | "knobs";
  /** The air between the answers, in place of the stack's or the row's. */
  gap?: number;
  /** A row of answers drops onto a second line rather than squeezing. */
  wrap?: boolean;
  children: React.ReactNode;
}) {
  // Re-attaching the union the caller declared keeps a governance screen's
  // literal types instead of widening every handler it owns to string.
  const select = useCallback(
    (next: string) => onChange(next as Value),
    [onChange],
  );

  const group = useMemo(
    () => ({ value, select, disabled }),
    [value, select, disabled],
  );

  const knobs = direction === "knobs";
  const row = direction === "row" || knobs;
  return (
    <RadioGroupContext.Provider value={group}>
      <Box
        direction={row ? "row" : "column"}
        align={knobs ? "center" : "stretch"}
        gap={gap ?? (knobs ? 10 : row ? 12 : 2)}
        wrap={wrap ?? knobs}
      >
        {children}
      </Box>
    </RadioGroupContext.Provider>
  );
}
