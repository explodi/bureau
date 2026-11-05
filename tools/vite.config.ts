/**
 * The UI as one script for Hermes (tools/bundle.ts): production React, the React
 * Compiler, and the kit's seams resolved to their native implementations.
 */
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const env = process.env;
const entry = env.BUREAU_BUNDLE_ENTRY!;
const developer = env.BUREAU_BUNDLE_DEVELOPER === "1";

export default defineConfig({
  root: at("../"),
  mode: "production",
  publicDir: false,
  logLevel: "warn",
  resolve: {
    alias: [
      {
        find: "platform",
        replacement: env.BUREAU_BUNDLE_PLATFORM ??
          at("../kit/native_platform.ts"),
      },
      { find: "bureau/host", replacement: at("../kit/primitives/host.ts") },
      {
        find: "bureau/primitives",
        replacement: at("../kit/primitives/primitives.ts"),
      },
      {
        find: "bureau/jsx-runtime",
        replacement: at("../kit/primitives/jsx-runtime.ts"),
      },
      {
        find: "bureau/pad_actions",
        replacement: env.BUREAU_BUNDLE_PAD_ACTIONS ??
          at("../kit/input/pad_actions.ts"),
      },
      { find: /^bureau\/kit\/(.*)$/, replacement: at("../kit/") + "$1" },
    ],
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __DEVELOPER_BUILD__: developer ? "true" : "false",
  },
  build: {
    outDir: env.BUREAU_BUNDLE_OUTPUT!,
    emptyOutDir: true,
    minify: false,
    target: "es2022",
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry,
      formats: ["iife"],
      name: "bureau",
      fileName: () => "bundle.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
