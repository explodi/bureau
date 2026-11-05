import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import {
  formatMessage,
  messageArguments,
  MessageSyntaxError,
  parseMessage,
} from "./message_format.ts";

Deno.test("plain arguments preserve numbers, falsy values and inserted syntax", () => {
  assertEquals(formatMessage("{count}", { count: 1234 }, "en"), "1234");
  assertEquals(
    formatMessage("{zero}|{false}|{empty}", {
      zero: 0,
      false: false,
      empty: "",
    }, "en"),
    "0|false|",
  );
  assertEquals(
    formatMessage("<b>{name}</b>", {
      name: "{gender, select, other {oops}} $t(secret) # '",
    }, "en"),
    "<b>{gender, select, other {oops}} $t(secret) # '</b>",
  );
});

Deno.test("only an argument's own value is visible", () => {
  assertEquals(
    formatMessage("{__proto__}", JSON.parse('{"__proto__":"Ada"}'), "en"),
    "Ada",
  );
  assertThrows(
    () => formatMessage("{toString}", {}, "en"),
    Error,
    "Missing message argument: toString",
  );
  assertThrows(
    () => formatMessage("{name}", { name: undefined }, "en"),
    Error,
    "Missing message argument: name",
  );
});

Deno.test("select uses a matching case or other, including a missing declared argument", () => {
  const message =
    "{name} said {gender, select, female {she} male {he} other {they}} will attend.";
  assertEquals(
    formatMessage(message, { name: "Alex", gender: "female" }, "en"),
    "Alex said she will attend.",
  );
  assertEquals(
    formatMessage(message, { name: "Alex", gender: "male" }, "en"),
    "Alex said he will attend.",
  );
  assertEquals(
    formatMessage(message, { name: "Alex", gender: "unknown" }, "en"),
    "Alex said they will attend.",
  );
  assertEquals(
    formatMessage(message, { name: "Alex" }, "en"),
    "Alex said they will attend.",
  );
});

Deno.test("prototype names are ordinary select cases", () => {
  assertEquals(
    formatMessage("{key, select, __proto__ {prototype} other {fallback}}", {
      key: "__proto__",
    }, "en"),
    "prototype",
  );
  assertEquals(
    formatMessage("{key, select, other {fallback}}", { key: "toString" }, "en"),
    "fallback",
  );
});

Deno.test("unselected branches need no arguments", () => {
  assertEquals(
    formatMessage(
      "{gender, select, female {name} other {Anonymous}}",
      {},
      "en",
    ),
    "Anonymous",
  );
  assertEquals(
    formatMessage(
      "{key, select, undefined {present} other {missing}}",
      {},
      "en",
    ),
    "missing",
  );
});

Deno.test("nested select and plural choose the language's cases", () => {
  assertEquals(
    formatMessage(
      "{gender, select, female {{count, plural, one {She opened one park.} other {She opened # parks.}}} other {{count, plural, one {They opened one park.} other {They opened # parks.}}}}",
      { gender: "female", count: 4 },
      "en",
    ),
    "She opened 4 parks.",
  );
});

Deno.test("exact plural cases precede categories and offsets", () => {
  const message =
    "{count, plural, offset:1 =0 {Nobody} =1 {Only you} one {You and one guest} other {You and # guests}}";
  assertEquals(formatMessage(message, { count: 0 }, "en"), "Nobody");
  assertEquals(formatMessage(message, { count: 1 }, "en"), "Only you");
  assertEquals(formatMessage(message, { count: 2 }, "en"), "You and one guest");
  assertEquals(formatMessage(message, { count: 5 }, "en"), "You and 4 guests");
  assertEquals(
    formatMessage("{count, plural, =0 {exact} zero {category} other {other}}", {
      count: 0,
    }, "en"),
    "exact",
  );
});

Deno.test("exact plural cases accept negative and fractional values", () => {
  const message =
    "{count, plural, =-1 {negative} =1.5 {fraction} other {other}}";
  assertEquals(formatMessage(message, { count: -1 }, "en"), "negative");
  assertEquals(formatMessage(message, { count: 1.5 }, "en"), "fraction");
});

Deno.test("English ordinals distinguish endings from teens", () => {
  const message =
    "{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}";
  assertEquals(formatMessage(message, { rank: 21 }, "en"), "21st");
  assertEquals(formatMessage(message, { rank: 22 }, "en"), "22nd");
  assertEquals(formatMessage(message, { rank: 23 }, "en"), "23rd");
  assertEquals(formatMessage(message, { rank: 11 }, "en"), "11th");
  assertEquals(formatMessage(message, { rank: 12 }, "en"), "12th");
  assertEquals(formatMessage(message, { rank: 13 }, "en"), "13th");
});

