"use strict";

const $ = (id) => document.getElementById(id);
const state = { settings: null, running: false, lastContext: null, receipts: [], tabId: null };

function formatBytes(value) {
  const n = Number(value || 0);
  if (n < 1024) return `${Math.round(n)} B`;
  return `${(n / 1024).toFixed(n > 10240 ? 0 : 1)} KB`;
}

function setRunning(running) {
  state.running = running;
  $("runButton").disabled = running;
  $("flightButton").disabled = running;
  $("voiceButton").disabled = running || !SpeechRecognitionAPI;
  if (running && recognition) recognition.abort();
  $("stopButton").classList.toggle("hidden", !running);
  $("stepBadge").textContent = running ? "running" : "idle";
}

function setProviderLine() {
  const provider = state.settings?.provider || {};
  let localEndpoint = false;
  try { localEndpoint = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(provider.endpoint).hostname); } catch (_) {}
  const cloudActive = Boolean(state.settings?.policy?.cloudEnabled !== false && provider.model && (provider.apiKey || localEndpoint));
  $("providerLine").textContent = cloudActive
    ? `${localEndpoint ? "Local planner" : "Cloud reasoning"}: ${provider.model}`
    : "Local fallback planner. Add a model in Settings for general tasks.";
  $("statusPill").querySelector("b").textContent = cloudActive && !localEndpoint ? "SAFE CLOUD" : "LOCAL";
}

function renderRedactedPreview(visual) {
  const section = $("visualPreviewSection");
  if (!visual?.redactedPreviewDataUrl) {
    section.classList.add("hidden");
    $("redactedPreview").removeAttribute("src");
    return;
  }
  $("redactedPreview").src = visual.redactedPreviewDataUrl;
  $("visualRedactionCount").textContent = `${Number(visual.redactionCount || 0)} masked`;
  section.classList.remove("hidden");
}

function renderContext(context, localPreview) {
  state.lastContext = context;
  const m = context?.metrics || {};
  $("metricNodes").textContent = Number(m.graphNodes || 0).toLocaleString();
  $("metricSensitive").textContent = Number(m.sensitiveNodes || 0).toLocaleString();
  $("metricChanged").textContent = Number(m.changedNodesLastBatch || 0).toLocaleString();
  $("metricReprocessed").textContent = Number(m.reprocessedLastBatch || 0).toLocaleString();
  $("metricRaw").textContent = formatBytes(m.rawContextBytes);
  $("metricSafe").textContent = formatBytes(m.safeContextBytes);
  $("metricLatency").textContent = `${Number(m.contextBuildMs || 0).toFixed(1)} ms`;
  const egressLabel = {
    verified_zero: "VERIFIED 0",
    blocked_leak: "BLOCKED",
    not_sent: "NOT SENT"
  }[m.egressStatus] || "NOT SENT";
  $("metricRawPii").textContent = egressLabel;
  $("metricRawPii").title = m.egressStatus === "verified_zero"
    ? `${Number(m.verifiedRequests || 0)} provider request(s) passed the final local egress inspection.`
    : m.egressStatus === "blocked_leak"
      ? `${Number(m.blockedEgressCount || 0)} outbound request(s) were stopped before network send.`
      : "No provider request has left this tab.";
  $("pageLabel").textContent = `${context?.page?.origin || ""}${context?.page?.path || ""}` || "Page inspected";

  const preview = localPreview || [];
  renderStream("rawStream", preview, (item) => item.local || "[sensitive field]", (item) => `${item.type || item.sensitivity} · local only`, "No sensitive values detected in the current distilled graph.");
  renderStream("safeStream", preview, (item) => item.safe || "[blocked]", (item) => item.policy || "KEEP", "Nothing needed redaction in the current view.");
}

function renderStream(id, items, primary, secondary, emptyText) {
  const container = $(id);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = emptyText;
    container.replaceChildren(empty);
    return;
  }
  const rows = items.slice(0, 10).map((item) => {
    const row = document.createElement("div");
    row.className = "stream-item";
    const code = document.createElement("code");
    code.textContent = primary(item);
    const small = document.createElement("small");
    small.textContent = secondary(item);
    row.append(code, small);
    return row;
  });
  container.replaceChildren(...rows);
}

function renderReceipts(receipts) {
  state.receipts = receipts || [];
  $("receiptCount").textContent = String(state.receipts.length);
  if (!state.receipts.length) {
    const empty = document.createElement("div");
    empty.className = "log-row muted";
    empty.textContent = "No local actions recorded yet.";
    $("receipts").replaceChildren(empty);
    return;
  }
  const rows = state.receipts.slice(0, 20).map((item) => {
    const row = document.createElement("div");
    row.className = "log-row";
    const heading = document.createElement("b");
    heading.textContent = item.action;
    const decision = document.createElement("code");
    decision.textContent = item.localDecision;
    const detail = document.createElement("small");
    detail.textContent = `${item.origin || "local"} · ${item.risk || "low"} risk · ${new Date(item.at).toLocaleTimeString()}${item.usedPrivateToken ? " · private alias resolved locally" : ""}`;
    row.append(heading, " ", decision, detail);
    return row;
  });
  $("receipts").replaceChildren(...rows);
}

