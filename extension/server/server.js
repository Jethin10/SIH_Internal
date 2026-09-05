"use strict";

const http = require("http");
const crypto = require("crypto");

const MAX_BODY_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 30_000;

function allowedBrowserOrigin(origin) {
  if (!origin) return true;
  return /^(?:chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin);
}

function authorized(request) {
  const expected = String(process.env.PLANNER_TOKEN || "");
  if (!expected) return true;
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function validateUpstreamEndpoint(value) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("UPSTREAM_ENDPOINT must use HTTPS, except for an explicit loopback endpoint");
  }
  return url.toString();
}

function json(request, response, status, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "X-Content-Type-Options": "nosniff"
  };
  const origin = String(request.headers.origin || "");
  if (origin && allowedBrowserOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  response.writeHead(status, headers);
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body exceeds 1 MB"), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (_) { reject(Object.assign(new Error("Request body must be valid JSON"), { status: 400 })); }
    });
    request.on("error", reject);
  });
}

function actionable(elements, predicate) {
  return (elements || []).find((element) => element.actionable && !element.disabled && predicate(element));
}

function localPlan(payload) {
  const task = String(payload?.task || "").trim();
  const lower = task.toLowerCase();
  const context = payload?.context || {};
  const elements = context.elements || [];
  const history = payload?.history || [];
  const last = history.at(-1);

  if (last?.result?.status === "executed") return { type: "done", message: "Requested browser action completed." };
  const click = task.match(/(?:click|press|open)\s+(?:on\s+)?["']?(.+?)["']?$/i);
  if (click) {
    const needle = click[1].toLowerCase();
    const target = actionable(elements, (element) => `${element.label || ""} ${element.value || ""}`.toLowerCase().includes(needle));
    if (target) return { type: "click", targetId: target.id, expectedVersion: target.version, reason: "Matched the requested control" };
  }

  const search = task.match(/search(?:\s+for)?\s+["']?(.+?)["']?$/i);
  if (search) {
    const query = search[1].trim();
    const target = actionable(elements, (element) => element.semanticType === "search" || /search/i.test(element.label || ""));
    if (target) {
      if (String(target.value || "").toLowerCase().includes(query.toLowerCase())) return { type: "done", message: "Search query entered." };
      return { type: "fill", targetId: target.id, expectedVersion: target.version, value: query, reason: "Enter the requested search query" };
    }
  }

  if (/fill|enter|type|use my/i.test(task)) {
    const kinds = [["email", "EMAIL"], ["phone", "PHONE"], ["name", "PERSON"], ["address", "ADDRESS"], ["upi", "UPI"]];
    for (const [word, type] of kinds) {
      if (!lower.includes(word)) continue;
      const capability = (context.vaultCapabilities || []).find((item) => item.type === type);
      const target = actionable(elements, (element) => element.role === "textbox" && (element.semanticType === word || String(element.label || "").toLowerCase().includes(word)));
      if (capability && target) return { type: "fill", targetId: target.id, expectedVersion: target.version, value: capability.token, reason: `Use the local ${word} capability` };
    }
  }

  if ((context.opaqueRegions || []).length && !context.visual?.scanned) return { type: "visual_scan", reason: "Structured context may be incomplete" };
  return { type: "done", message: "The safe context was reviewed, but no supported action matched the request." };
}

function extractPlannerPayload(body) {
  if (!Array.isArray(body?.messages)) throw Object.assign(new Error("messages must be an array"), { status: 400 });
  const user = [...body.messages].reverse().find((message) => message?.role === "user");
  if (typeof user?.content !== "string") throw Object.assign(new Error("A string user message is required"), { status: 400 });
  let payload;
  try { payload = JSON.parse(user.content); }
  catch (_) { throw Object.assign(new Error("The user message must contain the serialized safe planner payload"), { status: 400 }); }
  return payload;
}

async function forwardUpstream(body) {
  const endpoint = process.env.UPSTREAM_ENDPOINT ? validateUpstreamEndpoint(process.env.UPSTREAM_ENDPOINT) : "";
  const apiKey = process.env.UPSTREAM_API_KEY;
  if (!endpoint) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const forwarded = { ...body, model: process.env.UPSTREAM_MODEL || body.model };
    const headers = { "Content-Type": "application/json", "Accept": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(forwarded), signal: controller.signal, redirect: "error" });
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_BODY_BYTES) throw new Error("Upstream response exceeds 1 MB");
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new Error("Upstream response exceeds 1 MB");
    let data;
    try { data = JSON.parse(text); } catch (_) { throw new Error("Upstream returned invalid JSON"); }
    if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const origin = String(request.headers.origin || "");
      if (!allowedBrowserOrigin(origin)) return json(request, response, 403, { error: "Browser origin is not allowed" });
      if (request.method === "OPTIONS") return json(request, response, 204, {});
      if (request.method === "GET" && url.pathname === "/health") {
        return json(request, response, 200, { ok: true, service: "strawhats-privacy-planner", mode: process.env.UPSTREAM_ENDPOINT ? "upstream" : "local" });
      }
      if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") return json(request, response, 404, { error: "Not found" });
      if (!authorized(request)) return json(request, response, 401, { error: "Planner authorization failed" });
      if (!String(request.headers["content-type"] || "").toLowerCase().includes("application/json")) return json(request, response, 415, { error: "Content-Type must be application/json" });
      const body = await readJson(request);
      const payload = extractPlannerPayload(body);
      const upstream = await forwardUpstream(body);
      if (upstream) return json(request, response, 200, upstream);
      const action = localPlan(payload);
      return json(request, response, 200, { id: `local-${Date.now()}`, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(action) }, finish_reason: "stop" }] });
    } catch (error) {
      if (!response.headersSent && !response.destroyed) json(request, response, Number(error.status || 502), { error: error.message || "Planner server error" });
    }
  });
}

if (require.main === module) {
  if (process.env.UPSTREAM_ENDPOINT && !process.env.PLANNER_TOKEN) {
    throw new Error("PLANNER_TOKEN is required whenever UPSTREAM_ENDPOINT is configured");
  }
  if (process.env.UPSTREAM_ENDPOINT) validateUpstreamEndpoint(process.env.UPSTREAM_ENDPOINT);
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8787);
  createServer().listen(port, host, () => process.stdout.write(`StrawHats planner listening on http://${host}:${port}\n`));
}

module.exports = { createServer, localPlan, allowedBrowserOrigin, authorized, validateUpstreamEndpoint, MAX_BODY_BYTES };
