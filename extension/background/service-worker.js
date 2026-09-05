"use strict";

if (typeof importScripts === "function") {
  importScripts("../lib/pii.js");
  importScripts("../lib/action-policy.js");
  importScripts("../lib/domain-policy.js");
  importScripts("chrome-adapter.js");
}
const PII = globalThis.PrivacyPII;
const ActionPolicy = globalThis.PrivacyActionPolicy;
const DomainPolicy = globalThis.PrivacyDomainPolicy;
const BrowserAdapter = globalThis.StrawHatsBrowserAdapter;

const sessions = new Map();
const visualCache = new Map();
const auditByTab = new Map();
const egressByTab = new Map();
const DEFAULT_SETTINGS = {
  aliasSeed: "",
  provider: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: "",
    model: ""
  },
  userProfile: {
    name: "",
    email: "",
    phone: "",
    address: "",
    upi: ""
  },
  policy: {
    allowedDomains: "",
    blockedDomains: "",
    alwaysConfirmSensitiveFill: false,
    cloudEnabled: true,
    visualEnabled: true
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  await configureBrowserPanel();
  const stored = await chrome.storage.local.get(["gatewaySettings"]);
  if (!stored.gatewaySettings) {
    await chrome.storage.local.set({ gatewaySettings: publicSettings({ ...DEFAULT_SETTINGS, aliasSeed: crypto.randomUUID() }) });
  }
});

chrome.runtime.onStartup.addListener(() => {
  configureBrowserPanel();
});

async function configureBrowserPanel() {
  await BrowserAdapter.configurePanel();
}

BrowserAdapter.bindToolbarAction();

function broadcast(message) {
  chrome.runtime.sendMessage({ source: "gateway-worker", ...message }).catch(() => {});
}

async function getSettings() {
  const [stored, secretStore] = await Promise.all([
    chrome.storage.local.get(["gatewaySettings"]),
    chrome.storage.session.get(["gatewaySecrets"])
  ]);
  const persisted = mergeSettings(stored.gatewaySettings || DEFAULT_SETTINGS);
  const legacySecrets = { apiKey: persisted.provider.apiKey || "", userProfile: persisted.userProfile || {} };
  const secrets = secretStore.gatewaySecrets || legacySecrets;
  const settings = mergeSettings({
    ...persisted,
    provider: { ...persisted.provider, apiKey: secrets.apiKey || "" },
    userProfile: { ...DEFAULT_SETTINGS.userProfile, ...(secrets.userProfile || {}) }
  });
  if (!settings.aliasSeed) {
    settings.aliasSeed = crypto.randomUUID();
  }
  if (!secretStore.gatewaySecrets && (legacySecrets.apiKey || Object.values(legacySecrets.userProfile).some(Boolean))) {
    await chrome.storage.session.set({ gatewaySecrets: legacySecrets });
  }
  await chrome.storage.local.set({ gatewaySettings: publicSettings(settings) });
  return settings;
}

function mergeSettings(next) {
  return {
    aliasSeed: next?.aliasSeed || "",
    provider: { ...DEFAULT_SETTINGS.provider, ...(next?.provider || {}) },
    userProfile: { ...DEFAULT_SETTINGS.userProfile, ...(next?.userProfile || {}) },
    policy: { ...DEFAULT_SETTINGS.policy, ...(next?.policy || {}) }
  };
}

function publicSettings(settings) {
  const merged = mergeSettings(settings);
  return {
    aliasSeed: merged.aliasSeed,
    provider: { endpoint: merged.provider.endpoint, model: merged.provider.model, apiKey: "" },
    userProfile: { ...DEFAULT_SETTINGS.userProfile },
    policy: { ...merged.policy }
  };
}

async function saveSettings(settings) {
  const merged = mergeSettings(settings);
  await Promise.all([
    chrome.storage.local.set({ gatewaySettings: publicSettings(merged) }),
    chrome.storage.session.set({ gatewaySecrets: { apiKey: merged.provider.apiKey, userProfile: { ...merged.userProfile } } })
  ]);
  return merged;
}

async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) throw new Error("No active browser tab");
  if (!/^https?:/i.test(tab.url || "")) throw new Error("Open a normal http/https webpage first");
  return tab.id;
}

async function assertDomainAllowed(tabId, settings) {
  const tab = await chrome.tabs.get(tabId);
  const decision = DomainPolicy.evaluate(tab.url, settings.policy);
  if (!decision.ok) throw new Error(decision.reason);
  return tab;
}

async function framesForTab(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    return frames?.length ? frames : [{ frameId: 0 }];
  } catch (_) {
    return [{ frameId: 0 }];
  }
}

async function sendFrame(tabId, frameId, message) {
  return chrome.tabs.sendMessage(tabId, message, { frameId });
}

async function sendAllFrames(tabId, message) {
  const frames = await framesForTab(tabId);
  const results = await Promise.allSettled(frames.map((frame) => sendFrame(tabId, frame.frameId, message)));
  return results.map((result, index) => ({ frameId: frames[index].frameId, result })).filter((item) => item.result.status === "fulfilled");
}

async function syncSettings(tabId) {
  const settings = await getSettings();
  await sendAllFrames(tabId, { type: "SYNC_SETTINGS", settings });
}

