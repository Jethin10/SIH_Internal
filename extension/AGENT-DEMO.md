# General agent demo on Windows

Run `npm run demo:agent` from this directory. It opens a disposable browser, a synthetic store, and the actual agent panel.

In the open Settings section, select Google Gemini, enter a model ID available in your account and your API key, then click Save settings. The key stays in the extension's session storage. A synthetic profile email is already set up.

Run the prefilled task:

> Shop for running shoes under Rs 3000 in size 9. Compare the listed options, add the affordable pair to the cart, fill my email, and stop before placing the order.

The model must choose the product, follow the link, select size 9, add it to the cart, and fill the email using an alias. Success means the cart visibly contains Trail Runner, size 9, Rs 2400, the email is filled, and the page still says Order not submitted. The agent's completion message alone is not proof.

This launcher uses the general planner loop. It does not script the model's actions. You can change the task or browse to a different website. Login, CAPTCHA, missing information, and consequential submissions may need your input. The store is synthetic; open-web reliability requires separate testing on the target site.

The separate panel controls the active ordinary browser tab. If you have updated the code while the launcher is open, restart the launcher before rehearsing to load the new version. This creates a new temporary profile, so enter your key again.

`npm run test:agent` verifies the five-step execution path with a deterministic test planner. `npm run test:agent:live` uses `OPENROUTER_API_KEY` and optional `AGENT_MODEL` for a real-model check. Free-router quota and model behavior have been inconsistent; use a model you have successfully rehearsed with for judges.

The automated launcher currently uses Playwright's bundled Chromium on Windows. Installed Google Chrome requires loading the extension unpacked through `chrome://extensions`; that installation has not been verified in this run. No personal Chrome profile is changed.
