HTTP API at **`/url-analysis/analyze`** (public, `POST`). Backs the [Analysis UI](<../Analysis UI/App.tsx>) page.

**Request:** `{ "indicator": "<url | ip | domain | file hash>" }`

The step auto-detects the indicator type (hex length 32/40/64 → hash, dotted quad → IP, `http(s)://` or bare domain → URL/domain) and enriches it in parallel:

- **VirusTotal v3** (`https://www.virustotal.com/api/v3`) — `/files`, `/ip_addresses`, `/domains`, or `/urls`. For an unseen URL it submits the URL and briefly polls the analysis before reading the report.
- **URLScan** (`https://urlscan.io/api/v1/search`) — searches existing public scans by domain / IP / URL. Not applicable to file hashes.

**Response:** `{ indicator, kind, virustotal, urlscan }`. Each provider block is independent — a failure in one is returned as `{ error }` without breaking the other. Credentials are injected by the VirusTotal and URLScan connectors; no keys live in code. `timeout = 120s` to allow for URL submission + polling.
