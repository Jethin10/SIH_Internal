"use strict";

// Chrome applies the screenshot quota across all tabs of an extension.
(function (root) {
  function createCaptureQueue({ capture, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), intervalMs = 600 }) {
    let tail = Promise.resolve();
    let nextAt = 0;
    return (...args) => {
      const result = tail.then(async () => {
        const delay = nextAt - now();
        if (delay > 0) await sleep(delay);
        nextAt = now() + intervalMs;
        return capture(...args);
      });
      tail = result.catch(() => {});
      return result;
    };
  }
  root.StrawHatsCaptureQueue = { createCaptureQueue };
  if (typeof module !== "undefined") module.exports = root.StrawHatsCaptureQueue;
})(globalThis);
