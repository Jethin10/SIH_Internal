import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "C:\\SIH'\\extension";
const SKILL_DIR = "C:\\Users\\jethi\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.903.11726\\skills\\presentations";
const RUNTIME_PYTHON = "C:\\Users\\jethi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const TMP_DIR = path.join(workspaceDir, ".deck-build");
const FINAL_PPTX = path.join(workspaceDir, "artifacts", "StrawHats_SIH26171_Internal_Presentation_Final.pptx");
const { resolvePresentationFont, applyPresentationChartFont, finalizePresentation } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
const font = resolvePresentationFont();
const evaluation = JSON.parse(await fs.readFile(path.join(workspaceDir, "artifacts", "evaluation-report.json"), "utf8"));

const C = { navy: "#0B1725", paper: "#F5F1E8", ink: "#142231", muted: "#66717B", blue: "#315CF5", teal: "#008F7A", amber: "#F0A11A", red: "#C44236", white: "#FFFFFF", line: "#D8D2C5", pale: "#E9E5DA" };
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function box(slide, x, y, w, h, fill, radius = false, line = "none") {
  return slide.shapes.add({ geometry: radius ? "roundRect" : "rect", position: { left: x, top: y, width: w, height: h }, fill, line: { fill: line, width: line === "none" ? 0 : 1 } });
}
function text(slide, value, x, y, w, h, size = 24, color = C.ink, bold = false, align = "left") {
  const shape = slide.shapes.add({ geometry: "textbox", position: { left: x, top: y, width: w, height: h }, fill: "none", line: { fill: "none", width: 0 } });
  shape.text = value;
  shape.text.style = { typeface: font, fontSize: size, color, bold, alignment: align, autoFit: "shrinkText" };
  return shape;
}
function title(slide, value, number, dark = false) {
  text(slide, value, 70, 42, 1080, 56, 34, dark ? C.white : C.ink, true);
  text(slide, String(number).padStart(2, "0"), 1170, 49, 42, 26, 15, dark ? "#8EA0B0" : C.muted, true, "right");
  box(slide, 70, 112, 1140, 2, dark ? "#2A3A4A" : C.line);
}
function notes(slide, value) { slide.speakerNotes.textFrame.setText(value); }
function arrow(slide, x, y, w = 74) { box(slide, x, y, w, 34, C.blue, false); box(slide, x + w - 3, y - 9, 28, 52, C.blue, false); }

// 1
{
  const s = p.slides.add(); s.background.fill = C.navy;
  box(s, 70, 76, 10, 494, C.teal);
  text(s, "STRAW HATS  /  SIH 26171", 108, 80, 680, 32, 17, "#70D7C8", true);
  text(s, "Privacy Gateway\nfor Browser Agents", 108, 156, 900, 190, 58, C.white, true);
  text(s, "A local boundary between what an AI model can request and what a browser may disclose or execute.", 110, 385, 820, 96, 24, "#C9D2DA");
  text(s, "Internal hackathon presentation  ·  September 2026", 110, 610, 760, 28, 16, "#8EA0B0");
  box(s, 1010, 122, 145, 145, C.blue, true);
  text(s, "0 raw\nin test", 1028, 156, 108, 80, 25, C.white, true, "center");
  notes(s, "Open with the problem statement, then move directly to the live product. Product source: extension/README.md.");
}

// 2
{
  const s = p.slides.add(); s.background.fill = C.paper; title(s, "The browser-agent privacy gap", 2);
  text(s, "Most agent loops combine two broad powers", 70, 150, 700, 42, 25, C.muted);
  text(s, "SEE", 90, 238, 170, 44, 36, C.red, true);
  text(s, "Full DOM text\nForm values\nScreenshots", 90, 300, 300, 170, 28, C.ink, true);
  box(s, 450, 205, 2, 340, C.line);
  text(s, "ACT", 520, 238, 170, 44, 36, C.red, true);
  text(s, "Click controls\nFill fields\nSubmit forms", 520, 300, 300, 170, 28, C.ink, true);
  box(s, 880, 170, 280, 360, C.navy, true);
  text(s, "The missing layer", 915, 210, 210, 38, 24, "#70D7C8", true);
  text(s, "A local policy boundary that minimizes context before reasoning and validates every proposed action before execution.", 915, 278, 205, 190, 25, C.white, true);
  notes(s, "Frame the problem as excessive observation plus excessive execution authority. Avoid claiming every current agent behaves identically.");
}

