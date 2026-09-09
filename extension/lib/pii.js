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
  // Bracketed emails that are not markdown links keep their brackets in the span.
  const EMAIL_BRACKETED = /\[[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\](?!\()/gi;

  // Cue that must immediately precede a default-country (Indian) phone
  // candidate from the vendored matcher; bare digit runs stay untouched.
  const PHONE_CUE_TAIL = /(?:(?:phone(?:\s+number)?|mobile(?:\s+number)?|telephone|contact(?:\s+(?:number|us))?|call(?:\s+us)?|dial|tel(?:ephone)?|whatsapp|fax|reach(?:able)?(?:\s+(?:me|us))?)(?:\s+(?:at|on))?\s*(?::|is|-)?\s*|फोन|मोबाइल|संपर्क)\s*$/iu;
  const LIBPHONENUMBER_MAX_TEXT = 20000;
  let libphonenumberModule;

  function loadLibphonenumber() {
    if (libphonenumberModule !== undefined) return libphonenumberModule;
    libphonenumberModule = null;
    try {
      const globalCandidate = globalThis.libphonenumber;
      if (globalCandidate && typeof globalCandidate.findPhoneNumbersInText === "function") {
        libphonenumberModule = globalCandidate;
        return libphonenumberModule;
      }
    } catch (_) { /* content-script worlds differ; fall through */ }
    try {
      if (typeof require === "function") {
        const required = require("./vendor/libphonenumber.js");
        if (required && typeof required.findPhoneNumbersInText === "function") libphonenumberModule = required;
      }
    } catch (_) { /* Node tests without the vendor file keep the base detector */ }
    return libphonenumberModule;
  }

  // libphonenumber-js adds international (+country-code) recall and cued
  // Indian landlines. Candidates never overlap existing PHONE findings, so
  // this stage can only add matches, never remove or rewrite them.
  function addLibphonenumberMatches(input, candidates) {
    if (input.length > LIBPHONENUMBER_MAX_TEXT) return;
    const lib = loadLibphonenumber();
    if (!lib) return;
    const collect = (defaultCountry, priority) => {
      let found;
      try { found = lib.findPhoneNumbersInText(input, defaultCountry); } catch (_) { return; }
      for (const item of found || []) {
        if (!item || !item.number) continue;
        let valid = false;
        try { valid = item.number.isValid(); } catch (_) { continue; }
        if (!valid) continue;
        const index = item.startsAt;
        const end = item.endsAt;
        if (!Number.isInteger(index) || !Number.isInteger(end) || end <= index) continue;
        if (defaultCountry && !PHONE_CUE_TAIL.test(input.slice(Math.max(0, index - 48), index))) continue;
        const value = input.slice(index, end);
        if (!value.trim()) continue;
        // International spans must be formatted like human-written numbers
        // (a separator inside the span). Machine data (EDIFACT, logs) glues
        // +country-code to an unbroken digit run, which libphonenumber still
        // accepts as a valid number; bare +91 runs stay covered by the base
        // Indian mobile rule.
        if (!defaultCountry && !/[\s()\-./]/.test(value)) continue;
        candidates.push({ type: "PHONE", value, index, end, priority });
      }
    };
    // Without a default country only +country-code forms match, which are
    // self-identifying: order numbers, dates, and IPs never carry one.
    // Priority 6 ties the NANP rule so the fuller +code span wins by length.
    if (input.includes("+")) collect(undefined, 6);
    // Indian-context pass adds cued landlines like "Call 080-4123-4567".
    collect("IN", 4);
  }

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
      throw new Error("Secure randomness is required for privacy capabilities");
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

  const PERSON_TOKEN = String.raw`(?:[\p{L}]\.|[\p{L}\p{M}]+(?:[.'’\-][\p{L}\p{M}]+)*)`;
  const PERSON_SEQUENCE = `${PERSON_TOKEN}(?:[ \t]+${PERSON_TOKEN}){0,4}`;

  function addCapturedContextMatch(input, candidates, match, type, priority, labelledOverride) {
    let value = String(match[1] || "").trim();
    if (type === "ADDRESS") value = value.replace(/,+$/, "").trim();
    if (!value) return;
    if (/^<[A-Z0-9_]+(?::[A-F0-9]{6,})?>/i.test(value)) return;
    if (type === "ADDRESS" && validIPv4(value)) return;
    const offset = match[0].lastIndexOf(match[1]);
    const index = match.index + Math.max(0, offset);
    candidates.push({ type, value, index, end: index + value.length, priority, labelledOverride });
  }

  function overlapsEmailValue(input, index, end) {
    const windowStart = Math.max(0, index - 64);
    const window = input.slice(windowStart, Math.min(input.length, end + 64));
    const email = /[A-Z0-9._%+-]+[ \t]*@[ \t]*[A-Z0-9.-]+\.[A-Z]{2,}/giu;
    let match;
    while ((match = email.exec(window)) !== null) {
      const emailStart = windowStart + match.index;
      const emailEnd = emailStart + match[0].length;
      if (index < emailEnd && end > emailStart) return true;
      if (match.index === email.lastIndex) email.lastIndex += 1;
    }
    return false;
  }

  const ADDRESS_BOUNDARY = String.raw`(?=\s*(?:,\s*\[|\n|$|\(|\s+(?:Name|Full\s+Name|City|State|Zip(?:\s+Code)?|Postal(?:\s+Code)?|Email(?:\s+Address)?|Phone(?:\s+Number)?|Contact|Date(?:\s+of\s+Birth)?|Financial|Monthly|Account|Policy|Property|New\s+Loan|Street|Passport|Travel\s+Document)\b\s*:|[.;](?=\s+(?:[A-Z][\p{Ll}\p{M}]+|The|This|It|WHEREAS|II\b)|$)))`;

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

    // Label form: the separator follows the cue immediately (no filler words),
    // so "Contact IPv4 Address:" can never pose as a phone label.
    const labelledPhone = /(?:phone(?:\s+number)?|mobile(?:\s+number)?|telephone|contact(?:\s+(?:number|us))?|tel(?:ephone)?|whatsapp|fax|फोन|मोबाइल|संपर्क)\s*(?::|is|at|-)[ \t]*(\+?[+(\d][\d(). +-]{4,}\d(?:[ \t]*(?:x|ext\.?|extension)[ \t]*[\d-]+)?)|\b(?:call|contact|reach|dial|ring)\b(?:[ \t]+\w+){0,4}?[ \t]+at[ \t]+(\+?[+(\d][\d(). +-]{4,}\d)/giu;
    while ((match = labelledPhone.exec(normalizedInput)) !== null) {
      const value = (match[1] || match[2]).trim();
      // Extension digits are part of the value but not of the phone-length gate.
      const base = value.replace(/\s*(?:x|ext\.?|extension)\s*[\d-]+$/i, "");
      const digits = base.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        const index = match.index + match[0].lastIndexOf(value);
        candidates.push({ type: "PHONE", value: input.slice(index, index + value.length), index, end: index + value.length, priority: 7, labelledOverride: true });
      }
      if (match.index === labelledPhone.lastIndex) labelledPhone.lastIndex += 1;
    }

    // Distinctive NANP/toll-free shapes need no cue; dates and IDs cannot match them.
    const nanpPhone = /(?<![\d-])(?:1[ -])?\(\d{3}\)[ -]?\d{3}[ -]?\d{4}(?!\d)|\b1[ -](?:800|888|877|866|855|844)[ -]\d{3}[ -]\d{4}\b/g;
    while ((match = nanpPhone.exec(normalizedInput)) !== null) {
      const digits = match[0].replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 11) {
        candidates.push({ type: "PHONE", value: input.slice(match.index, match.index + match[0].length), index: match.index, end: match.index + match[0].length, priority: 6, labelledOverride: true });
      }
      if (match.index === nanpPhone.lastIndex) nanpPhone.lastIndex += 1;
    }

    const labelledPassport = /(?:passport(?:\s+(?:number|no\.?))?|travel\s+document|pasaporte|passeport|passaporto|паспорт)\s*(?:is|:|-|\s)\s*["']?\b([A-Z0-9][A-Z0-9-]{5,11})\b["']?/giu;
    while ((match = labelledPassport.exec(input)) !== null) {
      const value = match[1];
      if ((value.match(/\d/g) || []).length >= 3 && (value.match(/[A-Z]/gi) || []).length <= 3) {
        const index = match.index + match[0].lastIndexOf(value);
        candidates.push({ type: "PASSPORT", value, index, end: index + value.length, priority: 7, labelledOverride: true });
      }
      if (match.index === labelledPassport.lastIndex) labelledPassport.lastIndex += 1;
    }

    const labelledCard = /(?:credit\s+card|payment\s+card|debit\s+card|card)(?:\s+(?:number|no\.?))?(?:[ \t]+\w+){0,3}[ \t]*(?::|is|-)[ \t]*((?:\d[ -]?){11,18}\d)/giu;
    while ((match = labelledCard.exec(input)) !== null) {
      const value = match[1].trim();
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 12 && digits.length <= 19) {
        const index = match.index + match[0].lastIndexOf(match[1]);
        candidates.push({ type: "CARD", value, index, end: index + value.length, priority: 7, labelledOverride: true });
      }
      if (match.index === labelledCard.lastIndex) labelledCard.lastIndex += 1;
    }

    const streetAddress = /\b\d{1,6}[ \t]*,?[ \t]+[\p{L}\p{M}0-9.'’/-]+(?:[ \t]+[\p{L}\p{M}0-9.'’/-]+){0,5}[ \t]+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Terrace|Way|Boulevard|Blvd|Highway|Hwy|Motorway|Bypass|Lodge|Lakes|Lake|Villages|Village|Parkways|Throughway|Tunnel|Path|Trafficway|Valley|Plains|Mission|Pines|Forks?|Circles?|Circle|Drives?|Union|Hill|Hills|Crest|Course|Extensions?|Gardens?|Garden|Groves?|Grove|Manor|Meadows?|Junctions?|Centers?|Trace|Summit|Trail|Turnpike|Station|Plaza|Square|Key|Cape|Isle|Locks?|Shoals?|Ports?|Views?|Heights?|Corners?|Corner|Club|Forest|Creek|Spring|Springs|Alley|Ville|Mountain|Mount|Brooks|Forge|Landing|Ferry|Ways|Hollow|Ridge|Wells|Mills|Knolls|Crossing|Green|Point|Rest|Gap|Prairie|Bend|Row|Run|Branch|Loop|Court|Ct|Island|Parkway|Gate|Pike|Vista|Woods|Wynd|Common)(?![ \t]+[\p{Lu}][\p{L}\p{M}])(?:,?[ \t]+(?:Apt|Apartment|Suite|Unit|Studio|Flat)\.?[ \t]*[A-Z0-9-]+)?(?:,(?![ \t]*(?:Name|City|State|Zip|Postal|Email|Phone|Tel|Contact|Date|Account)\b)[ \t]*[\p{L}\p{M}0-9.'’ -]{2,32}){0,4}\b/giu;
    while ((match = streetAddress.exec(input)) !== null) {
      candidates.push({ type: "ADDRESS", value: match[0], index: match.index, end: match.index + match[0].length, priority: 6 });
      if (match.index === streetAddress.lastIndex) streetAddress.lastIndex += 1;
    }

    // Cue-gated addresses may omit the street-suffix word ("street address at
    // Vicolo Lucio, 2"). Captured text is validated in JS: it must contain a
    // house number or postcode digit, or end with a street suffix.
    const SUFFIX_TAIL = /(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Highway|Hwy|Valley|Plains|Pines|Gardens?|Manor|Meadows?|Court|Terrace|Way|Lane|Drive|Park|Close|Walk|Row|View|Place|Loke|Gate|Wharf|Quay|Street|Gardens)$/i;
    const cueAddress = /\b(?:street[ \t]+address|mailing[ \t]+address|residential[ \t]+address|billing[ \t]+address|address|residing[ \t]+at|located[ \t]+at)[ \t]*(?:of|is|:|-|at)?[ \t]*((?:\d{1,6}[ \t]*,?[ \t]*)?[A-Z0-9][\p{L}\p{M}0-9.'’-]*(?:[ \t]+[\p{L}\p{M}0-9.'’-]+){0,6}(?:,[ \t]*[\p{L}\p{M}0-9.'’ -]{2,32}){0,3})/giu;
    while ((match = cueAddress.exec(input)) !== null) {
      const value = match[1].trim();
      const plausible = /\d/.test(value) || SUFFIX_TAIL.test(value);
      // Letterless values are identifiers (IPv4, coordinates), not addresses.
      const letterless = !/[A-Za-z\u00C0-\u024F\u0370-\u04FF]{2}/.test(value);
      if (plausible && !letterless && !/^[<\[]/.test(value)) {
        const index = match.index + match[0].lastIndexOf(match[1]) + match[1].indexOf(value);
        candidates.push({ type: "ADDRESS", value, index, end: index + value.length, priority: 5 });
      }
      if (match.index === cueAddress.lastIndex) cueAddress.lastIndex += 1;
    }

    const NAME_CORE = "[\\p{Lu}][\\p{L}\\p{M}'’-]{1,}";
    const NAME_TAIL = `(?:[ \\t]+(?:[\\p{Lu}]\\.[ \\t]+)?${NAME_CORE}){0,3}`;
    const labelledValues = [
      ["PERSON", new RegExp(String.raw`(?:Nombre|Nom|Nome|नाम|পূর্ণ\s+নাম|பெயர்)\s*(?:is|:|-|है)\s*(${PERSON_SEQUENCE})`, "giu")],
      ["PERSON", new RegExp(String.raw`(?:such\s+as|named|account\s+of|belongs\s+to)\s+(${PERSON_TOKEN}(?:[ \t]+${PERSON_TOKEN}){1,4})(?=['’]s\b)`, "giu")],
      ["ADDRESS", /(?:Indirizzo|Direcci[oó]n|Adresse)\s*:\s*([^.;\n]{5,100})/giu],
      ["PERSON", new RegExp(`(?:[Pp]atient|[Bb]eneficiary|[Rr]ecipient|[Aa]ccount [Hh]older|Full Legal Name|Full Name|Applicant Name|Provider Name|Account Name|Cardholder Name|Customer Name|[Bb]orrower|[Ss]hipper|[Cc]onsignee|[Ss]eller|[Bb]uyer|[Cc]laimant|[Ii]nsured|[Pp]aid to|[Cc]ontact|[Uu]ser|[Ss]ignature|(?<![A-Za-z])[Nn]ame)\\s*(?:name\\s*)?(?:is|:|-)\\s*((?:Dr\\.?[ \\t]+)?${NAME_CORE}${NAME_TAIL})(?=[ \\t]+(?:Date|Address|Phone|Email|Account|Policy|Street|Property|New Loan)\\b\\s*:|[.,;|\\n]|$)`, "gu")],
      ["PERSON", /\bmy\s+name\s+is\s+([A-Z][\p{L}\p{M}'’-]{1,}(?:\s+[A-Z][\p{L}\p{M}'’-]{1,}){0,3})/giu],
      ["PERSON", /\bDear\s+([A-Z][\p{L}\p{M}'’-]{1,}(?:\s+[A-Z][\p{L}\p{M}'’-]{1,}){0,3})(?=,)/gu],
      ["PERSON", /\bbetween\s+((?:Dr\.?[ \t]+)?[\p{Lu}][\p{L}\p{M}'’-]{1,}(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’-]{1,}){0,3})(?=[ \t]*[,.;\n])/gu],
      ["PERSON", /\bSincerely,?[ \t\n]+((?:Dr\.?[ \t]+)?[\p{Lu}][\p{L}\p{M}'’-]{1,}(?:[ \t]+[\p{Lu}][\p{L}\p{M}'’-]{1,}){0,3})(?=[.,;\n]|$)/giu],
      ["PERSON", /(?:^|\n)[ \t]*((?:Dr\.?[ \t]+)?[\p{Lu}][\p{L}\p{M}'’-]{2,})[ \t]*,(?=\n)/gmu],
      ["PERSON", /(?:मरीज|रोगी|लाभार्थी|प्राप्तकर्ता)\s*(?:का नाम\s*)?(?:है|:|-)\s*([\p{L}\p{M}'’-]{2,}(?:\s+[\p{L}\p{M}'’-]{2,}){1,3})/gu],
      ["ADDRESS", /(?:Residential address|residential address|Delivery address|delivery address|Home address|home address)\s*(?:is|:|-)\s*([^.;\n]{8,100})/gu],
      ["ADDRESS", /(?:घर का पता|डिलीवरी पता|आवासीय पता)\s*(?:है|:|-)?\s*([^.;\n]{5,100})/gu],
      ["HEALTH", /(?:Diagnosis|diagnosis|Medical condition|medical condition|Health condition|health condition|Allergy|allergy)\s*(?:is|:|-)\s*([^.;\n]{3,100})/gu],
      ["HEALTH", /(?:बीमारी|रोग|स्वास्थ्य स्थिति|एलर्जी)\s*(?:है|:|-)?\s*([^.;\n]{3,100})/gu]
    ];
    const greetingBlocklist = /^(?:Hello|Hi|Hey|Thanks|Thank|Regards|Best|Kind|Please|Note|Warning|Subject|Date|From|To|OK|Okay|Done|Yes|No|Dear|Sincerely|Welcome|Sorry|Congratulations|Greetings)$/i;
    for (const [type, regex] of labelledValues) {
      regex.lastIndex = 0;
      while ((match = regex.exec(input)) !== null) {
        const value = match[1].trim();
        if (/^<[A-Z0-9_]+(?::[A-F0-9]{6,})?>/i.test(value)) continue;
        if (type === "PERSON" && /^(?:policyholder|borrower|customer|applicant|recipient|beneficiary|patient|user)$/i.test(value)) continue;
        if (type === "PERSON" && greetingBlocklist.test(value)) continue;
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
    EMAIL_BRACKETED.lastIndex = 0;
    let bracketed;
    while ((bracketed = EMAIL_BRACKETED.exec(normalizedInput)) !== null) {
      // Below structured spans: a plain email detection wins overlaps.
      candidates.push({ type: "EMAIL", value: input.slice(bracketed.index, bracketed.index + bracketed[0].length), index: bracketed.index, end: bracketed.index + bracketed[0].length, priority: 2 });
    }
    addContextualMatches(input, normalizedInput, candidates);
    addLibphonenumberMatches(input, candidates);

    const contextualValues = candidates.filter((item) => item.priority >= 6 && ["PERSON", "ADDRESS", "HEALTH"].includes(item.type));
    const lowerInput = input.toLocaleLowerCase();
    for (const item of contextualValues) {
      const lowerValue = item.value.toLocaleLowerCase();
      if (lowerValue.length < 3) continue;
      let from = 0;
      while (from < lowerInput.length) {
        const index = lowerInput.indexOf(lowerValue, from);
        if (index === -1) break;
        // Repeat copies stay below structured detections so a person name
        // repeated inside an email/URL never erases that email detection.
        candidates.push({ ...item, priority: 2, value: input.slice(index, index + item.value.length), index, end: index + item.value.length });
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

  const api = { AliasVault, findPII, redactText, luhn, verhoeff, hashText, normalizeType, libphonenumberActive: () => loadLibphonenumber() !== null };
  root.PrivacyPII = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
