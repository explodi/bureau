import { assertEquals } from "@std/assert";
import { createElement } from "react";
import { Text } from "bureau/primitives";
import { createNativeRoot } from "../primitives/reconciler.ts";
import type { MutationStream } from "../primitives/ops.ts";
import { createInstance, useTranslation } from "./i18n.ts";

Deno.test("catalog lookup resolves namespaces, nested keys and common", () => {
  const i18n = createInstance({
    lng: "es-MX",
    defaultNS: "tools",
    resources: {
      en: { common: { close: "Close" } },
      es: {
        tools: { build: { house: "Construir" } },
        common: { close: "Cerrar" },
      },
    },
  });
  assertEquals(i18n.t("build.house"), "Construir");
  assertEquals(i18n.t("close"), "Cerrar");
  assertEquals(i18n.t("tools:build.house"), "Construir");
  assertEquals(i18n.t("build.house", { ns: "tools" }), "Construir");
  assertEquals(i18n.t("common:close", { lng: "en" }), "Close");
});

Deno.test("a missing namespace, missing key and empty translation use English", () => {
  const i18n = createInstance({
    lng: "es",
    resources: {
      en: {
        common: { absent: "Present", empty: "Full" },
        tools: { title: "Tools" },
      },
      es: { common: { empty: "" } },
    },
  });
  assertEquals(i18n.t("absent"), "Present");
  assertEquals(i18n.t("empty"), "Full");
  assertEquals(i18n.t("tools:title"), "Tools");
});

for (const language of ["fi", "nl", "ru", "uk", "zh-TW"]) {
  Deno.test(`${language} uses English until a translation is downloaded`, () => {
    const i18n = createInstance({
      lng: language,
      resources: {
        en: {
          common: {
            close: "Close",
            coins: "{count, plural, one {# coin} other {# coins}}",
          },
        },
        [language]: {},
      },
    });
    assertEquals(i18n.language, language);
    assertEquals(i18n.t("close"), "Close");
    assertEquals(i18n.t("coins", { count: 2 }), "2 coins");
  });
}

Deno.test("a malformed translation and a missing argument use English", () => {
  const i18n = createInstance({
    lng: "es",
    resources: {
      en: { common: { malformed: "Welcome {name}", extra: "Hello {name}" } },
      es: { common: { malformed: "Hola {", extra: "Hola {name} {title}" } },
    },
  });
  assertEquals(i18n.t("malformed", { name: "Sam" }), "Welcome Sam");
  assertEquals(i18n.t("extra", { name: "Sam" }), "Hello Sam");
});

Deno.test("an incomplete translated plural uses English instead of other", () => {
  const i18n = createInstance({
    lng: "es",
    resources: {
      en: {
        common: {
          coins: "{count, plural, one {{count} coin} other {{count} coins}}",
        },
      },
      es: {
        common: {
          coins:
            "{count, plural, one {{count} moneda} other {{count} monedas}}",
        },
      },
    },
  });
  assertEquals(i18n.t("coins", { count: 1 }), "1 moneda");
  assertEquals(i18n.t("coins", { count: 2 }), "2 monedas");
  assertEquals(i18n.t("coins", { count: 1000000 }), "1000000 coins");
});

Deno.test("a missing select case or value keeps the translation's other", () => {
  const i18n = createInstance({
    lng: "es",
    resources: {
      en: { common: { welcome: "Welcome" } },
      es: {
        common: {
          welcome: "{gender, select, female {Bienvenida} other {Hola}}",
        },
      },
    },
  });
  assertEquals(i18n.t("welcome", { gender: "male" }), "Hola");
  assertEquals(i18n.t("welcome"), "Hola");
});

Deno.test("arrays and objects format their values and fall back whole", () => {
  const i18n = createInstance({
    lng: "es",
    resources: {
      en: {
        common: {
          lines: ["Hello {name}", "Welcome"],
          missing: ["One", "Two"],
          nested: { title: "Mr {name}" },
        },
      },
      es: {
        common: {
          lines: ["Hola {name}", "{missing}"],
          nested: { title: "Sr {name}" },
        },
      },
    },
  });
  assertEquals(i18n.t("lines", { returnObjects: true, name: "Sam" }), [
    "Hello Sam",
    "Welcome",
  ]);
  assertEquals(i18n.t("missing", { returnObjects: true }), ["One", "Two"]);
  assertEquals(i18n.t("nested", { returnObjects: true, name: "Sam" }), {
    title: "Sr Sam",
  });
});

Deno.test("default messages are ICU and explicit empty defaults remain optional", () => {
  const i18n = createInstance();
  assertEquals(
    i18n.t("new", { defaultValue: "Hello {name}", name: "Sam" }),
    "Hello Sam",
  );
  assertEquals(i18n.t("new", "Hello {name}", { name: "Sam" }), "Hello Sam");
  assertEquals(i18n.t("optional", { defaultValue: "" }), "");
  assertEquals(i18n.t("missing"), "Text unavailable");
  assertEquals(i18n.t("broken", { defaultValue: "{" }), "Text unavailable");
});

