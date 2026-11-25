import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { forgetVanishedToolset } from "./build_hermes.ts";

Deno.test("a build tree whose cached linker is gone starts afresh", async () => {
  const build = await Deno.makeTempDir();
  const linker = join(build, "old-toolset", "link.exe");
  await Deno.writeTextFile(
    join(build, "CMakeCache.txt"),
    `CMAKE_LINKER:FILEPATH=${linker}\n`,
  );

  await forgetVanishedToolset(build);

  const kept = await Deno.stat(build).then(() => true, () => false);
  assertEquals(kept, false);
});

Deno.test("a build tree whose cached tools are all there is kept", async () => {
  const build = await Deno.makeTempDir();
  const linker = join(build, "link.exe");
  await Deno.writeTextFile(linker, "");
  await Deno.writeTextFile(
    join(build, "CMakeCache.txt"),
    `CMAKE_LINKER:FILEPATH=${linker}\nCMAKE_MT:FILEPATH=CMAKE_MT-NOTFOUND\n`,
  );

  await forgetVanishedToolset(build);

  const kept = await Deno.stat(join(build, "CMakeCache.txt"))
    .then(() => true, () => false);
  assertEquals(kept, true);
  await Deno.remove(build, { recursive: true });
});
