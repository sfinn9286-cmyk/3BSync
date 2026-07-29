Stores and reports study progress. HTTP route `/cka/progress`, space-authenticated — `GET` returns the dashboard payload, `POST` records a finished session. Called by the [Simulator](<../Simulator/App.tsx>) page; contract in [api.json](api.json), implementation in [script.ts](script.ts).

Data is per-user: rows are keyed off the `x-3b-authenticated-email` header that 3B attaches to space-authenticated requests, so your history is yours and cannot be spoofed by the browser.

Storage is SQLite at `/storage/cka_progress/progress.db` on the `cka_progress` named volume, mounted `concurrency=exclusive` in the [Dockerfile](Dockerfile) because reads and writes hit the same database file. Two tables: `attempts` (one row per graded question) and `sessions` (one row per exam or drill).

`GET` derives everything from `attempts`:

- **totals** — questions answered, mean score, distinct bank items seen
- **byDomain / byTopic** — mean score ordered worst-first, which is what the dashboard's weak-spot list uses
- **reviewQueue** — items whose mean score is under 0.7, oldest-seen first, so repeated misses resurface before recent ones
- **sessions** — the 50 most recent sessions for the score trend

Draft branches get their own isolated volume data, so testing here never pollutes live study history.
