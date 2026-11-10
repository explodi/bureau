/** The pin's ICU, linked statically into the program on every non-Apple host. */
import { join } from "@std/path";
import type { HermesPin } from "./fetch_hermes.ts";
import {
  msysPath,
  windowsIcuEnvironment,
  windowsIcuTools,
  withWindowsIcuDrive,
} from "./windows_icu.ts";

/** What a game building for Android hands Hermes's build (fetch_hermes.ts). */
export type AndroidToolchain = {
  /** The NDK's folder. */
  ndk: string;
  /** Its LLVM tools' folder. */
  llvm: string;
  abi: string;
  minSdk: number;
};

type IcuPin = Pick<HermesPin, "icu">;

const STATIC_FLAGS = [
  "--enable-static",
  "--disable-shared",
  "--with-data-packaging=static",
  "--disable-tests",
  "--disable-samples",
  "--disable-extras",
  "--disable-icuio",
];
const UNIX_ARCHIVES = ["libicuuc.a", "libicui18n.a", "libicudata.a"];
const WINDOWS_ARCHIVES = ["sicuuc.lib", "sicuin.lib", "sicudt.lib"];

const PIC = { CFLAGS: "-O2 -fPIC", CXXFLAGS: "-O2 -fPIC" };

async function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<void> {
  const result = await new Deno.Command(command, {
    args,
    cwd,
    env,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!result.success) throw new Error(`${command} ${args.join(" ")} failed`);
}

type IcuBuild = {
  /** The folder beside the pin's archives: linux-x86_64, android-arm64. */
  target: string;
  /** ICU's configure script, and the arguments that pick the platform. */
  configure: string;
  platform: string[];
  env: Record<string, string>;
  /** Names the flags in the build's stamp: another profile rebuilds. */
  profile: string;
  archives?: string[];
  make?: string;
  shellPath?: (path: string) => Promise<string>;
};

/** Where an ICU build installed, and its build tree, whose tools a cross
 * build runs. */
type BuiltIcu = { install: string; build: string };

async function buildIcu(
  pin: IcuPin,
  dir: string,
  icu: IcuBuild,
): Promise<BuiltIcu> {
  const host = join(dir, icu.target);
  const build = join(host, "icu-build");
  const install = join(host, "icu");
  const stamp = join(install, "recipe.json");
  const recipe = JSON.stringify({
    source: pin.icu.sha256,
    profile: icu.profile,
  });
  const previous = await Deno.readTextFile(stamp).catch(() => "");
  const artifacts = [
    "include/unicode/utypes.h",
    ...(icu.archives ?? UNIX_ARCHIVES).map((file) => `lib/${file}`),
  ];
  const ready = async () =>
    await Promise.all(
      artifacts.map(async (file) => {
        const info = await Deno.stat(join(install, file));
        return info.isFile && info.size > 0;
      }),
    ).then((files) => files.every(Boolean), () => false);
  if (previous === recipe && await ready()) {
    console.log(`ICU ${pin.icu.version} (${icu.target}): ready at ${install}`);
    return { install, build };
  }
  // Make cannot detect changed flags, and interrupted installs are not caches.
  await Deno.remove(build, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.remove(install, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.mkdir(build, { recursive: true });
  const prefix = icu.shellPath ? await icu.shellPath(install) : install;
  const libdir = icu.shellPath
    ? await icu.shellPath(join(install, "lib"))
    : join(install, "lib");
  const started = performance.now();
  await run(
    icu.configure,
    [
      ...icu.platform,
      `--prefix=${prefix}`,
      `--libdir=${libdir}`,
      ...STATIC_FLAGS,
    ],
    build,
    icu.env,
  );
  await run(icu.make ?? "make", ["--jobs=4"], build, icu.env);
  await run(icu.make ?? "make", ["install"], build, icu.env);
  if (!await ready()) {
    throw new Error(
      `ICU did not install its static headers and archives at ${install}`,
    );
  }
  await Deno.writeTextFile(stamp, recipe);
  console.log(
    `ICU ${pin.icu.version} (${icu.target}): built at ${install} (${
      ((performance.now() - started) / 1000).toFixed(2)
    } s)`,
  );
  return { install, build };
}

function runConfigure(pin: IcuPin, dir: string): string {
  return join(dir, pin.icu.unpack, "icu/source/runConfigureICU");
}

export async function buildLinuxIcu(
  pin: IcuPin,
  dir: string,
): Promise<string> {
  const built = await buildIcu(pin, dir, {
    target: "linux-x86_64",
    configure: runConfigure(pin, dir),
    platform: ["Linux/gcc"],
    env: PIC,
    profile: "pic-static-O2-1",
  });
  return built.install;
}

/** Android's ICU, cross-built with the NDK. ICU's cross build makes its
 * data with tools of the host's own build, so that is built first. */
export async function buildAndroidIcu(
  pin: IcuPin,
  dir: string,
  sdk: AndroidToolchain,
): Promise<string> {
  const onMac = Deno.build.os === "darwin";
  const tools = await buildIcu(pin, dir, {
    target: onMac ? "darwin-icu-tools" : "linux-x86_64",
    configure: runConfigure(pin, dir),
    platform: [onMac ? "MacOSX" : "Linux/gcc"],
    env: PIC,
    profile: "pic-static-O2-1",
  });
  const triple = `aarch64-linux-android${sdk.minSdk}`;
  const built = await buildIcu(pin, dir, {
    target: "android-arm64",
    configure: join(dir, pin.icu.unpack, "icu/source/configure"),
    platform: [
      "--host=aarch64-linux-android",
      `--with-cross-build=${tools.build}`,
      "--disable-tools",
    ],
    env: {
      ...PIC,
      CC: join(sdk.llvm, `${triple}-clang`),
      CXX: join(sdk.llvm, `${triple}-clang++`),
      AR: join(sdk.llvm, "llvm-ar"),
      RANLIB: join(sdk.llvm, "llvm-ranlib"),
    },
    profile: `android${sdk.minSdk}-pic-static-O2-1`,
  });
  return built.install;
}

/** The same pinned ICU, on MSVC's dynamic C runtime, with no OS ICU imports. */
export async function buildWindowsIcu(
  pin: IcuPin,
  dir: string,
  developer: Record<string, string>,
): Promise<string> {
  const tools = await windowsIcuTools();
  const env = await windowsIcuEnvironment(tools, developer);
  await withWindowsIcuDrive(dir, async (drive) => {
    await buildIcu(pin, drive, {
      target: "windows-x86_64",
      configure: tools.bash,
      platform: [
        "--noprofile",
        "--norc",
        await msysPath(tools, runConfigure(pin, drive)),
        "MSYS/MSVC",
        // MSYS's uname names its shell; ICU's MSVC make fragment is mingw.
        "--build=x86_64-pc-mingw64",
        "--host=x86_64-pc-mingw64",
      ],
      env,
      profile: "msys-msvc-static-md-cxx17-O2-1",
      archives: WINDOWS_ARCHIVES,
      make: tools.make,
      shellPath: (path) => msysPath(tools, path),
    });
  });
  return join(dir, "windows-x86_64", "icu");
}
