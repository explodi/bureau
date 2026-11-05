setImmediate(() => {
  __bureauCommit("immediate");
  Promise.resolve().then(() => __bureauCommit("microtask"));
  queueMicrotask(() => __bureauCommit("queued"));
});
setTimeout(() => __bureauCommit("timer"), 0);
const repeat = setInterval(() => {
  __bureauCommit("interval");
  clearInterval(repeat);
}, 5);
requestAnimationFrame((at) => __bureauCommit(`frame:${at}`));
