/**
 * The kit's looks as the JSON bureau::Ui reads (Options::tokens):
 *
 *   deno run --allow-read --allow-write tools/tokens.ts ui/tokens.json
 *
 * A game with looks of its own passes its own document to `shippedTokens`.
 */
import { BUREAU_TOKENS } from "../kit/tokens.ts";

type Json = Record<string, unknown>;

/** What the view's typeStyleOf (src/style/tokens.cpp) takes when a type style
 * leaves the member out. */
const TYPE_STYLE_DEFAULTS: Record<string, unknown> = {
  face: "Jersey25",
  letterSpacing: 0,
  wordSpacing: 0,
  weight: 400,
  italic: false,
  case: "none",
  figures: "proportional",
  halo: null,
  shadow: null,
  underline: null,
};

/**
 * The document as the view reads it (Tokens::load): a language whose type
 * styles are English's is left to Tokens::type's fallback to English; a type
 * style keeps what differs from typeStyleOf's defaults; of the metrics only the
 * stipple flag is read.
 */
export function shippedTokens(tokens: Json): Json {
  const typography = tokens.typography as Record<string, Record<string, Json>>;
  const english = JSON.stringify(typography.en);
  const languages: Record<string, Record<string, Json>> = {};
  for (const [language, styles] of Object.entries(typography)) {
    if (language !== "en" && JSON.stringify(styles) === english) continue;
    const kept: Record<string, Json> = {};
    for (const [name, style] of Object.entries(styles)) {
      kept[name] = Object.fromEntries(
        Object.entries(style).filter(([member, value]) =>
          !(member in TYPE_STYLE_DEFAULTS) ||
          JSON.stringify(value ?? null) !==
            JSON.stringify(TYPE_STYLE_DEFAULTS[member])
        ),
      );
    }
    languages[language] = kept;
  }
  const metrics: Record<string, Json> = {};
  for (const [name, metric] of Object.entries(tokens.metrics as Json)) {
    if ((metric as Json).stipple === true) metrics[name] = { stipple: true };
  }
  return { ...tokens, typography: languages, metrics };
}

if (import.meta.main) {
  const output = Deno.args[0];
  if (!output) throw new Error("tokens.ts <output.json>");
  const document = JSON.parse(JSON.stringify(BUREAU_TOKENS)) as Json;
  await Deno.writeTextFile(output, JSON.stringify(shippedTokens(document)));
}