async function prepareTaskPrivacy(tabId, task, settings, taskScope) {
  const tab = await chrome.tabs.get(tabId);
  const origin = new URL(tab.url).origin;
  const taskVault = new PII.AliasVault(`${settings.aliasSeed}|${origin}|${taskScope}`);
  taskVault.registerUserProfile(settings.userProfile || {});
  let redacted = PII.redactText(task, taskVault);
  const extraPatterns = [
    ["OTP", /\b(?:otp|one[- ]time password)\s*(?:is|:)?\s*([0-9]{4,8})\b/gi],
    ["ACCOUNT", /\b(?:account|a\/c)\s*(?:number|no\.?|#)?\s*(?:is|:)?\s*([0-9]{8,18})\b/gi],
    ["DOB", /\b(?:dob|date of birth)\s*(?:is|:)?\s*([0-3]?\d[\/. -][01]?\d[\/. -](?:19|20)\d{2})\b/gi],
    ["PERSON", /\b(?:to|for|name(?:d)?|recipient)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3})\b/g],
    ["ADDRESS", /\b(?:address|deliver to|ship to)\s*(?:is|:)?\s*([^.;\n]{8,100})/gi],
    ["HEALTH", /\b(?:diagnosis|medical condition|health condition|disease|allergy|medication)\s*(?:is|:)?\s*([^.;\n]{3,100})/gi],
    ["PERSON", /(?:नाम|प्राप्तकर्ता)\s*(?:है|:)?\s*([\p{L}\p{M}]{2,}(?:\s+[\p{L}\p{M}]{2,}){1,3})/gu],
    ["ADDRESS", /(?:पता|डिलीवरी पता)\s*(?:है|:)?\s*([^.;\n]{5,100})/gu],
    ["HEALTH", /(?:बीमारी|रोग|स्वास्थ्य स्थिति)\s*(?:है|:)?\s*([^.;\n]{3,100})/gu]
  ];
  let safe = redacted.safe;
  const extras = [];
  for (const [type, regex] of extraPatterns) {
    safe = safe.replace(regex, (full, value) => {
      const token = taskVault.register(type, value, { source: "task", scope: "task", allowedActions: ["fill"], maxUses: 3, expiresAt: Date.now() + 30 * 60 * 1000 });
      extras.push({ type, value, token });
      return full.replace(value, token);
    });
  }
  redacted = { ...redacted, safe, entities: [...(redacted.entities || []), ...extras] };
  const entities = (redacted.entities || []).map((entity) => ({
    type: entity.type,
    value: entity.value,
    token: entity.token
  }));
  if (entities.length) await sendAllFrames(tabId, { type: "REGISTER_TASK_VALUES", entities });
  return { safeTask: redacted.safe, entities };
}

async function assertSessionBoundary(session, settings) {
  const tab = await assertDomainAllowed(session.tabId, settings);
  const origin = new URL(tab.url).origin;
  if (!session.origin) {
    session.origin = origin;
    return true;
  }
  if (session.origin === origin) return true;

  visualCache.delete(session.tabId);
  session.pending = null;
  session.origin = origin;
  session.taskScope = crypto.randomUUID();
  await sendAllFrames(session.tabId, { type: "SYNC_SETTINGS", settings });
  await sendAllFrames(session.tabId, { type: "SET_TASK", task: session.task, taskScope: session.taskScope });
  const taskPrivacy = await prepareTaskPrivacy(session.tabId, session.task, settings, session.taskScope);
  session.safeTask = taskPrivacy.safeTask;
  session.taskPrivateEntities = taskPrivacy.entities;
  session.history.push({
    action: { type: "boundary_reset" },
    result: { status: "blocked", risk: "high", reason: "Page origin changed; stale context and private capabilities were discarded" }
  });
  broadcast({ type: "ACTION_RESULT", tabId: session.tabId, action: { type: "boundary_reset" }, result: session.history.at(-1).result });
  return false;
}

async function runVisualOperation(type, payload) {
  return BrowserAdapter.runVisualOperation(type, payload);
}

function parseOCRLines(tsv, imageWidth, imageHeight, safeContext, settings, taskScope) {
  const viewport = safeContext.page?.viewport || { width: imageWidth, height: imageHeight };
  const scaleX = Number(viewport.width || imageWidth) / Math.max(1, Number(imageWidth || 1));
  const scaleY = Number(viewport.height || imageHeight) / Math.max(1, Number(imageHeight || 1));
  const vault = new PII.AliasVault(`${settings.aliasSeed}|${safeContext.page.origin}|${taskScope || crypto.randomUUID()}`);
  vault.registerUserProfile(settings.userProfile || {});
  const lines = new Map();
  const rows = String(tsv || "").split(/\r?\n/);

  for (let i = 1; i < rows.length; i += 1) {
    if (!rows[i].trim()) continue;
    const cols = rows[i].split("\t");
    if (cols.length < 12 || Number(cols[0]) !== 5) continue;
    const confidence = Number(cols[10]);
    const text = cols.slice(11).join("\t").trim();
    if (!text || confidence < 20) continue;
    const key = `${cols[2]}:${cols[3]}:${cols[4]}`;
    const left = Number(cols[6]);
    const top = Number(cols[7]);
    const width = Number(cols[8]);
    const height = Number(cols[9]);
    const right = left + width;
    const bottom = top + height;
    const line = lines.get(key) || { words: [], left, top, right, bottom, confidenceTotal: 0, confidenceCount: 0 };
    line.words.push(text);
    line.left = Math.min(line.left, left);
    line.top = Math.min(line.top, top);
    line.right = Math.max(line.right, right);
    line.bottom = Math.max(line.bottom, bottom);
    line.confidenceTotal += confidence;
    line.confidenceCount += 1;
    lines.set(key, line);
  }

  const elements = [];
  const localPreview = [];
  const redactionBoxes = [];
  for (const [key, line] of lines.entries()) {
    const rawText = line.words.join(" ").replace(/\s+/g, " ").trim();
    if (rawText.length < 2) continue;
    const redacted = PII.redactText(rawText, vault);
    const imageBox = {
      x: Math.round(line.left),
      y: Math.round(line.top),
      width: Math.max(1, Math.round(line.right - line.left)),
      height: Math.max(1, Math.round(line.bottom - line.top))
    };
    const bbox = {
      x: Math.round(line.left * scaleX),
      y: Math.round(line.top * scaleY),
      width: Math.max(1, Math.round((line.right - line.left) * scaleX)),
      height: Math.max(1, Math.round((line.bottom - line.top) * scaleY))
    };
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    const insideOpaqueRegion = (safeContext.opaqueRegions || []).some((region) => {
      const box = region.bbox || {};
      return centerX >= box.x && centerX <= box.x + box.width && centerY >= box.y && centerY <= box.y + box.height;
    });
    const id = `v_${PII.hashText(`${safeContext.page.epoch}|${key}|${redacted.safe}|${bbox.x}|${bbox.y}`)}`;
    elements.push({
      id,
      frameId: 0,
      source: "vision",
      role: "visual_text",
      label: redacted.safe,
      value: "",
      semanticType: "visual",
      actionable: insideOpaqueRegion && redacted.sensitivity === "none",
      sensitivity: redacted.sensitivity,
      policy: redacted.sensitivity === "none" ? "KEEP" : "TOKENIZE",
      relevance: 0.5,
      version: 1,
      disabled: false,
      confidence: Number((line.confidenceTotal / Math.max(1, line.confidenceCount)).toFixed(1)),
      bbox
    });
    for (const entity of redacted.entities || []) {
      localPreview.push({
        id,
        local: entity.value,
        hasRawValue: true,
        safe: entity.token,
        policy: "TOKENIZE",
        type: entity.type.toLowerCase(),
        sensitivity: ["CARD", "AADHAAR", "SECRET", "JWT"].includes(entity.type) ? "critical" : "personal",
        source: "vision"
      });
    }
    if ((redacted.entities || []).length) redactionBoxes.push(imageBox);
  }
  return {
    elements: elements.slice(0, 180),
    localPreview,
    egressInventory: localPreview.map((item) => ({ type: item.type, field: "visual", value: item.local })),
    redactionBoxes
  };
}

