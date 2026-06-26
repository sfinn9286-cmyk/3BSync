An autonomous Security Operations Center (SOC). Security alerts are ingested, triaged and investigated by Claude, persisted, and surfaced in a live console. High/Critical alerts are escalated to Slack and Jira (currently stubbed).

**Flow**

1. [Ingest Alert](<Ingest Alert/script.ts>) — `POST /soc-ingest`. Accepts an alert JSON body, or generates a realistic synthetic alert when the body is empty (demo mode).
2. [Triage](Triage/script.ts) — Claude classifies severity, gives a verdict (true/false positive), summarizes, maps MITRE ATT&CK techniques, and recommends actions.
3. [Dispatch](Dispatch/script.ts) — stores the enriched alert in the `soc` volume; for High/Critical it builds Slack + Jira payloads (logged, not sent — see stubs).
4. [Alerts API](<Alerts API/script.ts>) — `GET /soc-alerts`, returns stored alerts for the UI.
5. [Dashboard](Dashboard/App.tsx) — `GET /soc`, the SOC console: live feed, severity filters, alert detail with AI analysis, and a button to generate sample alerts.

**Triggers:** Primary entry is the Dashboard at `/soc`. Alerts enter via `/soc-ingest`.

**Connectors:** Anthropic (Claude) on Triage. Slack + Jira are stubbed — wire connectors into Dispatch to go live.

**Storage:** `soc` named volume (`alerts.jsonl`), written only by Dispatch.

All routes are private (space members) except none are public.