Deno.test("Spanish millions have the many category", () => {
  const message = "{count, plural, one {uno} many {muchos} other {otros}}";
  assertEquals(formatMessage(message, { count: 1 }, "es"), "uno");
  assertEquals(formatMessage(message, { count: 2 }, "es"), "otros");
  assertEquals(formatMessage(message, { count: 1_000_000 }, "es"), "muchos");
});

Deno.test("Polish selects few, many and fractional other", () => {
  const message =
    "{count, plural, one {# park} few {# parki} many {# parków} other {# parku}}";
  assertEquals(formatMessage(message, { count: 1 }, "pl"), "1 park");
  assertEquals(formatMessage(message, { count: 22 }, "pl"), "22 parki");
  assertEquals(formatMessage(message, { count: 12 }, "pl"), "12 parków");
  assertEquals(formatMessage(message, { count: 1.5 }, "pl"), "1,5 parku");
});

Deno.test("French zero and Japanese one use their own cardinal rules", () => {
  assertEquals(
    formatMessage(
      "{count, plural, one {# parc} other {# parcs}}",
      { count: 0 },
      "fr",
    ),
    "0 parc",
  );
  assertEquals(
    formatMessage(
      "{count, plural, one {wrong} other {公園#件}}",
      { count: 1 },
      "ja",
    ),
    "公園1件",
  );
});

Deno.test("pound is formatted in the message's language", () => {
  const message = "{count, plural, other {# / {count}}}";
  assertEquals(
    formatMessage(message, { count: 12345 }, "de"),
    "12.345 / 12345",
  );
  assertEquals(
    formatMessage(message, { count: 12345 }, "en"),
    "12,345 / 12345",
  );
  assertEquals(
    formatMessage(message, { count: 12345 }, "fr"),
    "12 345 / 12345",
  );
});

Deno.test("nested plurals restore the enclosing pound value", () => {
  assertEquals(
    formatMessage(
      "{outer, plural, other {# ({inner, plural, offset:1 other {#}}) #}}",
      { outer: 5, inner: 3 },
      "en",
    ),
    "5 (2) 5",
  );
});

Deno.test("a pound is special directly in a plural, not in a nested select", () => {
  assertEquals(
    formatMessage("{count, plural, other {# {gender, select, other {#}} #}}", {
      count: 2,
    }, "en"),
    "2 # 2",
  );
  assertEquals(formatMessage("# '#': {count}", { count: 2 }, "en"), "# '#': 2");
});

Deno.test("apostrophes quote syntax while preserving contractions", () => {
  assertEquals(
    formatMessage("Don't quote '{name}'; ''{name}'' is the mayor.", {
      name: "Alex",
    }, "en"),
    "Don't quote {name}; 'Alex' is the mayor.",
  );
  assertEquals(formatMessage("'{' and '}'", {}, "en"), "{ and }");
  assertEquals(formatMessage("'{still quoted", {}, "en"), "{still quoted");
  assertEquals(formatMessage("'{isn''t parsed}'", {}, "en"), "{isn't parsed}");
  assertEquals(
    formatMessage("# {count, plural, other {'#' #}}", { count: 2 }, "en"),
    "# # 2",
  );
});

Deno.test("number formats use Bureau's number formatting", () => {
  assertEquals(
    formatMessage(
      "{amount, number} / {amount, number, integer} / {amount, number, currency} / {ratio, number, percent}",
      { amount: 1234.6, ratio: 0.25 },
      "en",
    ),
    "1,234.6 / 1,235 / $1,234.60 / 25%",
  );
  assertEquals(formatMessage("{n, number}", { n: "1234.5" }, "de"), "1.234,5");
});

Deno.test("translated plurals can require the selected category", () => {
  const message = "{count, plural, one {uno} other {otros}}";
  assertEquals(formatMessage(message, { count: 1_000_000 }, "es"), "otros");
  assertThrows(
    () =>
      formatMessage(message, { count: 1_000_000 }, "es", {
        requirePluralCase: true,
      }),
    Error,
    "Missing plural case many for count",
  );
  assertEquals(
    formatMessage(
      "{count, plural, =1000000 {exact} other {otros}}",
      { count: 1_000_000 },
      "es",
      { requirePluralCase: true },
    ),
    "exact",
  );
  assertEquals(
    formatMessage(
      "{gender, select, female {ella} other {persona}}",
      { gender: "unknown" },
      "es",
      { requirePluralCase: true },
    ),
    "persona",
  );
});

