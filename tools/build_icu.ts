/** Static ICU in the program's shared library must be position independent. */
import { join } from "@std/path";
import type { HermesPin } from "./fetch_hermes.ts";

/** What a game building for Android hands Hermes's build (fetch_hermes.ts). */
export type AndroidToolchain = {
  /** The NDK's folder. */
  ndk: string;
  /** Its LLVM tools' folder. */
  llvm: string;
  abi: string;
  minSdk: number;
};

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
};

/** Where an ICU build installed, and its build tree, whose tools a cross
 * build runs. */
type BuiltIcu = { install: string; build: string };

async function buildIcu(
  pin: HermesPin,
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
    "lib/libicuuc.a",
    "lib/libicui18n.a",
    "lib/libicudata.a",
  ];
  const ready = await Promise.all(
    artifacts.map((file) => Deno.stat(join(install, file))),
  )
    .then(() => true, () => false);
  if (previous === recipe && ready) {
    console.log(`ICU ${pin.icu.version} (${icu.target}): ready at ${install}`);
    return { install, build };
  }
  await Deno.mkdir(build, { recursive: true });
  // Make does not detect changed compiler flags in its existing objects.
  if (previous && previous !== recipe) {
    await run("make", ["clean"], build, icu.env);
  }
  const started = performance.now();
  await run(
    icu.configure,
    [
      ...icu.platform,
      `--prefix=${install}`,
      `--libdir=${join(install, "lib")}`,
      "--enable-static",
      "--disable-shared",
      "--with-data-packaging=static",
      "--disable-tests",
      "--disable-samples",
      "--disable-extras",
      "--disable-icuio",
    ],
    build,
    icu.env,
  );
  await run("make", ["--jobs=4"], build, icu.env);
  await run("make", ["install"], build, icu.env);
  await Deno.writeTextFile(stamp, recipe);
  console.log(
    `ICU ${pin.icu.version} (${icu.target}): built at ${install} (${
      ((performance.now() - started) / 1000).toFixed(2)
    } s)`,
  );
  return { install, build };
}

function runConfigure(pin: HermesPin, dir: string): string {
  return join(dir, pin.icu.unpack, "icu/source/runConfigureICU");
}

export async function buildLinuxIcu(
  pin: HermesPin,
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
  pin: HermesPin,
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
