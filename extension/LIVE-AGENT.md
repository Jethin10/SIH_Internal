# Voice and live browser tasks

Load the unpacked extension and open its side panel on an ordinary HTTPS page. No provider key is bundled. You can configure the endpoint now and add your own key later.

## Connect a model

In Settings, choose a provider preset, enter a model ID and your key, then Save settings. Provider changes clear the unsaved key. Keys last for the browser session; endpoint, model, and step limit persist. When the saved endpoint is Groq and the model field is blank, the runtime uses `openai/gpt-oss-20b`.

| Provider | Chat completions endpoint | Model |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `openrouter/free`, or a model from its catalog |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | `openai/gpt-oss-20b`, or another active Groq model |
| Other compatible provider | Its full HTTPS chat completions URL | Its model ID |
| Offline demo | `http://127.0.0.1:8787/v1/chat/completions` | `local-demo`; run `npm run demo` first |

The client sends bearer authentication and OpenAI-style `messages`, and reads `choices[0].message.content`. The model must follow the supplied single-action JSON schema. Models that cannot follow it stop with a visible error. For Groq, the runtime requests JSON output, caps completion tokens, and uses low reasoning effort for GPT-OSS so the browser context leaves more room inside small free-tier token budgets. Free availability, quotas, and model access belong to the provider. No shared keys or automatic paid fallback are supplied.

Official references checked September 5, 2026: [OpenRouter quickstart](https://openrouter.ai/docs/quickstart), [OpenRouter free router](https://openrouter.ai/openrouter), [Groq API reference](https://console.groq.com/docs/api-reference), and [Groq model catalog](https://console.groq.com/docs/models).

## Speak a task

Choose Speak task, permit microphone access if prompted, and speak. Review or edit the transcript before choosing Run task. Stop listening ends recognition without starting the agent. Unsupported browsers show a typed-input fallback; permission and recognition failures appear beside the control. Optional spoken completion reads a fixed status message, not the model's page-derived answer.

Browser speech recognition may send audio to its speech service. Speech synthesis may use browser or OS services. Neither is covered by the gateway's text-egress filtering. This is push-to-talk, not an always-listening wake-word agent.

## Live flight demonstration

1. Save a compatible HTTPS provider and your own key. Groq can leave the model field blank to use `openai/gpt-oss-20b`.
2. Expand Live flight booking demo. Enter departure and arrival cities or airport codes and a future departure date.
3. Choose Start live flight search. The extension opens a real Google Flights query with route, date, one-way economy, and one adult already encoded in the URL, then waits for the page content script.
4. The model receives the minimized visible/actionable slice of the live results page and compares up to three visible options. The complete page graph and raw private values stay local.
5. The demo reports the visible airline, times, stops, prices, and cheapest visible option, then stops before passenger details, reservation, or payment. Normal tasks can continue through the multi-step click/fill/select action loop and local confirmation firewall.

The planner context has a hard serialized budget and prioritizes visible actionable controls. This prevents large sites from sending thousands of irrelevant off-screen nodes to small-quota providers. Use Stop to cancel longer normal tasks; the configured step limit still bounds the general agent loop.

A real Groq run using `openai/gpt-oss-20b` was verified on September 5, 2026 with the extension's provider harness. It completed a private email-fill task through the real model in about two seconds using two successful API calls; the harness confirmed the raw synthetic private values and screenshot were absent from planner requests. A separate Google Flights browser check loaded a real HYD-to-DEL result page with the requested route/date and live fare controls. The first unrestricted page-context experiment exceeded Groq's 8,000 TPM allowance, which led to the planner-context budget and preloaded-query fast path in this version. Physical microphone capture still needs testing on the presentation device. No passenger data, reservation, or payment was submitted during verification.

Google consent pages, login, CAPTCHA, provider quotas, or changing site markup can still interrupt a live run. The model is instructed to explain these interruptions rather than bypass them. This version controls one task tab; an airline checkout opened in another tab needs a new task there.

## Product comparison

The side panel compares this extension with [Comet's domain permissions](https://www.perplexity.ai/help-center/en/articles/13531023-managing-comet-assistant-permissions) and [ChatGPT agent's browser workflow](https://help.openai.com/en/articles/11752874-chatgpt-agent). This project exposes model selection, local aliases, and action receipts inside an existing Chrome or Firefox session. The comparison describes workflows, not measured superiority, equivalent reliability, or a security certification.
