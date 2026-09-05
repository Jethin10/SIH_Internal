# Six-minute judge demo

## Before entering the room

1. Run `npm test`, then `npm run evaluate`.
2. Run `npm run server` in a separate terminal.
3. Load the `extension` folder unpacked in Chrome and open the side panel.
4. In Settings use `http://127.0.0.1:8787/v1/chat/completions`, model `local-demo`, and no API key.
5. Open the integration fixture through the test server, or use a prepared ordinary HTTP/HTTPS demo page.

## Live flow

1. **Problem — 35 seconds.** “Browser agents normally receive raw page content and broad execution rights. Our gateway minimizes context before reasoning and validates every action locally.”
2. **Inspect — 50 seconds.** Click **Inspect page**. Point to raw local values, randomized aliases, graph size, reduced safe context, and the `NOT SENT` egress state.
3. **Private capability — 55 seconds.** Save a demo email in the session-only profile. Run `fill my email`. Show that the planner uses an alias while the real value is resolved only into the matching field.
4. **Visual privacy — 60 seconds.** Scroll the Canvas into view and click **Local visual scan**. Show OCR text, the visible masks in **Local redacted view**, and explain that the screenshot remains on-device.
5. **Action firewall — 60 seconds.** Run `click Submit order`. First choose **Block**, show that nothing happened, then repeat and choose **Allow once**. Show the privacy receipt.
6. **Measured evidence — 60 seconds.** Open `artifacts/EVALUATION-SUMMARY.md`. Present the five criteria and their limitations, then show that every release gate passes.
7. **Close — 20 seconds.** “The model can propose; only the local gateway can disclose or act.”

## Recovery plan

- If OCR is slow, explain that the first run loads the local language model; use the already-generated redacted preview.
- If a cloud endpoint is unavailable, use the included local server. The privacy and execution controls are unchanged.
- If Chrome was already open before loading the extension, reload the demo page.