async function captureVisualContext(tabId, safeContext) {
  const settings = await getSettings();
  if (!settings.policy.visualEnabled) throw new Error("Local visual perception is disabled by policy");
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) throw new Error("Cannot capture the current browser window");
  broadcast({ type: "VISUAL_OCR_PROGRESS", status: "capturing visible page locally", progress: 0 });
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const screenshotHash = await hashDataUrl(dataUrl);
  const cached = visualCache.get(tabId);
  if (cached && cached.screenshotHash === screenshotHash && Number(cached.epoch) === Number(safeContext.page?.epoch || 0)) return cached;
  const result = await runVisualOperation("OCR_IMAGE", { dataUrl });
  if (!result?.ok) throw new Error(result?.error || "Local OCR failed");
  const taskScope = sessions.get(tabId)?.taskScope || crypto.randomUUID();
  const parsed = parseOCRLines(result.tsv, result.imageWidth, result.imageHeight, safeContext, settings, taskScope);
  let redactedPreview = null;
  if (parsed.redactionBoxes.length) {
    const redacted = await runVisualOperation("REDACT_IMAGE", { dataUrl, boxes: parsed.redactionBoxes });
    if (!redacted?.ok) throw new Error(redacted?.error || "Local visual redaction failed");
    redactedPreview = redacted.dataUrl;
  }
  const visual = {
    epoch: Number(safeContext.page?.epoch || 0),
    elements: parsed.elements,
    localPreview: parsed.localPreview,
    egressInventory: parsed.egressInventory,
    ocrMs: Number(result.ocrMs || 0),
    confidence: Number(result.confidence || 0),
    imageWidth: Number(result.imageWidth || 0),
    imageHeight: Number(result.imageHeight || 0),
    redactionCount: parsed.redactionBoxes.length,
    redactedPreviewDataUrl: redactedPreview,
    screenshotHash
  };
  visualCache.set(tabId, visual);
  broadcast({
    type: "VISUAL_CONTEXT",
    tabId,
    lineCount: visual.elements.length,
    ocrMs: visual.ocrMs,
    confidence: visual.confidence
  });
  return visual;
}

