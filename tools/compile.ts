/**
 * The bundler's last step: `bundle.js` (and its map) in `output`, lowered to what
 * Hermes runs and compiled to `bundle.hbc`.
 */
import { join } from "@std/path";
import { compilerPath, readPin } from "./fetch_hermes.ts";
import { lowerForHermesWithMap } from "./lower.ts";

async function run(command: string, args: string[]): Promise<void> {
  const result = await new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const message = new TextDecoder().decode(result.stderr);
  if (!result.success) throw new Error(`${command}: ${message}`);
  if (message.trim()) console.error(message.trim());
}

export async function compileBundle(
  output: string,
  options: { developer: boolean },
): Promise<void> {
  const source = await Deno.readTextFile(join(output, "bundle.js"));
  if (source.includes("react-dom")) {
    throw new Error("The bundle includes react-dom");
  }
  const inputMap = JSON.parse(
    await Deno.readTextFile(join(output, "bundle.js.map")),
  );
  const lowered = await lowerForHermesWithMap(source, inputMap);
  await Deno.writeTextFile(join(output, "bundle.lowered.js"), lowered.code);
  if (!lowered.map) throw new Error("Babel returned no source map");
  await Deno.writeTextFile(
    join(output, "bundle.lowered.js.map"),
    JSON.stringify(lowered.map),
  );
  const hermesc = compilerPath(await readPin());
  // bundle.hbc.map maps bytecode to bundle.lowered.js, and
  // bundle.lowered.js.map takes it on to the sources. Given the lowered map as
  // input, hermesc composes it itself but writes every position against one
  // source, losing which file it is in.
  await run(hermesc, [
    "-O",
    ...(options.developer ? ["-g2"] : []),
    "-emit-binary",
    "-output-source-map",
    "-out",
    join(output, "bundle.hbc"),
    join(output, "bundle.lowered.js"),
  ]);
  if (options.developer) {
    // -output-source-map strips the embedded locations the debugger needs.
    await run(hermesc, [
      "-O",
      "-g2",
      "-emit-binary",
      "-out",
      join(output, "bundle.hbc"),
      join(output, "bundle.lowered.js"),
    ]);
  }
}
