(function initAgentProtocol(root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  const Egress = node ? require("./privacy-egress.js") : root.PrivacyEgress;
  const Actions = node
    ? require("./action-policy.js")
    : root.PrivacyActionPolicy;
  const text = (maxLength = 4000) => ({ type: "string", maxLength });
  const integer = { type: "integer", minimum: 0 };
  const object = (properties) => ({
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  });
  const array = (items, maxItems) => ({ type: "array", items, maxItems });
  const element = object({
    id: text(100),
    frameId: integer,
    version: { type: "integer", minimum: 1 },
    role: text(80),
    label: text(),
    value: text(),
    semanticType: text(80),
    actionable: { type: "boolean" },
    disabled: { type: "boolean" },
    source: { enum: ["structure", "vision"] },
  });
  const observationSchema = object({
    protocolVersion: { const: 1 },
    sessionId: text(100),
    observationId: text(100),
    safeTask: text(8000),
    page: object({
      origin: text(2000),
      path: text(2000),
      title: text(2000),
      epoch: integer,
    }),
    elements: array(element, 260),
    capabilities: array(
      object({
        token: { type: "string", pattern: "^<[A-Z0-9_]+:[A-F0-9]{24}>$" },
        type: text(80),
        source: { enum: ["user", "task"] },
      }),
      100,
    ),
    history: array(
      object({ action: text(80), status: text(80), reason: text(1000) }),
      8,
    ),
    supportedActions: array(
      {
        enum: Actions.responseSchema.anyOf.map(
          (item) => item.properties.type.enum[0],
        ),
      },
      20,
    ),
    omittedElements: integer,
    unavailableFrames: integer,
  });
  const proposalSchema = object({
    protocolVersion: { const: 1 },
    sessionId: text(100),
    observationId: text(100),
    action: Actions.responseSchema,
  });
  function fail(code) {
    throw new Error(`Agent protocol: ${code}`);
  }
  function validate(value, schema) {
    if (schema.anyOf) {
      if (
        !schema.anyOf.some((choice) => {
          try {
            validate(value, choice);
            return true;
          } catch (_) {
            return false;
          }
        })
      )
        fail("INVALID_ACTION");
      return;
    }
    if (schema.const !== undefined && value !== schema.const) fail("VERSION");
    if (schema.enum && !schema.enum.includes(value)) fail("ENUM");
    if (!schema.type) return;
    if (schema.type === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        fail("OBJECT");
      if (
        Object.keys(value).some((key) => !Object.hasOwn(schema.properties, key))
      )
        fail("UNKNOWN_FIELD");
      if (schema.required.some((key) => !Object.hasOwn(value, key)))
        fail("MISSING_FIELD");
      for (const [key, child] of Object.entries(value))
        validate(child, schema.properties[key]);
    } else if (schema.type === "array") {
      if (!Array.isArray(value) || value.length > schema.maxItems)
        fail("ARRAY");
      value.forEach((child) => validate(child, schema.items));
    } else if (schema.type === "integer" || schema.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (schema.type === "integer" && !Number.isInteger(value)) ||
        value < (schema.minimum ?? -Infinity)
      )
        fail("NUMBER");
    } else if (typeof value !== schema.type) fail("TYPE");
    if (typeof value === "string") {
      if (
        value.length > (schema.maxLength ?? 8000) ||
        (schema.pattern && !new RegExp(schema.pattern).test(value))
      )
        fail("STRING");
      if (
        /(?:data:|javascript:|<\/?(?:html|body|script|input|iframe|img|div)\b)/i.test(
          value,
        )
      )
        fail("RAW_CONTENT");
    }
  }
  function serialize(value, schema, knownValues, limit = 24000) {
    validate(value, schema);
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > limit)
      fail("BYTE_LIMIT");
    return Egress.inspectSerialized(serialized, knownValues);
  }
  function createObservation({
    sessionId,
    observationId,
    safeTask,
    context,
    history = [],
    knownValues = [],
  }) {
    if (
      !context.metrics?.graphComplete ||
      context.metrics.pendingScanNodes > 0 ||
      context.metrics.topFrameObserved !== true
    )
      fail("OBSERVATION_NOT_READY");
    const result = {
      protocolVersion: 1,
      sessionId,
      observationId,
      safeTask,
      page: {
        origin: context.page?.origin || "",
        path: context.page?.path || "",
        title: context.page?.title || "",
        epoch: context.page?.epoch || 0,
      },
      elements: (context.elements || []).map((e) => ({
        id: e.id,
        frameId: e.frameId || 0,
        version: e.version,
        role: e.role || "",
        label: e.label || "",
        value: e.value || "",
        semanticType: e.semanticType || "none",
        actionable: Boolean(e.actionable),
        disabled: Boolean(e.disabled),
        source: e.source === "vision" ? "vision" : "structure",
      })),
      capabilities: (context.vaultCapabilities || [])
        .filter((c) => ["user", "task"].includes(c.source))
        .map((c) => ({ token: c.token, type: c.type, source: c.source })),
      history: history
        .slice(-8)
        .map((entry) => ({
          action: entry.action?.type || "unknown",
          status: entry.result?.status || "unknown",
          reason: String(
            entry.result?.reason || entry.action?.reason || "",
          ).slice(0, 1000),
        })),
      supportedActions:
        observationSchema.properties.supportedActions.items.enum,
      omittedElements: 0,
      unavailableFrames: context.metrics.unavailableFrames || 0,
    };
    // Preserve the most useful ranked elements; never truncate capabilities.
    while (
      new TextEncoder().encode(JSON.stringify(result)).byteLength > 24000 &&
      result.elements.length
    ) {
      result.elements.pop();
      result.omittedElements++;
    }
    const serialized = serialize(result, observationSchema, knownValues);
    return { observation: JSON.parse(serialized), serialized };
  }
  function acceptProposal(proposal, observation) {
    validate(proposal, proposalSchema);
    if (
      proposal.sessionId !== observation.sessionId ||
      proposal.observationId !== observation.observationId
    )
      fail("STALE_OBSERVATION");
    if (!observation.supportedActions.includes(proposal.action.type))
      fail("UNSUPPORTED_ACTION");
    const action = JSON.parse(JSON.stringify(proposal.action));
    if (!Actions.validate(action).ok) fail("INVALID_ACTION");
    if (Actions.TARGET_ACTIONS.has(action.type)) {
      const target = observation.elements.find((e) => e.id === action.targetId);
      if (
        !target ||
        target.version !== action.expectedVersion ||
        target.disabled ||
        !target.actionable
      )
        fail("INVALID_TARGET");
    }
    return action;
  }
  const api = {
    observationSchema,
    proposalSchema,
    validate,
    serialize,
    createObservation,
    acceptProposal,
  };
  root.PrivacyAgentProtocol = api;
  if (node) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
