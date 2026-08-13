Public webpage served at **`/url-analysis`** — a dark "threat intel console" front end for enriching a single indicator.

A visitor pastes a **URL, IP address, domain, or file hash** and hits Analyze. The page POSTs `{ "indicator": "<value>" }` to the [Analyze](<../Analyze/script.ts>) endpoint (`/url-analysis/analyze`, preserving the current `?branch=` query so drafts hit the right branch) and renders the returned report:

- **VirusTotal** — verdict badge (clean / suspicious / malicious), analysis stats, reputation, and context (AS owner, country, registrar, file names, etc.).
- **URLScan** — recent scan submissions with screenshots, resolved IP, and links to the full reports.

This step renders the shell and fetches data at runtime, so it has no upstream links. Fonts (JetBrains Mono + Archivo) load from Google Fonts.
