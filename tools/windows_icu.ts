/** MSYS runs ICU's makefiles; MSVC supplies every compiler and linker. */
import { join, resolve } from "@std/path";
import { dirname } from "@std/path/windows";

export type WindowsIcuTools = { bash: string; make: string; cygpath: string };

export async function windowsIcuTools(
  root = Deno.env.get("MSYS2_ROOT") ?? "C:\\msys64",
): Promise<WindowsIcuTools> {
  const bin = join(root, "usr", "bin");
  const tools = {
    bash: join(bin, "bash.exe"),
    make: join(bin, "make.exe"),
    cygpath: join(bin, "cygpath.exe"),
  };
  for (const path of Object.values(tools)) {
    const present = await Deno.stat(path).then(
      (file) => file.isFile,
      () => false,
    );
    if (!present) {
      throw new Error(
        `ICU needs MSYS2 with make: missing ${path}. Install MSYS2, run ` +
          "pacman -S --needed make in its shell, and set MSYS2_ROOT if it is " +
          "not installed at C:\\msys64.",
      );
    }
  }
  return tools;
}

async function output(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<string> {
  const result = await new Deno.Command(command, { args, env }).output();
  if (!result.success) {
    throw new Error(
      `${command} failed: ${new TextDecoder().decode(result.stderr).trim()}`,
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}

function systemTool(name: string): string {
  return join(Deno.env.get("SystemRoot") ?? "C:\\Windows", "System32", name);
}

/** PATH is case insensitive on Windows; a developer shell commonly uses Path. */
export async function windowsIcuEnvironment(
  tools: WindowsIcuTools,
  developer: Record<string, string>,
): Promise<Record<string, string>> {
  const compiler =
    (await output(systemTool("where.exe"), ["cl.exe"], developer))
      .split(/\r?\n/)[0];
  if (!compiler) {
    throw new Error("ICU needs MSVC's cl.exe in the developer shell");
  }
  const entries = Object.entries(developer);
  const path = entries.find(([key]) => key.toUpperCase() === "PATH")?.[1] ??
    Deno.env.get("PATH") ?? "";
  return {
    ...Object.fromEntries(
      entries.filter(([key]) => key.toUpperCase() !== "PATH"),
    ),
    // MSYS also has link.exe. Only MSVC's may answer ICU's linker calls.
    PATH: [dirname(compiler), dirname(tools.bash), path].join(";"),
    CFLAGS: "-O2",
    // ICU 76 uses C++17; cl still defaults to an older language mode.
    CXXFLAGS: "-O2 -std:c++17",
  };
}

export function msysPath(
  tools: WindowsIcuTools,
  path: string,
): Promise<string> {
  return output(tools.cygpath, ["-u", path]);
}

/** ICU's configure and makefiles expand paths without quoting. A temporary
 * drive keeps them space-free even when the checkout or username has spaces. */
export async function withWindowsIcuDrive<T>(
  directory: string,
  build: (drive: string) => Promise<T>,
): Promise<T> {
  const subst = systemTool("subst.exe");
  for (const letter of "ZYXWVUTSRQPONMLKJIHGFED") {
    const drive = `${letter}:`;
    const occupied = await Deno.stat(`${drive}\\`).then(() => true, (error) => {
      return !(error instanceof Deno.errors.NotFound);
    });
    if (occupied) continue;
    const mapped = await new Deno.Command(subst, {
      args: [drive, resolve(directory)],
    }).output();
    if (!mapped.success) continue;
    try {
      return await build(`${drive}\\`);
    } finally {
      await output(subst, [drive, "/D"]);
    }
  }
  throw new Error("ICU needs a free drive letter for its temporary build path");
}
