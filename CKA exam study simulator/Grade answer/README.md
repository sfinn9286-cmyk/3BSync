Grades a single answer. HTTP route `POST /cka/grade`, space-authenticated, called by the [Simulator](<../Simulator/App.tsx>) page. Contract in [api.json](api.json), implementation in [script.ts](script.ts).

Three grading paths, cheapest first:

1. **MCQ** — `selectedIndex` compared with `answerIndex`. No model call.
2. **Command** — normalised token overlap against the model answer and each `accepted` variant. At ≥90% overlap it returns a pass immediately, so `-n prod` versus `--namespace=prod` never costs you a mark.
3. **Everything else** — Claude (`claude-sonnet-5` via `POST /messages` on the **Anthropic** connector) grades the answer against the model solution and rubric, returning a per-rubric-point breakdown, terse feedback, and the candidate's answer minimally corrected. `tool_choice` forces the `submit_grade` tool, so the response is always structured rather than prose.

The prompt tells the examiner to be strict about correctness and generous about form: imperative versus declarative, flag order, and `deploy`/`deployment` shorthand all pass, while a wrong `apiVersion`, a missing RBAC `apiGroup`, or a manifest that would not apply does not.

If the Anthropic call fails for any reason, the step logs the cause to stderr and returns `graded: "self"` with the rubric, so the page falls back to a self-assessment checklist instead of the session dying mid-exam. The base URL comes from `ANTHROPIC_BASE_URL` (it already includes `/v1`) and the connector proxy injects the API key.
