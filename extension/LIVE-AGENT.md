# Voice and live browser tasks

Load the unpacked extension and open its side panel on an ordinary HTTPS page. No provider key is bundled. You can configure the endpoint now and add your own key later.

## Connect a model

In Settings, choose a provider preset, enter a model ID and your key, then Save settings. Provider changes clear the unsaved key. Keys last for the browser session; endpoint, model, and step limit persist.

| Provider | Chat completions endpoint | Model |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `openrouter/free`, or a model from its catalog |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | Enter an active model ID from Groq's catalog |
| Other compatible provider | Its full HTTPS chat completions URL | Its model ID |
| Offline demo | `http://127.0.0.1:8787/v1/chat/completions` | `local-demo`; run `npm run demo` first |

The client sends bearer authentication and OpenAI-style `messages`, and reads `choices[0].message.content`. The model must follow the supplied single-action JSON schema. Models that cannot follow it stop with a visible error. Free availability, quotas, and model access belong to the provider. No shared keys or automatic paid fallback are supplied.

Official references checked September 5, 2026: [OpenRouter quickstart](https://openrouter.ai/docs/quickstart), [OpenRouter free router](https://openrouter.ai/openrouter), [Groq API reference](https://console.groq.com/docs/api-reference), and [Groq model catalog](https://console.groq.com/docs/models).

## Speak a task

Choose Speak task, permit microphone access if prompted, and speak. Review or edit the transcript before choosing Run task. Stop listening ends recognition without starting the agent. Unsupported browsers show a typed-input fallback; permission and recognition failures appear beside the control. Optional spoken completion reads a fixed status message, not the model's page-derived answer.

Browser speech recognition may send audio to its speech service. Speech synthesis may use browser or OS services. Neither is covered by the gateway's text-egress filtering. This is push-to-talk, not an always-listening wake-word agent.

## Live flight booking demonstration

1. Save a compatible HTTPS provider, model, and your own key. Set a 30- or 50-step limit for longer searches.
2. Expand Live flight booking demo. Enter departure and arrival cities or airport codes and a future departure date.
3. Choose Start live flight search. The extension opens Google Flights and waits for its content script before starting the task in that tab.
4. Watch the activity log while the model fills search controls, selects airport suggestions, compares fares, and selects an itinerary. Each step receives fresh minimized context and goes through the existing action firewall.
5. Review the displayed price and booking option. The demo asks the agent to stop before passenger details, reservation, or payment. Continue manually after reviewing the itinerary. High-risk actions still require local confirmation.

Use Stop to cancel the task even if another tab has become active. A late model response cannot execute the next action. The configured step limit bounds the loop; reaching it is reported as a stop, not successful booking.

Google consent pages, login, CAPTCHA, inaccessible controls, provider quotas, or changing site markup can interrupt the flow. The model is instructed to explain these interruptions rather than bypass them. This version controls one task tab; an airline checkout opened in another tab needs a new task there. A live model run and physical microphone capture remain to be verified with the user's key and device. Offline and simulated tests do not prove successful live booking.

## Product comparison

The side panel compares this extension with [Comet's domain permissions](https://www.perplexity.ai/help-center/en/articles/13531023-managing-comet-assistant-permissions) and [ChatGPT agent's browser workflow](https://help.openai.com/en/articles/11752874-chatgpt-agent). This project exposes model selection, local aliases, and action receipts inside an existing Chrome or Firefox session. The comparison describes workflows, not measured superiority, equivalent reliability, or a security certification.
