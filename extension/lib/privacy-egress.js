(function initPrivacyEgress(root) {
  "use strict";

  const PII =
    typeof module !== "undefined" && module.exports
      ? require("./pii.js")
      : root.PrivacyPII;
  const CAPABILITY = /<[A-Z0-9_]+:[A-F0-9]{24}>/g;

  function fail(code) {
    const error = new Error(`Privacy egress blocked: ${code}`);
    error.code = code;
    throw error;
  }

  function privateValues(settings = {}, inventory = []) {
    return [
      ...inventory.map((item) => ({
        source: `graph:${item.type || "private"}`,
        value: item.value,
      })),
      ...Object.entries(settings.userProfile || {}).map(([field, value]) => ({
        source: `profile:${field}`,
        value,
      })),
      { source: "provider:apiKey", value: settings.provider?.apiKey },
      { source: "agent:token", value: settings.agent?.token },
      ...(settings.provider?.fallbackApiKeys || []).map((value) => ({
        source: "provider:fallbackKey",
        value,
      })),
      ...(settings.taskPrivateEntities || []).map((entity) => ({
        source: `task:${entity.type || "entity"}`,
        value: entity.value,
      })),
    ]
      .map((item) => ({ ...item, value: String(item.value ?? "").trim() }))
      .filter((item) => item.value.length >= 3);
  }

  // Inspect the exact JSON bytes that the caller will send. Parsed string
  // inspection also catches secrets hidden by JSON escaping or URL encoding.
  // This recognizes known values and PII patterns, not arbitrary unknown PII.
  function inspectSerialized(serialized, knownValues = []) {
    if (typeof serialized !== "string") fail("INVALID_JSON");
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch (_) {
      fail("INVALID_JSON");
    }
    const secrets = knownValues
      .map((item) =>
        typeof item === "string" ? { source: "value", value: item } : item,
      )
      .map((item) => ({
        source: item.source || "value",
        value: String(item.value ?? "")
          .trim()
          .toLowerCase(),
      }))
      .filter((item) => item.value.length >= 3);
    const pending = [parsed];
    const strings = [serialized];
    while (pending.length) {
      const value = pending.pop();
      if (typeof value === "string") strings.push(value);
      else if (value && typeof value === "object") {
        if (
          typeof value.label === "string" &&
          typeof value.value === "string"
        ) {
          strings.push(`${value.label} ${value.value}`);
        }
        for (const [key, child] of Object.entries(value)) {
          strings.push(key);
          pending.push(child);
        }
      }
    }
    for (const original of strings) {
      let text = original;
      for (let depth = 0; depth < 3; depth++) {
        for (const secret of secrets) {
          if (text.toLowerCase().includes(secret.value)) {
            const error = new Error(
              `Privacy egress blocked: KNOWN_PRIVATE_VALUE (${secret.source})`,
            );
            error.code = "KNOWN_PRIVATE_VALUE";
            throw error;
          }
        }
        const hits = PII.findPII(text.replace(CAPABILITY, "<PRIVATE_TOKEN>"));
        if (hits.length) {
          const detail = hits
            .map((hit) => {
              const value = String(hit.value || "");
              const masked =
                value.length > 4
                  ? `${value.length > 4 ? `${value.slice(0, 2)}�${value.slice(-2)}` : "�"}`
                  : "…";
              return `${hit.type}(${masked})`;
            })
            .join(",");
          const error = new Error(
            `Privacy egress blocked: RAW_PII (${detail})`,
          );
          error.code = "RAW_PII";
          throw error;
        }
        let decoded;
        try {
          decoded = decodeURIComponent(text);
        } catch (_) {
          break;
        }
        if (decoded === text) break;
        text = decoded;
      }
    }
    return serialized;
  }

  const api = { privateValues, inspectSerialized };
  root.PrivacyEgress = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
