"use strict";

let workerPromise = null;

function postProgress(message) {
  chrome.runtime.sendMessage({
    source: "gateway-offscreen",
    type: "VISUAL_OCR_PROGRESS",
    status: message.status,
    progress: Number(message.progress || 0)
  }).catch(() => {});
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
      workerPath: chrome.runtime.getURL("vendor/tesseract/worker.min.js"),
      corePath: chrome.runtime.getURL("vendor/tesseract-core"),
      langPath: chrome.runtime.getURL("vendor/lang"),
      workerBlobURL: false,
      cacheMethod: "none",
      logger: postProgress,
      errorHandler: (error) => postProgress({ status: `ocr error: ${error?.message || error}`, progress: 0 })
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function imageDimensions(dataUrl) {
  const comma = String(dataUrl || "").indexOf(",");
  if (comma < 0) throw new Error("OCR image is not a data URL");
  const header = atob(dataUrl.slice(comma + 1, comma + 1 + 48));
  if (header.length < 24 || header.charCodeAt(1) !== 80 || header.charCodeAt(2) !== 78 || header.charCodeAt(3) !== 71) {
    throw new Error("OCR image is not a PNG screenshot");
  }
  const byte = (index) => header.charCodeAt(index) & 0xff;
  const uint32be = (index) => ((byte(index) << 24) | (byte(index + 1) << 16) | (byte(index + 2) << 8) | byte(index + 3)) >>> 0;
  return { width: uint32be(16), height: uint32be(20) };
}

async function runOCR(dataUrl) {
  const started = performance.now();
  const [worker, dimensions] = await Promise.all([getWorker(), imageDimensions(dataUrl)]);
  const result = await worker.recognize(dataUrl, {}, {
    text: true,
    tsv: true,
    blocks: false,
    hocr: false,
    pdf: false,
    imageColor: false,
    imageGrey: false,
    imageBinary: false
  });
  return {
    ok: true,
    text: result.data?.text || "",
    tsv: result.data?.tsv || "",
    confidence: Number(result.data?.confidence || 0),
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
    ocrMs: performance.now() - started
  };
}

async function redactImage(dataUrl, boxes) {
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(bitmap, 0, 0);
  context.fillStyle = "#101418";
  for (const box of boxes || []) {
    const padding = Math.max(4, Math.round(Number(box.height || 0) * 0.16));
    context.fillRect(
      Math.max(0, Number(box.x || 0) - padding),
      Math.max(0, Number(box.y || 0) - padding),
      Math.min(canvas.width, Number(box.width || 0) + padding * 2),
      Math.min(canvas.height, Number(box.height || 0) + padding * 2)
    );
  }
  bitmap.close();
  return { ok: true, dataUrl: canvas.toDataURL("image/png"), redactionCount: (boxes || []).length };
}

globalThis.StrawHatsVisual = Object.freeze({ runOCR, redactImage });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return undefined;
  if (message.type === "OCR_IMAGE") {
    runOCR(message.dataUrl)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message.type === "REDACT_IMAGE") {
    redactImage(message.dataUrl, message.boxes)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message.type === "TERMINATE_OCR") {
    if (workerPromise) {
      workerPromise.then((worker) => worker.terminate()).catch(() => {});
      workerPromise = null;
    }
    sendResponse({ ok: true });
    return undefined;
  }
  return undefined;
});
