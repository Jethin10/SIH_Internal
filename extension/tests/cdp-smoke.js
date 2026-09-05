const assert = require("assert");

const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9227);
const FIXTURE_URL = process.env.FIXTURE_URL || "http://127.0.0.1:8765/tests/integration.html";

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    events.push(message);
  });

  function send(method, params = {}, timeoutMs = 10000) {
    const id = nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP command timed out after ${timeoutMs} ms: ${method}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
    ws.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  return { ws, send, events };
}

async function main() {
  const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page" && target.url === FIXTURE_URL);
  assert(page, "integration fixture page target was not found");

  const cdp = await connect(page.webSocketDebuggerUrl);
  await new Promise((resolve) => setTimeout(resolve, 900));
  await cdp.send("Runtime.enable");
  await new Promise((resolve) => setTimeout(resolve, 250));

  const contexts = cdp.events
    .filter((event) => event.method === "Runtime.executionContextCreated")
    .map((event) => event.params.context);
  assert(contexts.length > 0, "no execution contexts were reported");

  let extensionContext = null;
  const orderedContexts = [...contexts].sort((a, b) => Number(b.auxData?.frameId === page.id) - Number(a.auxData?.frameId === page.id));
  for (const context of orderedContexts) {
    let result;
    try {
      result = await cdp.send("Runtime.evaluate", {
        contextId: context.id,
        expression: "Boolean(globalThis.__STRAW_HATS_PRIVACY_GATEWAY__ && globalThis.PrivacyPII)",
        returnByValue: true
      });
    } catch (_) { continue; }
    if (result.result?.value === true) {
      extensionContext = context;
      break;
    }
  }
  assert(extensionContext, "privacy content script did not initialize in an isolated world");
  async function waitForConfirmation() {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const result = await cdp.send("Runtime.evaluate", {
        contextId: extensionContext.id,
        expression: "chrome.runtime.sendMessage({type:'GET_AUDIT'})",
        awaitPromise: true, returnByValue: true
      });
      if (result.result?.value?.receipts?.[0]?.localDecision === "needs_confirmation") return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("The visual action did not reach confirmation within 10 seconds");
  }

  const savedSettings = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: `(async () => {
      const save = await chrome.runtime.sendMessage({type:'SAVE_SETTINGS', settings:{userProfile:{name:'Vault User',email:'vault.user@example.com',phone:'9876543210',address:'Knowledge Park II, Greater Noida',upi:'vault@upi'}}});
      const local = await chrome.storage.local.get(['gatewaySettings']);
      return {save, local};
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert(savedSettings.result?.value?.save?.ok, "session-only private profile could not be saved");
  assert.strictEqual(savedSettings.result.value.local.gatewaySettings.provider.apiKey, "", "API key was persisted in local storage");
  assert.strictEqual(savedSettings.result.value.local.gatewaySettings.userProfile.email, "", "private profile was persisted in local storage");

  const refresh = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'REFRESH_CONTEXT'})",
    awaitPromise: true,
    returnByValue: true
  });
  const response = refresh.result?.value;
  assert(response?.ok, `refresh failed: ${JSON.stringify(response)}`);
  assert(response.context?.elements?.length > 0, "safe context has no elements");
  assert(response.context.metrics?.sensitiveNodes >= 1, "expected sensitive nodes were not detected");
  const serialized = JSON.stringify(response.context);
  assert(!serialized.includes("test.user@example.com"), "raw email leaked into safe context");
  assert(!serialized.includes("9876543210"), "raw phone leaked into safe context");
  assert(!serialized.includes("swordfish42"), "blocked password value leaked into safe context");
  assert(!response.context.elements.some((element) => element.semanticType === "password"), "BLOCK-classified password field was still exported");
  assert(serialized.includes("<EMAIL:"), "email alias was not present in safe context");

  const profileFill = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'START_TASK', task:'fill my email'})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(profileFill.result?.value?.ok, "private capability fill task did not start");
  await new Promise((resolve) => setTimeout(resolve, 700));

  const firstEmail = response.context.elements.find((element) => element.semanticType === "email" && /email/i.test(element.label || ""));
  assert(firstEmail, "email field was not present in safe context");
  const mainContext = contexts.find((context) => context.auxData?.isDefault && context.auxData?.frameId === page.id);
  assert(mainContext, "default page context was not found");
  const profileValue = await cdp.send("Runtime.evaluate", {
    contextId: mainContext.id,
    expression: "document.querySelector('#email').value",
    returnByValue: true
  });
  assert.strictEqual(profileValue.result?.value, "vault.user@example.com", "private email capability was not resolved locally into the matching field");
  await cdp.send("Runtime.evaluate", {
    contextId: mainContext.id,
    expression: `(() => { const el = document.querySelector('#email'); el.value = 'changed.user@example.com'; el.dispatchEvent(new InputEvent('input', { bubbles: true, data: el.value })); })()`,
    returnByValue: true
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const afterUserEdit = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'REFRESH_CONTEXT'})",
    awaitPromise: true,
    returnByValue: true
  });
  const editedResponse = afterUserEdit.result?.value;
  const editedEmail = editedResponse?.context?.elements?.find((element) => element.id === firstEmail.id);
  assert(editedEmail?.version > firstEmail.version, "user input did not invalidate the privacy-graph node version");
  assert(!JSON.stringify(editedResponse.context).includes("changed.user@example.com"), "user-edited email leaked into safe context");

  await cdp.send("Runtime.evaluate", {
    contextId: mainContext.id,
    expression: "document.querySelector('#opaque').scrollIntoView({block:'center'})",
    returnByValue: true
  });
  await new Promise((resolve) => setTimeout(resolve, 120));

  const visualScan = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'VISUAL_SCAN'})",
    awaitPromise: true,
    returnByValue: true
  });
  const visualResponse = visualScan.result?.value;
  assert(visualResponse?.ok, `visual scan failed: ${JSON.stringify(visualResponse)}`);
  assert(visualResponse.visual?.lineCount > 0, "local OCR returned no visual text regions");
  assert(visualResponse.visual?.redactionCount >= 1, "local visual scan did not produce a sensitive-region mask");
  assert(/^data:image\/png;base64,/.test(visualResponse.visual?.redactedPreviewDataUrl || ""), "redacted visual preview was not returned as a local PNG");
  const visualElements = visualResponse.context?.elements?.filter((element) => element.source === "vision") || [];
  assert(visualElements.length > 0, "visual OCR elements were not added to safe context");
  if (!visualElements.some((element) => /private visual fallback/i.test(element.label || ""))) {
    const canvasGeometry = await cdp.send("Runtime.evaluate", {
      contextId: mainContext.id,
      expression: "(() => { const r=document.querySelector('#opaque').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,scrollY,innerHeight}; })()",
      returnByValue: true
    });
    throw new Error(`OCR did not recover expected canvas text: ${JSON.stringify({ labels: visualElements.map((element) => element.label), canvas: canvasGeometry.result?.value })}`);
  }
  const canvasVisualTargets = visualElements.filter((element) => /private visual fallback/i.test(element.label || ""));
  assert(canvasVisualTargets.some((element) => element.actionable), `OCR recovered canvas text but did not bind it to the opaque region: ${JSON.stringify(canvasVisualTargets)}`);
  const visualSerialized = JSON.stringify(visualResponse.context);
  assert(!visualSerialized.includes("test.user@example.com"), "raw email leaked through local OCR context");
  assert(!visualSerialized.includes("canvas.user@example.com"), "canvas email leaked through local OCR context");
  assert(!visualSerialized.includes("9876543210"), "raw phone leaked through local OCR context");
  const visualExpectedPatterns = [/canvas checkout/i, /private visual fallback/i, /<EMAIL:/i];
  const visualRecoveredTargets = visualExpectedPatterns.filter((pattern) => visualElements.some((element) => pattern.test(element.label || ""))).length;
  const visualSensitiveLines = (visualResponse.localPreview || []).filter((item) => item.source === "vision").length;
  assert.strictEqual(visualRecoveredTargets, visualExpectedPatterns.length, "OCR did not recover every labelled canvas target");
  assert(visualResponse.visual.redactionCount >= visualSensitiveLines && visualSensitiveLines > 0, "not every OCR-detected sensitive line received a mask");

  const visualBlockTask = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'START_TASK', task:'click Private visual fallback'})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(visualBlockTask.result?.value?.ok, "visual click task did not start");
  await waitForConfirmation();
  const blockVisual = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'CONFIRM_PENDING', allow:false})",
    awaitPromise: true,
    returnByValue: true
  });
  if (!(blockVisual.result?.value?.ok && blockVisual.result?.value?.blocked)) {
    const visualAuditDebug = await cdp.send("Runtime.evaluate", { contextId: extensionContext.id, expression: "chrome.runtime.sendMessage({type:'GET_AUDIT'})", awaitPromise: true, returnByValue: true });
    throw new Error(`visual click did not reach local confirmation: ${JSON.stringify({ response: blockVisual.result?.value, receipts: visualAuditDebug.result?.value?.receipts?.slice(0, 6) })}`);
  }
  const blockedCanvasCount = await cdp.send("Runtime.evaluate", { contextId: mainContext.id, expression: "window.canvasClicks", returnByValue: true });
  assert.strictEqual(blockedCanvasCount.result?.value, 0, "blocked visual action still clicked the canvas");

  const visualAllowTask = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'START_TASK', task:'click Private visual fallback'})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(visualAllowTask.result?.value?.ok, "second visual click task did not start");
  await waitForConfirmation();
  const allowVisual = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'CONFIRM_PENDING', allow:true})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(allowVisual.result?.value?.ok, `confirmed visual action was not accepted: ${JSON.stringify(allowVisual.result?.value)}`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const allowedCanvasCount = await cdp.send("Runtime.evaluate", { contextId: mainContext.id, expression: "window.canvasClicks", returnByValue: true });
  assert.strictEqual(allowedCanvasCount.result?.value, 1, "confirmed visual action did not click exactly once");

  const startSearch = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'START_TASK', task:'search for privacy gateway'})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(startSearch.result?.value?.ok, `search task did not start: ${JSON.stringify(startSearch.result?.value)}`);
  await new Promise((resolve) => setTimeout(resolve, 900));

  const searchValue = await cdp.send("Runtime.evaluate", {
    contextId: mainContext.id,
    expression: "document.querySelector('#search').value",
    returnByValue: true
  });
  assert.strictEqual(searchValue.result?.value, "privacy gateway", "agent did not fill the real page search field");

  await cdp.send("Runtime.evaluate", {
    contextId: mainContext.id,
    expression: "document.querySelector('#add').click()",
    returnByValue: true
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const afterMutation = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'REFRESH_CONTEXT'})",
    awaitPromise: true,
    returnByValue: true
  });
  const mutationResponse = afterMutation.result?.value;
  assert(mutationResponse?.context?.metrics?.changedNodesLastBatch >= 1, "mutation batch did not report changed nodes");
  assert(mutationResponse?.context?.metrics?.reprocessedLastBatch >= 1, "mutation batch did not reprocess the changed subtree");

  const riskyTask = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'START_TASK', task:'click Submit order'})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(riskyTask.result?.value?.ok, "high-risk task did not start");
  await new Promise((resolve) => setTimeout(resolve, 450));
  const blockRisk = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'CONFIRM_PENDING', allow:false})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(blockRisk.result?.value?.ok && blockRisk.result?.value?.blocked, "high-risk action did not reach the local confirmation gate");

  const blockedClickCount = await cdp.send("Runtime.evaluate", {
    contextId: mainContext.id,
    expression: "window.submitClicks",
    returnByValue: true
  });
  assert.strictEqual(blockedClickCount.result?.value, 0, "blocked high-risk action still clicked the page");

  const retryRiskyTask = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'START_TASK', task:'click Submit order'})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(retryRiskyTask.result?.value?.ok, "second high-risk task did not start");
  await new Promise((resolve) => setTimeout(resolve, 450));
  const allowRisk = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'CONFIRM_PENDING', allow:true})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(allowRisk.result?.value?.ok, "confirmed high-risk action was not accepted");
  await new Promise((resolve) => setTimeout(resolve, 150));
  const allowedClickCount = await cdp.send("Runtime.evaluate", {
    contextId: mainContext.id,
    expression: "window.submitClicks",
    returnByValue: true
  });
  assert.strictEqual(allowedClickCount.result?.value, 1, "confirmed high-risk action did not click exactly once");

  const semanticRisk = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'START_TASK', task:'click Continue'})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(semanticRisk.result?.value?.ok, "semantic submit-risk task did not start");
  await new Promise((resolve) => setTimeout(resolve, 450));
  const blockSemanticRisk = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'CONFIRM_PENDING', allow:false})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(blockSemanticRisk.result?.value?.ok && blockSemanticRisk.result?.value?.blocked, "submit control labelled Continue bypassed confirmation");

  const audit = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'GET_AUDIT'})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(audit.result?.value?.receipts?.some((item) => item.action === "click" && item.risk === "high"), "high-risk privacy receipt was not available to the panel");

  async function waitForReceipt(taskFragment, predicate, timeoutMs = 2500) {
    const deadline = Date.now() + timeoutMs;
    let last = [];
    while (Date.now() < deadline) {
      const result = await cdp.send("Runtime.evaluate", {
        contextId: extensionContext.id,
        expression: "chrome.runtime.sendMessage({type:'GET_AUDIT'})",
        awaitPromise: true,
        returnByValue: true
      });
      last = result.result?.value?.receipts || [];
      const hit = last.find((item) => String(item.task || "").includes(taskFragment) && predicate(item));
      if (hit) return hit;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    throw new Error(`Timed out waiting for receipt for ${taskFragment}: ${JSON.stringify(last.slice(0, 8))}`);
  }

  const mockEndpoint = `${new URL(FIXTURE_URL).origin}/mock/v1/chat/completions`;
  const remoteSettings = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: `chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{provider:{endpoint:${JSON.stringify(mockEndpoint)},apiKey:'test-only',model:'mock'},policy:{cloudEnabled:true}}})`,
    awaitPromise: true, returnByValue: true
  });
  assert(remoteSettings.result?.value?.ok, "mock remote provider settings failed");
  const mockTaskStartedAt = performance.now();
  const leakProofTask = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'START_TASK',task:'Send OTP 482913 to Rahul Sharma'})",
    awaitPromise: true, returnByValue: true
  });
  assert(leakProofTask.result?.value?.ok, "leak-proof remote task did not start");
  const remoteReceipt = await waitForReceipt("Send OTP", (item) => item.action === "done" || item.action === "error");
  const mockTaskLatencyMs = performance.now() - mockTaskStartedAt;
  assert.strictEqual(remoteReceipt.action, "done", `mock provider task failed: ${JSON.stringify(remoteReceipt)}`);

  for (const [task, fragment] of [
    ["Use account number 123456789012", "Use account number"],
    ["DOB: 14/08/2004", "DOB:"],
    ["Address: 22 Lake Road Kolkata", "Address:"],
    ["Medical condition: diabetes mellitus", "Medical condition:"],
    ["नाम: राहुल शर्मा", "नाम:"]
  ]) {
    const started = await cdp.send("Runtime.evaluate", {
      contextId: extensionContext.id,
      expression: `chrome.runtime.sendMessage({type:'START_TASK',task:${JSON.stringify(task)}})`,
      awaitPromise: true,
      returnByValue: true
    });
    assert(started.result?.value?.ok, `sensitive task did not start: ${task}`);
    const receipt = await waitForReceipt(fragment, (item) => item.action === "done" || item.action === "error");
    assert.strictEqual(receipt.action, "done", `sensitive task egress failed: ${JSON.stringify(receipt)}`);
  }

  await cdp.send("Runtime.evaluate", { contextId: extensionContext.id, expression: "chrome.runtime.sendMessage({type:'START_TASK',task:'read only audit'})", awaitPromise: true, returnByValue: true });
  await waitForReceipt("read only audit", (item) => item.reason === "Action is outside the user task scope");

  await cdp.send("Runtime.evaluate", { contextId: extensionContext.id, expression: "chrome.runtime.sendMessage({type:'START_TASK',task:'find laptop safely'})", awaitPromise: true, returnByValue: true });
  await waitForReceipt("find laptop safely", (item) => item.action === "done");
  const readOnlySearchValue = await cdp.send("Runtime.evaluate", { contextId: mainContext.id, expression: "document.querySelector('#search').value", returnByValue: true });
  assert.strictEqual(readOnlySearchValue.result?.value, "laptop", "read-only task could not use a safe search field");

  await cdp.send("Runtime.evaluate", { contextId: extensionContext.id, expression: "chrome.runtime.sendMessage({type:'START_TASK',task:'fill my email cross frame probe'})", awaitPromise: true, returnByValue: true });
  await waitForReceipt("fill my email cross frame probe", (item) => item.action === "fill" && item.localDecision === "blocked");

  const egressRefresh = await cdp.send("Runtime.evaluate", { contextId: extensionContext.id, expression: "chrome.runtime.sendMessage({type:'REFRESH_CONTEXT'})", awaitPromise: true, returnByValue: true });
  assert.strictEqual(egressRefresh.result?.value?.context?.metrics?.egressStatus, "verified_zero", "successful provider requests were not marked as locally verified zero-PII egress");
  assert.strictEqual(egressRefresh.result?.value?.context?.metrics?.rawPiiSent, 0, "verified egress did not report zero raw PII");

  const blockDomain = await cdp.send("Runtime.evaluate", {
    contextId: extensionContext.id,
    expression: "chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{policy:{blockedDomains:'127.0.0.1'}}})",
    awaitPromise: true,
    returnByValue: true
  });
  assert(blockDomain.result?.value?.ok, "could not set local blocked-domain policy");
  const blockedDomainRefresh = await cdp.send("Runtime.evaluate", { contextId: extensionContext.id, expression: "chrome.runtime.sendMessage({type:'REFRESH_CONTEXT'})", awaitPromise: true, returnByValue: true });
  assert.strictEqual(blockedDomainRefresh.result?.value?.ok, false, "blocked domain still exposed browser context");
  assert(/blocked by local policy/i.test(blockedDomainRefresh.result?.value?.error || ""), "blocked-domain failure did not explain the local policy decision");
  await cdp.send("Runtime.evaluate", { contextId: extensionContext.id, expression: "chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{policy:{blockedDomains:''}}})", awaitPromise: true, returnByValue: true });

  const remoteAudit = await cdp.send("Runtime.evaluate", { contextId: extensionContext.id, expression: "chrome.runtime.sendMessage({type:'GET_AUDIT'})", awaitPromise: true, returnByValue: true });

  cdp.ws.close();
  console.log(JSON.stringify({
    ok: true,
    extensionContext: extensionContext.name || extensionContext.origin,
    graphNodes: response.context.metrics.graphNodes,
    sensitiveNodes: response.context.metrics.sensitiveNodes,
    safeElements: response.context.elements.length,
    rawBytes: response.context.metrics.rawContextBytes,
    safeBytes: response.context.metrics.safeContextBytes,
    visualLines: visualResponse.visual.lineCount,
    visualOcrMs: Math.round(visualResponse.visual.ocrMs),
    visualRedactions: visualResponse.visual.redactionCount,
    visualExpectedTargets: visualExpectedPatterns.length,
    visualRecoveredTargets,
    visualDetectedSensitiveLines: visualSensitiveLines,
    visualMaskCoveragePct: Number((100 * visualResponse.visual.redactionCount / visualSensitiveLines).toFixed(1)),
    mockTaskLatencyMs: Number(mockTaskLatencyMs.toFixed(1)),
    searchFilled: searchValue.result?.value,
    privateCapabilityFilled: profileValue.result?.value,
    userEditVersionAdvanced: editedEmail.version,
    changedNodes: mutationResponse.context.metrics.changedNodesLastBatch,
    reprocessedNodes: mutationResponse.context.metrics.reprocessedLastBatch,
    highRiskGate: "block and allow-once paths verified",
    auditReceipts: remoteAudit.result.value.receipts.length,
    remoteEgress: "mock provider accepted task only after OTP/name tokenization",
    adversarialScope: "unrelated cloud action blocked",
    crossOriginCapability: "blocked",
    blockedFieldPolicy: "password omitted from safe context",
    visualActionPolicy: "all visual clicks require local confirmation",
    readOnlySearch: readOnlySearchValue.result?.value,
    domainPolicy: "blocked origin enforcement verified",
    egressStatus: egressRefresh.result.value.context.metrics.egressStatus
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