async function hashDataUrl(dataUrl) {
  const bytes = new TextEncoder().encode(String(dataUrl || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function visualObservationIsCurrent(tabId, visual) {
  if (!visual?.screenshotHash) return false;
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) return false;
  const current = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return (await hashDataUrl(current)) === visual.screenshotHash;
}

function augmentWithVisual(safeContext, visual) {
  if (!visual || Number(visual.epoch) !== Number(safeContext.page?.epoch)) return safeContext;
  return {
    ...safeContext,
    elements: [...safeContext.elements, ...visual.elements].slice(0, 380),
    visual: {
      scanned: true,
      lineCount: visual.elements.length,
      ocrMs: visual.ocrMs,
      confidence: visual.confidence,
      redactionCount: Number(visual.redactionCount || 0),
      epoch: visual.epoch
    },
    metrics: {
      ...safeContext.metrics,
      visualOcrMs: visual.ocrMs,
      visualLines: visual.elements.length
    }
  };
}

function shouldAutoVisualScan(safeContext) {
  if (Number(safeContext.metrics?.actionableNodes || 0) >= 3) return false;
  return (safeContext.opaqueRegions || []).some((region) => Number(region.viewportShare || 0) >= 0.25);
}

async function collectContext(tabId) {
  const frames = await framesForTab(tabId);
  const pieces = [];
  for (const frame of frames) {
    try {
      const response = await sendFrame(tabId, frame.frameId, { type: "GET_SAFE_CONTEXT" });
      if (response?.context) pieces.push({ frameId: frame.frameId, ...response });
    } catch (_) {}
  }
  if (!pieces.length) throw new Error("Privacy Gateway is not available on this page. Reload the tab after loading the extension.");

  const elements = [];
  const localPreview = [];
  const egressInventory = [];
  const opaqueRegions = [];
  const vaultCapabilities = new Map();
  const metrics = {
    graphNodes: 0,
    actionableNodes: 0,
    sensitiveNodes: 0,
    changedNodesLastBatch: 0,
    reprocessedLastBatch: 0,
    rawContextBytes: 0,
    safeContextBytes: 0,
    graphApproxBytes: 0,
    contextBuildMs: 0,
    initialScanMs: 0,
    lastMutationMs: 0,
    framesObserved: pieces.length,
    rawPiiSent: null,
    graphComplete: true,
    pendingScanNodes: 0,
    egressStatus: "not_sent",
    verifiedRequests: 0,
    blockedEgressCount: 0
  };
  let page = null;

  for (const piece of pieces) {
    if (piece.frameId === 0) {
      page = piece.context.page;
      for (const region of piece.context.opaqueRegions || []) opaqueRegions.push({ ...region, frameId: 0 });
    }
    for (const element of piece.context.elements || []) {
      elements.push({ ...element, frameId: piece.frameId });
    }
    for (const capability of piece.context.vaultCapabilities || []) vaultCapabilities.set(capability.token, capability);
    for (const preview of piece.localPreview || []) localPreview.push({ ...preview, frameId: piece.frameId });
    for (const item of piece.egressInventory || []) egressInventory.push({ ...item, frameId: piece.frameId });
    const m = piece.context.metrics || {};
    metrics.graphNodes += Number(m.graphNodes || 0);
    metrics.actionableNodes += Number(m.actionableNodes || 0);
    metrics.sensitiveNodes += Number(m.sensitiveNodes || 0);
    metrics.changedNodesLastBatch += Number(m.changedNodesLastBatch || 0);
    metrics.reprocessedLastBatch += Number(m.reprocessedLastBatch || 0);
    metrics.rawContextBytes += Number(m.rawContextBytes || 0);
    metrics.safeContextBytes += Number(m.safeContextBytes || 0);
    metrics.graphApproxBytes += Number(m.graphApproxBytes || 0);
    metrics.contextBuildMs += Number(m.lastContextBuildMs || 0);
    metrics.initialScanMs += Number(m.initialScanMs || 0);
    metrics.lastMutationMs += Number(m.lastMutationMs || 0);
    metrics.graphComplete = metrics.graphComplete && m.graphComplete !== false;
    metrics.pendingScanNodes += Number(m.pendingScanNodes || 0);
  }

  const egress = egressByTab.get(tabId) || { status: "not_sent", verifiedRequests: 0, blockedEgressCount: 0 };
  metrics.egressStatus = egress.status;
  metrics.verifiedRequests = Number(egress.verifiedRequests || 0);
  metrics.blockedEgressCount = Number(egress.blockedEgressCount || 0);
  metrics.rawPiiSent = egress.status === "verified_zero" ? 0 : null;

  elements.sort((a, b) => Number(b.actionable) - Number(a.actionable) || Number(b.relevance || 0) - Number(a.relevance || 0));
  const safeContext = {
    page: page || pieces[0].context.page,
    elements: elements.slice(0, 260),
    opaqueRegions,
    vaultCapabilities: Array.from(vaultCapabilities.values()),
    metrics
  };
  return { safeContext, localPreview: localPreview.slice(0, 20), egressInventory, elementFrames: new Map(elements.map((element) => [element.id, element.frameId])) };
}

async function collectAudit(tabId) {
  return (auditByTab.get(tabId) || []).slice(0, 50);
}

function recordAudit(tabId, session, safeContext, action, result, userDecision) {
  const egress = egressByTab.get(tabId) || { status: "not_sent", verifiedRequests: 0, blockedEgressCount: 0 };
  const receipt = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    origin: safeContext?.page?.origin || "",
    task: session?.safeTask || "",
    sources: safeContext?.visual?.scanned ? ["DOM/ARIA", "local OCR"] : ["DOM/ARIA"],
    sensitiveDetected: Number(safeContext?.metrics?.sensitiveNodes || 0),
    contextSent: {
      elements: Number(safeContext?.elements?.length || 0),
      bytes: Number(safeContext?.metrics?.safeContextBytes || 0),
      rawPii: egress.status === "verified_zero" ? 0 : null,
      egressStatus: egress.status
    },
    action: action?.type || "unknown",
    targetId: action?.targetId || "",
    risk: result?.risk || "low",
    localDecision: userDecision || result?.status || "unknown",
    executed: result?.status === "executed",
    usedPrivateToken: Boolean(result?.usedPrivateToken),
    reason: result?.reason || action?.reason || ""
  };
  const list = auditByTab.get(tabId) || [];
  list.unshift(receipt);
  auditByTab.set(tabId, list.slice(0, 100));
  return receipt;
}

function compactForPlanner(safeContext) {
  return {
    page: safeContext.page,
    visual: safeContext.visual || null,
    opaqueRegions: safeContext.opaqueRegions || [],
    vaultCapabilities: safeContext.vaultCapabilities,
    elements: safeContext.elements.map((element) => ({
      id: element.id,
      frameId: element.frameId,
      source: element.source || "structure",
      role: element.role,
      label: element.label,
      value: element.value,
      semanticType: element.semanticType,
      actionable: element.actionable,
      sensitivity: element.sensitivity,
      policy: element.policy,
      version: element.version,
      checked: element.checked,
      disabled: element.disabled,
      bbox: element.source === "vision" ? element.bbox : undefined
    }))
  };
}

function assertEgressSafe(safeContext, egressInventory, settings, safeTask, history) {
  const payload = compactForPlanner(safeContext);
  const outbound = { task: safeTask, context: payload, history: (history || []).slice(-6) };
  const serialized = JSON.stringify(outbound).toLocaleLowerCase();
  function locateExactValue(value, node, path) {
    if (typeof node === "string") return node.toLocaleLowerCase().includes(value.toLocaleLowerCase()) ? path : null;
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        const hit = locateExactValue(value, node[index], `${path}[${index}]`);
        if (hit) return hit;
      }
      return null;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        const hit = locateExactValue(value, child, path ? `${path}.${key}` : key);
        if (hit) return hit;
      }
    }
    return null;
  }
  const privateValues = [
    ...(egressInventory || []).map((item) => ({ source: `graph:${item.type || "private"}:${item.field || "value"}`, value: item.value })),
    ...Object.entries(settings.userProfile || {}).map(([key, value]) => ({ source: `profile:${key}`, value }))
  ].map((item) => ({ ...item, value: String(item.value || "").trim() })).filter((item) => item.value.length >= 3);
  for (const item of privateValues) {
    if (serialized.includes(item.value.toLocaleLowerCase())) {
      const path = locateExactValue(item.value, outbound, "outbound") || "serialized-payload";
      throw new Error(`Egress barrier blocked a raw private value from ${item.source} at ${path}`);
    }
  }
  const withoutCapabilities = (value) => String(value || "").replace(/<[A-Z0-9_]+:[A-F0-9]{24}>/g, "<PRIVATE_TOKEN>");
  for (const element of payload.elements || []) {
    const visibleText = withoutCapabilities(`${element.label || ""} ${element.value || ""}`);
    if (PII.findPII(visibleText).length) throw new Error("Egress barrier found unclassified PII in safe context");
  }
  if (PII.findPII(withoutCapabilities(JSON.stringify(outbound))).length) throw new Error("Egress barrier found raw PII in the outbound request");
  return payload;
}

