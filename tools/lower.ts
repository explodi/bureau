/**
 * Lowers a bundle for the pinned Hermes:
 * the syntax transforms React Native 0.88.0's Babel preset applies in its
 * release `hermes-stable` profile (`@react-native/babel-preset`,
 * `src/configs/main.js`), and no others. Classes, class fields, generators,
 * optional chaining and `??` stay as written. The list moves with the pin.
 *
 * Block scoping is lowered even though `hermesc` compiles `let`: without it,
 * the closures a `let` loop makes share one binding (section 10, J3.2).
 */
import { transformAsync } from "@babel/core";
import blockScoping from "@babel/plugin-transform-block-scoping";
import destructuring from "@babel/plugin-transform-destructuring";
import asyncGenerators from "@babel/plugin-transform-async-generator-functions";
import asyncToGenerator from "@babel/plugin-transform-async-to-generator";
import privateMethods from "@babel/plugin-transform-private-methods";
import privateIn from "@babel/plugin-transform-private-property-in-object";
import namedGroups from "@babel/plugin-transform-named-capturing-groups-regex";
import unicodeRegex from "@babel/plugin-transform-unicode-regex";

/** The preset's order: its first override, then its last. */
const PLUGINS = [
  blockScoping,
  [privateMethods, { loose: true }],
  [privateIn, { loose: true }],
  unicodeRegex,
  namedGroups,
  [destructuring, { useBuiltIns: true }],
  asyncGenerators,
  asyncToGenerator,
];

export async function lowerForHermesWithMap(
  code: string,
  inputSourceMap?: object,
): Promise<{ code: string; map: object | null }> {
  const result = await transformAsync(code, {
    babelrc: false,
    configFile: false,
    compact: false,
    // The bundler's `//#region` markers name each module in the profile.
    comments: true,
    sourceType: "script",
    sourceMaps: Boolean(inputSourceMap),
    inputSourceMap,
    plugins: PLUGINS,
  });
  if (!result?.code) throw new Error("Babel returned no code");
  return { code: result.code, map: result.map };
}

export async function lowerForHermes(code: string): Promise<string> {
  return (await lowerForHermesWithMap(code)).code;
}
