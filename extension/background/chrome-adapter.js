"use strict";

async function configurePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

function bindToolbarAction() {}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL("visual/offscreen.html");
  if (chrome.runtime.getContexts) {
    const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
    if (existing.length) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: "visual/offscreen.html",
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: "Run local OCR and image processing without sending screenshots off-device"
    });
  } catch (error) {
    if (!/single offscreen|already exists/i.test(error?.message || "")) throw error;
  }
}

async function runVisualOperation(type, payload) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ target: "offscreen", type, ...payload });
}

globalThis.StrawHatsBrowserAdapter = Object.freeze({ configurePanel, bindToolbarAction, runVisualOperation });
