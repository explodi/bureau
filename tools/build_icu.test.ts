import { assertEquals, assertRejects } from "@std/assert";
import { dirname, join, resolve } from "@std/path";
import { stub } from "@std/testing/mock";
import { buildLinuxIcu } from "./build_icu.ts";
import {
  msysPath,
  windowsIcuEnvironment,
  windowsIcuTools,
  withWindowsIcuDrive,
} from "./windows_icu.ts";

type Call = { command: string; args: string[]; env?: Record<string, string> };

function commands(answer: (call: Call) => Promise<string>) {
  const calls: Call[] = [];
  const original = Deno.Command;
  class Command {
    call: Call;
    constructor(command: string | URL, options: Deno.CommandOptions = {}) {
      this.call = {
        command: String(command),
        args: options.args ?? [],
        env: options.env,
      };
      calls.push(this.call);
    }
    async output() {
      return {
        success: true,
        code: 0,
        signal: null,
        stdout: new TextEncoder().encode(await answer(this.call)),
        stderr: new Uint8Array(),
      };
    }
  }
  Object.defineProperty(Deno, "Command", { value: Command });
  return {
    calls,
    [Symbol.dispose]() {
      Object.defineProperty(Deno, "Command", { value: original });
    },
  };
}

const tools = {
  bash: "C:\\MSYS Tools\\usr\\bin\\bash.exe",
  make: "C:\\MSYS Tools\\usr\\bin\\make.exe",
  cygpath: "C:\\MSYS Tools\\usr\\bin\\cygpath.exe",
};

Deno.test("Windows ICU finds every MSYS tool and diagnoses missing make", async () => {
  const root = await Deno.makeTempDir({ prefix: "msys tools " });
  const bin = join(root, "usr", "bin");
  try {
    await Deno.mkdir(bin, { recursive: true });
    await Deno.writeTextFile(join(bin, "bash.exe"), "bash");
    await Deno.writeTextFile(join(bin, "cygpath.exe"), "cygpath");
    await assertRejects(() => windowsIcuTools(root), Error, "make.exe");
    await Deno.writeTextFile(join(bin, "make.exe"), "make");
    assertEquals(await windowsIcuTools(root), {
      bash: join(bin, "bash.exe"),
      make: join(bin, "make.exe"),
      cygpath: join(bin, "cygpath.exe"),
    });
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("Windows ICU keeps MSVC's linker ahead of MSYS even with Path casing", async () => {
  using process = commands(() =>
    Promise.resolve("C:\\Visual Studio\\bin\\cl.exe\r\n")
  );
  const env = await windowsIcuEnvironment(tools, {
    Path: "C:\\old tools",
    INCLUDE: "headers",
    LIB: "libraries",
  });
  assertEquals(env, {
    PATH: "C:\\Visual Studio\\bin;C:\\MSYS Tools\\usr\\bin;C:\\old tools",
    INCLUDE: "headers",
    LIB: "libraries",
    CFLAGS: "-O2",
    CXXFLAGS: "-O2 -std:c++17",
  });
  assertEquals(process.calls[0]!.args, ["cl.exe"]);
});

Deno.test("Windows ICU converts paths as a single literal argument", async () => {
  using process = commands(() =>
    Promise.resolve("/c/a folder/(sources)/icu\r\n")
  );
  const path = "C:\\a folder\\(sources)\\icu";
  assertEquals(await msysPath(tools, path), "/c/a folder/(sources)/icu");
  assertEquals(process.calls[0], {
    command: tools.cygpath,
    args: ["-u", path],
    env: undefined,
  });
});

Deno.test("Windows ICU releases its drive mapping when a build fails", async () => {
  using process = commands(() => Promise.resolve(""));
  using _stat = stub(
    Deno,
    "stat",
    () => Promise.reject(new Deno.errors.NotFound()),
  );
  await assertRejects(
    () =>
      withWindowsIcuDrive("a checkout with spaces", (drive) => {
        assertEquals(drive, "Z:\\");
        return Promise.reject(new Error("compiler failed"));
      }),
    Error,
    "compiler failed",
  );
  assertEquals(process.calls.map((call) => call.args), [
    ["Z:", resolve("a checkout with spaces")],
    ["Z:", "/D"],
  ]);
});

const pin = {
  icu: {
    version: "fixture",
    sha256: "fixture-digest",
    unpack: "source",
    file: "icu.tgz",
    urlBase: "unused",
  },
};
const artifacts = [
  "include/unicode/utypes.h",
  "lib/libicuuc.a",
  "lib/libicui18n.a",
  "lib/libicudata.a",
];

async function install(root: string, files: string[]) {
  for (const file of files) {
    const path = join(root, "linux-x86_64", "icu", file);
    await Deno.mkdir(dirname(path), { recursive: true });
    await Deno.writeTextFile(path, "archive or header");
  }
}

Deno.test("ICU reuses a complete install but rebuilds an interrupted one", async () => {
  const root = await Deno.makeTempDir();
  try {
    using process = commands(async (call) => {
      if (call.args[0] === "install") await install(root, artifacts);
      return "";
    });
    const installed = await buildLinuxIcu(pin, root);
    assertEquals(process.calls.length, 3);
    assertEquals(await buildLinuxIcu(pin, root), installed);
    assertEquals(process.calls.length, 3);
    await Deno.writeTextFile(join(installed, "lib/libicudata.a"), "");
    await buildLinuxIcu(pin, root);
    assertEquals(process.calls.length, 6);
    assertEquals(
      await Deno.readTextFile(join(installed, "recipe.json")),
      JSON.stringify({ source: "fixture-digest", profile: "pic-static-O2-1" }),
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("ICU cannot stamp a successful command that omitted an archive", async () => {
  const root = await Deno.makeTempDir();
  try {
    using _process = commands(async (call) => {
      if (call.args[0] === "install") {
        await install(root, artifacts.slice(0, 3));
      }
      return "";
    });
    await assertRejects(
      () => buildLinuxIcu(pin, root),
      Error,
      "did not install",
    );
    await assertRejects(
      () => Deno.stat(join(root, "linux-x86_64/icu/recipe.json")),
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
