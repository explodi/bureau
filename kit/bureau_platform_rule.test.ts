import { assertEquals, assertStringIncludes } from "@std/assert";
import { platformRule } from "./bureau_platform_rule.ts";

function check(source: string, file = "src/program.ts") {
  return Deno.lint.runPlugin(
    {
      name: "bureau",
      rules: { "engine-services-use-platform": platformRule },
    },
    file,
    source,
  );
}

Deno.test("a program takes the engine's timers and frames through the platform", () => {
  assertEquals(
    check(`
    setTimeout(run, 0);
    const later = setInterval;
    requestAnimationFrame(render);
    globalThis['clearTimeout'](id);
  `).length,
    4,
  );
});

Deno.test("platform ownership rejects a cast global, in place or aliased", () => {
  const diagnostics = check(`
    (globalThis as any).__reportStartupMilestone?.("boot");
    (window as any).anything = 1;
    const g = self as unknown as { flag?: boolean };
    (<any> globalThis).__x;
  `);
  assertEquals(diagnostics.length, 4);
  assertStringIncludes(diagnostics[0]!.message, "A cast globalThis");
  assertStringIncludes(diagnostics[1]!.message, "A cast window");
});

Deno.test("platform ownership accepts a typed developer hook", () => {
  assertEquals(check("globalThis.__dev = { ready: true };"), []);
});

Deno.test("the native platform wraps the engine's own timers and frames", () => {
  assertEquals(
    check(
      "setTimeout(run, 0); requestAnimationFrame(draw);",
      "kit/native_platform.ts",
    ),
    [],
  );
});

Deno.test("the test platform wraps Deno's timers", () => {
  assertEquals(
    check("setTimeout(run, 0);", "kit/test_platform.ts"),
    [],
  );
});

Deno.test("the design catalog takes the platform's timers too", () => {
  assertEquals(
    check("setTimeout(run, 0);", "src/catalog.tsx").length,
    1,
  );
});

Deno.test("platform ownership leaves tools and the server alone", () => {
  assertEquals(check("setTimeout(run, 0);", "tools/probe.ts"), []);
  assertEquals(check("setTimeout(run, 0);", "tests/probe.ts"), []);
});

Deno.test("platform ownership ignores prose, object properties and platform calls", () => {
  assertEquals(
    check(`
    // setTimeout and requestAnimationFrame are the engine's.
    const description = 'setTimeout';
    const data = { setTimeout: 1 };
    data.setTimeout;
    platform.timers.setTimeout(update, 20);
  `),
    [],
  );
});

Deno.test("Z7 only the city host and the pad take the platform's frames", () => {
  const loop = `
    const frame = platform.frame.request(draw);
    platform.frame.cancel(frame);
  `;
  assertEquals(check(loop, "src/Shop.tsx").length, 2);
  assertEquals(check(loop, "kit/input/Gamepad.ts").length, 0);
  assertEquals(
    check("const now = platform.frame.now();", "src/Bank.tsx")
      .length,
    0,
  );
});