// 3
{
  const s = p.slides.add(); s.background.fill = C.paper; title(s, "The product boundary", 3);
  text(s, "The model proposes. The gateway decides.", 70, 145, 1040, 54, 36, C.blue, true);
  const items = [
    ["OBSERVATION", "Build a local privacy graph from DOM, ARIA, forms, frames and visible OCR."],
    ["DISCLOSURE", "Replace private values with random task aliases and inspect the complete outbound payload."],
    ["EXECUTION", "Revalidate target, version, field type, task scope and risk before any browser action."],
    ["EVIDENCE", "Show masks, egress state, timing and local receipts inside the side panel."]
  ];
  items.forEach((item, i) => {
    const y = 242 + i * 92;
    text(s, String(i + 1).padStart(2, "0"), 82, y, 52, 36, 23, C.teal, true);
    text(s, item[0], 155, y, 220, 34, 21, C.ink, true);
    text(s, item[1], 390, y - 2, 760, 58, 21, C.muted);
    if (i < 3) box(s, 155, y + 66, 995, 1, C.line);
  });
  notes(s, "Every claim on this slide maps to shipped code in content/, background/, visual/ and sidepanel/.");
}

// 4
{
  const s = p.slides.add(); s.background.fill = C.navy; title(s, "System architecture", 4, true);
  const nodes = [
    [80, "WEB PAGE", "DOM · ARIA\nforms · frames"],
    [330, "LOCAL GATEWAY", "privacy graph\nPII policy · vault"],
    [620, "SAFE PLANNER", "local server or\nHTTPS endpoint"],
    [910, "LOCAL FIREWALL", "scope · version\nrisk · confirmation"]
  ];
  nodes.forEach(([x, h, b], i) => {
    box(s, x, 235, 220, 220, i === 1 || i === 3 ? "#102E3B" : "#162536", true, "#314454");
    text(s, h, x + 24, 270, 172, 32, 20, i === 1 || i === 3 ? "#70D7C8" : C.white, true);
    text(s, b, x + 24, 330, 172, 80, 21, "#C9D2DA");
    if (i < 3) text(s, "›", x + 226, 312, 82, 70, 56, "#5D7B92", true, "center");
  });
  box(s, 330, 505, 220, 54, C.teal, true);
  text(s, "RAW VALUES STAY HERE", 345, 520, 190, 24, 16, C.white, true, "center");
  text(s, "safe context", 548, 196, 106, 24, 15, "#8EA0B0", true, "center");
  text(s, "structured action", 803, 196, 138, 24, 15, "#8EA0B0", true, "center");
  text(s, "Only validated actions reach the page", 720, 590, 440, 40, 24, C.white, true, "right");
  notes(s, "Architecture evidence: background/service-worker.js, content/content-script.js, server/server.js and visual/offscreen.js.");
}

// 5
{
  const s = p.slides.add(); s.background.fill = C.paper; title(s, "Privacy graph and private capabilities", 5);
  text(s, "Raw page value", 80, 165, 260, 34, 20, C.muted, true);
  text(s, "test.user@example.com", 80, 218, 380, 48, 28, C.red, true);
  text(s, "Local tokenization", 80, 318, 260, 34, 20, C.muted, true);
  text(s, "<EMAIL: 96-bit random ID>", 80, 370, 390, 52, 27, C.teal, true);
  box(s, 520, 152, 2, 410, C.line);
  text(s, "Every graph node carries", 580, 160, 500, 36, 24, C.ink, true);
  const lines = [
    ["semantic identity", "Stable target ID, role, label and field type"],
    ["freshness", "Content hash, mutation epoch and positive version"],
    ["disclosure", "KEEP, TOKENIZE, DROP or BLOCK"],
    ["execution limits", "Origin, task, destination field, expiry and use count"]
  ];
  lines.forEach((line, i) => {
    const y = 225 + i * 82;
    text(s, line[0], 580, y, 230, 32, 21, C.blue, true);
    text(s, line[1], 820, y, 345, 52, 20, C.muted);
  });
  text(s, "Aliases rotate with every task and origin change.", 80, 550, 1030, 44, 28, C.ink, true);
  notes(s, "The displayed token is explanatory; the implementation uses uppercase hexadecimal without spaces. Evidence: lib/pii.js and background/service-worker.js.");
}

