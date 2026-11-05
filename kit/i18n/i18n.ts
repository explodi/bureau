import { useMemo, useSyncExternalStore } from "react";
import { KIT_STRINGS } from "./kit_strings.ts";
import { formatMessage } from "./message_format.ts";

export type CatalogValue = string | readonly CatalogValue[] | Catalog;
export interface Catalog {
  readonly [key: string]: CatalogValue;
}
export type Catalogs = Record<string, Record<string, Catalog>>;

export interface TranslateOptions<Namespace extends string = string> {
  lng?: string;
  ns?: Namespace | readonly Namespace[];
  defaultValue?: string;
  returnObjects?: boolean;
  [argument: string]: unknown;
}

export interface TFunction<Namespace extends string = string> {
  (
    key: string | readonly string[],
    options: TranslateOptions<Namespace> & { returnObjects: true },
  ): CatalogValue;
  (
    key: string | readonly string[],
    options?: TranslateOptions<Namespace>,
  ): string;
  (
    key: string | readonly string[],
    defaultValue: string,
    options?: TranslateOptions<Namespace>,
  ): string;
}

export interface I18nOptions {
  resources?: Catalogs;
  lng?: string;
  defaultNS?: string;
  fallbackNS?: string;
  onFallback?: (language: string, key: string, reason: unknown) => void;
}

function read(
  catalog: Catalog | undefined,
  key: string,
): CatalogValue | undefined {
  let value: CatalogValue | undefined = catalog;
  for (const part of key.split(".")) {
    if (!value || typeof value === "string" || !Object.hasOwn(value, part)) {
      return undefined;
    }
    value = (value as Catalog)[part];
  }
  return value;
}

function render(
  value: CatalogValue,
  options: TranslateOptions,
  language: string,
): CatalogValue {
  if (typeof value === "string") {
    if (!value) throw new Error("Empty translation");
    const message = formatMessage(value, options, language, {
      requirePluralCase: language !== "en",
    });
    if (!message.trim()) throw new Error("Empty formatted translation");
    return message;
  }
  if (!options.returnObjects) {
    throw new Error("Expected a message, received a catalog");
  }
  if (Array.isArray(value)) {
    return value.map((item) => render(item, options, language));
  }
  return Object.fromEntries(
    Object.entries(value).map((
      [key, item],
    ) => [key, render(item, options, language)]),
  );
}

/** Catalog lookup and message formatting share one fallback boundary. */
export class I18n {
  language = "en";
  readonly store: { data: Catalogs } = { data: {} };
  private defaultNS = "common";
  private fallbackNS = "common";
  private listeners = new Set<(language: string) => void>();
  private fallbacks = new Set<string>();
  private reportFallback?: I18nOptions["onFallback"];

  constructor(options?: I18nOptions) {
    if (options) this.init(options);
  }

  get resolvedLanguage(): string {
    return this.language;
  }

  init(options: I18nOptions): TFunction {
    this.store.data = options.resources ?? {};
    this.defaultNS = options.defaultNS ?? "common";
    this.fallbackNS = options.fallbackNS ?? "common";
    this.reportFallback = options.onFallback;
    this.fallbacks.clear();
    this.language = this.resolveLanguage(options.lng ?? "en");
    return this.t;
  }

  private resolveLanguage(language: string): string {
    const normalized = language.toLowerCase().replaceAll("_", "-");
    const catalogLanguage = Object.keys(this.store.data).find((key) =>
      key.toLowerCase() === normalized
    );
    if (catalogLanguage) return catalogLanguage;
    return normalized.split("-")[0] ?? "en";
  }

  changeLanguage(language: string): Promise<TFunction> {
    const next = this.resolveLanguage(language);
    if (next !== this.language) {
      this.language = next;
      for (const listener of this.listeners) listener(next);
    }
    return Promise.resolve(this.t);
  }

  on(_event: "languageChanged", listener: (language: string) => void): void {
    this.listeners.add(listener);
  }

  off(_event: "languageChanged", listener: (language: string) => void): void {
    this.listeners.delete(listener);
  }

  readonly subscribe = (listener: () => void): () => void => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly snapshot = (): string => this.language;

