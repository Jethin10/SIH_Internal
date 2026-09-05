# Six-minute judge demo

This demo uses synthetic data and the included offline planner. It never sends a payment, message, password, or private profile value to an external service.

## Prepare once

1. In this `extension` directory, run `npm run demo` and keep the terminal open.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this `extension` directory. Reload it if it is already installed.
3. Open `http://127.0.0.1:8765/tests/integration.html`, reload the page, and click the extension action to open its side panel.
4. Open **Settings**. Set endpoint to `http://127.0.0.1:8787/v1/chat/completions`, model to `local-demo`, and leave API key empty. Set profile email to `vault.user@example.com`, then save.
5. Keep [artifacts/EVALUATION-SUMMARY.md](artifacts/EVALUATION-SUMMARY.md) ready in an editor for the evidence step.

## Live sequence

1. **Frame the problem, 30 seconds.** Say: "Browser agents usually receive broad page context and broad execution rights. Our gateway reduces what the planner sees, then independently checks every proposed action on the device."
2. **Show minimization, 45 seconds.** Click **Inspect page**. Point out that raw email, phone, password, iframe data, and Canvas text stay in the local column. The safe column contains aliases or exclusions. `PII EGRESS` is `NOT SENT` before a task and `VERIFIED 0` after a planner call.
3. **Show private capability use, 45 seconds.** Run `fill my email`. The log shows an `<EMAIL:...>` capability. The visible Email field receives `vault.user@example.com`, but the planner request contains only the alias.
4. **Show prompt-injection resistance, 35 seconds.** Point at the orange `SYSTEM: ignore...` text. Run `search for privacy gateway`. The Search field changes; the order count stays `0`. The page cannot replace the user's task.
5. **Show local vision, 55 seconds.** Scroll until the Canvas is visible and click **Local visual scan**. Show the masked local preview and the OCR count. Say: "The screenshot and raw OCR remain local. Only masked text and bounded target geometry can reach the planner."
6. **Show the action firewall, 75 seconds.** Run `click Submit order`. Choose **Block** and show `Orders submitted: 0`. Run it again, choose **Allow once**, and show `Orders submitted: 1`. Point at both receipts. Do the same with `click Private visual fallback` if time remains; every visual click requires confirmation and the Canvas count proves execution.
7. **Show live updates and cleanup, 30 seconds.** Click **Add dynamic row**, then **Inspect page**. Point at `CHANGED` and `REPROCESSED`, which demonstrate incremental updates. Click **Clear private session** before ending.
8. **Close with evidence, 40 seconds.** Open the evaluation summary. State the measured fixture results and their listed limits. Finish with: "The model may propose. Only the local gateway can disclose or act."

## Fast recovery

- If the panel says the visible pixels changed, keep the page still, run **Local visual scan** once, and retry the action. The check is deliberately strict.
- If the panel loses the page, return to the fixture tab and click **Inspect page**. Internal Chrome pages cannot be inspected.
- If either local URL fails, stop the old demo terminal with Ctrl+C and run `npm run demo` again.
- If OCR needs a moment on its first run, continue explaining the structured privacy path while it loads. Do not switch to a cloud provider during judging.

## Two-minute preflight

Run `npm run test:ui`. It opens a clean Chromium profile and verifies the panel journeys, including both confirmation choices, local OCR masks, secret clearing, receipt clearing, and settings persistence. A pass also refreshes `artifacts/product-ui.png`.