Deno.test("strict plural completeness also applies to nested blocks and ordinals", () => {
  assertThrows(
    () =>
      formatMessage(
        "{x, select, other {{count, plural, other {otros}}}}",
        { count: 2 },
        "pl",
        { requirePluralCase: true },
      ),
    Error,
    "Missing plural case few for count",
  );
  assertThrows(
    () =>
      formatMessage("{rank, selectordinal, other {#th}}", { rank: 1 }, "en", {
        requirePluralCase: true,
      }),
    Error,
    "Missing plural case one for rank",
  );
});

Deno.test("missing number arguments fail the message", () => {
  assertThrows(
    () => formatMessage("{n, number}", {}, "en"),
    Error,
    "Missing message argument: n",
  );
  assertThrows(
    () => formatMessage("{n, plural, other {#}}", {}, "en"),
    Error,
    "Missing message argument: n",
  );
});

Deno.test("numeric coercion and special numbers follow FormatJS", () => {
  assertEquals(formatMessage("{n, number}", { n: null }, "en"), "0");
  assertEquals(formatMessage("{n, number}", { n: true }, "en"), "1");
  assertEquals(formatMessage("{n, number}", { n: NaN }, "en"), "NaN");
  assertEquals(formatMessage("{n, number}", { n: Infinity }, "en"), "∞");
  assertEquals(
    formatMessage("{n, plural, other {#}}", { n: "none" }, "en"),
    "NaN",
  );
  assertEquals(
    formatMessage("{n, plural, other {#}}", { n: Infinity }, "en"),
    "∞",
  );
});

Deno.test("malformed messages report their position", () => {
  const error = assertThrows(
    () => parseMessage("hello }"),
    MessageSyntaxError,
    "position 6",
  );
  assertEquals(error.position, 6);
  assertThrows(() => parseMessage("hello {"), MessageSyntaxError, "position 6");
  assertThrows(
    () => parseMessage("{bad name}"),
    MessageSyntaxError,
    "Invalid argument name",
  );
  assertThrows(
    () => parseMessage("{n, plural}"),
    MessageSyntaxError,
    "needs cases",
  );
  assertThrows(
    () => parseMessage("{n, plural, one {one}}"),
    MessageSyntaxError,
    "other case",
  );
  assertThrows(
    () => parseMessage("{n, plural, other {unclosed}"),
    MessageSyntaxError,
    "Unclosed block",
  );
  assertThrows(
    () => parseMessage("{n, plural, other {first} other {second}}"),
    MessageSyntaxError,
    "Duplicate case other",
  );
  assertThrows(
    () => parseMessage("{n, plural, bogus {bad} other {valid}}"),
    MessageSyntaxError,
    "Invalid case key",
  );
  assertThrows(
    () => parseMessage("{n, plural, offset:-1 other {invalid}}"),
    MessageSyntaxError,
    "Invalid case key",
  );
});

Deno.test("unsupported date, time and skeleton formats must be preformatted", () => {
  assertThrows(
    () => parseMessage("{date, date, long}"),
    MessageSyntaxError,
    "pass preformatted text",
  );
  assertThrows(
    () => parseMessage("{time, time}"),
    MessageSyntaxError,
    "pass preformatted text",
  );
  assertThrows(
    () => parseMessage("{n, number, ::currency/USD}"),
    MessageSyntaxError,
    "pass preformatted text",
  );
  assertThrows(
    () => parseMessage("{n, number, unknown}"),
    MessageSyntaxError,
    "pass preformatted text",
  );
});

Deno.test("parsed messages are cached by source, independent of language", () => {
  assertStrictEquals(
    parseMessage("Cached {name}"),
    parseMessage("Cached {name}"),
  );
  assertEquals(
    formatMessage("Cached {name}", { name: "Ada" }, "en"),
    "Cached Ada",
  );
  assertEquals(
    formatMessage("Cached {name}", { name: "Grace" }, "fr"),
    "Cached Grace",
  );
});

Deno.test("argument inspection includes nested branches but ignores quoted text", () => {
  assertEquals(
    messageArguments(
      "'{ignored}' {name} {gender, select, female {{n, plural, one {{amount, number}} other {#}}} other {anonymous}}",
    ),
    [
      { name: "name", kind: "argument" },
      { name: "gender", kind: "select", cases: ["female", "other"] },
      { name: "n", kind: "plural", cases: ["one", "other"] },
      { name: "amount", kind: "number" },
    ],
  );
  assertEquals(
    formatMessage("{名前}: {город}", { 名前: "Ada", город: "Paris" }, "en"),
    "Ada: Paris",
  );
});
