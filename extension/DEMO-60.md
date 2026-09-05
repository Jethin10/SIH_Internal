# Windows Chrome demo

From the extension directory, run `npm run demo:60:auto` for the paced presentation or `npm run demo:60` to drive it yourself. First-time setup is `npm ci` followed by `npm run setup:browsers`.

The launcher opens a disposable Chromium window and the extension panel beside it, starts an offline planner, seeds a synthetic email, and warms local OCR. It does not use your personal browser profile or a cloud key. Keep the fixture window active while using the panel controls. Close both windows when finished, or press Ctrl+C in the terminal.

The automatic presentation starts after READY and takes about 45 seconds. It inspects the page, fills the email through a private alias, verifies egress, blocks a synthetic order, allows exactly one, and shows masked local OCR. The automatic Block and Allow once clicks are scripted presentation actions on the local fixture. Real browsing retains confirmation gates.

`npm run test:demo` exercises the same path without narration pauses and exits. Its results are in `artifacts/demo-60.json`. Setup and OCR warmup are outside the timed presentation. This proves privacy mediation and confirmation, not open-ended autonomous shopping.

For installed Google Chrome on Windows, open `chrome://extensions`, enable Developer mode, click Load unpacked, and choose this extension directory. Run `npm run demo` and open `http://127.0.0.1:8765/tests/integration.html`, then open the extension side panel. This manual installation path is separate from the automated Chromium launcher.

For general tasks, select Google Gemini in Settings, enter a model ID available in your account and its API key, and save. The endpoint follows https://ai.google.dev/gemini-api/docs/openai. Start on an ordinary web page and include the exact destination URL, for example `Open https://www.google.com/ and search for running shoes under 3000 rupees`. The model can navigate to that supplied URL, then use page controls. Local domain policy and private-value checks still apply. Actual provider availability and store behavior require a live test with your account. Voice and macOS have not been verified by this Windows demo.
