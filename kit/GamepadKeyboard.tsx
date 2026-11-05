import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "./i18n/i18n.ts";
import { platform } from "platform";
import { getFocusedNode, host, type HostNode } from "bureau/host";
import { Box, Field, Layer, Scroll, Text } from "bureau/primitives";
import { SUPPORTED_LANGS, type SupportedLanguage } from "./i18n/language.ts";
import { normalizeLanguage } from "./i18n/language.ts";
import {
  GamepadPriority,
  useGamepadFrame,
  useGamepadSpatialNavigation,
  usePadContext,
} from "./input/useGamepad.ts";
import {
  ACCENT_KEYS,
  appendHangul,
  changeLastKana,
  deleteHangul,
  HANGUL_KEYS,
  hiragana,
  KANA_KEYS,
  katakana,
  LATIN_KEYS,
  PAD_LANGUAGE_NAMES,
  shiftedKey,
  SYMBOL_KEYS,
} from "./input/pad_text.ts";
import { Button } from "./Bureau.tsx";
import { Select } from "./Select.tsx";
import { InputPrompt } from "./InputPrompt.tsx";
import { markPopoverOpen } from "./popoverState.ts";

interface GamepadKeyboardProps {
  initialValue?: string;
  maxLength?: number;
  capitalize?: boolean;
  title?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

type Mode = "latin" | "pinyin" | "hiragana" | "katakana" | "hangul";
type Readings = Record<"zh" | "zh-TW" | "ja", Record<string, string>>;
let readingsRequest: Promise<Readings> | undefined;
const CANDIDATES_PER_PAGE = 8;
const navigation = { navigationGrid: "keyboard", navigable: true } as const;
const defaultMode = (language: SupportedLanguage): Mode =>
  language === "zh" || language === "zh-TW"
    ? "pinyin"
    : language === "ja"
    ? "hiragana"
    : language === "ko"
    ? "hangul"
    : "latin";

/** Native keyboards own full IMEs; this fallback offers scripts and character conversion. */
export function GamepadKeyboard({
  initialValue = "",
  maxLength = 256,
  capitalize = false,
  title,
  onSubmit,
  onCancel,
}: GamepadKeyboardProps) {
  const { t } = useTranslation("titlescreen");
  const { t: controllerText, i18n } = useTranslation("controller");
  const initialLanguage = normalizeLanguage(
    i18n.resolvedLanguage ?? i18n.language,
  );
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);
  const [mode, setMode] = useState<Mode>(defaultMode(initialLanguage));
  const [text, setText] = useState(initialValue);
  const [composition, setComposition] = useState("");
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const [accents, setAccents] = useState(false);
  const [readings, setReadings] = useState<Readings | null>(null);
  const [readingsFailed, setReadingsFailed] = useState(false);
  const [candidatePage, setCandidatePage] = useState(0);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const firstKey = useRef<HostNode | null>(null);
  const previousFocus = useRef(getFocusedNode());
  const isKana = mode === "hiragana" || mode === "katakana";
  const converting = isKana || mode === "pinyin";
  const characters = Array.from(text);
  const full = characters.length >= maxLength;

  usePadContext("menu", true, GamepadPriority.MODAL + 10);
  useEffect(() => markPopoverOpen(), []);
  useLayoutEffect(() => {
    const previous = previousFocus.current;
    host.focus(firstKey.current);
    return () => host.focus(previous);
  }, []);
  useEffect(() => {
    if (!converting) return;
    let active = true;
    readingsRequest ??= platform.assets.text("/keyboards/readings.json").then(
      (data) => {
        if (!data) throw new Error("Missing controller character readings");
        const parsed = JSON.parse(data) as Readings;
        const valid = [parsed?.zh, parsed?.["zh-TW"], parsed?.ja].every((map) =>
          map !== null && typeof map === "object" && !Array.isArray(map) &&
          Object.values(map).every((value) => typeof value === "string")
        );
        if (!valid) throw new Error("Invalid controller character readings");
        return parsed;
      },
    ).catch((error) => {
      readingsRequest = undefined;
      throw error;
    });
    void readingsRequest.then((data) => {
      if (active) {
        setReadings(data);
        setReadingsFailed(false);
      }
    }).catch(() => {
      if (active) setReadingsFailed(true);
    });
    return () => {
      active = false;
    };
  }, [converting, language]);

