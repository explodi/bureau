declare global {
  var __bureauCommit: (commit: string) => void;
}

const callbacks: Array<() => number> = [];
for (let index = 0; index < 3; index++) {
  callbacks.push(() => index);
}
globalThis.__bureauCommit(callbacks.map((callback) => callback()).join(","));
