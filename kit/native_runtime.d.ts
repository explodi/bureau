// The globals the UI's engine gives TypeScript beyond ECMAScript: console, timers,
// frames and the clock (src/js/host.cpp), and native_globals.ts's crypto.

declare const console: {
  debug(...data: unknown[]): void;
  info(...data: unknown[]): void;
  log(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};

declare function setTimeout(
  callback: (...args: never[]) => void,
  delayMs?: number,
): number;
declare function setInterval(
  callback: (...args: never[]) => void,
  delayMs?: number,
): number;
declare function clearTimeout(id?: number): void;
declare function clearInterval(id?: number): void;
declare const performance: { now(): number };
declare function requestAnimationFrame(
  callback: (time: number) => void,
): number;
declare function cancelAnimationFrame(id: number): void;
declare function queueMicrotask(callback: () => void): void;

declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  randomUUID(): `${string}-${string}-${string}-${string}-${string}`;
};
