import { assertEquals, assertStringIncludes } from "@std/assert";
import { encodeHex } from "@std/encoding/hex";
import readings from "../assets/keyboards/readings.json" with {
  type: "json",
};

Deno.test("Traditional Chinese pinyin offers common traditional characters", () => {
  const traditional = readings["zh-TW"];
  assertStringIncludes(traditional.tai, "臺");
  assertStringIncludes(traditional.wan, "灣");
  assertStringIncludes(traditional.xue, "學");
  assertStringIncludes(traditional.guo, "國");
  assertStringIncludes(traditional.men, "門");
  assertStringIncludes(traditional.lv, "綠");
  assertEquals(traditional.wan.includes("湾"), false);
  assertEquals(traditional.xue.includes("学"), false);
  assertEquals(traditional.guo.includes("国"), false);
  assertEquals(traditional.men.includes("门"), false);
  assertEquals(new Set(Object.values(traditional).join("")).size, 5401);
});

Deno.test("adding Traditional Chinese preserves Simplified Chinese candidates and order", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(readings.zh));
  assertEquals(
    encodeHex(await crypto.subtle.digest("SHA-256", bytes)),
    "40f1520fb66d96b1ec2c81eeb9b2f9abf9f63915bd176b6f8cbcd4bd59c2e501",
  );
});

Deno.test("adding Traditional Chinese preserves Japanese candidates and order", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(readings.ja));
  assertEquals(
    encodeHex(await crypto.subtle.digest("SHA-256", bytes)),
    "ff81fce3cda9494e14087b6b4607517ae1eb1fe1826dd278f37e88f0cb215b0f",
  );
});