function appendLog(message, className) {
  const log = $("log");
  if (log.children.length === 1 && log.firstElementChild?.classList.contains("muted")) log.replaceChildren();
  const row = document.createElement("div");
  row.className = `log-row ${className || ""}`;
  row.textContent = String(message).replace(/<\/?(?:b|code)>/g, "");
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (response?.ok === false) throw new Error(response.error || "Request failed");
  return response;
}

async function loadSettings() {
  const response = await request({ type: "GET_SETTINGS" });
  state.settings = response.settings;
  const provider = response.settings.provider || {};
  const profile = response.settings.userProfile || {};
  const policy = response.settings.policy || {};
  $("endpointInput").value = provider.endpoint || "";
  $("modelInput").value = provider.model || "";
  $("apiKeyInput").value = provider.apiKey || "";
  $("fallbackKeysInput").value = (provider.fallbackApiKeys || []).join(', ');
  $("nameInput").value = profile.name || "";
  $("emailInput").value = profile.email || "";
  $("phoneInput").value = profile.phone || "";
  $("addressInput").value = profile.address || "";
  $("upiInput").value = profile.upi || "";
  $("allowedDomainsInput").value = policy.allowedDomains || "";
  $("blockedDomainsInput").value = policy.blockedDomains || "";
  $("alwaysConfirmSensitiveFillInput").checked = Boolean(policy.alwaysConfirmSensitiveFill);
  $("cloudEnabledInput").checked = policy.cloudEnabled !== false;
  $("visualEnabledInput").checked = policy.visualEnabled !== false;
  $("autonomousActionsInput").checked = Boolean(policy.autonomousActions);
  $("maxStepsInput").value = String(policy.maxSteps || 30);
  setProviderLine();
}

async function saveSettings() {
  const settings = {
    provider: {
      endpoint: $("endpointInput").value.trim(),
      model: $("modelInput").value.trim(),
      apiKey: $("apiKeyInput").value.trim(),
      fallbackApiKeys: $("fallbackKeysInput").value.split(',').map(key=>key.trim()).filter(Boolean)
    },
    userProfile: {
      name: $("nameInput").value.trim(),
      email: $("emailInput").value.trim(),
      phone: $("phoneInput").value.trim(),
      address: $("addressInput").value.trim(),
      upi: $("upiInput").value.trim()
    },
    policy: {
      allowedDomains: $("allowedDomainsInput").value.trim(),
      blockedDomains: $("blockedDomainsInput").value.trim(),
      alwaysConfirmSensitiveFill: $("alwaysConfirmSensitiveFillInput").checked,
      cloudEnabled: $("cloudEnabledInput").checked,
      visualEnabled: $("visualEnabledInput").checked,
      autonomousActions: $("autonomousActionsInput").checked,
      maxSteps: Number($("maxStepsInput").value)
    }
  };
  await request({ type: "SAVE_SETTINGS", settings });
  state.settings = settings;
  setProviderLine();
  appendLog("<b>Local settings saved.</b> API key and private profile stay in browser-session storage and agents only see capability aliases.", "ok");
}

async function refreshContext() {
  try {
    const response = await request({ type: "REFRESH_CONTEXT" });
    if (response.context) renderContext(response.context, response.localPreview);
    renderReceipts(response.receipts);
  } catch (error) {
    appendLog(`<b>Inspect failed.</b> ${error.message}`, "blocked");
  }
}

async function visualScan() {
  const button = $("visualButton");
  button.disabled = true;
  button.textContent = "Scanning locally...";
  try {
    const response = await request({ type: "VISUAL_SCAN" });
    if (response.context) renderContext(response.context, response.localPreview);
    renderRedactedPreview(response.visual);
    appendLog(`<b>Local vision</b> OCR found ${Number(response.visual?.lineCount || 0)} text regions and masked ${Number(response.visual?.redactionCount || 0)} sensitive region(s) in ${Number(response.visual?.ocrMs || 0).toFixed(0)} ms.`, "ok");
  } catch (error) {
    appendLog(`<b>Visual scan failed.</b> ${error.message}`, "blocked");
  } finally {
    button.disabled = false;
    button.textContent = "Local visual scan";
  }
}

