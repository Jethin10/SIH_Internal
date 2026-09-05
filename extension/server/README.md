# StrawHats local planner server

Run `npm run server`, then configure the extension with:

- Endpoint: `http://127.0.0.1:8787/v1/chat/completions`
- Model: `local-demo`
- API key: leave blank

The server accepts only the already-minimized planner payload produced by the extension. In local mode it returns deterministic browser actions without internet access. To proxy to another OpenAI-compatible model, set `UPSTREAM_ENDPOINT`, `UPSTREAM_MODEL`, and optionally `UPSTREAM_API_KEY` before starting it. Request and response bodies are capped at 1 MB and upstream calls time out after 30 seconds. Payload bodies are not logged.
