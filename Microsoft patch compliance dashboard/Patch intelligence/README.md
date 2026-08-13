Serves the data behind the patch compliance dashboard: real Microsoft patch intelligence joined against a simulated Contoso estate.

**Trigger:** HTTP `GET /patch-data` (space members only).

**What it does**

1. Reads the MSRC CVRF catalogue at `https://api.msrc.microsoft.com/cvrf/v3.0/updates` and pulls the four most recent released months (`/cvrf/v3.0/cvrf/<month>`). No credentials needed — the API is public.
2. Keeps only products matching the tracked SKUs (Windows Server 2012 R2 → 2025, Windows 10 22H2, Windows 11 23H2–25H2, Edge, Microsoft 365 Apps) and groups the vulnerabilities into per-SKU KB packages with severity, impact, CVSS and exploited/publicly-disclosed flags.
3. Generates a deterministic fake estate — 96 servers and 264 endpoints across six sites, with roles, tiers, update rings, agent health, pending reboots and a per-product patch lag in months. The seed is fixed, so the fleet is stable between runs.

**Output:** a JSON HTTP response with `months`, `skus`, `updates` (each with its CVE list) and `fleet`. The dashboard does all filtering and aggregation client-side from this payload.

See [script.ts](script.ts). The fleet shape is in `buildFleet`; SKU matching is the `SKUS` table.
