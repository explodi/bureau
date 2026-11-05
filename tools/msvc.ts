/** Finds a Visual Studio developer shell's environment on Windows. */
import { join } from "@std/path";

async function captured(command: string, args: string[]): Promise<string> {
  try {
    const { success, stdout } = await new Deno.Command(command, {
      args,
      stdout: "piped",
      stderr: "null",
    }).output();
    return success ? new TextDecoder().decode(stdout).trim() : "";
  } catch {
    return "";
  }
}

/** Visual Studio's developer command script, through vswhere; "" without. */
async function developerCommandScript(): Promise<string> {
  const vswhere = join(
    Deno.env.get("ProgramFiles(x86)") ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  const installation = await captured(vswhere, [
    "-latest",
    "-products",
    "*",
    "-property",
    "installationPath",
  ]);
  if (installation === "") return "";
  return join(installation, "Common7", "Tools", "VsDevCmd.bat");
}

let developerEnvironment: Record<string, string> | undefined;

/**
 * The environment of a Visual Studio developer shell for x64: this
 * process's own when it is one, else what `VsDevCmd.bat` sets, read once.
 * CMake on PATH is not enough: Visual Studio puts its CMake there without
 * `cl`.
 */
export async function msvcEnvironment(): Promise<Record<string, string>> {
  if (Deno.env.get("VCINSTALLDIR")) return {};
  if (developerEnvironment) return developerEnvironment;
  const developerShell = await developerCommandScript();
  if (developerShell === "") {
    throw new Error(
      "Visual Studio was not found: install its C++ workload, or run this " +
        "from a developer shell",
    );
  }
  const { success, stdout } = await new Deno.Command("cmd", {
    args: [
      "/c",
      "call",
      developerShell,
      "-arch=x64",
      "-host_arch=x64",
      ">nul",
      "&&",
      "set",
    ],
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!success) throw new Error(`${developerShell} failed`);
  developerEnvironment = {};
  for (const line of new TextDecoder().decode(stdout).split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals > 0) {
      developerEnvironment[line.slice(0, equals)] = line.slice(equals + 1);
    }
  }
  return developerEnvironment;
}
