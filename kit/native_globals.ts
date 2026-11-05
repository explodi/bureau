/**
 * What packages expect of a runtime that the engine lacks: installed first in
 * the bundle, before any package reads them. The engine's host
 * (src/js/host.cpp) gives the timers, the
 * frames, `performance.now` and `queueMicrotask`; these are the rest, over
 * `__native` where they reach the machine (the log, random bytes).
 */
declare const __DEVELOPER_BUILD__: boolean | undefined;
const DEVELOPER_BUILD = typeof __DEVELOPER_BUILD__ === "boolean" &&
  __DEVELOPER_BUILD__;

/** What the native host offers the client (src/js/ui.cpp). */
export interface NativeBridge {
  log(level: string, text: string): void;
  randomBytes(count: number): number[];
}

declare global {
  var __native: NativeBridge & Record<string, unknown>;
}

function define(name: string, value: unknown): void {
  if (Object.getOwnPropertyDescriptor(globalThis, name)) return;
  Object.defineProperty(globalThis, name, {
    value,
    writable: true,
    configurable: true,
  });
}

function describe(part: unknown): string {
  if (part instanceof Error) return `${part.message}\n${part.stack ?? ""}`;
  if (typeof part === "string") return part;
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

function encodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    }
  }
  return new Uint8Array(bytes);
}

function decodeUtf8(input?: ArrayBuffer | ArrayBufferView): string {
  if (input === undefined) return "";
  const bytes = input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  let text = "";
  for (let index = 0; index < bytes.length;) {
    const byte = bytes[index++]!;
    let code = byte;
    if (byte >= 0xf0) {
      code = ((byte & 7) << 18) | ((bytes[index++]! & 63) << 12) |
        ((bytes[index++]! & 63) << 6) | (bytes[index++]! & 63);
    } else if (byte >= 0xe0) {
      code = ((byte & 15) << 12) | ((bytes[index++]! & 63) << 6) |
        (bytes[index++]! & 63);
    } else if (byte >= 0xc0) {
      code = ((byte & 31) << 6) | (bytes[index++]! & 63);
    }
    text += String.fromCodePoint(code);
  }
  return text;
}

class SearchParams {
  #entries: Array<[string, string]> = [];
  constructor(init = "") {
    const query = init.startsWith("?") ? init.slice(1) : init;
    for (const part of query.split("&")) {
      if (!part) continue;
      const [key, value = ""] = part.split("=");
      this.#entries.push([
        decodeURIComponent(key!.replace(/\+/g, " ")),
        decodeURIComponent(value.replace(/\+/g, " ")),
      ]);
    }
  }
  get(name: string) {
    return this.#entries.find(([key]) => key === name)?.[1] ?? null;
  }
  getAll(name: string) {
    return this.#entries.filter(([key]) => key === name).map(([, value]) =>
      value
    );
  }
  has(name: string) {
    return this.#entries.some(([key]) => key === name);
  }
  set(name: string, value: string) {
    this.delete(name);
    this.#entries.push([name, String(value)]);
  }
  append(name: string, value: string) {
    this.#entries.push([name, String(value)]);
  }
  delete(name: string) {
    this.#entries = this.#entries.filter(([key]) => key !== name);
  }
  forEach(callback: (value: string, key: string) => void) {
    for (const [key, value] of this.#entries) callback(value, key);
  }
  keys() {
    return this.#entries.map(([key]) => key)[Symbol.iterator]();
  }
  entries() {
    return this.#entries[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.#entries[Symbol.iterator]();
  }
  toString() {
    return this.#entries.map(([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    ).join("&");
  }
}

/** Absolute `scheme://host/path?query#hash` URLs, and paths against a base. */
class Url {
  protocol = "";
  host = "";
  pathname = "/";
  search = "";
  hash = "";
  constructor(input: string, base?: string) {
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(input);
    if (!absolute && base === undefined) {
      throw new TypeError(`Invalid URL: ${input}`);
    }
    const full = absolute ? input : new Url(base!).#resolve(input);
    const match = full.match(
      /^([a-z][a-z0-9+.-]*:)(?:\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/i,
    );
    if (!match) throw new TypeError(`Invalid URL: ${input}`);
    this.protocol = match[1]!;
    this.host = match[2] ?? "";
    this.pathname = match[3] || "/";
    this.search = match[4] ?? "";
    this.hash = match[5] ?? "";
  }
  #resolve(path: string): string {
    if (path.startsWith("/")) return `${this.origin}${path}`;
    const directory = this.pathname.slice(
      0,
      this.pathname.lastIndexOf("/") + 1,
    );
    return `${this.origin}${directory}${path.replace(/^\.\//, "")}`;
  }
  get origin() {
    return `${this.protocol}//${this.host}`;
  }
  get hostname() {
    return this.host.split(":")[0]!;
  }
  get port() {
    return this.host.split(":")[1] ?? "";
  }
  get searchParams() {
    return new SearchParams(this.search);
  }
  get href() {
    return `${this.origin}${this.pathname}${this.search}${this.hash}`;
  }
  toString() {
    return this.href;
  }
}

class Signal {
  aborted = false;
  reason: unknown = undefined;
  onabort: (() => void) | null = null;
  #listeners = new Set<() => void>();
  addEventListener(_name: string, listener: () => void) {
    this.#listeners.add(listener);
  }
  removeEventListener(_name: string, listener: () => void) {
    this.#listeners.delete(listener);
  }
  throwIfAborted() {
    if (this.aborted) throw this.reason;
  }
  abort(reason: unknown) {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason ?? new Error("Aborted");
    this.onabort?.();
    for (const listener of [...this.#listeners]) listener();
  }
}

function clone<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof Map) {
    return new Map([...value].map(([k, v]) => [clone(k), clone(v)])) as T;
  }
  if (value instanceof Set) return new Set([...value].map(clone)) as T;
  if (ArrayBuffer.isView(value)) {
    return (value as unknown as { slice(): T }).slice();
  }
  if (Array.isArray(value)) return value.map(clone) as T;
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) copy[key] = clone(entry);
  return copy as T;
}

function hex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const native = globalThis.__native;
const line = (level: string) => (...parts: unknown[]) =>
  native.log(level, parts.map(describe).join(" "));
Object.defineProperty(globalThis, "console", {
  value: {
    log: line("log"),
    info: line("info"),
    warn: line("warn"),
    error: line("error"),
    debug: DEVELOPER_BUILD ? line("debug") : () => {},
    trace: line("trace"),
    group: () => {},
    groupEnd: () => {},
    time: () => {},
    timeEnd: () => {},
  },
  writable: true,
  configurable: true,
});
define(
  "TextEncoder",
  class {
    encode = encodeUtf8;
  },
);
define(
  "TextDecoder",
  class {
    decode = decodeUtf8;
  },
);
define("URL", Url);
define("URLSearchParams", SearchParams);
define(
  "AbortController",
  class {
    signal = new Signal();
    abort(reason?: unknown) {
      this.signal.abort(reason);
    }
  },
);
define("structuredClone", clone);
define("crypto", {
  getRandomValues<T extends ArrayBufferView>(array: T): T {
    const bytes = new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength,
    );
    const random = native.randomBytes(bytes.length);
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = random[index]!;
    }
    return array;
  },
  randomUUID() {
    const bytes = native.randomBytes(16);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const text = hex(bytes);
    return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${
      text.slice(16, 20)
    }-${text.slice(20)}`;
  },
});