// 6
{
  const s = p.slides.add(); s.background.fill = C.paper; title(s, "Local visual redaction", 6);
  const imageBytes = await fs.readFile(path.join(workspaceDir, "artifacts", "product-ui.png"));
  s.images.add({ blob: new Uint8Array(imageBytes), contentType: "image/png", alt: "StrawHats side panel showing raw and safe context plus a locally masked screenshot", fit: "contain", position: { left: 70, top: 132, width: 440, height: 535 } });
  text(s, "Canvas text becomes usable without sending pixels to the planner", 570, 154, 600, 92, 34, C.ink, true);
  const points = [
    ["1", "Capture the visible tab locally"],
    ["2", "Run bundled Tesseract OCR"],
    ["3", "Tokenize detected private text"],
    ["4", "Paint masks into a local preview"],
    ["5", "Require pixel freshness before visual clicks"]
  ];
  points.forEach((point, i) => {
    const y = 282 + i * 64;
    text(s, point[0], 580, y, 34, 30, 18, C.teal, true, "center");
    text(s, point[1], 632, y, 510, 34, 21, C.muted, i === 4);
  });
  text(s, `${evaluation.e2e.visualRedactions} sensitive regions masked in the controlled fixture`, 575, 610, 570, 34, 22, C.blue, true);
  notes(s, "Screenshot generated by scripts/capture-product-ui.js from the running extension. Controlled result: 3 of 3 labelled Canvas targets recovered and 100% of OCR-detected sensitive lines masked. Source: artifacts/evaluation-report.json.");
}

// 7
{
  const s = p.slides.add(); s.background.fill = C.paper; title(s, "Local action firewall", 7);
  const steps = [
    ["PROPOSE", "Planner returns one structured action"],
    ["REVALIDATE", "Target, version, task scope and origin"],
    ["ASSESS", "Field compatibility and side-effect risk"],
    ["DECIDE", "Execute, block or request allow-once confirmation"]
  ];
  steps.forEach((step, i) => {
    const x = 75 + i * 292;
    text(s, String(i + 1).padStart(2, "0"), x, 170, 50, 32, 19, C.teal, true);
    box(s, x, 220, 240, 205, i === 3 ? C.navy : C.white, true, i === 3 ? C.navy : C.line);
    text(s, step[0], x + 24, 250, 195, 32, 20, i === 3 ? "#70D7C8" : C.blue, true);
    text(s, step[1], x + 24, 308, 190, 88, 22, i === 3 ? C.white : C.ink, true);
    if (i < 3) text(s, "›", x + 240, 284, 52, 60, 48, C.muted, true, "center");
  });
  box(s, 75, 500, 1130, 2, C.line);
  text(s, "Navigation clears stale visual state and pending confirmation. Origin changes also rotate every private capability.", 90, 536, 1080, 82, 27, C.ink, true, "center");
  notes(s, "Demo both outcomes: block Submit order, then repeat and allow once. Evidence: tests/cdp-smoke.js.");
}

// 8
{
  const s = p.slides.add(); s.background.fill = C.paper; title(s, "Measured results on the presentation machine", 8);
  const chart = s.charts.add("bar", {
    position: { left: 65, top: 165, width: 610, height: 390 },
    categories: evaluation.benchmarks.results.map((item) => `${item.nodes / 1000}k`),
    series: [{ name: "Context reduction (%)", values: evaluation.benchmarks.results.map((item) => item.reductionPct), fill: C.blue }],
    barOptions: { direction: "column", grouping: "clustered" },
    hasLegend: false,
    dataLabels: { showValue: true, position: "outEnd", numberFormatCode: "0.0" }
  });
  applyPresentationChartFont(chart, { fontFamily: font });
  text(s, "Context reduction by generated page size", 92, 570, 540, 30, 18, C.muted, true, "center");
  text(s, Number(evaluation.pii.cases).toLocaleString("en-US"), 760, 175, 180, 64, 44, C.teal, true);
  text(s, "synthetic PII cases\n0 FP · 0 FN", 760, 241, 270, 58, 20, C.muted, true);
  text(s, `${evaluation.summary.maxWarmP95Ms} ms`, 760, 335, 240, 60, 42, C.blue, true);
  text(s, "worst warm p95", 760, 397, 250, 30, 19, C.muted, true);
  text(s, `${evaluation.summary.maxGraphApproxMb} MB`, 760, 477, 220, 60, 42, C.ink, true);
  text(s, "graph estimate at 20k nodes", 760, 540, 340, 30, 19, C.muted, true);
  text(s, "Controlled local fixtures. Full limitations appear in the generated evaluation report.", 70, 647, 1100, 24, 15, C.muted);
  notes(s, "Source: artifacts/evaluation-report.json generated on 4 September 2026. Chart unit: percentage points of context-byte reduction. Synthetic/local results only.");
}

