(function initBrowserUseClient(root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  const Protocol = node
    ? require("./agent-protocol.js")
    : root.PrivacyAgentProtocol;
  const Egress = node ? require("./privacy-egress.js") : root.PrivacyEgress;
  function endpoint(value) {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error(
        "Use a local Browser Use bridge at http://127.0.0.1:port",
      );
    return url.origin;
  }
  async function request(base, token, route, value, signal) {
    const response = await fetch(base + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(value),
      signal,
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        `Browser Use bridge ${response.status}. Restart the demo launcher or check pairing.`,
      );
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > 160000)
      throw new Error("Browser Use bridge response too large");
    return JSON.parse(text);
  }
  function inspectModelRequest(value, knownValues) {
    if (
      !value ||
      Object.keys(value).some(
        (key) => !["messages", "responseSchema"].includes(key),
      ) ||
      !Array.isArray(value.messages) ||
      value.messages.length !== 2 ||
      !value.responseSchema ||
      typeof value.responseSchema !== "object"
    )
      throw new Error("Invalid Browser Use model request");
    for (const [index, message] of value.messages.entries()) {
      if (
        Object.keys(message).some(
          (key) => !["role", "content"].includes(key),
        ) ||
        message.role !== (index === 0 ? "system" : "user") ||
        typeof message.content !== "string"
      )
        throw new Error("Browser Use requires text-only messages");
    }
    const text = JSON.stringify(value);
    if (
      new TextEncoder().encode(text).byteLength > 100000 ||
      /data:image\/|"image_url"|"input_image"/i.test(text)
    )
      throw new Error("Browser Use model request exceeds privacy limits");
    Egress.inspectSerialized(text, knownValues);
    return value;
  }
  async function plan({
    session,
    settings,
    safeContext,
    history,
    inventory,
    requestModel,
    onObservation,
  }) {
    const base = endpoint(settings.agent.endpoint);
    const token = settings.agent.token;
    if (!token || token.length < 32)
      throw new Error(
        "Browser Use is not paired. Start the Browser Use demo launcher.",
      );
    const knownValues = [
      ...Egress.privateValues(settings, inventory),
      token,
      ...(session.taskPrivateEntities || []).map((e) => e.value),
    ];
    const identity = () =>
      crypto
        .randomUUID()
        .replace(/[0-9]/g, (d) => String.fromCharCode(103 + Number(d)));
    session.agentSessionId ||= identity();
    const { observation, serialized } = Protocol.createObservation({
      sessionId: session.agentSessionId,
      observationId: identity(),
      safeTask: session.safeTask,
      context: safeContext,
      history,
      knownValues,
    });
    onObservation?.(observation);
    const controller = new AbortController();
    session.requestController = controller;
    const timer = setTimeout(() => controller.abort(), 240000);
    let jobId;
    try {
      // The request helper serializes a fresh parse of the exact inspected JSON.
      const prepared = await request(
        base,
        token,
        "/prepare",
        JSON.parse(serialized),
        controller.signal,
      );
      if (
        prepared.engine !== "browser-use/0.13.10" ||
        !/^[a-f0-9]{48}$/.test(prepared.jobId || "")
      )
        throw new Error("Unexpected Browser Use bridge version");
      jobId = prepared.jobId;
      const modelRequest = inspectModelRequest(
        prepared.modelRequest,
        knownValues,
      );
      if (session.cancelled) throw new Error("Task stopped");
      const modelOutput = await requestModel(modelRequest);
      session.requestController = controller;
      if (session.cancelled || session.needsRebind)
        throw new Error(
          "Browser changed or task stopped during Browser Use planning. Run again from the current page.",
        );
      Egress.inspectSerialized(JSON.stringify(modelOutput), knownValues);
      const proposed = await request(
        base,
        token,
        "/complete",
        {
          jobId,
          sessionId: observation.sessionId,
          observationId: observation.observationId,
          modelOutput,
        },
        controller.signal,
      );
      const action = Protocol.acceptProposal(proposed, observation);
      session.acceptedObservation = {
        id: observation.observationId,
        epoch: observation.page.epoch,
        targets: new Map(observation.elements.map((e) => [e.id, e])),
      };
      return action;
    } catch (error) {
      if (jobId)
        request(
          base,
          token,
          "/cancel",
          { jobId },
          AbortSignal.timeout(2000),
        ).catch(() => {});
      if (error.name === "TypeError")
        throw new Error(
          "Browser Use bridge is unavailable. Start the demo launcher and try again.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
      if (session.requestController === controller)
        session.requestController = null;
    }
  }
  const api = { plan, endpoint, inspectModelRequest };
  root.PrivacyBrowserUseClient = api;
  if (node) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
