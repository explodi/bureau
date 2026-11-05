/** Build the pinned VM from source with a compiler of the same pin: Linux's
 * and Android's with static ICU, Windows's against the system's ICU
 * (native_windows.md J1). */
import { fromFileUrl, join } from "@std/path";
import type { HermesPin } from "./fetch_hermes.ts";
import {
  type AndroidToolchain,
  buildAndroidIcu,
  buildLinuxIcu,
} from "./build_icu.ts";
import { msvcEnvironment } from "./msvc.ts";

async function run(
  args: string[],
  env?: Record<string, string>,
): Promise<void> {
  const result = await new Deno.Command("cmake", {
    args,
    env,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!result.success) throw new Error(`cmake ${args.join(" ")} failed`);
}

/** What only the host's build needs: its folder and its CMake arguments. */
type HostBuild = {
  host: string;
  flags: string[];
  jobs: number;
  env?: Record<string, string>;
};

async function linuxHost(pin: HermesPin, dir: string): Promise<HostBuild> {
  const icu = await buildLinuxIcu(pin, dir);
  return {
    host: "linux-x86_64",
    flags: [
      "-DCMAKE_POSITION_INDEPENDENT_CODE=ON",
      "-DHERMES_USE_STATIC_ICU=ON",
      "-UICU_*",
      `-DICU_ROOT=${icu}`,
    ],
    jobs: 4,
  };
}

// For a tablet, cross-built with the NDK on its libc++, static as the program
// library links it. Without HERMES_IS_ANDROID,
// which would reach Java through fbjni for Unicode, it takes ICU as Linux
// does.
async function androidHost(
  pin: HermesPin,
  dir: string,
  sdk: AndroidToolchain,
): Promise<HostBuild> {
  const icu = await buildAndroidIcu(pin, dir, sdk);
  return {
    host: "android-arm64",
    flags: [
      `-DCMAKE_TOOLCHAIN_FILE=${
        join(sdk.ndk, "build/cmake/android.toolchain.cmake")
      }`,
      `-DANDROID_ABI=${sdk.abi}`,
      `-DANDROID_PLATFORM=android-${sdk.minSdk}`,
      "-DANDROID_STL=c++_static",
      "-DCMAKE_POSITION_INDEPENDENT_CODE=ON",
      "-DHERMES_USE_STATIC_ICU=ON",
      // PlatformUnicode.h takes Java's for any __ANDROID__ build unless
      // told otherwise: 3 is HERMES_PLATFORM_UNICODE_ICU. The API's one
      // fbjni use is answered by a header of ours (third_party/hermes_android).
      `-DCMAKE_CXX_FLAGS=-DHERMES_PLATFORM_UNICODE=3 -isystem ${
        fromFileUrl(new URL("../third_party/hermes_android", import.meta.url))
      }`,
      "-UICU_*",
      `-DICU_ROOT=${icu}`,
      // The NDK's toolchain searches its sysroot alone.
      `-DCMAKE_FIND_ROOT_PATH=${icu}`,
    ],
    jobs: 4,
  };
}

// Built without an ICU of its own, Hermes links Windows's (icuuc, icuin),
// which every Windows 10 since 1703 has; nothing ships. The dynamic C runtime.
async function windowsHost(): Promise<HostBuild> {
  return {
    host: "windows-x86_64",
    flags: [
      "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL",
      "-DHERMES_ENABLE_WIN10_ICU_FALLBACK=ON",
      "-DCMAKE_C_COMPILER=cl",
      "-DCMAKE_CXX_COMPILER=cl",
    ],
    jobs: navigator.hardwareConcurrency,
    env: await msvcEnvironment(),
  };
}

/** Builds the VM for this desktop, or for an Android tablet. */
export async function buildHermesFromSource(
  pin: HermesPin,
  dir: string,
  hermesc: string,
  target: "desktop" | AndroidToolchain,
): Promise<void> {
  const { host: hostName, flags, jobs, env } = target !== "desktop"
    ? await androidHost(pin, dir, target)
    : Deno.build.os === "windows"
    ? await windowsHost()
    : await linuxHost(pin, dir);
  const source = join(dir, pin.source.unpack, `hermes-${pin.commit}`);
  const host = join(dir, hostName);
  await Deno.mkdir(host, { recursive: true });
  const imports = join(host, "import-host.cmake").replaceAll("\\", "/");
  // Core extensions need hermesc even with HERMES_ENABLE_TOOLS disabled.
  await Deno.writeTextFile(
    imports,
    `if(NOT TARGET imported-hermesc)
  add_executable(imported-hermesc IMPORTED GLOBAL)
  set_target_properties(imported-hermesc PROPERTIES IMPORTED_LOCATION [==[${hermesc}]==])
endif()
`,
  );
  // Hermes marks its C++ API and Static Hermes runtime dllexport, which
  // exports them from the program library that links the VM statically;
  // defined empty, the library exports bureau/program.h alone (hermes.cmake
  // defines them for its own sources too). Linux hides them in the link.
  const projectFlags = [...flags];
  if (Deno.build.os === "windows") {
    const noExports = join(host, "no-exports.cmake").replaceAll("\\", "/");
    await Deno.writeTextFile(
      noExports,
      "add_compile_definitions(HERMES_EXPORT= SHERMES_EXPORT=)\n",
    );
    projectFlags.push(`-DCMAKE_PROJECT_Hermes_INCLUDE=${noExports}`);
  }
  for (const variant of ["release", "debug"]) {
    const build = join(host, variant);
    const started = performance.now();
    await run([
      "-S",
      source,
      "-B",
      build,
      "-G",
      "Ninja",
      // Optimised in both: the debug variant adds the debugger, and an
      // unoptimised VM made the developer game unplayably slow.
      "-DCMAKE_BUILD_TYPE=Release",
      ...projectFlags,
      "-DHERMES_UNICODE_LITE=OFF",
      "-DHERMES_ENABLE_INTL=OFF",
      `-DHERMES_ENABLE_DEBUGGER=${variant === "debug" ? "ON" : "OFF"}`,
      "-DHERMES_ENABLE_TOOLS=OFF",
      "-DHERMES_ENABLE_TEST_SUITE=OFF",
      "-DHERMES_BUILD_SHARED_JSI=OFF",
      `-DIMPORT_HOST_COMPILERS=${imports}`,
    ], env);
    await run([
      "--build",
      build,
      "--target",
      // The release tree's full VM, which compiles source, is the
      // benchmark build's (BUREAU_HERMES_COMPILER): a player's is lean.
      ...(variant === "release"
        ? ["hermesvmlean_a", "hermesvm_a"]
        : ["hermesvm_a"]),
      "--parallel",
      String(jobs),
    ], env);
    console.log(
      `Hermes ${variant}: ready at ${build} (${
        ((performance.now() - started) / 1000).toFixed(2)
      } s)`,
    );
  }
}
