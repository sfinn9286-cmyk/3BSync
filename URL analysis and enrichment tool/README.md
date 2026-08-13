Enrich a security indicator — a URL, IP address, domain, or file hash — against VirusTotal and URLScan from a single web page.

**Entry point:** the [Analysis UI](<Analysis UI/App.tsx>) webpage at `/url-analysis` (public). A visitor submits one indicator; the page calls the [Analyze](<Analyze/script.ts>) API (`/url-analysis/analyze`), which detects the indicator type, queries VirusTotal v3 and URLScan.io in parallel, and returns a combined JSON report that the page renders (verdict, detection stats, and recent URLScan submissions with screenshots).

**Connectors:** VirusTotal and URLScan (attached to the Analyze step). The workflow is read-only against external systems, except that an unseen URL is submitted to VirusTotal for scanning.

To change which fields are surfaced, edit [Analyze/script.ts](<Analyze/script.ts>) (the `summarize*` / provider functions) and the matching panels in [Analysis UI/App.tsx](<Analysis UI/App.tsx>).
