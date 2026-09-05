(function privacyGatewayContent() {
  "use strict";

  if (globalThis.__STRAW_HATS_PRIVACY_GATEWAY__) return;
  globalThis.__STRAW_HATS_PRIVACY_GATEWAY__ = true;

  const PII = globalThis.PrivacyPII;
  const ActionPolicy = globalThis.PrivacyActionPolicy;
  const framePrefix = Math.random().toString(36).slice(2, 7);
  let vault = new PII.AliasVault(`${location.origin}|${framePrefix}`);
  const elementToId = new WeakMap();
  let siblingOrdinalCache = new WeakMap();
  const idToElement = new Map();
  const records = new Map();
  const recordHistory = new Map();
  const privacyReceipts = [];
  let rawMetricTotal = 0;
  let graphMetricTotal = 0;
  const observedRoots = new WeakSet();
  const openShadowRoots = new Set();
  let contextSelectionCache = null;
  let opaqueRegionCache = null;
  let opaqueRegionDirty = true;
  let nextNodeId = 1;
  let task = "";
  let mutationEpoch = 0;
  let pendingMutationRoots = new Set();
  let mutationTimer = null;
  let viewportTimer = null;
  let scanTimer = null;
  let scanGeneration = 0;
  let pendingScanNodes = [];
  let pendingScanReason = "";
  let settings = { userProfile: {} };
  let settingsFingerprint = "";
  let taskScope = "idle";
  let metrics = {
    pageNodesSeen: 0,
    graphNodes: 0,
    actionableNodes: 0,
    sensitiveNodes: 0,
    changedNodesLastBatch: 0,
    reprocessedLastBatch: 0,
    initialScanMs: 0,
    lastMutationMs: 0,
    lastContextBuildMs: 0,
    rawContextBytes: 0,
    safeContextBytes: 0,
    graphApproxBytes: 0,
    rawPiiSent: 0,
    mutationEpoch: 0,
    graphComplete: true,
    pendingScanNodes: 0
  };

  const ACTIONABLE_TAGS = new Set(["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "OPTION", "SUMMARY"]);
  const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "TD", "TH", "LABEL", "LEGEND", "CAPTION"]);
  const ActionRisk = self.PrivacyActionRisk;

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function byteLength(value) {
    try {
      return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).length;
    } catch (_) {
      return JSON.stringify(value).length;
    }
  }

  function stableId(el) {
    if (elementToId.has(el)) return elementToId.get(el);
    const parts = [];
    let current = el;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      const tag = current.tagName.toLowerCase();
      const nativeId = current.id ? `#${current.id}` : "";
      const name = current.getAttribute("name") ? `[name=${current.getAttribute("name")}]` : "";
      const role = current.getAttribute("role") ? `[role=${current.getAttribute("role")}]` : "";
      let ordinal = "";
      if (!nativeId && current.parentElement) {
        if (!siblingOrdinalCache.has(current)) {
          const siblings = Array.from(current.parentElement.children).filter((item) => item.tagName === current.tagName);
          siblings.forEach((item, index) => siblingOrdinalCache.set(item, siblings.length > 1 ? `:${index}` : ""));
        }
        ordinal = siblingOrdinalCache.get(current) || "";
      }
      parts.unshift(`${tag}${nativeId}${name}${role}${ordinal}`);
      if (nativeId) break;
    }
    const base = `e_${framePrefix}_${PII.hashText(parts.join("/"))}`;
    let id = base;
    while (idToElement.has(id) && idToElement.get(id)?.isConnected) id = `${base}_${nextNodeId++}`;
    elementToId.set(el, id);
    idToElement.set(id, el);
    return id;
  }

  function directText(el, maxLength) {
    let output = "";
    for (const child of el.childNodes || []) {
      if (child.nodeType === Node.TEXT_NODE) output += ` ${child.nodeValue || ""}`;
      if (output.length >= maxLength) break;
    }
    return output.replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function isPotentiallyMeaningful(el) {
    if (!(el instanceof Element)) return false;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "SVG", "PATH"].includes(el.tagName)) return false;
    if (ACTIONABLE_TAGS.has(el.tagName) || TEXT_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute("role") || el.hasAttribute("aria-label") || el.hasAttribute("contenteditable")) return true;
    if (el.tagName === "IMG" && (el.getAttribute("alt") || el.getAttribute("title"))) return true;
    return directText(el, 140).length > 1;
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    if (el.closest("[hidden], [aria-hidden='true']")) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
    }
    return true;
  }

  function roleOf(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "img") return "img";
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (["checkbox", "radio"].includes(type)) return type;
      if (["button", "submit", "reset"].includes(type)) return "button";
      if (type === "range") return "slider";
      return "textbox";
    }
    if (/^h[1-6]$/.test(tag)) return "heading";
    return tag;
  }

  function semanticTypeOf(el, label) {
    const haystack = [
      el.getAttribute("type"), el.getAttribute("autocomplete"), el.getAttribute("name"),
      el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label"), label
    ].filter(Boolean).join(" ").toLowerCase();
    // A postal PIN is not a credential. Indian address forms label it "PIN code",
    // and an address must stay fillable without a confirmation prompt.
    if (/pin\s*code|pincode|postal\s*code|\bzip\b/.test(haystack)) return "address";
    if (/password|passcode|(?:upi|atm|card|debit|credit|transaction)\s*pin\b|\bpin\s*number\b/.test(haystack)) return "password";
    if (/e-?mail/.test(haystack)) return "email";
    if (/phone|mobile|telephone|\btel\b/.test(haystack)) return "phone";
    if (/aadhaar|aadhar|uidai/.test(haystack)) return "aadhaar";
    if (/\bpan\b|permanent account/.test(haystack)) return "pan";
    if (/upi|vpa/.test(haystack)) return "upi";
    if (/\botp\b|one.?time password/.test(haystack)) return "otp";
    if (/\bdob\b|date of birth|birth date/.test(haystack)) return "dob";
    if (/diagnosis|medical condition|health condition|disease|allergy|medication/.test(haystack)) return "health";
    if (/ifsc/.test(haystack)) return "ifsc";
    if (/account number|bank account|acct\b/.test(haystack)) return "account";
    if (/cvv|cvc|security code/.test(haystack)) return "secret";
    if (/card|credit|debit/.test(haystack)) return "card";
    if (/address|street|locality|postal|pincode|pin code/.test(haystack)) return "address";
    if (/name|full name|first name|last name/.test(haystack)) return "person";
    if (/search|query/.test(haystack)) return "search";
    return "generic";
  }

  function labelOf(el) {
    const candidates = [
      el.getAttribute("aria-label"),
      el.getAttribute("alt"),
      el.getAttribute("placeholder"),
      el.getAttribute("title")
    ];
    if (el.labels && el.labels.length) {
      candidates.unshift(Array.from(el.labels).map((label) => label.innerText || label.textContent || "").join(" "));
    }
    if (el.getAttribute("aria-labelledby")) {
      const ids = el.getAttribute("aria-labelledby").split(/\s+/);
      candidates.unshift(ids.map((id) => document.getElementById(id)?.textContent || "").join(" "));
    }
    if (el.tagName === "INPUT" && ["button", "submit", "reset"].includes((el.type || "").toLowerCase())) {
      candidates.unshift(el.value);
    }
    candidates.push(directText(el, 180));
    return candidates.find((value) => String(value || "").trim())?.replace(/\s+/g, " ").trim().slice(0, 180) || "";
  }

  function rawValueOf(el) {
    // A label is the caption of its associated control, not a second private
    // value. In particular, the public caption "Password" must not enter the
    // sensitive inventory and block OCR text or alias type names later.
    if (el instanceof HTMLLabelElement && el.control) return "";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.type === "checkbox" || el.type === "radio") return el.checked ? "checked" : "unchecked";
      return String(el.value || "").slice(0, 400);
    }
    if (el.isContentEditable) return String(el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400);
    return directText(el, 400);
  }

  function taskTokens() {
    return new Set(task.toLowerCase().match(/[a-z0-9@._-]{3,}/g) || []);
  }

  function relevanceOf(label, value, actionable) {
    if (!task) return actionable ? 0.75 : 0.35;
    const tokens = taskTokens();
    const haystack = `${label} ${value}`.toLowerCase();
    let hits = 0;
    for (const token of tokens) if (haystack.includes(token)) hits += 1;
    const score = Math.min(1, hits / Math.max(1, Math.min(tokens.size, 4)));
    return Math.max(actionable ? 0.45 : 0.05, score);
  }

  function safeString(raw, semanticType, forceSemantic) {
    return PII.redactText(raw, vault, {
      semanticType: semanticType === "generic" || semanticType === "search" ? null : semanticType,
      forceSemantic: Boolean(forceSemantic)
    });
  }

  function policyFor(sensitivity, relevance, semanticType) {
    if (semanticType === "password" || semanticType === "secret") return "BLOCK";
    if (sensitivity === "critical" || sensitivity === "personal") return relevance > 0.15 ? "TOKENIZE" : "DROP";
    if (relevance < 0.1) return "DROP";
    return "KEEP";
  }

  function processElement(el, reason) {
    if (!(el instanceof Element) || !isPotentiallyMeaningful(el)) return null;
    if (!isVisible(el)) {
      const existingId = elementToId.get(el);
      if (existingId) {
        const existing = records.get(existingId);
        if (existing) {
          rawMetricTotal -= Number(existing.rawMetricBytes || 0);
          graphMetricTotal -= Number(existing.graphMetricBytes || 0);
        }
        records.delete(existingId);
        contextSelectionCache = null;
      }
      return null;
    }
    const started = now();
    const id = stableId(el);
    const previous = records.get(id) || recordHistory.get(id);
    const label = labelOf(el);
    const role = roleOf(el);
    const semanticType = semanticTypeOf(el, label);
    const rawValue = rawValueOf(el);
    const actionable = ACTIONABLE_TAGS.has(el.tagName) || el.hasAttribute("role") || el.isContentEditable;
    const relevance = relevanceOf(label, rawValue, actionable);
    const labelResult = safeString(label, "generic", false);
    const editableValue = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable;
    const forceSemantic = editableValue && rawValue.length > 0 && ["password", "secret", "email", "phone", "aadhaar", "pan", "upi", "card", "person", "address", "otp", "account", "ifsc", "dob", "health"].includes(semanticType);
    const valueResult = safeString(rawValue, semanticType, forceSemantic);
    const sensitivity = valueResult.sensitivity !== "none" ? valueResult.sensitivity : labelResult.sensitivity;
    const policy = policyFor(sensitivity, relevance, semanticType);
    const rect = el.getBoundingClientRect();
    const contentHash = PII.hashText(JSON.stringify({ role, label, rawValue, semanticType, actionable, checked: el.checked, disabled: el.disabled,
      href: el.getAttribute('href'), target: el.getAttribute('target'), type: el.getAttribute('type'),
      formAction: el.form?.action, formMethod: el.form?.method, formTarget: el.form?.target }));
    const version = previous ? previous.version + Number(previous.contentHash !== contentHash) : 1;
    const rawMetricRecord = { id, role, label, value: rawValue, semanticType };
    const graphMetricRecord = {
      id,
      role,
      rawLabel: label,
      rawValue,
      semanticType,
      policy,
      relevance,
      version,
      contentHash
    };
    const record = {
      id,
      role,
      label: labelResult.safe,
      rawLabel: label,
      value: policy === "DROP" ? "" : valueResult.safe,
      rawValue,
      semanticType,
      actionable,
      sensitivity,
      policy,
      relevance,
      version,
      contentHash,
      verified: true,
      epoch: mutationEpoch,
      checked: typeof el.checked === "boolean" ? el.checked : undefined,
      disabled: Boolean(el.disabled),
      bbox: {
        x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)
      },
      lastReason: reason,
      processingMs: now() - started,
      rawMetricBytes: byteLength(rawMetricRecord),
      graphMetricBytes: byteLength(graphMetricRecord)
    };
    const current = records.get(id);
    if (current) {
      rawMetricTotal -= Number(current.rawMetricBytes || 0);
      graphMetricTotal -= Number(current.graphMetricBytes || 0);
    }
    rawMetricTotal += record.rawMetricBytes;
    graphMetricTotal += record.graphMetricBytes;
    records.set(id, record);
    recordHistory.set(id, record);
    contextSelectionCache = null;
    return record;
  }

  function traverse(rootNode, reason, cap) {
    const stack = [];
    if (rootNode instanceof Element) stack.push(rootNode);
    else if (rootNode instanceof Document || rootNode instanceof ShadowRoot) stack.push(...rootNode.children);
    let seen = 0;
    let processed = 0;
    const limit = cap || 12000;
    while (stack.length && seen < limit) {
      const el = stack.pop();
      seen += 1;
      if (processElement(el, reason)) processed += 1;
      if (el.shadowRoot) {
        observeRoot(el.shadowRoot);
        stack.push(...el.shadowRoot.children);
      }
      if (el.children && el.children.length) stack.push(...el.children);
    }
    metrics.pageNodesSeen += seen;
    return { seen, processed, remaining: stack };
  }

  function updateScanState() {
    metrics.pendingScanNodes = pendingScanNodes.length;
    metrics.graphComplete = pendingScanNodes.length === 0;
  }

  function continueFullScan(generation, budget) {
    if (generation !== scanGeneration || !pendingScanNodes.length) {
      updateScanState();
      return;
    }
    let remainingBudget = Math.max(1, Number(budget || 2500));
    while (pendingScanNodes.length && remainingBudget > 0) {
      const root = pendingScanNodes.pop();
      if (!(root instanceof Element) || !root.isConnected) continue;
      const result = traverse(root, pendingScanReason || "continuation", Math.min(500, remainingBudget));
      remainingBudget -= Math.max(1, result.seen);
      if (result.remaining.length) pendingScanNodes.push(...result.remaining);
    }
    refreshCounts();
    updateScanState();
  }

  function scheduleFullScanContinuation(generation) {
    if (scanTimer || generation !== scanGeneration || !pendingScanNodes.length) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      continueFullScan(generation, 2500);
      if (pendingScanNodes.length) scheduleFullScanContinuation(generation);
    }, 0);
  }

  function startFullScan(reason) {
    scanGeneration += 1;
    const generation = scanGeneration;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
    pendingScanReason = reason;
    pendingScanNodes = [];
    const result = traverse(document, reason, 12000);
    pendingScanNodes = result.remaining;
    updateScanState();
    scheduleFullScanContinuation(generation);
    return result;
  }

  function removeSubtree(node) {
    if (!(node instanceof Element)) return;
    const stack = [node];
    while (stack.length) {
      const el = stack.pop();
      const id = elementToId.get(el);
      if (id) {
        const existing = records.get(id);
        if (existing) {
          rawMetricTotal -= Number(existing.rawMetricBytes || 0);
          graphMetricTotal -= Number(existing.graphMetricBytes || 0);
        }
        records.delete(id);
        idToElement.delete(id);
        contextSelectionCache = null;
      }
      if (el.shadowRoot) stack.push(...el.shadowRoot.children);
      stack.push(...el.children);
    }
  }

  function refreshCounts() {
    let actionableNodes = 0;
    let sensitiveNodes = 0;
    for (const record of records.values()) {
      if (record.actionable) actionableNodes += 1;
      if (record.sensitivity !== "none") sensitiveNodes += 1;
    }
    metrics.graphNodes = records.size;
    metrics.actionableNodes = actionableNodes;
    metrics.sensitiveNodes = sensitiveNodes;
    metrics.mutationEpoch = mutationEpoch;
  }

  function flushMutations() {
    const roots = Array.from(pendingMutationRoots);
    pendingMutationRoots = new Set();
    mutationTimer = null;
    if (!roots.length) return;
    const started = now();
    mutationEpoch += 1;
    let reprocessed = 0;
    for (const rootNode of roots.slice(0, 120)) {
      if (rootNode instanceof Element && rootNode.isConnected) {
        const result = traverse(rootNode, "mutation", 500);
        reprocessed += result.processed;
        for (const pending of result.remaining) pendingMutationRoots.add(pending);
      }
    }
    for (const pending of roots.slice(120)) pendingMutationRoots.add(pending);
    refreshCounts();
    metrics.changedNodesLastBatch = roots.length;
    metrics.reprocessedLastBatch = reprocessed;
    metrics.lastMutationMs = now() - started;
    if (pendingMutationRoots.size && !mutationTimer) mutationTimer = setTimeout(flushMutations, 0);
  }

  const observer = new MutationObserver((mutations) => {
    opaqueRegionDirty = true;
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        siblingOrdinalCache = new WeakMap();
        for (const node of mutation.removedNodes) removeSubtree(node);
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) pendingMutationRoots.add(node);
        }
        if (mutation.target instanceof Element) pendingMutationRoots.add(mutation.target);
      } else if (mutation.type === "characterData") {
        if (mutation.target.parentElement) pendingMutationRoots.add(mutation.target.parentElement);
      } else if (mutation.target instanceof Element) {
        pendingMutationRoots.add(mutation.target);
      }
    }
    if (!mutationTimer) mutationTimer = setTimeout(flushMutations, 35);
  });

  function observeRoot(rootNode) {
    if (!rootNode || observedRoots.has(rootNode)) return;
    observedRoots.add(rootNode);
    if (rootNode instanceof ShadowRoot) openShadowRoots.add(rootNode);
    observer.observe(rootNode, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "aria-labelledby", "aria-hidden", "role", "value", "checked", "disabled", "placeholder", "class", "style", "href", "target", "action", "method", "type", "formaction", "formtarget"]
    });
  }

  function privacyScopeOrigin() {
    return location.origin;
  }

  function mayUsePrivateCapabilities() {
    try {
      const ancestors = Array.from(location.ancestorOrigins || []);
      return !ancestors.length || ancestors[ancestors.length - 1] === location.origin;
    } catch (_) { return window === top; }
  }

  function resetVault() {
    const seed = settings.aliasSeed || "local-session";
    vault = new PII.AliasVault(`${seed}|${privacyScopeOrigin()}|${taskScope}`);
    if (mayUsePrivateCapabilities()) vault.registerUserProfile(settings.userProfile || {});
  }

  function publicRecord(record) {
    return {
      id: record.id,
      role: record.role,
      label: record.label,
      value: record.value,
      semanticType: record.semanticType,
      actionable: record.actionable,
      sensitivity: record.sensitivity,
      policy: record.policy,
      relevance: Number(record.relevance.toFixed(2)),
      version: record.version,
      checked: record.checked,
      disabled: record.disabled,
      bbox: record.bbox
    };
  }

  function collectOpaqueRegions() {
    if (!opaqueRegionDirty && opaqueRegionCache) return opaqueRegionCache;
    const output = [];
    const roots = [document, ...openShadowRoots];
    for (const rootNode of roots) {
      for (const el of rootNode.querySelectorAll?.("canvas, video, embed, object") || []) {
        if (!isVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 30) continue;
        let kind = el.tagName.toLowerCase();
        const type = (el.getAttribute("type") || "").toLowerCase();
        if ((kind === "embed" || kind === "object") && type.includes("pdf")) kind = "pdf";
        output.push({
          kind,
          bbox: {
            x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)
          },
          viewportShare: Number(Math.min(1, (rect.width * rect.height) / Math.max(1, innerWidth * innerHeight)).toFixed(3))
        });
      }
    }
    opaqueRegionCache = output.slice(0, 30);
    opaqueRegionDirty = false;
    return opaqueRegionCache;
  }

  function buildContext() {
    const started = now();
    if (!contextSelectionCache) {
      const all = Array.from(records.values());
      const candidates = all.filter((record) => !["DROP", "BLOCK"].includes(record.policy) && (record.actionable || record.relevance >= 0.12));
      const visibleRank = record => {
        const box = idToElement.get(record.id)?.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0 ? 1 : 0;
      };
      candidates.sort((a, b) => visibleRank(b) - visibleRank(a) || Number(b.actionable) - Number(a.actionable) || b.relevance - a.relevance || a.id.localeCompare(b.id));
      contextSelectionCache = {
        selected: candidates.slice(0, 220),
        sensitive: all.filter((record) => record.sensitivity !== "none")
      };
    }
    const selected = contextSelectionCache.selected;
    const safeElements = selected.map(publicRecord);
    const context = {
      page: {
        origin: PII.redactText(location.origin, vault).safe,
        path: PII.redactText(location.pathname, vault).safe,
        title: PII.redactText(document.title, vault).safe,
        viewport: { width: innerWidth, height: innerHeight },
        epoch: mutationEpoch
      },
      elements: safeElements,
      opaqueRegions: collectOpaqueRegions(),
      vaultCapabilities: vault.capabilities(true),
      metrics: { ...metrics }
    };
    metrics.rawContextBytes = Math.max(0, rawMetricTotal);
    metrics.graphApproxBytes = Math.max(0, graphMetricTotal);
    metrics.safeContextBytes = byteLength(context);
    metrics.lastContextBuildMs = now() - started;
    context.metrics = { ...metrics };

    const sensitive = contextSelectionCache.sensitive;
    const localPreview = sensitive.slice(0, 12).map((record) => ({
      id: record.id,
      local: record.rawValue || record.rawLabel || "[sensitive field]",
      hasRawValue: Boolean(record.rawValue),
      safe: record.value || record.label || `<${record.semanticType.toUpperCase()}>`,
      policy: record.policy,
      type: record.semanticType,
      sensitivity: record.sensitivity
    }));
    const egressInventory = [];
    for (const record of sensitive) {
      const candidates = [["value", record.rawValue]];
      if (PII.findPII(String(record.rawLabel || "")).length) candidates.push(["label", record.rawLabel]);
      for (const [field, value] of candidates) {
        const raw = String(value || "").trim();
        if (raw.length >= 3) egressInventory.push({ id: record.id, field, type: record.semanticType, value: raw });
      }
    }
    return { context, localPreview, egressInventory };
  }

  function actionTarget(action) {
    if (!action || !action.targetId) return null;
    const el = idToElement.get(action.targetId);
    if (!el || !el.isConnected) return null;
    return el;
  }

  function fieldAcceptsAction(el, actionType) {
    if (actionType === "fill") return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable;
    if (actionType === "select") return el instanceof HTMLSelectElement;
    if (actionType === "click") return true;
    if (actionType === "press") return true;
    return true;
  }

  // Page-derived evidence about the form a control belongs to. Risk decisions read
  // this and never the planner prose, so an unchanged page classifies the same way
  // on every run.
  function formDescriptor(el) {
    const form = el && el.form ? el.form : null;
    if (!form) return { inForm: false, formText: "", formIsSearch: false, formHasPaymentField: false };
    const fields = Array.from(form.querySelectorAll("input, textarea, select"));
    const hintsOf = (field) => [
      field.name, field.id, field.placeholder,
      field.getAttribute("aria-label"), field.getAttribute("autocomplete")
    ].filter(Boolean).join(" ");
    const formHasPaymentField = fields.some((field) => {
      const autocomplete = String(field.getAttribute("autocomplete") || "").toLowerCase();
      if (field.type === "password" || autocomplete.startsWith("cc-")) return true;
      return ActionRisk.PAYMENT_FIELD.test(hintsOf(field));
    });
    const hasSearchField = form.getAttribute("role") === "search" || fields.some((field) => {
      if (field.type === "search" || field.name === "q" || field.name === "field-keywords") return true;
      if (field.getAttribute("role") === "searchbox") return true;
      return field.type === "text" && /search|query|keyword/i.test(hintsOf(field));
    });
    const method = String(form.getAttribute("method") || "get").toLowerCase();
    return {
      inForm: true,
      formText: `${form.getAttribute("action") || ""} ${String(form.innerText || "").slice(0, 4000)}`,
      formIsSearch: method === "get" && hasSearchField && !formHasPaymentField,
      formHasPaymentField
    };
  }

  function submitControl(el) {
    const controlType = String((el && el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
    if (el instanceof HTMLButtonElement) return !controlType || controlType === "submit";
    return el instanceof HTMLInputElement && controlType === "submit";
  }

  function actionRisk(action, record, el) {
    return ActionRisk.classify({
      actionType: action.type,
      key: action.key,
      isTextInput: el instanceof HTMLInputElement && !["submit", "button", "reset"].includes(el.type),
      label: record ? record.rawLabel : "",
      semanticType: record ? record.semanticType : null,
      sensitivity: record ? record.sensitivity : "none",
      isSubmitControl: submitControl(el) || (action.type === "press" && String(action.key || "Enter") === "Enter" && Boolean(el.form) && el instanceof HTMLInputElement),
      alwaysConfirmSensitiveFill: Boolean(settings.policy && settings.policy.alwaysConfirmSensitiveFill),
      ...formDescriptor(el)
    });
  }

  function resolveActionValue(value, record, consume) {
    const raw = String(value == null ? "" : value);
    const tokenMatch = raw.match(/^<[A-Z0-9_]+:[A-F0-9]{24}>$/);
    if (!tokenMatch) return { ok: true, value: raw, usedToken: null };
    const resolved = vault.resolveForUse(raw, { action: "fill", semanticType: record?.semanticType, consume });
    if (!resolved.ok) return resolved;
    return { ok: true, value: resolved.value, usedToken: raw };
  }

  function validateAction(action, confirmed) {
    const shape = ActionPolicy.validate(action);
    if (!shape.ok) return { ok: false, status: "blocked", reason: shape.reason };
    if (["scroll", "wait", "done"].includes(action.type)) return { ok: true, status: "allowed", risk: "low" };
    const el = actionTarget(action);
    if (!el) return { ok: false, status: "blocked", reason: "Target no longer exists" };
    processElement(el, 'action revalidation');
    const record = records.get(action.targetId);
    if (!record) return { ok: false, status: "blocked", reason: "Target is not in the current privacy graph" };
    if (["click", "press"].includes(action.type) && !record.actionable) {
      return { ok: false, status: "blocked", reason: "Target is not actionable" };
    }
    if (Number(action.expectedVersion) !== record.version) {
      return { ok: false, status: "blocked", reason: "Target changed after the agent observed it" };
    }
    if (record.disabled) return { ok: false, status: "blocked", reason: "Target is disabled" };
    if (!fieldAcceptsAction(el, action.type)) return { ok: false, status: "blocked", reason: "Action does not match target type" };
    if (action.type === "fill") {
      const resolved = resolveActionValue(action.value, record, false);
      if (!resolved.ok) return { ok: false, status: "blocked", reason: resolved.error };
    }
    const assessment = actionRisk(action, record, el);
    const risk = assessment.risk;
    if (["high", "critical"].includes(risk) && !confirmed) {
      return {
        ok: false,
        status: "needs_confirmation",
        reason: assessment.reason,
        risk,
        target: { id: record.id, label: record.label, role: record.role, semanticType: record.semanticType }
      };
    }
    return { ok: true, status: "allowed", risk, record };
  }

  function dispatchInput(el, value) {
    if (el instanceof HTMLInputElement) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      descriptor?.set?.call(el, value);
    } else if (el instanceof HTMLTextAreaElement) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      descriptor?.set?.call(el, value);
    } else if (el.isContentEditable) {
      el.textContent = value;
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function executeAction(action, confirmed) {
    if (pendingMutationRoots.size) {
      if (mutationTimer) clearTimeout(mutationTimer);
      mutationTimer = null;
      flushMutations();
    }
    const validation = validateAction(action, confirmed);
    if (!validation.ok) return validation;
    if (action.type === "done") return { status: "done", message: action.message || "Task complete" };
    if (action.type === "wait") {
      const ms = Math.min(3000, Math.max(50, Number(action.ms) || 350));
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { status: "executed", action: "wait", ms };
    }
    if (action.type === "scroll") {
      const amount = Math.min(innerHeight * 2, Math.max(160, Number(action.amount) || Math.round(innerHeight * 0.75)));
      const direction = String(action.direction || "down").toLowerCase();
      window.scrollBy({ top: direction === "up" ? -amount : amount, behavior: "smooth" });
      return receipt(action, { status: "executed", risk: "low" });
    }

    const el = actionTarget(action);
    const record = records.get(action.targetId);
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    el.focus({ preventScroll: true });

    let usedToken = null;
    if (action.type === "fill") {
      const resolved = resolveActionValue(action.value, record, true);
      dispatchInput(el, resolved.value);
      usedToken = resolved.usedToken;
    } else if (action.type === "click") {
      // Keep observed links in the controlled tab, so the next observation is
      // the destination rather than the abandoned opener.
      if (el instanceof HTMLAnchorElement && el.target && el.target !== '_self') el.target = '_self';
      el.click();
    } else if (action.type === "select") {
      const desired = String(action.value || "");
      const option = Array.from(el.options).find((item) => item.value === desired || item.text.trim().toLowerCase() === desired.trim().toLowerCase());
      if (!option) return { status: "blocked", reason: "Requested option does not exist" };
      el.value = option.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (action.type === "press") {
      const key = String(action.key || "Enter");
      const activatesControl = key === "Enter" && (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement || (el instanceof HTMLInputElement && ["submit", "button", "reset"].includes(el.type)));
      if (activatesControl) {
        // Scripted keyboard events have no browser default activation behavior.
        if (el instanceof HTMLAnchorElement && el.target && el.target !== '_self') el.target = '_self';
        el.click();
      } else {
        const defaultAllowed = el.dispatchEvent(new KeyboardEvent("keydown", { key, code: key === "Enter" ? "Enter" : key, bubbles: true, cancelable: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { key, code: key === "Enter" ? "Enter" : key, bubbles: true }));
        if (defaultAllowed && key === "Enter" && el instanceof HTMLInputElement && el.form && typeof el.form.requestSubmit === "function") {
          const submitAssessment = ActionRisk.classify({
            actionType: "click",
            label: "",
            isSubmitControl: true,
            ...formDescriptor(el)
          });
          if (!["low", "medium"].includes(submitAssessment.risk) && !confirmed) {
            return { status: "needs_confirmation", risk: submitAssessment.risk, reason: submitAssessment.reason };
          }
          el.form.requestSubmit();
        }
      }
    } else if (action.type === "focus") {
      // scrollIntoView and focus above are the complete operation.
    }

    pendingMutationRoots.add(el);
    if (!mutationTimer) mutationTimer = setTimeout(flushMutations, 25);
    return receipt(action, {
      status: "executed",
      risk: validation.risk,
      usedPrivateToken: usedToken,
      target: { id: record.id, label: record.label, role: record.role }
    });
  }

  function validateVisualAction(action, confirmed) {
    const target = action?.visualTarget;
    if (!target?.bbox) return { ok: false, status: "blocked", reason: "Missing visual target geometry" };
    if (!["click", "press"].includes(action.type)) return { ok: false, status: "blocked", reason: "Visual fallback currently supports click/press actions only" };
    if (Number(action.expectedPageEpoch) !== mutationEpoch) {
      return { ok: false, status: "blocked", reason: "Visual observation is stale; page changed after OCR" };
    }
    const x = Math.round(target.bbox.x + target.bbox.width / 2);
    const y = Math.round(target.bbox.y + target.bbox.height / 2);
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
      return { ok: false, status: "blocked", reason: "Visual target is outside the current viewport" };
    }
    const el = document.elementFromPoint(x, y);
    if (!el) return { ok: false, status: "blocked", reason: "No local element exists at the OCR target" };
    const risk = "high";
    if (risk === "high" && !confirmed) {
      return {
        ok: false,
        status: "needs_confirmation",
        reason: "High-risk visual action requires local user confirmation",
        risk,
        target: { id: target.id, label: target.label, role: "visual_text" }
      };
    }
    return { ok: true, status: "allowed", risk, el, x, y };
  }

  function dispatchVisualClick(el, x, y) {
    if (el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement) {
      for (const type of ["mousedown", "mouseup", "click"]) {
        el.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
          button: 0
        }));
      }
      return;
    }
    el.click();
  }

  async function executeVisualAction(action, confirmed) {
    const validation = validateVisualAction(action, confirmed);
    if (!validation.ok) return validation;
    const { el, x, y } = validation;
    if (action.type === "click") {
      dispatchVisualClick(el, x, y);
    } else {
      const key = String(action.key || "Enter");
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    }
    return receipt(action, {
      status: "executed",
      risk: validation.risk,
      target: { id: action.visualTarget.id, label: action.visualTarget.label, role: "visual_text" }
    });
  }

  function receipt(action, result) {
    const item = {
      at: new Date().toISOString(),
      origin: location.origin,
      action: action.type,
      targetId: action.targetId || null,
      localDecision: result.status,
      risk: result.risk || "low",
      usedPrivateToken: result.usedPrivateToken || null,
      task: PII.redactText(task, vault).safe,
      pageEpoch: mutationEpoch,
      target: result.target || null
    };
    privacyReceipts.unshift(item);
    if (privacyReceipts.length > 50) privacyReceipts.length = 50;
    return { ...result, receipt: item };
  }

  async function applySettings(nextSettings) {
    const merged = {
      ...settings,
      ...(nextSettings || {}),
      userProfile: { ...(settings.userProfile || {}), ...(nextSettings?.userProfile || {}) },
      policy: { ...(settings.policy || {}), ...(nextSettings?.policy || {}) }
    };
    const fingerprint = JSON.stringify(merged);
    if (fingerprint === settingsFingerprint) return;
    settings = merged;
    settingsFingerprint = fingerprint;
    resetVault();
    mutationEpoch += 1;
    const started = now();
    startFullScan("settings");
    refreshCounts();
    metrics.lastMutationMs = now() - started;
  }

  function queueUserEdit(event) {
    const el = event.target;
    if (!(el instanceof Element)) return;
    pendingMutationRoots.add(el);
    if (!mutationTimer) mutationTimer = setTimeout(flushMutations, 20);
  }

  function noteViewportChange() {
    if (viewportTimer) return;
    viewportTimer = setTimeout(() => {
      viewportTimer = null;
      mutationEpoch += 1;
      opaqueRegionDirty = true;
      refreshCounts();
    }, 40);
  }

  function allowedFieldTypesForPrivateType(type) {
    return {
      PERSON: ["person"], EMAIL: ["email"], PHONE: ["phone"], ADDRESS: ["address"], UPI: ["upi"],
      PAN: ["pan"], AADHAAR: ["aadhaar"], CARD: ["card"], SECRET: ["password", "secret"],
      IFSC: ["ifsc"], OTP: ["otp"], ACCOUNT: ["account"], DOB: ["dob"], HEALTH: ["health"]
    }[String(type || "").toUpperCase()] || [];
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return undefined;
    if (message.type === "PING") {
      sendResponse({ ok: true, framePrefix, origin: location.origin, url: location.href, readyState: document.readyState });
      return undefined;
    }
    if (message.type === "SET_TASK") {
      task = String(message.task || "");
      taskScope = String(message.taskScope || crypto.randomUUID());
      resetVault();
      const started = now();
      startFullScan("task");
      refreshCounts();
      metrics.lastMutationMs = now() - started;
      sendResponse({ ok: true });
      return undefined;
    }
    if (message.type === "REGISTER_TASK_VALUES") {
      if (!mayUsePrivateCapabilities()) {
        sendResponse({ ok: true, ignored: "cross-origin-frame" });
        return undefined;
      }
      for (const entity of message.entities || []) {
        if (entity?.type && entity?.value) {
          const allowedSemanticTypes = allowedFieldTypesForPrivateType(entity.type);
          vault.register(entity.type, entity.value, {
            source: "task", scope: "task", allowedActions: allowedSemanticTypes.length ? ["fill"] : [],
            allowedSemanticTypes, maxUses: 3,
            expiresAt: Date.now() + 30 * 60 * 1000
          });
        }
      }
      const started = now();
      startFullScan("task-private-values");
      refreshCounts();
      metrics.lastMutationMs = now() - started;
      sendResponse({ ok: true });
      return undefined;
    }
    if (message.type === "SYNC_SETTINGS") {
      applySettings(message.settings).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message.type === "GET_SAFE_CONTEXT") {
      if (pendingScanNodes.length) continueFullScan(scanGeneration, 10000);
      if (pendingMutationRoots.size) {
        if (mutationTimer) clearTimeout(mutationTimer);
        mutationTimer = null;
        flushMutations();
      }
      sendResponse(buildContext());
      return undefined;
    }
    if (message.type === "PROPOSE_ACTION") {
      executeAction(message.action, false).then(sendResponse);
      return true;
    }
    if (message.type === "PROPOSE_VISUAL_ACTION") {
      executeVisualAction(message.action, false).then(sendResponse);
      return true;
    }
    if (message.type === "EXECUTE_CONFIRMED") {
      executeAction(message.action, true).then(sendResponse);
      return true;
    }
    if (message.type === "EXECUTE_VISUAL_CONFIRMED") {
      executeVisualAction(message.action, true).then(sendResponse);
      return true;
    }
    if (message.type === "GET_DEBUG_STATE") {
      sendResponse({ metrics: { ...metrics }, receipts: privacyReceipts.slice(0, 20), framePrefix });
      return undefined;
    }
    return undefined;
  });

  async function initialize() {
    try {
      const stored = await chrome.storage.local.get(["gatewaySettings"]);
      if (stored.gatewaySettings) settings = stored.gatewaySettings;
    } catch (_) {}
    settingsFingerprint = JSON.stringify(settings);
    resetVault();
    const started = now();
    startFullScan("initial");
    refreshCounts();
    metrics.initialScanMs = now() - started;
    observeRoot(document);
    document.addEventListener("input", queueUserEdit, true);
    document.addEventListener("change", queueUserEdit, true);
    addEventListener("scroll", noteViewportChange, true);
    addEventListener("resize", noteViewportChange, true);
  }

  initialize();
})();
