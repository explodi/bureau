import { assertEquals } from "@std/assert";
import { contrastingTextColor } from "./contrast_color.ts";

Deno.test("dark navy takes the light ink", () => {
  assertEquals(contrastingTextColor("db32-blue-navy"), "db32-white");
});

Deno.test("bright yellow takes the dark ink", () => {
  assertEquals(contrastingTextColor("db32-yellow-bright"), "db32-valhalla");
});

Deno.test("bright cyan takes the dark ink", () => {
  assertEquals(contrastingTextColor("db32-cyan-bright"), "db32-valhalla");
});

Deno.test("pink takes the dark ink", () => {
  assertEquals(contrastingTextColor("db32-pink"), "db32-valhalla");
});

Deno.test("black takes the light ink", () => {
  assertEquals(contrastingTextColor("db32-black"), "db32-white");
});

Deno.test("white takes the dark ink", () => {
  assertEquals(contrastingTextColor("db32-white"), "db32-valhalla");
});
