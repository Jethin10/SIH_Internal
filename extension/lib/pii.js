(function initPrivacyPII(root) {
  "use strict";

  const TYPE_DEFS = [
    { type: "EMAIL", regex: /\b[A-Z0-9._%+-]+[ \t]*@[ \t]*[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { type: "PAN", regex: /\b[A-Z]{5}[ \t-]*[0-9]{4}[ \t-]*[A-Z]\b/gi },
    { type: "IFSC", regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
    { type: "PASSPORT", regex: /\b[A-Z][1-9][0-9]{6}\b/g },
    { type: "VOTER_ID", regex: /\b[A-Z]{3}[0-9]{7}\b/g },
    { type: "UPI", regex: /\b[A-Z0-9._-]{2,}@[A-Z][A-Z0-9.-]{1,}\b/gi },
    { type: "JWT", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
    { type: "IP", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    { type: "PHONE", regex: /(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g },
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

  function normalizeDetectionText(value) {
    return String(value || "").replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966));
  }

  function normalizeDigits(value) {
    return normalizeDetectionText(value).replace(/\D/g, "");
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

  function addMatch(matches, type, value, index, priority, labelledOverride) {
    if (!value || index < 0 || (!labelledOverride && !validMatch(type, value))) return;
    const end = index + value.length;
    const overlaps = matches.some((item) => index < item.end && end > item.index);
    if (overlaps) return;
    matches.push({ type, value, index, end, priority: priority || 0 });
  }

  function phoneLooksLikeCount(input, index, end) {
    const before = input.slice(Math.max(0, index - 48), index).toLocaleLowerCase();
    const after = input.slice(end, Math.min(input.length, end + 32)).toLocaleLowerCase();
    const phoneCue = /(?:phone|mobile|contact|call|tel|whatsapp|फोन|मोबाइल|संपर्क)\s*(?::|is|at|-)?\s*$/iu.test(before);
    if (phoneCue) return false;
    return /(?:dataset|table|report|count|contains?)\s*$/iu.test(before)
      || /^\s*(?:records?|rows?|entries|items|samples|users)\b/iu.test(after);
  }

  function addContextualMatches(input, normalizedInput, candidates) {
    const ocrPhone = /(?:phone|mobile|contact|call|tel(?:ephone)?|whatsapp|फोन|मोबाइल|संपर्क)\s*(?::|is|at|-)?\s*(?:\+?91[ -]?)?([6-9][0-9ILO]{4}[ -]?[0-9ILO]{5})/giu;
    let match;
    while ((match = ocrPhone.exec(normalizedInput)) !== null) {
      const normalized = match[1].replace(/[ILO]/gi, (value) => ({ I: "1", L: "1", O: "0" })[value.toUpperCase()]).replace(/\D/g, "");
      const ambiguous = (match[1].match(/[ILO]/gi) || []).length;
      if (normalized.length === 10 && /^[6-9]/.test(normalized) && ambiguous > 0 && ambiguous <= 2) {
        const index = match.index + match[0].lastIndexOf(match[1]);
        candidates.push({ type: "PHONE", value: input.slice(index, index + match[1].length), index, end: index + match[1].length, priority: 7 });
      }
      if (match.index === ocrPhone.lastIndex) ocrPhone.lastIndex += 1;
    }

    const labelledPhone = /(?:phone(?:\s+number)?|mobile(?:\s+number)?|telephone|contact(?:\s+number)?|tel|whatsapp|फोन|मोबाइल|संपर्क)\s*(?::|is|at|-)\s*(\+?(?:\(\d{2,4}\)|\d)[\d(). -]{4,}\d)/giu;
    while ((match = labelledPhone.exec(normalizedInput)) !== null) {
      const value = match[1].trim();
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        const index = match.index + match[0].lastIndexOf(match[1]) + match[1].indexOf(value);
        candidates.push({ type: "PHONE", value: input.slice(index, index + value.length), index, end: index + value.length, priority: 7 });
      }
      if (match.index === labelledPhone.lastIndex) labelledPhone.lastIndex += 1;
    }

    const labelledPassport = /(?:passport(?:\s+(?:number|no\.?))?|travel\s+document)\s*(?::|is|-)\s*([A-Z0-9][A-Z0-9-]{5,11})\b/giu;
    while ((match = labelledPassport.exec(input)) !== null) {
      const value = match[1];
      const index = match.index + match[0].lastIndexOf(value);
      candidates.push({ type: "PASSPORT", value, index, end: index + value.length, priority: 7 });
      if (match.index === labelledPassport.lastIndex) labelledPassport.lastIndex += 1;
    }

    const labelledCard = /(?:credit\s+card|payment\s+card|card)(?:\s+(?:number|no\.?))?\s*(?::|is|-)\s*((?:\d[ -]?){11,18}\d)/giu;
    while ((match = labelledCard.exec(input)) !== null) {
      const value = match[1].trim();
      const index = match.index + match[0].lastIndexOf(match[1]);
      candidates.push({ type: "CARD", value, index, end: index + value.length, priority: 7, labelledOverride: true });
      if (match.index === labelledCard.lastIndex) labelledCard.lastIndex += 1;
    }

    const streetAddress = /\b\d{1,6}\s+[\p{L}\p{M}0-9.'’/-]+(?:\s+[\p{L}\p{M}0-9.'’/-]+){0,5}\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Terrace|Way|Boulevard|Blvd|Highway|Hwy|Motorway|Bypass|Lodge|Lakes|Villages|Parkways|Throughway|Tunnel|Path|Trafficway|Valley|Plains|Mission|Pines|Forks?|Circles?|Drives?|Union|Hill|Crest|Course|Extensions?|Gardens?|Groves?|Manor|Meadows|Junctions?|Centers?|Trace|Summit|Trail|Turnpike|Station|Plaza|Square|Key|Cape|Isle|Locks?|Shoals?|Ports?|Views?|Heights?|Corners?|Club)(?:,?\s+(?:Apt|Apartment|Suite|Unit)\.?\s*[A-Z0-9-]+)?(?:,\s*[\p{L}\p{M}.'’ -]{2,32}){0,2}\b/giu;
    while ((match = streetAddress.exec(input)) !== null) {
      candidates.push({ type: "ADDRESS", value: match[0], index: match.index, end: match.index + match[0].length, priority: 6 });
      if (match.index === streetAddress.lastIndex) streetAddress.lastIndex += 1;
    }

    const labelledValues = [
      ["PERSON", /(?:[Pp]atient|[Bb]eneficiary|[Rr]ecipient|[Aa]ccount [Hh]older|Full Legal Name|Full Name|Applicant Name|Provider Name|Account Name|Cardholder Name|Customer Name|[Bb]orrower|[Ss]hipper|[Uu]ser|[Ss]ignature)\s*(?:name\s*)?(?:is|:|-)\s*((?:Dr\.?\s+)?[\p{Lu}][\p{L}\p{M}'’-]{1,}(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’-]{1,}){0,3}?)(?=[ \t]+(?:Date|Address|Phone|Email|Account|Policy|Street|Property|New Loan)\b\s*:|[.,;|\n]|$)/gu],
      ["PERSON", /\bmy\s+name\s+is\s+([A-Z][\p{L}\p{M}'’-]{1,}(?:\s+[A-Z][\p{L}\p{M}'’-]{1,}){0,3})/giu],
      ["PERSON", /\bDear\s+([A-Z][\p{L}\p{M}'’-]{1,}(?:\s+[A-Z][\p{L}\p{M}'’-]{1,}){0,3})(?=,)/gu],
      ["PERSON", /(?:मरीज|रोगी|लाभार्थी|प्राप्तकर्ता)\s*(?:का नाम\s*)?(?:है|:|-)\s*([\p{L}\p{M}'’-]{2,}(?:\s+[\p{L}\p{M}'’-]{2,}){1,3})/gu],
      ["ADDRESS", /(?:Residential address|residential address|Delivery address|delivery address|Home address|home address)\s*(?:is|:|-)\s*([^.;\n]{8,100})/gu],
      ["ADDRESS", /(?:घर का पता|डिलीवरी पता|आवासीय पता)\s*(?:है|:|-)?\s*([^.;\n]{5,100})/gu],
      ["HEALTH", /(?:Diagnosis|diagnosis|Medical condition|medical condition|Health condition|health condition|Allergy|allergy)\s*(?:is|:|-)\s*([^.;\n]{3,100})/gu],
      ["HEALTH", /(?:बीमारी|रोग|स्वास्थ्य स्थिति|एलर्जी)\s*(?:है|:|-)?\s*([^.;\n]{3,100})/gu]
    ];
    for (const [type, regex] of labelledValues) {
      regex.lastIndex = 0;
      while ((match = regex.exec(input)) !== null) {
        const value = match[1].trim();
        if (/^<[A-Z0-9_]+(?::[A-F0-9]{6,})?>/i.test(value)) continue;
        if (type === "PERSON" && /^(?:policyholder|borrower|customer|applicant|recipient|beneficiary|patient|user)$/i.test(value)) continue;
        const index = match.index + match[0].lastIndexOf(match[1]) + match[1].indexOf(value);
        candidates.push({ type, value, index, end: index + value.length, priority: 6 });
        if (match.index === regex.lastIndex) regex.lastIndex += 1;
      }
    }
  }

  function findPII(text, vault) {
    const input = String(text == null ? "" : text);
    if (!input) return [];
    const normalizedInput = normalizeDetectionText(input);
    const candidates = [];
    for (const def of TYPE_DEFS) {
      def.regex.lastIndex = 0;
      let match;
      while ((match = def.regex.exec(normalizedInput)) !== null) {
        if (validMatch(def.type, match[0])) {
          const end = match.index + match[0].length;
          if (def.type === "PHONE" && phoneLooksLikeCount(input, match.index, end)) continue;
          candidates.push({
            type: def.type,
            value: input.slice(match.index, end),
            index: match.index,
            end,
            priority: def.type === "CARD" || def.type === "AADHAAR" ? 5 : 3
          });
        }
        if (match.index === def.regex.lastIndex) def.regex.lastIndex += 1;
      }
    }
    addContextualMatches(input, normalizedInput, candidates);

    const contextualValues = candidates.filter((item) => item.priority >= 6 && ["PERSON", "ADDRESS", "HEALTH"].includes(item.type));
    const lowerInput = input.toLocaleLowerCase();
    for (const item of contextualValues) {
      const lowerValue = item.value.toLocaleLowerCase();
      if (lowerValue.length < 3) continue;
      let from = 0;
      while (from < lowerInput.length) {
        const index = lowerInput.indexOf(lowerValue, from);
        if (index === -1) break;
        candidates.push({ ...item, value: input.slice(index, index + item.value.length), index, end: index + item.value.length });
        from = index + item.value.length;
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
    for (const item of candidates) addMatch(accepted, item.type, item.value, item.index, item.priority, item.labelledOverride);
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
