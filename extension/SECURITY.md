# Security guidance

## Safe deployment

- Keep the planner bound to its default loopback address, `127.0.0.1`.
- When `UPSTREAM_ENDPOINT` is configured, set a high-entropy `PLANNER_TOKEN`; startup refuses upstream mode without one.
- Enter the same token as the extension's API key for the local planner endpoint.
- Upstream endpoints must use HTTPS. Plain HTTP is accepted only for loopback testing.
- Never commit provider keys, planner tokens, exported receipts, or private profiles.
- Use the domain allow/block policy for demonstrations involving external sites.

## Implemented controls

The server limits request and response bodies, enforces JSON, applies timeouts, rejects redirects, checks extension origins, and compares configured bearer tokens using a timing-safe operation. The extension validates planner output against a strict action schema and revalidates the page target immediately before execution.

## Reporting

For this internal hackathon project, report suspected vulnerabilities directly to the StrawHats team and include reproduction steps without real personal data. Rotate any exposed key or token immediately.

External penetration testing, browser-store review, and production incident-response operations are not represented as complete by this repository.

## Voice and live-agent data boundaries

The browser speech service may receive microphone audio before a transcript reaches the extension. Review transcripts before running tasks; do not dictate credentials. Optional speech output reads a fixed completion status. Provider keys are supplied by the user and remain in browser-session storage. Switching a preset clears the unsaved key, and provider error bodies are not echoed into the activity log. Model actions still pass task-scope, page-freshness, and confirmation checks. These controls reduce exposure but do not guarantee perfect detection or correct model behavior on changing travel websites.
