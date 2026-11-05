/**
 * Which files Bureau's lint rules mean. A game points them at its own sources
 * from its own lint plugin: `configureLintScope({...})`, then `export default
 * plugin` (bureau_lint_plugin.ts). By default they read this folder.
 */
export interface LintScope {
  /** What the paths below are relative to. */
  root: URL;
  /** The kit's folder under it. */
  kit: string;
  /** What ships in the UI's bundle... */
  client: RegExp;
  /** ...but for these. */
  notClient: RegExp[];
  /** What wraps the timers and frames the engine offers. */
  platform: RegExp;
  /** What runs by the frame, rather than through the kit's animations. */
  frameOwners: RegExp[];
  /** What may read a controller's physical buttons. */
  physicalInput: RegExp[];
  /** What may call Hermes's missing `Intl` by name, as it stands in for it. */
  formatModules: Set<string>;
  /** Where a raised face is shown bare rather than worn by a key. */
  showcases: RegExp[];
}

let scope: LintScope = {
  root: new URL("../", import.meta.url),
  kit: "kit/",
  client: /^(?:src|kit)\//,
  notClient: [/^(?:tools|tests)\//],
  platform: /^kit\/(?:native_platform|test_platform)\.ts$/,
  frameOwners: [/^kit\/input\/(?:Gamepad|useGamepad)\.ts$/],
  physicalInput: [
    /^kit\/input\/(?:pad_types|Gamepad|useGamepad|pad_actions|pad_glyphs)\.ts$/,
  ],
  formatModules: new Set(["kit/i18n/format.ts", "kit/i18n/plural_rules.ts"]),
  showcases: [/^kit\//],
};

export function configureLintScope(next: LintScope): void {
  scope = next;
}

export function lintScope(): LintScope {
  return scope;
}

export function clientPath(filename: string): string {
  const root = decodeURIComponent(scope.root.pathname)
    .replace(/^\/([A-Za-z]:\/)/, "$1");
  const path = filename.replaceAll("\\", "/");
  return path.startsWith(root)
    ? path.slice(root.length)
    : path.replace(/^\.\//, "");
}

/** What ships in the bundle: the client's sources but its tests and tools. */
export function isClientSource(filename: string): boolean {
  const path = clientPath(filename);
  if (!scope.client.test(path)) return false;
  if (scope.notClient.some((pattern) => pattern.test(path))) return false;
  return !/(?:\.test\.[cm]?[jt]sx?$|\/(?:tests|__tests__|fixtures)\/)/.test(
    path,
  );
}

/** The platform's backends, which wrap the timers and frames of the engine. */
export function isNativePlatform(filename: string): boolean {
  return scope.platform.test(clientPath(filename));
}