Deno.test("a fallback is reported once per language and key", () => {
  const logged: string[] = [];
  const i18n = createInstance({
    lng: "es",
    resources: { en: { common: { title: "Title" } } },
    onFallback: (language, key) => logged.push(`${language}/${key}`),
  });
  i18n.t("title");
  i18n.t("title");
  i18n.t("title", { lng: "pl" });
  assertEquals(logged, ["es/common:title", "pl/common:title"]);
});

Deno.test("fixed translators keep their language while subscribers follow changes", async () => {
  const i18n = createInstance({
    resources: {
      en: { common: { title: "Title" } },
      es: { common: { title: "Título" } },
    },
  });
  const fixed = i18n.getFixedT("en", "common");
  const languages: string[] = [];
  const listener = (language: string) => languages.push(language);
  i18n.on("languageChanged", listener);
  await i18n.changeLanguage("es");
  assertEquals(i18n.t("title"), "Título");
  assertEquals(fixed("title"), "Title");
  assertEquals(languages, ["es"]);
  i18n.off("languageChanged", listener);
  await i18n.changeLanguage("en");
  assertEquals(languages, ["es"]);
});

Deno.test("a language change re-renders mounted native text", async () => {
  const i18n = createInstance({
    resources: {
      en: { common: { title: "Title" } },
      es: { common: { title: "Título" } },
    },
  });
  function Caption() {
    const { t } = useTranslation("common", { i18n });
    return createElement(Text, null, t("title"));
  }
  const commits: MutationStream[] = [];
  const root = createNativeRoot((stream) => commits.push(stream));
  root.renderSync(createElement(Caption));
  await i18n.changeLanguage("es");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(commits.at(-1)?.strings.includes("Título"), true);
  root.renderSync(null);
});

Deno.test("context candidates prefer their English before the general message", () => {
  const i18n = createInstance({
    lng: "es",
    resources: {
      en: {
        placement: {
          denial: {
            ground: "Needs solid ground",
            ground_slope: "Level the ground first",
          },
        },
      },
      es: { placement: { denial: { ground: "Necesita suelo firme" } } },
    },
  });
  assertEquals(
    i18n.t(["placement:denial.ground_slope", "placement:denial.ground"]),
    "Level the ground first",
  );
  assertEquals(
    i18n.t(["placement:denial.ground_unknown", "placement:denial.ground"]),
    "Necesita suelo firme",
  );
});

Deno.test("an empty selected translation falls back instead of hiding the message", () => {
  const i18n = createInstance({
    lng: "es",
    resources: {
      en: { common: { welcome: "Welcome" } },
      es: {
        common: { welcome: "{gender, select, female {Bienvenida} other {}}" },
      },
    },
  });
  assertEquals(i18n.t("welcome"), "Welcome");
  assertEquals(i18n.t("welcome", { gender: "female" }), "Bienvenida");
});

Deno.test("the hook binds the first namespace and retains common as its fallback", () => {
  const i18n = createInstance({
    resources: {
      en: {
        common: { title: "Common title" },
        primary: {},
        secondary: { title: "Secondary title" },
      },
    },
  });
  function Caption() {
    const { t } = useTranslation(["primary", "secondary"], { i18n });
    return createElement(Text, null, t("title"));
  }
  const commits: MutationStream[] = [];
  const root = createNativeRoot((stream) => commits.push(stream));
  root.renderSync(createElement(Caption));
  assertEquals(commits.at(-1)?.strings.includes("Common title"), true);
  assertEquals(
    i18n.getFixedT("en", ["primary", "secondary"])("title"),
    "Secondary title",
  );
  root.renderSync(null);
});

Deno.test("regional catalog keys retain their canonical casing", async () => {
  const i18n = createInstance({
    lng: "zh-tw",
    resources: {
      en: { common: { title: "English" } },
      zh: { common: { title: "Simplified" } },
      "zh-TW": { common: { title: "Traditional" } },
    },
  });
  assertEquals(i18n.language, "zh-TW");
  assertEquals(i18n.t("title"), "Traditional");
  await i18n.changeLanguage("zh");
  assertEquals(i18n.t("title"), "Simplified");
  await i18n.changeLanguage("zh_TW");
  assertEquals(i18n.t("title"), "Traditional");
});

Deno.test("the kit speaks English with no catalog of the game's", () => {
  const i18n = createInstance({ lng: "en", resources: {} });
  assertEquals(i18n.t("common:close"), "Close");
  assertEquals(
    i18n.t("titlescreen:keyboard.charactersHint", { count: 1, max: 9 }),
    "1/9 characters",
  );
});

Deno.test("the game's catalog comes before the kit's English", () => {
  const i18n = createInstance({
    lng: "en",
    resources: { en: { common: { close: "Shut" } } },
  });
  assertEquals(i18n.t("common:close"), "Shut");
});
