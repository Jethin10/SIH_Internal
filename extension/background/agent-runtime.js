(function initAgentRuntime(global) {
  "use strict";

  const CAPABILITY = /^<[A-Z0-9_]+:[A-F0-9]{24}>$/;
  const GROQ_HOST = "api.groq.com";
  const GROQ_DEFAULT_MODEL = "openai/gpt-oss-20b";

  function compactText(value, maxLength) {
    const text = String(value == null ? "" : value);
    if (CAPABILITY.test(text) || text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  function isVisible(element, viewportHeight) {
    if (!element?.bbox || !Number.isFinite(viewportHeight)) return true;
    const y = Number(element.bbox.y || 0);
    const height = Number(element.bbox.height || 0);
    return y < viewportHeight && y + height > 0;
  }

  function compactPlannerContext(safeContext, maxBytes = 6500) {
    const context = safeContext || {};
    const elements = Array.isArray(context.elements) ? context.elements : [];
    const viewportHeight = Number(context.page?.viewport?.height || Infinity);
    const ranked = elements.map((element, index) => ({ element, index })).sort((left, right) => {
      const rank = ({ element }) => (isVisible(element, viewportHeight) ? 0 : 2) + (element?.actionable ? 0 : 1);
      return rank(left) - rank(right) || left.index - right.index;
    });

    const payload = {
      page: context.page,
      visual: context.visual ? {
        scanned: Boolean(context.visual.scanned),
        lineCount: Number(context.visual.lineCount || 0),
        epoch: context.visual.epoch
      } : null,
      opaqueRegions: (context.opaqueRegions || []).slice(0, 4),
      vaultCapabilities: context.vaultCapabilities,
      elements: [],
      omittedElements: elements.length
    };

    for (const { element } of ranked) {
      const item = {
        id: element.id,
        frameId: Number(element.frameId || 0) || undefined,
        source: element.source === "vision" ? "vision" : undefined,
        role: element.role,
        label: compactText(element.label, 320),
        value: compactText(element.value, 180),
        semanticType: element.semanticType,
        actionable: element.actionable ? true : undefined,
        policy: element.policy && element.policy !== "KEEP" ? element.policy : undefined,
        version: element.version,
        checked: typeof element.checked === "boolean" ? element.checked : undefined,
        disabled: element.disabled ? true : undefined,
        bbox: element.source === "vision" ? element.bbox : undefined
      };
      payload.elements.push(item);
      payload.omittedElements = elements.length - payload.elements.length;
      if (JSON.stringify(payload).length > maxBytes) {
        payload.elements.pop();
        payload.omittedElements = elements.length - payload.elements.length;
      }
    }

    while (payload.elements.length && JSON.stringify(payload).length > maxBytes) {
      payload.elements.pop();
      payload.omittedElements = elements.length - payload.elements.length;
    }
    return payload;
  }

  function providerHost(endpoint) {
    try { return new URL(String(endpoint || "").trim()).hostname.toLowerCase(); }
    catch (_) { return ""; }
  }

  function applyProviderDefaults(settings) {
    const next = { ...(settings || {}), provider: { ...(settings?.provider || {}) } };
    if (providerHost(next.provider.endpoint) === GROQ_HOST && !String(next.provider.model || "").trim()) {
      next.provider.model = GROQ_DEFAULT_MODEL;
    }
    return next;
  }

  function tuneProviderBody(endpoint, body) {
    if (providerHost(endpoint) !== GROQ_HOST || !body || typeof body !== "object") return body;
    const next = { ...body };
    const requestedMax = Number(next.max_completion_tokens || 512);
    next.max_completion_tokens = Math.max(64, Math.min(Number.isFinite(requestedMax) ? requestedMax : 512, 512));
    next.response_format = { type: "json_object" };
    if (String(next.model || "").startsWith("openai/gpt-oss-")) next.reasoning_effort = "low";
    return next;
  }

  function buildFlightUrl(from, to, date) {
    const query = `Flights from ${String(from).trim()} to ${String(to).trim()} on ${String(date).trim()} one way economy 1 adult`;
    const url = new URL("https://www.google.com/travel/flights");
    url.searchParams.set("hl", "en");
    url.searchParams.set("gl", "IN");
    url.searchParams.set("curr", "INR");
    url.searchParams.set("q", query);
    return url.toString();
  }

  const api = {
    GROQ_DEFAULT_MODEL,
    compactPlannerContext,
    applyProviderDefaults,
    tuneProviderBody,
    buildFlightUrl
  };
  global.StrawHatsAgentRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
