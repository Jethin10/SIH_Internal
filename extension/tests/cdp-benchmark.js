"use strict";

const assert = require("assert");

const port = Number(process.env.CHROME_DEBUG_PORT);
const url = process.env.FIXTURE_URL;

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map();
  const events = [];

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      events.push(message);
      return;
    }

    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) {
      request.reject(new Error(`CDP ${request.method}: ${message.error.message}`));
      return;
    }
    request.resolve(message.result);
  };

  return {
    ws,
    events,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, 15000);
        pending.set(id, { resolve, reject, timer, method });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

function percentile(values, value) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(value * sorted.length))];
}

async function findExtensionContext(cdp) {
  const contexts = cdp.events
    .filter((event) => event.method === "Runtime.executionContextCreated")
    .map((event) => event.params.context)
    .reverse();

  for (const context of contexts) {
    try {
      const evaluated = await cdp.send("Runtime.evaluate", {
        contextId: context.id,
        expression: "Boolean(globalThis.__STRAW_HATS_PRIVACY_GATEWAY__)",
        returnByValue: true
      });
      if (evaluated?.result?.value) return context;
    } catch (error) {
      if (!/context|destroyed|invalid/i.test(error.message)) throw error;
    }
  }
  throw new Error("Privacy Gateway execution context was not found");
}

async function findPageContext(cdp) {
  const contexts = cdp.events
    .filter((event) => event.method === "Runtime.executionContextCreated")
    .map((event) => event.params.context)
    .filter((context) => context.auxData?.isDefault)
    .reverse();
  for (const context of contexts) {
    try {
      const evaluated = await cdp.send("Runtime.evaluate", { contextId: context.id, expression: "Boolean(document)", returnByValue: true });
      if (evaluated?.result?.value) return context;
    } catch (error) {
      if (!/context|destroyed|invalid/i.test(error.message)) throw error;
    }
  }
  throw new Error("Default page execution context was not found");
}

async function evaluate(cdp, contextId, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    contextId,
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response?.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Runtime evaluation failed");
  }
  if (!response?.result) throw new Error("Runtime evaluation returned no result");
  return response.result.value;
}

async function evaluateFresh(cdp, kind, expression) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const context = kind === "extension" ? await findExtensionContext(cdp) : await findPageContext(cdp);
      return await evaluate(cdp, context.id, expression);
    } catch (error) {
      lastError = error;
      if (!/context|destroyed|invalid/i.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

(async () => {
  let target;
  const targetDeadline = Date.now() + 15000;
  while (!target && Date.now() < targetDeadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    target = targets.find((item) => item.type === "page" && item.url === url);
    if (!target) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(target, `benchmark page target was not found for ${url}`);

  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  const readyDeadline = Date.now() + 30000;
  let ready = false;
  while (!ready && Date.now() < readyDeadline) {
    try {
      const loaded = await evaluateFresh(cdp, "page", `location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`);
      if (loaded) {
        const initial = await evaluateFresh(cdp, "extension", "chrome.runtime.sendMessage({type:'REFRESH_CONTEXT'})");
        ready = initial?.ok && initial.context?.metrics?.graphComplete && initial.context.metrics.graphNodes > 0;
      }
    } catch (error) {
      if (!/context|destroyed|invalid/i.test(error.message)) throw error;
    }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, "Benchmark page and privacy graph did not finish loading");
  const samples = [];
  let lastResponse;

  for (let index = 0; index < 30; index += 1) {
    const started = performance.now();
    lastResponse = await evaluateFresh(cdp, "extension", "chrome.runtime.sendMessage({type:'REFRESH_CONTEXT'})");
    assert(lastResponse?.ok, `context refresh failed: ${JSON.stringify(lastResponse)}`);
    samples.push(performance.now() - started);
  }

  await evaluateFresh(cdp, "page", "document.querySelector('#mutate').click()");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const afterMutation = await evaluateFresh(cdp, "extension", "chrome.runtime.sendMessage({type:'REFRESH_CONTEXT'})");
  assert(afterMutation?.ok, `post-mutation context refresh failed: ${JSON.stringify(afterMutation)}`);

  const metrics = afterMutation.context?.metrics;
  assert(metrics, "post-mutation response did not include context metrics");
  const warm = samples.slice(5);

  console.log(`BENCHMARK_JSON ${JSON.stringify({
    nodes: Number(new URL(url).searchParams.get("nodes")),
    graphNodes: metrics.graphNodes,
    graphComplete: metrics.graphComplete,
    pendingScanNodes: metrics.pendingScanNodes,
    initialScanMs: metrics.initialScanMs,
    contextBuildMs: metrics.contextBuildMs,
    warmP50Ms: percentile(warm, 0.5),
    warmP95Ms: percentile(warm, 0.95),
    warmP99Ms: percentile(warm, 0.99),
    mutationMs: metrics.lastMutationMs,
    changed: metrics.changedNodesLastBatch,
    reprocessed: metrics.reprocessedLastBatch,
    rawBytes: metrics.rawContextBytes,
    safeBytes: metrics.safeContextBytes,
    graphApproxBytes: metrics.graphApproxBytes,
    reductionPct: Number((100 * (1 - metrics.safeContextBytes / Math.max(1, metrics.rawContextBytes))).toFixed(1)),
    trials: warm.length
  })}`);
  cdp.ws.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
