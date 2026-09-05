"use strict";

async function configurePanel() {}

function bindToolbarAction() {
  chrome.action.onClicked.addListener(() => chrome.sidebarAction.toggle().catch(() => {}));
}

async function runVisualOperation(type, payload) {
  const visual = globalThis.StrawHatsVisual;
  if (type === "OCR_IMAGE" && visual?.runOCR) return visual.runOCR(payload.dataUrl);
  if (type === "REDACT_IMAGE" && visual?.redactImage) return visual.redactImage(payload.dataUrl, payload.boxes);
  throw new Error("Firefox local visual processor is unavailable");
}

globalThis.StrawHatsBrowserAdapter = Object.freeze({ configurePanel, bindToolbarAction, runVisualOperation });
