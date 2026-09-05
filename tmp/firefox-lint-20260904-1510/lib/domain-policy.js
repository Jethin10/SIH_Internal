(function initDomainPolicy(global) {
  "use strict";

  function rules(value) {
    return String(value || "").split(/[\s,]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  }

  function matches(hostname, rule) {
    const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
    const normalized = String(rule || "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^\*\./, "").replace(/^www\./, "");
    return Boolean(normalized) && (host === normalized || host.endsWith(`.${normalized}`));
  }

  function evaluate(url, policy) {
    const hostname = new URL(url).hostname;
    const blocked = rules(policy?.blockedDomains);
    const allowed = rules(policy?.allowedDomains);
    if (blocked.some((rule) => matches(hostname, rule))) return { ok: false, reason: `${hostname} is blocked by local policy` };
    if (allowed.length && !allowed.some((rule) => matches(hostname, rule))) return { ok: false, reason: `${hostname} is not in the local allowlist` };
    return { ok: true, hostname };
  }

  global.PrivacyDomainPolicy = { rules, matches, evaluate };
})(typeof globalThis !== "undefined" ? globalThis : this);