  const insert = (value: string): boolean => {
    if (Array.from(text + value).length > maxLength) return false;
    setText(text + value);
    setComposition("");
    setCandidatePage(0);
    return true;
  };
  const handleKeyPress = (key: string) => {
    if (converting && !symbols) {
      if (composition.length >= 24) return;
      setComposition(composition + key);
      setCandidatePage(0);
      return;
    }
    if (mode === "hangul" && !symbols) {
      const value = appendHangul(text, key);
      if (Array.from(value).length <= maxLength) setText(value);
      return;
    }
    const startsWord = text === "" || /[ .-]$/.test(text);
    const value = capitalize && startsWord ? shiftedKey(key, language) : key;
    insert(composition + value);
  };
  const backspace = () => {
    if (composition) {
      setComposition(Array.from(composition).slice(0, -1).join(""));
      setCandidatePage(0);
      return;
    }
    setText(
      mode === "hangul" ? deleteHangul(text) : characters.slice(0, -1).join(""),
    );
  };
  const submit = () => {
    if (composition) insert(composition);
    else onSubmit(text);
  };
  const chooseLanguage = (value: SupportedLanguage) => {
    if (composition && !insert(composition)) return;
    setReadingsFailed(false);
    setLanguage(value);
    setMode(defaultMode(value));
    setShift(false);
    setSymbols(false);
    setAccents(false);
  };
  const chooseMode = (value: Mode) => {
    if (composition && !insert(composition)) return;
    setReadingsFailed(false);
    setMode(value);
    setSymbols(false);
    setAccents(false);
  };

  useGamepadSpatialNavigation({
    gridId: "keyboard",
    enabled: !languagePickerOpen,
    onCancel,
    priority: GamepadPriority.MODAL + 10,
  });
  useGamepadFrame((input) => {
    if (!input.connected) return;
    if (input.wasPressed("menu_tertiary")) backspace();
    if (input.wasPressed("menu_start")) submit();
  }, { enabled: !languagePickerOpen, priority: GamepadPriority.MODAL + 10 });

  const modes: Mode[] = language === "ja"
    ? ["hiragana", "katakana", "latin"]
    : language === "zh" || language === "zh-TW"
    ? ["pinyin", "latin"]
    : language === "ko"
    ? ["hangul", "latin"]
    : ["latin"];
  const modeTitle: Record<Mode, string> = {
    latin: "keyboardLatin",
    pinyin: "keyboardPinyin",
    hiragana: "keyboardKana",
    katakana: "keyboardKatakana",
    hangul: "keyboardHangul",
  };
  const rows = symbols
    ? SYMBOL_KEYS
    : accents
    ? ACCENT_KEYS[language] ?? LATIN_KEYS
    : isKana
    ? KANA_KEYS
    : mode === "hangul"
    ? HANGUL_KEYS
    : LATIN_KEYS;
  const keyLabel = (key: string) =>
    mode === "pinyin" && key === "v" && !symbols
      ? "ü"
      : mode === "katakana" && !symbols
      ? katakana(key)
      : shift && mode !== "pinyin"
      ? shiftedKey(key, language)
      : key;
  const query = mode === "pinyin"
    ? composition.toLowerCase().replaceAll("ü", "v")
    : hiragana(composition);
  const readingLanguage = mode !== "pinyin"
    ? "ja"
    : language === "zh-TW"
    ? "zh-TW"
    : "zh";
  const candidates = Array.from(readings?.[readingLanguage][query] ?? "");
  const pageCount = Math.max(
    1,
    Math.ceil(candidates.length / CANDIDATES_PER_PAGE),
  );
  const page = Math.min(candidatePage, pageCount - 1);
  const pageCandidates = candidates.slice(
    page * CANDIDATES_PER_PAGE,
    (page + 1) * CANDIDATES_PER_PAGE,
  );