// 9
{
  const s = p.slides.add(); s.background.fill = C.navy; title(s, "Adversarial release gates", 9, true);
  const tests = [
    ["RAW PII EGRESS", "Known canaries reached the mock provider only after tokenization", "PASS"],
    ["TASK SCOPE", "An unrelated submit action proposed by the provider was blocked", "PASS"],
    ["CROSS ORIGIN", "A private capability could not fill a field in another frame origin", "PASS"],
    ["VISUAL ACTION", "Block and allow-once paths both preserved pixel freshness", "PASS"],
    ["LARGE PAGE", "Complete graphs through 20,000 generated nodes", "PASS"]
  ];
  tests.forEach((row, i) => {
    const y = 156 + i * 94;
    text(s, row[0], 80, y, 240, 32, 18, "#70D7C8", true);
    text(s, row[1], 330, y - 2, 700, 52, 21, C.white, false);
    text(s, row[2], 1080, y, 100, 30, 18, "#70D7C8", true, "right");
    if (i < 4) box(s, 80, y + 66, 1100, 1, "#2A3A4A");
  });
  notes(s, "All release gates passed in the latest npm run evaluate. Source: artifacts/EVALUATION-SUMMARY.md.");
}

// 10
{
  const s = p.slides.add(); s.background.fill = C.paper; title(s, "Team knowledge coverage", 10);
  const cols = [
    [70, "PRODUCT + EXECUTION", "Jethin\nShubhangi\nIshu", "Side panel, demo flow, action schema, confirmation and browser execution"],
    [455, "PRIVACY + SERVER", "Divyam\nMaan\nJethin", "PII pipeline, aliases, egress barrier, local planner and provider security"],
    [840, "VISION + EVIDENCE", "Shreya\nIshu\nMaan", "OCR, visual masks, test harness, five SIH metrics and presentation recovery"]
  ];
  cols.forEach(([x, h, names, desc], i) => {
    text(s, h, x, 165, 320, 34, 19, i === 1 ? C.blue : C.teal, true);
    text(s, names, x, 225, 300, 142, 32, C.ink, true);
    box(s, x, 390, 300, 2, C.line);
    text(s, desc, x, 422, 300, 122, 21, C.muted);
  });
  text(s, "Every technical area has three people. Every member appears in more than one area.", 70, 600, 1100, 38, 25, C.ink, true, "center");
  notes(s, "The detailed overlapping responsibility map is in TEAM-RESPONSIBILITIES.md. These groups describe knowledge ownership rather than hierarchy.");
}

// 11
{
  const s = p.slides.add(); s.background.fill = C.paper; title(s, "Current product boundary", 11);
  text(s, "Ready to demonstrate", 70, 158, 470, 42, 28, C.teal, true);
  text(s, "Chrome runtime verified\nFirefox package schema verified\nOn-device OCR and masks\nAuthenticated local planner\nReproducible evaluation and releases", 70, 225, 500, 280, 26, C.ink, true);
  box(s, 620, 145, 2, 410, C.line);
  text(s, "Still research or production work", 680, 158, 500, 42, 28, C.red, true);
  text(s, "Browser-store signing and review\nBroad real-world PII and vision datasets\nPrivileged browser surfaces\nEnterprise operations\nIndependent security assessment", 680, 225, 500, 280, 26, C.ink, true);
  box(s, 70, 585, 1110, 58, C.navy, true);
  text(s, "LIVE DEMO  ·  Inspect page  /  Fill private value  /  Mask Canvas PII  /  Block and allow action", 100, 601, 1050, 28, 19, C.white, true, "center");
  notes(s, "Close with the live demo. Do not describe this as production ready. Use DEMO.md for the six-minute sequence and recovery options.");
}

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });
const candidatePath = path.join(TMP_DIR, "candidate.pptx");
await (await PresentationFile.exportPptx(p)).save(candidatePath);

const requirements = {
  explicitTotalSlideCount: 11,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [8],
  materializeLiteralChartWorkbooks: true
};
const result = await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-bullet-geometry", "--validate-heading-fit"],
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [8],
  fontPolicy: { basis: "design", families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(TMP_DIR, "presentation-final-v2.validation.json")
});
console.log(JSON.stringify({ finalPath: FINAL_PPTX, font, result }, null, 2));
