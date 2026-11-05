/**
 * A game's TSX as the bytecode bureau::Ui runs:
 *
 *   deno run -A tools/bundle.ts ui/main.tsx build/ui [--developer]
 *       [--platform ui/platform.ts] [--pad-actions ui/pad_actions.ts]
 *
 * `build/ui/bundle.hbc` is Options::bytecode; with --developer the folder also
 * holds what Chrome DevTools maps back to the TSX (Options::debugBundle).
 * --platform and --pad-actions name a game's own, which the kit then reads.
 */
import { fromFileUrl, resolve } from "@std/path";
import { compileBundle } from "./compile.ts";

const args = [...Deno.args];
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args.splice(index, 2)[1];
}
const developerAt = args.indexOf("--developer");
const developer = developerAt >= 0;
if (developer) args.splice(developerAt, 1);
const platform = option("--platform");
const padActions = option("--pad-actions");
const [entry, output] = args;
if (!entry || !output) {
  throw new Error("bundle.ts <entry.tsx> <output folder> [--developer]");
}

const config = fromFileUrl(new URL("./vite.config.ts", import.meta.url));
const { success } = await new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "npm:vite@^8", "build", "--config", config],
  env: {
    BUREAU_BUNDLE_ENTRY: resolve(entry),
    BUREAU_BUNDLE_OUTPUT: resolve(output),
    BUREAU_BUNDLE_DEVELOPER: developer ? "1" : "0",
    ...(platform ? { BUREAU_BUNDLE_PLATFORM: resolve(platform) } : {}),
    ...(padActions ? { BUREAU_BUNDLE_PAD_ACTIONS: resolve(padActions) } : {}),
  },
}).spawn().status;
if (!success) throw new Error("vite build failed");
await compileBundle(resolve(output), { developer });
console.log(`${resolve(output)}/bundle.hbc`);