function updateEgressState(tabId, next) {
  const current = egressByTab.get(tabId) || { status: "not_sent", verifiedRequests: 0, blockedEgressCount: 0 };
  const merged = { ...current, ...next, at: new Date().toISOString() };
  egressByTab.set(tabId, merged);
  return merged;
}

function extractJSON(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Agent returned an empty response");
  try { return JSON.parse(raw); } catch (_) {}
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return JSON.parse(fenced[1]);
  throw new Error("Agent response must contain exactly one JSON object");
}

async function remotePlan(tabId, task, safeContext, history, settings, egressInventory) {
  const endpoint = settings.provider.endpoint.trim();
  const apiKey = settings.provider.apiKey.trim();
  const model = settings.provider.model.trim();
  if (!endpoint || !model) return null;
  const endpointUrl = new URL(endpoint);
  const isLocalProvider = ["localhost", "127.0.0.1", "[::1]"].includes(endpointUrl.hostname);
  if (endpointUrl.protocol !== "https:" && !isLocalProvider) {
    throw new Error("Reasoning endpoint must use HTTPS");
  }
  if (!apiKey && !isLocalProvider) throw new Error("A provider API key is required for non-local endpoints");

  const systemPrompt = `You are a browser action planner behind a privacy gateway. You NEVER receive raw private values.\n\nReturn exactly one JSON object and nothing else. Valid actions:\n{"type":"click","targetId":"...","expectedVersion":1,"reason":"..."}\n{"type":"fill","targetId":"...","value":"literal or <PRIVATE:TOKEN>","expectedVersion":1,"reason":"..."}\n{"type":"select","targetId":"...","value":"visible option or value","expectedVersion":1,"reason":"..."}\n{"type":"press","targetId":"...","key":"Enter","expectedVersion":1,"reason":"..."}\n{"type":"focus","targetId":"...","expectedVersion":1,"reason":"..."}\n{"type":"scroll","direction":"down|up","amount":600,"reason":"..."}\n{"type":"wait","ms":350,"reason":"..."}\n{"type":"back","reason":"Return to the previous history entry"}\n{"type":"visual_scan","reason":"Structured context is insufficient"}\n{"type":"done","message":"answer or completion message"}\n\nRules:\n- Only use targetId values present in the supplied context.\n- Copy the element version into expectedVersion for structured targets.\n- Elements with source=vision came from local OCR. They support click/press only; their screenshot geometry is revalidated locally before execution.\n- If an opaque Canvas/WebGL/PDF-like region matters but visual.scanned is false and structured context is insufficient, request visual_scan.\n- Private user values are represented by vault capability tokens. Use those tokens directly; never ask for the raw value.\n- Prefer structured element labels and roles before vision.\n- Never invent a URL or execute JavaScript.\n- For read-only questions, inspect the supplied safe text and return done with the answer when sufficient.\n- If the previous action was blocked, choose a safe alternative or return done explaining why.\n- One action per turn.`;

  let plannerContext;
  try {
    plannerContext = assertEgressSafe(safeContext, egressInventory, settings, task, history);
  } catch (error) {
    const current = egressByTab.get(tabId) || {};
    updateEgressState(tabId, {
      status: "blocked_leak",
      blockedEgressCount: Number(current.blockedEgressCount || 0) + 1,
      lastError: error.message || String(error)
    });
    throw error;
  }

  const body = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ task, context: plannerContext, history: history.slice(-6) }) }
    ]
  };

  const bodyText = JSON.stringify(body);
  const knownPrivateValues = [
    ...(egressInventory || []).map((item) => item.value),
    ...Object.values(settings.userProfile || {})
  ].map((value) => String(value || "").trim()).filter((value) => value.length >= 3);
  const leakedKnown = knownPrivateValues.find((value) => bodyText.toLocaleLowerCase().includes(value.toLocaleLowerCase()));
  const inspectedBodyText = bodyText.replace(/<[A-Z0-9_]+:[A-F0-9]{24}>/g, "<PRIVATE_TOKEN>");
  if (leakedKnown || PII.findPII(inspectedBodyText).length) {
    const current = egressByTab.get(tabId) || {};
    updateEgressState(tabId, {
      status: "blocked_leak",
      blockedEgressCount: Number(current.blockedEgressCount || 0) + 1,
      lastError: "Final provider request failed the local egress inspection"
    });
    throw new Error("Final provider request failed the local egress inspection");
  }

  const currentEgress = egressByTab.get(tabId) || {};
  updateEgressState(tabId, {
    status: "verified_zero",
    verifiedRequests: Number(currentEgress.verifiedRequests || 0) + 1,
    lastError: ""
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  let response;
  let responseText;
  try {
    const headers = { "Content-Type": "application/json", "Accept": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: bodyText,
      signal: controller.signal
    });
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 1_000_000) throw new Error("Agent API response exceeded the 1 MB safety limit");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) throw new Error("Agent API returned a non-JSON response");
    responseText = await response.text();
    if (new TextEncoder().encode(responseText).byteLength > 1_000_000) throw new Error("Agent API response exceeded the 1 MB safety limit");
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Agent API timed out after 30 seconds");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) throw new Error(`Agent API ${response.status}: ${responseText.slice(0, 220)}`);
  let data;
  try { data = JSON.parse(responseText); } catch (_) { throw new Error("Agent API returned invalid JSON"); }
  const content = data?.choices?.[0]?.message?.content ?? data?.output_text ?? data?.content;
  return extractJSON(content);
}

function bestElement(elements, predicate) {
  return elements.find((element) => element.actionable && !element.disabled && predicate(element));
}