async function startTask() {
  const task = $("taskInput").value.trim();
  if (!task) return;
  $("confirmationBox").classList.add("hidden");
  setRunning(true);
  appendLog(`<b>Task</b> ${task}`);
  try {
    const response = await request({ type: "START_TASK", task });
    state.tabId = response.tabId;
  } catch (error) {
    setRunning(false);
    appendLog(`<b>Could not start.</b> ${error.message}`, "blocked");
  }
}

async function stopTask() {
  await request({ type: "STOP_TASK", tabId: state.tabId }).catch(() => {});
  setRunning(false);
  $("confirmationBox").classList.add("hidden");
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.source !== "gateway-worker") return;
  if (state.running && state.tabId != null && message.tabId != null && message.tabId !== state.tabId) return;
  if (message.type === "TASK_STARTED") {
    state.tabId = message.tabId;
    setRunning(true);
    $("stepBadge").textContent = "step 1";
  } else if (message.type === "CONTEXT") {
    renderContext(message.context, message.localPreview);
  } else if (message.type === "ACTION_PROPOSED") {
    $("stepBadge").textContent = `step ${message.step}`;
    const a = message.action || {};
    appendLog(`<b>Agent proposes</b> <code>${a.type}</code>${a.targetId ? ` → <code>${a.targetId}</code>` : ""}${a.value ? ` with <code>${a.value}</code>` : ""}`);
  } else if (message.type === "ACTION_RESULT") {
    const r = message.result || {};
    const cls = r.status === "blocked" ? "blocked" : "ok";
    appendLog(`<b>Local firewall</b> ${r.status || "unknown"}${r.reason ? ` · ${r.reason}` : ""}`, cls);
    if (r.receipt) renderReceipts([r.receipt, ...state.receipts.filter((item) => item.at !== r.receipt.at)]);
  } else if (message.type === "VISUAL_OCR_PROGRESS") {
    const pct = Math.round(Number(message.progress || 0) * 100);
    $("stepBadge").textContent = `vision ${pct}%`;
  } else if (message.type === "PLANNER_WAIT") {
    $("stepBadge").textContent = "provider wait";
    appendLog(message.message || `Provider rate limit. Waiting ${message.seconds} seconds before retrying. Stop remains available.`);
  } else if (message.type === "VISUAL_CONTEXT") {
    appendLog(`<b>Local vision ready.</b> ${Number(message.lineCount || 0)} safe OCR regions · ${Number(message.ocrMs || 0).toFixed(0)} ms.`);
  } else if (message.type === "CONFIRMATION_REQUIRED") {
    const action = message.action || {};
    const tokenType = String(action.value || "").match(/^<([A-Z0-9_]+):[A-F0-9]{24}>$/)?.[1] || "none";
    const destination = state.lastContext?.page?.origin || "current site";
    const target = message.result?.target || {};
    $("confirmationBox").classList.remove("hidden");
    $("confirmationTitle").textContent = action.reason || "Local confirmation required";
    $("confirmationReason").textContent = `${message.result?.reason || "This action can create an external side effect."} Destination: ${destination}.`;
    $("confirmationAction").textContent = [
      `Action: ${action.type || "unknown"}`,
      `Target: ${target.label || action.targetId || "visual target"}`,
      `Private data disclosed: ${tokenType === "none" ? "none" : `${tokenType} capability, resolved locally`}`,
      "Execution: blocked until you choose Allow once"
    ].join("\n");
    $("confirmationBox").scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (message.type === "TASK_DONE") {
    setRunning(false);
    $("confirmationBox").classList.add("hidden");
    appendLog(`<b>Done.</b> ${message.message || "Task complete"}`, "ok");
    if ($("speakResults").checked && globalThis.speechSynthesis) {
      // Speak status only; model answers can contain information from the page.
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance("The agent has stopped. Review the result in the activity log."));
    }
  } else if (message.type === "TASK_ERROR") {
    setRunning(false);
    $("confirmationBox").classList.add("hidden");
    appendLog(`<b>Agent error.</b> ${message.error || "Unknown error"}`, "blocked");
  }
});

