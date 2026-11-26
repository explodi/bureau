import { useMemo, useSyncExternalStore } from "react";
import { KIT_STRINGS } from "./kit_strings.ts";
import { formatMessage, type MessageValues } from "./message_format.ts";

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

/** What text on screen is formatted with besides each call's own options. */
export interface I18nSnapshot {
  readonly language: string;
  readonly defaultArguments: MessageValues;
}

/** Catalog lookup and message formatting share one fallback boundary. */
export class I18n {
  language = "en";
  readonly store: { data: Catalogs } = { data: {} };
  private defaultNS = "common";
  private fallbackNS = "common";
  private defaults: MessageValues = {};
  private current: I18nSnapshot = {
    language: this.language,
    defaultArguments: this.defaults,
  };
  private languageListeners = new Set<(language: string) => void>();
  private listeners = new Set<() => void>();
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
      for (const listener of this.languageListeners) listener(next);
      for (const listener of this.listeners) listener();
    }
    return Promise.resolve(this.t);
  }

  /** The arguments every message reads when its call does not pass them. */
  get defaultArguments(): MessageValues {
    return this.defaults;
  }

  /**
   * Gives every message the argument `name` for calls that do not pass it
   * themselves, or takes it away when `value` is undefined. Mounted text
   * formats again, as after a language change; `languageChanged` listeners
   * are not told, since the language stays.
   */
  setDefaultArgument(name: string, value: unknown): void {
    const previous = Object.hasOwn(this.defaults, name)
      ? this.defaults[name]
      : undefined;
    if (previous === value) return;
    // A new object each time, so that whoever holds the old one sees a change.
    const defaults: Record<string, unknown> = {
      ...this.defaults,
      [name]: value,
    };
    if (value === undefined) delete defaults[name];
    this.defaults = defaults;
    for (const listener of this.listeners) listener();
  }

  on(_event: "languageChanged", listener: (language: string) => void): void {
    this.languageListeners.add(listener);
  }

  off(_event: "languageChanged", listener: (language: string) => void): void {
    this.languageListeners.delete(listener);
  }

  readonly subscribe = (listener: () => void): () => void => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** A new object whenever the language or a default argument changes. */
  readonly snapshot = (): I18nSnapshot => {
    const isCurrent = this.current.language === this.language &&
      this.current.defaultArguments === this.defaults;
    if (!isCurrent) {
      this.current = {
        language: this.language,
        defaultArguments: this.defaults,
      };
    }
    return this.current;
  };

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
    const values = { ...this.defaults, ...options };
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
              return render(translated, values, language);
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
          return render(english, values, "en");
        } catch (error) {
          this.fallback("en", qualified, error);
        }
      }
    }
    if (options.defaultValue !== undefined) {
      try {
        return formatMessage(options.defaultValue, values, "en");
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
  // A new translator for each snapshot, so memoized text that uses it renders
  // again when a default argument changes too.
  const snapshot = useSyncExternalStore(instance.subscribe, instance.snapshot);
  const defaultNamespace = typeof namespace === "string"
    ? namespace
    : namespace?.[0];
  const t = useMemo(
    () => instance.getFixedT(snapshot.language, defaultNamespace),
    [instance, snapshot, defaultNamespace],
  );
  return { t, i18n: instance };
}