  getResource(
    language: string,
    namespace: string,
    key: string,
  ): CatalogValue | undefined {
    const resolved = this.resolveLanguage(language);
    const found = read(this.store.data[resolved]?.[namespace], key);
    if (found !== undefined || resolved !== "en") return found;
    return read((KIT_STRINGS as Record<string, Catalog>)[namespace], key);
  }

  private locations(
    key: string,
    namespace?: string | readonly string[],
  ): { namespace: string; key: string }[] {
    const separator = key.indexOf(":");
    const explicit = separator >= 0;
    const names = explicit
      ? [key.slice(0, separator)]
      : typeof namespace === "string"
      ? [namespace]
      : namespace ?? [this.defaultNS];
    const path = explicit ? key.slice(separator + 1) : key;
    return [...new Set([...names, this.fallbackNS])].map((namespace) => ({
      namespace,
      key: path,
    }));
  }

  exists(key: string, options: TranslateOptions = {}): boolean {
    const language = this.resolveLanguage(options.lng ?? this.language);
    return this.locations(key, options.ns).some((location) => {
      const translated = this.getResource(
        language,
        location.namespace,
        location.key,
      );
      const english = this.getResource("en", location.namespace, location.key);
      return translated !== undefined && translated !== "" ||
        english !== undefined && english !== "";
    });
  }

  private fallback(language: string, key: string, reason: unknown): void {
    const id = `${language}:${key}`;
    if (this.fallbacks.has(id)) return;
    this.fallbacks.add(id);
    this.reportFallback?.(language, key, reason);
  }

  readonly t: TFunction = ((
    key: string | readonly string[],
    value?: TranslateOptions | string,
    extra?: TranslateOptions,
  ): CatalogValue => {
    const options = typeof value === "string"
      ? { ...extra, defaultValue: value }
      : value ?? {};
    const language = this.resolveLanguage(options.lng ?? this.language);
    const keys = typeof key === "string" ? [key] : key;
    for (const candidate of keys) {
      for (const location of this.locations(candidate, options.ns)) {
        const qualified = `${location.namespace}:${location.key}`;
        if (language !== "en") {
          const translated = this.getResource(
            language,
            location.namespace,
            location.key,
          );
          if (translated === undefined) {
            this.fallback(language, qualified, "Missing translation");
          } else {
            try {
              return render(translated, options, language);
            } catch (error) {
              this.fallback(language, qualified, error);
            }
          }
        }
        const english = this.getResource(
          "en",
          location.namespace,
          location.key,
        );
        if (english === undefined) continue;
        try {
          return render(english, options, "en");
        } catch (error) {
          this.fallback("en", qualified, error);
        }
      }
    }
    if (options.defaultValue !== undefined) {
      try {
        return formatMessage(options.defaultValue, options, "en");
      } catch (error) {
        this.fallback("en", String(keys[0]), error);
      }
    }
    // Broken English is a source error, but must not expose syntax or keys to players.
    return "Text unavailable";
  }) as TFunction;

  getFixedT(
    language: string,
    namespace?: string | readonly string[],
  ): TFunction {
    return ((
      key: string | readonly string[],
      value?: TranslateOptions | string,
      extra?: TranslateOptions,
    ) => {
      const options = typeof value === "string"
        ? { ...extra, defaultValue: value }
        : value ?? {};
      return this.t(key, { lng: language, ns: namespace, ...options });
    }) as TFunction;
  }
}

export function createInstance(options?: I18nOptions): I18n {
  return new I18n(options);
}

const i18n = createInstance();
export default i18n;
export const t = i18n.t;

export function useTranslation(
  namespace?: string | readonly string[],
  options?: { i18n?: I18n },
): { t: TFunction; i18n: I18n } {
  const instance = options?.i18n ?? i18n;
  const language = useSyncExternalStore(instance.subscribe, instance.snapshot);
  const defaultNamespace = typeof namespace === "string"
    ? namespace
    : namespace?.[0];
  const t = useMemo(
    () => instance.getFixedT(language, defaultNamespace),
    [instance, language, defaultNamespace],
  );
  return { t, i18n: instance };
}