$("runButton").addEventListener("click", startTask);
$("refreshButton").addEventListener("click", refreshContext);
$("visualButton").addEventListener("click", visualScan);
$("stopButton").addEventListener("click", stopTask);
$("saveSettingsButton").addEventListener("click", () => saveSettings().catch((error) => appendLog(`Settings failed. ${error.message}`, "blocked")));
$("clearPrivateButton").addEventListener("click", async () => {
  await request({ type: "CLEAR_PRIVATE_SESSION" });
  if (state.settings) { state.settings.provider.apiKey = ""; state.settings.userProfile = {}; }
  setProviderLine();
  for (const id of ["apiKeyInput", "fallbackKeysInput", "nameInput", "emailInput", "phoneInput", "addressInput", "upiInput"]) $(id).value = "";
  appendLog("<b>Session secrets cleared.</b> API key and private profile were removed.", "ok");
});
$("clearAuditButton").addEventListener("click", async () => {
  await request({ type: "CLEAR_AUDIT" });
  renderReceipts([]);
});
$("exportAuditButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), receipts: state.receipts }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `privacy-receipts-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function confirmAction(allow) {
  $("allowButton").disabled = true;
  $("blockButton").disabled = true;
  $("allowButton").textContent = allow ? "Checking fresh page..." : "Allow once";
  try {
    await request({ type: "CONFIRM_PENDING", allow, tabId: state.tabId });
    $("confirmationBox").classList.add("hidden");
  } catch (error) {
    appendLog(`Confirmation failed. ${error.message} You can retry or stop the task.`, "blocked");
  } finally {
    $("allowButton").disabled = false;
    $("blockButton").disabled = false;
    $("allowButton").textContent = "Allow once";
  }
}
$("allowButton").addEventListener("click", () => confirmAction(true));
$("blockButton").addEventListener("click", () => confirmAction(false));
$("taskInput").addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") startTask();
});

const SpeechRecognitionAPI = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
let recognition = null;
$("voiceButton").disabled = !SpeechRecognitionAPI;
if (!SpeechRecognitionAPI) $("voiceStatus").textContent = "Speech recognition is unavailable in this browser. Type your task instead.";
$("voiceButton").addEventListener("click", () => {
  if (recognition) { recognition.stop(); return; }
  if (!SpeechRecognitionAPI || state.running) return;
  const current = new SpeechRecognitionAPI();
  recognition = current;
  current.lang = navigator.language || "en-IN";
  current.interimResults = true;
  current.continuous = false;
  let failed = false;
  current.onresult = (event) => {
    $("taskInput").value = Array.from(event.results, (result) => result[0].transcript).join(" ");
    $("voiceStatus").textContent = "Transcript received. Review it, then choose Run task.";
  };
  current.onerror = (event) => {
    failed = true;
    $("voiceStatus").textContent = event.error === "not-allowed"
      ? "Microphone access was denied. Allow microphone access in browser settings or type your task."
      : `Speech recognition stopped (${event.error}). You can retry or type your task.`;
  };
  current.onend = () => {
    recognition = null;
    $("voiceButton").textContent = "Speak task";
    $("voiceButton").setAttribute("aria-pressed", "false");
    if (!failed) $("voiceStatus").textContent = "Listening ended. Review the transcript before running.";
  };
  try {
    current.start();
    $("voiceButton").textContent = "Stop listening";
    $("voiceButton").setAttribute("aria-pressed", "true");
    $("voiceStatus").textContent = "Listening. Your browser may process audio using its speech service.";
  } catch (_) { recognition = null; $("voiceStatus").textContent = "Could not start the microphone. Type your task or retry."; }
});
window.addEventListener("pagehide", () => { recognition?.abort(); globalThis.speechSynthesis?.cancel(); });

const presets = {
  gemini: ["https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", ""],
  openrouter: ["https://openrouter.ai/api/v1/chat/completions", "openrouter/free"],
  groq: ["https://api.groq.com/openai/v1/chat/completions", "openai/gpt-oss-20b"],
  openai: ["https://api.openai.com/v1/chat/completions", ""],
  local: ["http://127.0.0.1:8787/v1/chat/completions", "local-demo"]
};
$("providerPreset").addEventListener("change", () => {
  const preset = presets[$("providerPreset").value];
  if (!preset) return;
  $("endpointInput").value = preset[0];
  $("modelInput").value = preset[1];
  $("apiKeyInput").value = "";
  $("fallbackKeysInput").value = "";
  $("modelInput").placeholder = "Enter a model ID from your provider's catalog";
});
$("endpointInput").addEventListener("input", () => { $("apiKeyInput").value = ""; $("fallbackKeysInput").value = ""; $("providerPreset").value = "custom"; });
const departure = new Date();
departure.setDate(departure.getDate() + 14);
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
$("flightDate").min = localDate(new Date());
$("flightDate").value = localDate(departure);
$("flightButton").addEventListener("click", async () => {
  $("flightButton").disabled = true;
  try {
    const response = await request({ type: "START_FLIGHT_DEMO", from: $("flightFrom").value.trim(), to: $("flightTo").value.trim(), date: $("flightDate").value });
    state.tabId = response.tabId;
    $("taskInput").value = response.task;
    $("flightStatus").textContent = "Live search started. Follow the actions below; use Stop to cancel.";
  } catch (error) { $("flightStatus").textContent = error.message; }
  finally { $("flightButton").disabled = state.running; }
});

loadSettings().then(refreshContext).catch((error) => appendLog(`<b>Startup.</b> ${error.message}`, "blocked"));
