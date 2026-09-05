# Privacy statement

StrawHats Privacy Gateway processes webpage structure, screenshots, detected private values, and saved profile values locally inside the browser by default.

## Data handling

- Screenshots used for visual OCR remain inside the extension and are not placed in planner requests.
- API keys and private-profile values are stored only in browser session storage and are cleared when the browser session ends or the user selects **Clear session secrets now**.
- Persistent extension storage contains the alias seed, endpoint, model name, and policy preferences, but not the API key or private profile.
- Local receipts remain in extension memory and are exported only when the user selects **Export**.
- No telemetry, advertising identifier, analytics SDK, or developer-operated collection endpoint is included.

## Optional planner transmission

When the user configures a model and permits safe cloud reasoning, the extension may send the task, minimized website content, search terms, capabilities, and action history to that user-selected OpenAI-compatible endpoint. A final local inspection blocks known raw private values and recognizable PII before transmission. The destination provider's own privacy and retention terms still apply.

The included local planner can operate without internet access. If its upstream mode is enabled, the operator must configure an HTTPS endpoint and a planner bearer token.

## User control

Cloud reasoning and visual processing can each be disabled in Settings. Users can clear session secrets and local receipts at any time. Uninstalling the extension removes its browser-managed storage.

This hackathon release is not an independently certified security product. Detector and OCR limitations are documented in `PROJECT-STATUS.md` and `SIH-EVALUATION.md`.