function localPlan(task, safeContext, history) {
  const lower = task.toLowerCase().trim();
  const elements = safeContext.elements;
  const last = history[history.length - 1];

  if (last?.action?.reason === "Local fallback" && last?.result?.status === "executed") {
    return { type: "done", message: "Local fallback action completed." };
  }
  if (["Matched requested control", "Submit search", "Use local email capability", "Use local phone capability", "Use local name capability", "Use local address capability", "Use local upi capability"].includes(last?.action?.reason) && last?.result?.status === "executed") {
    return { type: "done", message: "Local fallback task completed." };
  }

  if (/^scroll\s+up/.test(lower)) return { type: "scroll", direction: "up", amount: 650, reason: "Local fallback" };
  if (/^scroll|scroll\s+down/.test(lower)) return { type: "scroll", direction: "down", amount: 650, reason: "Local fallback" };
  if (/^(?:go\s+)?back$/.test(lower)) return { type: "back", reason: "User requested browser history navigation" };

  const clickMatch = task.match(/(?:click|press|open)\s+(?:on\s+)?["']?(.+?)["']?$/i);
  if (clickMatch) {
    const needle = clickMatch[1].trim().toLowerCase();
    let target = bestElement(elements, (element) => `${element.label} ${element.value}`.toLowerCase().includes(needle));
    if (!target) {
      const words = needle.match(/[a-z0-9]{3,}/g) || [];
      const rankedVisual = elements
        .filter((element) => element.source === "vision" && element.actionable && !element.disabled)
        .map((element) => {
          const haystack = `${element.label || ""} ${element.value || ""}`.toLowerCase();
          const score = words.reduce((sum, word) => sum + Number(haystack.includes(word)), 0);
          return { element, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || Number(b.element.confidence || 0) - Number(a.element.confidence || 0));
      target = rankedVisual[0]?.element || null;
    }
    if (target) return { type: "click", targetId: target.id, expectedVersion: target.version, reason: "Matched requested control" };
    if (!safeContext.visual?.scanned) return { type: "visual_scan", reason: "Requested control was not present in structured context" };
  }

  const searchMatch = task.match(/search(?:\s+for)?\s+["']?(.+?)["']?$/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    const search = bestElement(elements, (element) => element.semanticType === "search" || /search/.test(`${element.label}`.toLowerCase()));
    if (search) {
      if (String(search.value || "").toLowerCase().includes(query.toLowerCase()) || last?.action?.type === "fill") {
        const button = bestElement(elements, (element) => element.role === "button" && /search|go/.test(element.label.toLowerCase()));
        if (button) return { type: "click", targetId: button.id, expectedVersion: button.version, reason: "Submit search" };
        return { type: "press", targetId: search.id, expectedVersion: search.version, key: "Enter", reason: "Submit search" };
      }
      return { type: "fill", targetId: search.id, expectedVersion: search.version, value: query, reason: "Fill search box" };
    }
    if (!safeContext.visual?.scanned && (safeContext.opaqueRegions || []).length) {
      return { type: "visual_scan", reason: "Search control may be inside an opaque visual region" };
    }
  }

  const requestedTypes = [
    ["email", "EMAIL"], ["phone", "PHONE"], ["mobile", "PHONE"], ["name", "PERSON"],
    ["address", "ADDRESS"], ["upi", "UPI"]
  ];
  if (/fill|enter|type|use my/.test(lower)) {
    for (const [word, capabilityType] of requestedTypes) {
      if (!lower.includes(word)) continue;
      const capability = safeContext.vaultCapabilities.find((item) => item.type === capabilityType);
      const target = bestElement(elements, (element) => element.role === "textbox" && (element.semanticType === word || element.label.toLowerCase().includes(word)));
      if (capability && target) return { type: "fill", targetId: target.id, expectedVersion: target.version, value: capability.token, reason: `Use local ${word} capability` };
    }
  }

  return {
    type: "done",
    message: "The local fallback planner only handles direct click, scroll, search, and saved-profile fill commands. Configure an OpenAI-compatible model in Settings for general web tasks."
  };
}

async function planAction(session, safeContext, egressInventory) {
  const settings = await getSettings();
  const endpoint = settings.provider.endpoint.trim();
  let localEndpoint = false;
  try { localEndpoint = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(endpoint).hostname); } catch (_) {}
  const hasRemote = settings.policy.cloudEnabled && Boolean(endpoint && settings.provider.model.trim() && (settings.provider.apiKey.trim() || localEndpoint));
  if (hasRemote) return remotePlan(session.tabId, session.safeTask, safeContext, session.history, settings, egressInventory);
  return localPlan(session.task, safeContext, session.history);
}

function frameForAction(action, elementFrames) {
  if (!action?.targetId) return 0;
  return elementFrames.get(action.targetId) ?? 0;
}

function taskAllowsAction(task, action, safeContext) {
  const intent = String(task || "").toLowerCase();
  if (["done", "wait", "scroll", "visual_scan"].includes(action.type)) return true;
  const readOnly = /\b(find|read|show|tell|list|compare|which|what|where|latest|cheapest|price|status)\b/.test(intent)
    && !/\b(click|open|press|fill|enter|type|select|choose|submit|send|delete|pay|buy|book|login|sign in|go to|navigate|search)\b/.test(intent);
  if (readOnly) {
    const target = (safeContext?.elements || []).find((element) => element.id === action.targetId) || null;
    if (action.type === "fill") {
      const usesPrivateCapability = /^<[A-Z0-9_]+:[A-F0-9]{24}>$/.test(String(action.value || ""));
      return !usesPrivateCapability && target?.semanticType === "search";
    }
    if (action.type === "focus") return true;
    if (["click", "press", "select"].includes(action.type)) {
      if (target?.source === "vision") return true;
      const label = `${target?.label || ""} ${target?.role || ""} ${target?.semanticType || ""}`.toLowerCase();
      return target?.role === "link" || /\b(search|filter|sort|next|previous|page|view|details|result|product|category|show more|load more)\b/.test(label);
    }
    return false;
  }
  if (action.type === "fill") return /\b(fill|enter|type|use my|search)\b/.test(intent);
  if (["click", "press", "select", "focus", "back"].includes(action.type)) {
    return /\b(click|open|press|select|choose|submit|send|delete|pay|buy|book|login|sign in|go to|navigate|search|fill|back)\b/.test(intent);
  }
  return false;
}

async function runSession(tabId) {
  const session = sessions.get(tabId);
  if (!session || session.running) return;
  session.running = true;
  try {
    for (; session.step < 10 && !session.cancelled; session.step += 1) {
      const settings = await getSettings();
      if (!(await assertSessionBoundary(session, settings))) {
        session.step = Math.max(-1, session.step - 1);
        continue;
      }
      const collected = await collectContext(tabId);
      session.elementFrames = collected.elementFrames;
      let visual = visualCache.get(tabId) || null;
      if (visual && Number(visual.epoch) !== Number(collected.safeContext.page?.epoch)) {
        visualCache.delete(tabId);
        visual = null;
      }
      if (!visual && settings.policy.visualEnabled && shouldAutoVisualScan(collected.safeContext)) {
        visual = await captureVisualContext(tabId, collected.safeContext);
      }
      const safeContext = augmentWithVisual(collected.safeContext, visual);
      const localPreview = visual
        ? [...collected.localPreview, ...(visual.localPreview || [])].slice(0, 24)
        : collected.localPreview;
      const egressInventory = visual
        ? [...collected.egressInventory, ...(visual.egressInventory || [])]
        : collected.egressInventory;
      broadcast({ type: "CONTEXT", tabId, context: safeContext, localPreview });
      const action = await planAction(session, safeContext, egressInventory);
      const schema = ActionPolicy.validate(action);
      if (!schema.ok) throw new Error(`Planner returned an invalid action: ${schema.reason}`);
      broadcast({ type: "ACTION_PROPOSED", tabId, action, step: session.step + 1 });

      if (!(await assertSessionBoundary(session, settings))) {
        const result = { status: "blocked", risk: "high", reason: "The page origin changed after planning; the stale action was discarded" };
        result.receipt = recordAudit(tabId, session, safeContext, action, result);
        session.history.push({ action, result });
        broadcast({ type: "ACTION_RESULT", tabId, action, result });
        session.step = Math.max(-1, session.step - 1);
        continue;
      }

      if (!taskAllowsAction(session.safeTask, action, safeContext)) {
        const result = { status: "blocked", risk: "high", reason: "Action is outside the user task scope" };
        result.receipt = recordAudit(tabId, session, safeContext, action, result);
        session.history.push({ action, result });
        broadcast({ type: "ACTION_RESULT", tabId, action, result });
        continue;
      }

      if (action.type === "visual_scan") {
        const captured = await captureVisualContext(tabId, collected.safeContext);
        session.history.push({
          action,
          result: { status: "executed", localOnly: true, visualLines: captured.elements.length, ocrMs: captured.ocrMs }
        });
        continue;
      }

      if (action.type === "done") {
        const result = { status: "done", risk: "low" };
        result.receipt = recordAudit(tabId, session, safeContext, action, result);
        session.history.push({ action, result });
        broadcast({ type: "TASK_DONE", tabId, message: action.message || "Task complete", history: session.history });
        sessions.delete(tabId);
        return;
      }

      if (action.type === "back") {
        await chrome.tabs.goBack(tabId);
        const result = { status: "executed", risk: "low", action: "back" };
        result.receipt = recordAudit(tabId, session, safeContext, action, result);
        session.history.push({ action, result });
        broadcast({ type: "ACTION_RESULT", tabId, action, result });
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      const visualTarget = safeContext.elements.find((element) => element.source === "vision" && element.id === action.targetId) || null;
      const frameId = visualTarget ? 0 : frameForAction(action, collected.elementFrames);
      const executableAction = visualTarget
        ? { ...action, visualTarget, expectedPageEpoch: Number(safeContext.page?.epoch || 0) }
        : action;
      let result;
      try {
        if (visualTarget && !(await visualObservationIsCurrent(tabId, visual))) {
          visualCache.delete(tabId);
          result = { status: "blocked", reason: "Visual observation is stale; the visible pixels changed after local OCR" };
        } else {
          result = await sendFrame(tabId, frameId, {
            type: visualTarget ? "PROPOSE_VISUAL_ACTION" : "PROPOSE_ACTION",
            action: executableAction
          });
        }
      } catch (error) {
        result = { status: "blocked", reason: error.message || "Target frame unavailable" };
      }
      session.history.push({ action, result });
      result.receipt = recordAudit(tabId, session, safeContext, action, result);
      broadcast({ type: "ACTION_RESULT", tabId, action, result });

      if (result?.status === "needs_confirmation") {
        session.pending = { action: executableAction, frameId, visual: Boolean(visualTarget), safeContext };
        broadcast({ type: "CONFIRMATION_REQUIRED", tabId, action, result });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, action.type === "wait" ? Number(action.ms || 350) : 250));
    }
    if (sessions.has(tabId)) {
      broadcast({ type: "TASK_DONE", tabId, message: "Stopped after 10 agent steps to prevent an unbounded loop.", history: session.history });
      sessions.delete(tabId);
    }
  } catch (error) {
    const active = sessions.get(tabId);
    if (active) {
      const receipt = recordAudit(tabId, active, null, { type: "error", reason: "Task failed" }, {
        status: "blocked",
        risk: "high",
        reason: error.message || String(error)
      });
      broadcast({ type: "ACTION_RESULT", tabId, action: { type: "error" }, result: { status: "blocked", reason: receipt.reason, receipt } });
    }
    broadcast({ type: "TASK_ERROR", tabId, error: error.message || String(error) });
    sessions.delete(tabId);
  } finally {
    const current = sessions.get(tabId);
    if (current) current.running = false;
  }
}

async function startTask(task) {
  if (!task) throw new Error("Enter a task before starting the agent");
  const tabId = await activeTabId();
  const settings = await getSettings();
  const tab = await assertDomainAllowed(tabId, settings);
  const taskScope = crypto.randomUUID();
  await sendAllFrames(tabId, { type: "SYNC_SETTINGS", settings });
  await sendAllFrames(tabId, { type: "SET_TASK", task, taskScope });
  const taskPrivacy = await prepareTaskPrivacy(tabId, task, settings, taskScope);
  sessions.set(tabId, {
    tabId,
    task,
    origin: new URL(tab.url).origin,
    taskScope,
    safeTask: taskPrivacy.safeTask,
    taskPrivateEntities: taskPrivacy.entities,
    history: [],
    step: 0,
    pending: null,
    running: false,
    cancelled: false,
    elementFrames: new Map()
  });
  broadcast({ type: "TASK_STARTED", tabId, task });
  runSession(tabId);
  return { ok: true, tabId };
}

async function confirmPending(allow) {
  const tabId = await activeTabId();
  const session = sessions.get(tabId);
  if (!session?.pending) throw new Error("No pending high-risk action");
  const { action, frameId, visual, safeContext } = session.pending;
  session.pending = null;
  let result;
  if (allow) {
    const boundaryCurrent = await assertSessionBoundary(session, await getSettings());
    if (!boundaryCurrent) {
      result = { status: "blocked", reason: "Confirmation expired because the page origin changed" };
    } else if (visual && !(await visualObservationIsCurrent(tabId, visualCache.get(tabId)))) {
      visualCache.delete(tabId);
      result = { status: "blocked", reason: "Visual confirmation expired because the visible pixels changed" };
    } else {
      result = await sendFrame(tabId, frameId, {
        type: visual ? "EXECUTE_VISUAL_CONFIRMED" : "EXECUTE_CONFIRMED",
        action
      });
    }
  } else {
    result = { status: "blocked", reason: "User blocked the action locally" };
  }
  session.history.push({ action, result, userDecision: allow ? "allow_once" : "block" });
  result.receipt = recordAudit(tabId, session, safeContext, action, result, allow ? "allow_once" : "block");
  broadcast({ type: "ACTION_RESULT", tabId, action, result });
  session.running = false;
  if (!allow) {
    broadcast({ type: "TASK_DONE", tabId, message: "Action blocked by the user.", history: session.history });
    sessions.delete(tabId);
    return { ok: true, blocked: true };
  }
  session.step += 1;
  runSession(tabId);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.source === "gateway-worker" || message.target === "offscreen") return undefined;
  if (message.source === "gateway-offscreen") {
    if (message.type === "VISUAL_OCR_PROGRESS") {
      broadcast({ type: "VISUAL_OCR_PROGRESS", status: message.status, progress: message.progress });
    }
    return undefined;
  }
  const handle = async () => {
    if (message.type === "GET_SETTINGS") return { settings: await getSettings() };
    if (message.type === "SAVE_SETTINGS") {
      const current = await getSettings();
      const settings = mergeSettings({
        ...current,
        ...message.settings,
        provider: { ...current.provider, ...(message.settings?.provider || {}) },
        userProfile: { ...current.userProfile, ...(message.settings?.userProfile || {}) },
        policy: { ...current.policy, ...(message.settings?.policy || {}) }
      });
      await saveSettings(settings);
      try {
        const tabId = await activeTabId();
        await sendAllFrames(tabId, { type: "SYNC_SETTINGS", settings });
      } catch (_) {}
      return { ok: true, settings };
    }
    if (message.type === "START_TASK") return startTask(String(message.task || "").trim());
    if (message.type === "CONFIRM_PENDING") return confirmPending(Boolean(message.allow));
    if (message.type === "REFRESH_CONTEXT") {
      const tabId = await activeTabId();
      await assertDomainAllowed(tabId, await getSettings());
      await syncSettings(tabId);
      const collected = await collectContext(tabId);
      const cached = visualCache.get(tabId);
      const visual = cached && Number(cached.epoch) === Number(collected.safeContext.page?.epoch) ? cached : null;
      const context = augmentWithVisual(collected.safeContext, visual);
      const localPreview = visual
        ? [...collected.localPreview, ...(visual.localPreview || [])].slice(0, 24)
        : collected.localPreview;
      broadcast({ type: "CONTEXT", tabId, context, localPreview });
      return { ok: true, context, localPreview, receipts: await collectAudit(tabId) };
    }
    if (message.type === "GET_AUDIT") {
      const tabId = await activeTabId();
      return { ok: true, receipts: await collectAudit(tabId) };
    }
    if (message.type === "VISUAL_SCAN") {
      const tabId = await activeTabId();
      await assertDomainAllowed(tabId, await getSettings());
      await syncSettings(tabId);
      const collected = await collectContext(tabId);
      const visual = await captureVisualContext(tabId, collected.safeContext);
      const context = augmentWithVisual(collected.safeContext, visual);
      const localPreview = [...collected.localPreview, ...(visual.localPreview || [])].slice(0, 24);
      broadcast({ type: "CONTEXT", tabId, context, localPreview });
      return {
        ok: true,
        context,
        localPreview,
        visual: {
          lineCount: visual.elements.length,
          ocrMs: visual.ocrMs,
          confidence: visual.confidence,
          redactionCount: visual.redactionCount,
          redactedPreviewDataUrl: visual.redactedPreviewDataUrl
        }
      };
    }
    if (message.type === "STOP_TASK") {
      const tabId = await activeTabId();
      const session = sessions.get(tabId);
      if (session) session.cancelled = true;
      sessions.delete(tabId);
      broadcast({ type: "TASK_DONE", tabId, message: "Task stopped." });
      return { ok: true };
    }
    if (message.type === "CLEAR_PRIVATE_SESSION") {
      await chrome.storage.session.remove(["gatewaySecrets"]);
      try { await syncSettings(await activeTabId()); } catch (_) {}
      return { ok: true };
    }
    if (message.type === "CLEAR_AUDIT") {
      const tabId = await activeTabId();
      auditByTab.delete(tabId);
      return { ok: true };
    }
    return null;
  };
  handle().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  sessions.delete(tabId);
  visualCache.delete(tabId);
  auditByTab.delete(tabId);
  egressByTab.delete(tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  visualCache.delete(details.tabId);
  const session = sessions.get(details.tabId);
  if (session?.pending) {
    session.pending = null;
    broadcast({
      type: "ACTION_RESULT",
      tabId: details.tabId,
      action: { type: "navigation_reset" },
      result: { status: "blocked", risk: "high", reason: "Pending confirmation was discarded after navigation" }
    });
  }
});
