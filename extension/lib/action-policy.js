(function initActionPolicy(root) {
  "use strict";

  const TARGET_ACTIONS = new Set(["click", "fill", "select", "press", "focus"]);
  const ALLOWED_KEYS = new Set([
    "Enter", "Escape", "Tab", " ", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Home", "End", "PageUp", "PageDown"
  ]);
  const FIELDS = {
    click: new Set(["type", "targetId", "expectedVersion", "reason"]),
    fill: new Set(["type", "targetId", "expectedVersion", "value", "reason"]),
    select: new Set(["type", "targetId", "expectedVersion", "value", "reason"]),
    press: new Set(["type", "targetId", "expectedVersion", "key", "reason"]),
    focus: new Set(["type", "targetId", "expectedVersion", "reason"]),
    scroll: new Set(["type", "direction", "amount", "reason"]),
    wait: new Set(["type", "ms", "reason"]),
    back: new Set(["type", "reason"]),
    navigate: new Set(["type", "url", "reason"]),
    search_web: new Set(["type", "query", "reason"]),
    visual_scan: new Set(["type", "reason"]),
    done: new Set(["type", "message"])
  };

  function fail(reason) {
    return { ok: false, reason };
  }

  function validate(action) {
    if (!action || Object.getPrototypeOf(action) !== Object.prototype) return fail("Action must be a plain object");
    if (typeof action.type !== "string" || !FIELDS[action.type]) return fail(`Unsupported action: ${String(action.type || "missing")}`);
    for (const key of Object.keys(action)) {
      if (!FIELDS[action.type].has(key)) return fail(`Unexpected action field: ${key}`);
    }
    if (TARGET_ACTIONS.has(action.type)) {
      if (typeof action.targetId !== "string" || !/^[ev]_[A-Za-z0-9_:-]+$/.test(action.targetId)) return fail("Target ID is missing or malformed");
      if (!Number.isInteger(action.expectedVersion) || action.expectedVersion < 1) return fail("A positive expectedVersion is required");
    }
    if (["fill", "select"].includes(action.type) && (typeof action.value !== "string" || action.value.length > 4000)) {
      return fail("Action value must be a string no longer than 4000 characters");
    }
    if (action.type === "press" && !ALLOWED_KEYS.has(String(action.key || "Enter"))) return fail("Requested key is not allowed");
    if (action.type === "navigate") {
      if (typeof action.url !== "string" || action.url.length > 2000) return fail("Navigation requires a URL under 2000 characters");
      try {
        const url = new URL(action.url);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return fail("Navigation requires an HTTP(S) URL without credentials");
      } catch (_) { return fail("Navigation URL is invalid"); }
    }
    if (action.type === "search_web" && (typeof action.query !== "string" || !action.query.trim() || action.query.length > 500)) return fail("Search query must contain 1 to 500 characters");
    if (action.type === "scroll") {
      if (!["up", "down"].includes(action.direction)) return fail("Scroll direction must be up or down");
      if (action.amount != null && (!Number.isFinite(action.amount) || action.amount < 1 || action.amount > 5000)) return fail("Scroll amount is outside the allowed range");
    }
    if (action.type === "wait" && action.ms != null && (!Number.isFinite(action.ms) || action.ms < 0 || action.ms > 3000)) {
      return fail("Wait duration is outside the allowed range");
    }
    if (action.type === "done" && (typeof action.message !== "string" || action.message.length > 4000)) return fail("Done message is missing or too long");
    if (action.reason != null && (typeof action.reason !== "string" || action.reason.length > 500)) return fail("Action reason is invalid");
    return { ok: true };
  }

  const responseSchema = {anyOf:Object.entries(FIELDS).map(([type,fields]) => ({
    type:'object',additionalProperties:false,
    required:[...fields].filter(field=>!['reason','amount','ms'].includes(field)),
    properties:Object.fromEntries([...fields].map(field=>[field,field==='type'?{type:'string',enum:[type]}:{type:field==='expectedVersion'?'integer':['amount','ms'].includes(field)?'number':'string'}]))
  }))};
  const api = { validate, TARGET_ACTIONS, ALLOWED_KEYS, responseSchema };
  root.PrivacyActionPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