  return (
    <Layer stacking="popup" cover>
      <Box width="100%" height="100%" justify="center" align="center">
        <Box
          position="absolute"
          inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
          fill="db32-black"
          opacity={0.7}
        />
        <Box
          surface="frame"
          fill="face"
          ink="ink"
          direction="column"
          padding={16}
          gap={10}
          width="94%"
          maxWidth={720}
          maxHeight="94%"
        >
          <Text typeStyle="ui-20-solid" align="center" role="heading">
            {title ?? controllerText("textEntry")}
          </Text>
          <Scroll
            direction="column"
            gap={8}
            shrink={1}
            minHeight={0}
            scrollbar="auto"
          >
            <Box align="center" justify="center" gap={8} wrap>
              <Text typeStyle="ui-14-solid">
                {controllerText("keyboardLanguage")}
              </Text>
              <Box width={180}>
                <Select
                  navigationGrid="keyboard"
                  onOpenChange={setLanguagePickerOpen}
                  value={language}
                  onChange={chooseLanguage}
                  options={SUPPORTED_LANGS.map((value) => ({
                    value,
                    label: PAD_LANGUAGE_NAMES[value],
                  }))}
                  fill
                />
              </Box>
              {modes.map((value) => (
                <Button
                  key={value}
                  size="compact"
                  pressed={mode === value}
                  onPress={() => chooseMode(value)}
                  {...navigation}
                >
                  {controllerText(modeTitle[value])}
                </Button>
              ))}
            </Box>
            {/* This field is already inside the keyboard: activating it must not open another one. */}
            <Field
              value={text}
              onChange={(value) =>
                setText(Array.from(value).slice(0, maxLength).join(""))}
              width="100%"
              height={40}
              typeStyle="ui-20-solid"
            />
            <Box justify="between" align="center">
              <Text typeStyle="ui-12-solid" ink="ink-neutral">
                {t("keyboard.charactersHint", {
                  count: characters.length,
                  max: maxLength,
                })}
              </Text>
              {converting && (
                <Text typeStyle="ui-12-solid" ink="ink-neutral">
                  {controllerText("keyboardComposeHint")}
                </Text>
              )}
            </Box>
            {converting && (
              <Box
                direction="column"
                gap={4}
                surface="well"
                fill="paper"
                padding={6}
              >
                <Box gap={8} align="center">
                  <Text typeStyle="ui-14-solid">
                    {controllerText("keyboardReading")}
                  </Text>
                  <Text typeStyle="ui-20-solid">{composition || " "}</Text>
                  <Button
                    size="compact"
                    disabled={!composition ||
                      Array.from(text + composition).length > maxLength}
                    onPress={() => insert(composition)}
                    {...navigation}
                  >
                    {controllerText("keyboardCommit")}
                  </Button>
                </Box>
                {composition && (
                  <Box gap={4} align="center" wrap>
                    {pageCandidates.map((value, index) => (
                      <Button
                        key={index}
                        size="compact"
                        disabled={full}
                        onPress={() => {
                          insert(value);
                          host.focus(firstKey.current);
                        }}
                        {...navigation}
                      >
                        <Text typeStyle="ui-20-solid">{value}</Text>
                      </Button>
                    ))}
                    {candidates.length === 0 && (
                      <Text typeStyle="ui-14-solid">
                        {controllerText(
                          readingsFailed
                            ? "keyboardUnavailable"
                            : readings
                            ? "keyboardNoCandidates"
                            : "keyboardLoading",
                        )}
                      </Text>
                    )}
                    {pageCount > 1 && (
                      <>
                        <Button
                          size="compact"
                          disabled={page === 0}
                          onPress={() => setCandidatePage(page - 1)}
                          {...navigation}
                        >
                          {controllerText("keyboardPrevious")}
                        </Button>
                        <Text typeStyle="ui-12-solid">
                          {page + 1}/{pageCount}
                        </Text>
                        <Button
                          size="compact"
                          disabled={page + 1 === pageCount}
                          onPress={() => setCandidatePage(page + 1)}
                          {...navigation}
                        >
                          {controllerText("keyboardNext")}
                        </Button>
                      </>
                    )}
                  </Box>
                )}
              </Box>
            )}
            <Box direction="column" gap={4}>
              {rows.map((row, rowIndex) => (
                <Box key={rowIndex} justify="center" gap={4}>
                  {Array.from(
                    row,
                    (key, index) => (
                      <Box key={key} width={40} shrink={0}>
                        <Button
                          fill
                          flush
                          ref={rowIndex === 0 && index === 0
                            ? (node) => {
                              firstKey.current = node;
                            }
                            : undefined}
                          onPress={() => handleKeyPress(keyLabel(key))}
                          {...navigation}
                        >
                          <Text typeStyle="ui-18-solid">{keyLabel(key)}</Text>
                        </Button>
                      </Box>
                    ),
                  )}
                </Box>
              ))}
              <Box justify="center" gap={6} wrap>
                {(mode === "latin" || mode === "hangul") && (
                  <Button
                    size="compact"
                    pressed={shift}
                    onPress={() => setShift(!shift)}
                    {...navigation}
                  >
                    {controllerText("keyboardShift")}
                  </Button>
                )}
                <Button
                  size="compact"
                  disabled={full}
                  onPress={() => insert(composition + " ")}
                  {...navigation}
                >
                  {t("keyboard.space")}
                </Button>
                <Button
                  size="compact"
                  pressed={symbols}
                  onPress={() => setSymbols(!symbols)}
                  {...navigation}
                >
                  {controllerText("keyboardSymbols")}
                </Button>
                {mode === "latin" && ACCENT_KEYS[language] && (
                  <Button
                    size="compact"
                    pressed={accents}
                    onPress={() => {
                      setAccents(!accents);
                      setSymbols(false);
                    }}
                    {...navigation}
                  >
                    {controllerText("keyboardAccents")}
                  </Button>
                )}
                {isKana && (
                  <>
                    <Button
                      size="compact"
                      disabled={!composition}
                      onPress={() => {
                        setComposition(changeLastKana(composition, false));
                        setCandidatePage(0);
                      }}
                      {...navigation}
                    >
                      ゛ / ゜
                    </Button>
                    <Button
                      size="compact"
                      disabled={!composition}
                      onPress={() => {
                        setComposition(changeLastKana(composition, true));
                        setCandidatePage(0);
                      }}
                      {...navigation}
                    >
                      ぁ / あ
                    </Button>
                  </>
                )}
              </Box>
            </Box>
          </Scroll>
          <Box justify="center" gap={8} wrap>
            <Button
              size="compact"
              onPress={backspace}
              disabled={!text && !composition}
              {...navigation}
            >
              <InputPrompt action="menu_tertiary" device="gamepad" />
              {t("keyboard.backspace")}
            </Button>
            <Button
              size="compact"
              isDefault
              onPress={submit}
              {...navigation}
            >
              <InputPrompt action="menu_start" device="gamepad" />
              {composition
                ? controllerText("keyboardCommit")
                : t("keyboard.enter")}
            </Button>
            <Button size="compact" onPress={onCancel} {...navigation}>
              <InputPrompt action="menu_back" device="gamepad" />
              {t("cancel")}
            </Button>
          </Box>
          <Box justify="center" align="center" gap={6}>
            <InputPrompt action="menu_confirm" device="gamepad" />
            <Text typeStyle="ui-14-solid">{controllerText("select")}</Text>
          </Box>
        </Box>
      </Box>
    </Layer>
  );
}
