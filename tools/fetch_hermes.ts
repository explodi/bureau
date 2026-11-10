/**
 * Fetches Hermes's checked compiler package and release/debug VMs: Apple
 * artifacts, or Linux and Windows source builds with pinned static ICU.
 *
 *   deno task hermes             the release and debug builds
 *   deno task hermes -- --dsyms  their dSYMs as well (870 MB)
 *
 * Each archive lands in `third_party/hermes/<version>/` (never
 * committed), is checked against its digest and unpacked beside it. Each
 * Apple build holds its frameworks and headers under `destroot/`. The
 * compiler package supplies every desktop's executable and Windows DLLs;
 * its package version, reported release and bytecode version must match
 * the pin. Source builds are incremental and need CMake, Ninja and a C++
 * compiler (Visual Studio's, found by itself, on Windows). ICU needs GNU Make,
 * from MSYS2 on Windows, and PIC on Linux. A second run fetches nothing.
 */
import { encodeHex } from "@std/encoding/hex";
import { dirname, fromFileUrl, join } from "@std/path";
import type { AndroidToolchain } from "./build_icu.ts";

export type HermesAsset = {
  file: string;
  sha256: string;
  /** The directory the archive unpacks to, beside it. */
  unpack: string;
  /** Debug symbols: fetched only with `--dsyms`. */
  dsym?: boolean;
};

export type HermesPin = {
  name: string;
  /** The distribution version shared by the VM artifacts and compiler package. */
  version: string;
  tag: string;
  /** The Hermes commit the artifacts were built from. */
  commit: string;
  /** The React Native release that ships this Hermes, and its React. */
  reactNative: string;
  react: string;
  reactReconciler: string;
  urlBase: string;
  compiler: HermesAsset & {
    urlBase: string;
    hosts: Record<string, string>;
    bytecodeVersion: number;
  };
  source: HermesAsset & { urlBase: string };
  icu: HermesAsset & { urlBase: string; version: string };
  assets: HermesAsset[];
};

export const PIN_PATH = fromFileUrl(
  new URL("../third_party/hermes.pin.json", import.meta.url),
);

export async function readPin(): Promise<HermesPin> {
  return JSON.parse(await Deno.readTextFile(PIN_PATH));
}

/** Why the bytes are not the pinned file, or undefined when they are. */
export async function digestMismatch(
  asset: HermesAsset,
  bytes: Uint8Array,
): Promise<string | undefined> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  const actual = encodeHex(new Uint8Array(digest));
  if (actual === asset.sha256) return undefined;
  return `${asset.file}: SHA-256 is ${actual}, the pin says ${asset.sha256}`;
}

export function assetsToFetch(
  pin: HermesPin,
  withDsyms: boolean,
  os: string,
): HermesAsset[] {
  if (os !== "darwin") return [];
  return pin.assets.filter((asset) => withDsyms || !asset.dsym);
}

/** The host's compiler always comes from the package paired with the VM pin. */
export function compilerPath(
  pin: HermesPin,
  host = `${Deno.build.os}-${Deno.build.arch}`,
): string {
  const executable = pin.compiler.hosts[host];
  if (!executable) throw new Error(`No pinned Hermes compiler for ${host}`);
  return join(
    dirname(PIN_PATH),
    "hermes",
    pin.version,
    pin.compiler.unpack,
    executable,
  );
}

/** Why `hermesc -version`'s output is not the pinned Hermes, or undefined. */
export function compilerMismatch(
  pin: HermesPin,
  versionOutput: string,
): string | undefined {
  // Only the bytecode: the package's Mac and Linux builds of one pin report
  // different release strings (260318099.0.4 and 1.0.0).
  const bytecode = versionOutput.match(/HBC bytecode version: (\d+)/)?.[1];
  if (Number(bytecode) !== pin.compiler.bytecodeVersion) {
    return `hermesc reports bytecode ${
      bytecode ?? "(none)"
    }, the pin says ${pin.compiler.bytecodeVersion}`;
  }
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function run(command: string, args: string[]): Promise<string> {
  const { success, stdout, stderr } = await new Deno.Command(command, {
    args,
  }).output();
  if (!success) {
    throw new Error(
      `${command} ${args.join(" ")}: ${new TextDecoder().decode(stderr)}`,
    );
  }
  return new TextDecoder().decode(stdout);
}

export async function fetchAsset(
  urlBase: string,
  asset: HermesAsset,
  dir: string,
) {
  const archive = join(dir, asset.file);
  if (await exists(archive)) {
    const mismatch = await digestMismatch(asset, await Deno.readFile(archive));
    if (mismatch) throw new Error(`${mismatch} (on disk at ${archive})`);
  } else {
    const url = `${urlBase}/${asset.file}`;
    console.log(`downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mismatch = await digestMismatch(asset, bytes);
    if (mismatch) throw new Error(mismatch);
    await Deno.writeFile(archive, bytes);
  }

  const target = join(dir, asset.unpack);
  if (await exists(target)) return;
  // Unpacked aside and renamed, so an interrupted run leaves no half build
  // that a second run would take for a whole one.
  const scratch = await Deno.makeTempDir({ dir });
  console.log(`unpacking ${asset.file} to ${asset.unpack}/`);
  const tar = Deno.build.os === "windows"
    ? "C:\\Windows\\System32\\tar.exe"
    : "tar";
  await run(tar, ["xzf", archive, "-C", scratch]);
  await Deno.rename(scratch, target);
}

/** Everything a build needs, once. A game building for Android passes its NDK. */
export async function fetchHermes(
  options: { dsyms?: boolean; android?: AndroidToolchain } = {},
): Promise<void> {
  const { android } = options;
  const pin = await readPin();
  const hermesc = compilerPath(pin);
  const dir = join(PIN_PATH, "..", pin.name, pin.version);
  await Deno.mkdir(dir, { recursive: true });
  await fetchAsset(pin.compiler.urlBase, pin.compiler, dir);
  const metadata = JSON.parse(
    await Deno.readTextFile(
      join(dir, pin.compiler.unpack, "package/package.json"),
    ),
  );
  if (metadata.name !== "hermes-compiler" || metadata.version !== pin.version) {
    throw new Error(`Compiler package is not hermes-compiler@${pin.version}`);
  }
  for (
    const asset of assetsToFetch(
      pin,
      options.dsyms ?? false,
      Deno.build.os,
    )
  ) {
    await fetchAsset(pin.urlBase, asset, dir);
  }

  const mismatch = compilerMismatch(pin, await run(hermesc, ["-version"]));
  if (mismatch) throw new Error(mismatch);
  console.log(`hermesc ${pin.version}: ready at ${hermesc}`);
  const desktopFromSource = Deno.build.os === "linux" ||
    Deno.build.os === "windows";
  if (desktopFromSource || android) {
    const { buildHermesFromSource } = await import("./build_hermes.ts");
    await fetchAsset(pin.source.urlBase, pin.source, dir);
    await fetchAsset(pin.icu.urlBase, pin.icu, dir);
    if (desktopFromSource) {
      await buildHermesFromSource(pin, dir, hermesc, "desktop");
    }
    if (android) await buildHermesFromSource(pin, dir, hermesc, android);
  }
}

if (import.meta.main) {
  await fetchHermes({ dsyms: Deno.args.includes("--dsyms") });
}
