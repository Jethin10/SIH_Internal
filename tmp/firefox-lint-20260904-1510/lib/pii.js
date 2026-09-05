(function initPrivacyPII(root) {
  "use strict";

  const TYPE_DEFS = [
    { type: "EMAIL", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { type: "PAN", regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
    { type: "IFSC", regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
    { type: "PASSPORT", regex: /\b[A-Z][1-9][0-9]{6}\b/g },
    { type: "VOTER_ID", regex: /\b[A-Z]{3}[0-9]{7}\b/g },
    { type: "UPI", regex: /\b[A-Z0-9._-]{2,}@[A-Z][A-Z0-9.-]{1,}\b/gi },
    { type: "JWT", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
    { type: "IP", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    { type: "PHONE", regex: /(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)/g },
    { type: "AADHAAR", regex: /(?<!\d)(?:\d[ -]?){11}\d(?!\d)/g },
    { type: "CARD", regex: /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g }
  ];

  const VERHOEFF_D = [
    [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]
  ];
  const VERHOEFF_P = [
    [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]
  ];

  function normalizeDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function luhn(value) {
    const digits = normalizeDigits(value);
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let doubleDigit = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let n = Number(digits[i]);
      if (doubleDigit) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
  }

  function verhoeff(value) {
    const digits = normalizeDigits(value);
    if (digits.length !== 12 || /^0/.test(digits)) return false;
    let c = 0;
    const reversed = digits.split("").reverse().map(Number);
    for (let i = 0; i < reversed.length; i += 1) {
      c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
    }
    return c === 0;
  }

  function validIPv4(value) {
    const parts = String(value).split(".");
    return parts.length === 4 && parts.every((part) => {
      const n = Number(part);
      return /^\d{1,3}$/.test(part) && n >= 0 && n <= 255;
    });
  }

  function validMatch(type, value) {
    if (type === "CARD") return luhn(value);
    if (type === "AADHAAR") {
      const digits = normalizeDigits(value);
      return digits.length === 12 && verhoeff(digits);
    }
    if (type === "IP") return validIPv4(value);
    if (type === "UPI" && /^[^@\s]+@[A-Z]{2,}$/i.test(value) === false) return false;
    return true;
  }

  function hashText(text) {
    let hash = 2166136261;
    const input = String(text);
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
  }

  function randomAliasId() {
    const bytes = new Uint8Array(12);
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function normalizeType(type) {
    return String(type || "PRIVATE").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  }

  class AliasVault {
    constructor(seed) {
      this.seed = seed || Math.random().toString(36).slice(2);
      this.byToken = new Map();
      this.byValue = new Map();
      this.userTokens = new Set();
    }

    register(type, value, options) {
      const raw = String(value == null ? "" : value).trim();
      if (!raw) return null;
      const normalizedType = normalizeType(type);
      const key = `${normalizedType}\u0000${raw}`;
      if (this.byValue.has(key)) {
        const existingToken = this.byValue.get(key);
        const existing = this.byToken.get(existingToken);
        if (existing && ["user", "task"].includes(options?.source) && existing.source === "page") {
          existing.source = options.source;
          existing.scope = options.scope || existing.scope;
          existing.allowedActions = options.allowedActions || existing.allowedActions;
          existing.allowedSemanticTypes = options.allowedSemanticTypes || existing.allowedSemanticTypes;
          existing.maxUses = Number.isFinite(options.maxUses) ? options.maxUses : existing.maxUses;
          existing.expiresAt = Number.isFinite(options.expiresAt) ? options.expiresAt : existing.expiresAt;
        }
        return existingToken;
      }
      const token = `<${normalizedType}:${randomAliasId()}>`;
      const record = {
        token,
        type: normalizedType,
        value: raw,
        source: options && options.source ? options.source : "page",
        scope: options && options.scope ? options.scope : "session",
        allowedActions: options?.allowedActions || ["fill"],
        allowedSemanticTypes: options?.allowedSemanticTypes || [],
        maxUses: Number.isFinite(options?.maxUses) ? options.maxUses : Infinity,
        uses: 0,
        expiresAt: Number.isFinite(options?.expiresAt) ? options.expiresAt : Infinity
      };
      this.byToken.set(token, record);
      this.byValue.set(key, token);
      if (record.source === "user") this.userTokens.add(token);
      return token;
    }

    resolve(token) {
      const record = this.byToken.get(String(token || ""));
      return record ? record.value : null;
    }

    resolveForUse(token, context) {
      const record = this.byToken.get(String(token || ""));
      if (!record) return { ok: false, error: "Unknown or expired private token" };
      if (!["user", "task"].includes(record.source)) return { ok: false, error: "Page-derived private tokens cannot be used for filling" };
      if (Date.now() > record.expiresAt) return { ok: false, error: "Private token expired" };
      if (record.uses >= record.maxUses) return { ok: false, error: "Private token use limit reached" };
      const action = String(context?.action || "");
      const semanticType = String(context?.semanticType || "").toLowerCase();
      if (!record.allowedActions.includes(action)) return { ok: false, error: "Private token is not allowed for this action" };
      if (record.allowedSemanticTypes.length && !record.allowedSemanticTypes.includes(semanticType)) {
        return { ok: false, error: "Private token does not match the destination field" };
      }
      if (context?.consume) record.uses += 1;
      return { ok: true, value: record.value, record };
    }

    getRecord(token) {
      return this.byToken.get(String(token || "")) || null;
    }

    capabilities(userOnly) {
      const output = [];
      for (const [token, record] of this.byToken.entries()) {
        if (userOnly && !this.userTokens.has(token)) continue;
        output.push({ token, type: record.type, source: record.source });
      }
      return output;
    }

    registerUserProfile(profile) {
      const mapping = [
        ["PERSON", profile && profile.name, ["person"]],
        ["EMAIL", profile && profile.email, ["email"]],
        ["PHONE", profile && profile.phone, ["phone"]],
        ["ADDRESS", profile && profile.address, ["address"]],
        ["UPI", profile && profile.upi, ["upi"]]
      ];
      for (const [type, value, allowedSemanticTypes] of mapping) {
        if (value) this.register(type, value, {
          source: "user", scope: "task", allowedSemanticTypes, allowedActions: ["fill"],
          maxUses: 3, expiresAt: Date.now() + 30 * 60 * 1000
        });
      }
    }
  }

  function addMatch(matches, type, value, index, priority) {
    if (!value || index < 0 || !validMatch(type, value)) return;
    const end = index + value.length;
    const overlaps = matches.some((item) => index < item.end && end > item.index);
    if (overlaps) return;
    matches.push({ type, value, index, end, priority: priority || 0 });
  }

  function findPII(text, vault) {
    const input = String(text == null ? "" : text);
    if (!input) return [];
    const candidates = [];
    for (const def of TYPE_DEFS) {
      def.regex.lastIndex = 0;
      let match;
      while ((match = def.regex.exec(input)) !== null) {
        if (validMatch(def.type, match[0])) {
          candidates.push({
            type: def.type,
            value: match[0],
            index: match.index,
            end: match.index + match[0].length,
            priority: def.type === "CARD" || def.type === "AADHAAR" ? 5 : 3
          });
        }
        if (match.index === def.regex.lastIndex) def.regex.lastIndex += 1;
      }
    }

    if (vault) {
      for (const record of vault.byToken.values()) {
        if (!record.value || record.value.length < 3) continue;
        const lowerInput = input.toLocaleLowerCase();
        const lowerValue = record.value.toLocaleLowerCase();
        let from = 0;
        while (from < lowerInput.length) {
          const index = lowerInput.indexOf(lowerValue, from);
          if (index === -1) break;
          candidates.push({
            type: record.type,
            value: input.slice(index, index + record.value.length),
            index,
            end: index + record.value.length,
            priority: record.source === "user" ? 10 : 2,
            existingToken: record.token
          });
          from = index + record.value.length;
        }
      }
    }

    candidates.sort((a, b) => b.priority - a.priority || b.value.length - a.value.length || a.index - b.index);
    const accepted = [];
    for (const item of candidates) addMatch(accepted, item.type, item.value, item.index, item.priority);
    accepted.sort((a, b) => a.index - b.index);
    return accepted;
  }

  function redactText(text, vault, options) {
    const input = String(text == null ? "" : text);
    const opts = options || {};
    if (!input) return { safe: input, entities: [], sensitivity: "none" };

    if (opts.semanticType === "password" || opts.semanticType === "secret") {
      const token = vault.register("SECRET", input, { source: "page" });
      return {
        safe: token || "<SECRET>",
        entities: [{ type: "SECRET", value: input, token }],
        sensitivity: "critical"
      };
    }

    if (opts.semanticType && opts.forceSemantic && input.trim()) {
      const type = normalizeType(opts.semanticType);
      const token = vault.register(type, input, { source: "page" });
      return {
        safe: token,
        entities: [{ type, value: input, token }],
        sensitivity: type === "CARD" || type === "AADHAAR" || type === "SECRET" ? "critical" : "personal"
      };
    }

    const matches = findPII(input, vault);
    if (!matches.length) return { safe: input, entities: [], sensitivity: "none" };
    let cursor = 0;
    let safe = "";
    const entities = [];
    let sensitivity = "personal";
    for (const match of matches) {
      safe += input.slice(cursor, match.index);
      const existing = Array.from(vault.byToken.values()).find((record) => record.type === match.type && record.value.toLocaleLowerCase() === match.value.toLocaleLowerCase());
      const token = existing ? existing.token : vault.register(match.type, match.value, { source: "page" });
      safe += token;
      entities.push({ type: match.type, value: match.value, token });
      if (["CARD", "AADHAAR", "SECRET", "JWT"].includes(match.type)) sensitivity = "critical";
      cursor = match.end;
    }
    safe += input.slice(cursor);
    return { safe, entities, sensitivity };
  }

  const api = { AliasVault, findPII, redactText, luhn, verhoeff, hashText, normalizeType };
  root.PrivacyPII = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
