An interactive, report-only alternative to a Windows Update / WSUS console: it pulls real Microsoft security update data and shows what is applicable across a simulated Contoso estate of servers and endpoints. Nothing is ever deployed — the workflow only reports.

**Triggers**

- `GET /patch-dashboard` — the console a person opens (entry point).
- `GET /patch-data` — the JSON API the page calls for its data.

Both are restricted to members of the space.

**The flow**

[Patch intelligence](<Patch intelligence/README.md>) reads the public MSRC CVRF API (`api.msrc.microsoft.com/cvrf/v3.0`) for the last four released patch months, reduces it to per-SKU KB packages with severity, impact, CVSS and exploited/publicly-disclosed flags, and joins it against a deterministic fake estate of 96 servers and 264 endpoints (Windows Server 2012 R2–2025, Windows 10 22H2, Windows 11 23H2–25H2, Edge, Microsoft 365 Apps) with sites, update rings, agent health and per-product patch lag. [Patch dashboard](<Patch dashboard/README.md>) renders that payload as a cross-filterable console.

**External services:** MSRC CVRF API only — public, no connector or credentials.

**Side effects:** none. Read-only, no state stored.

**Common changes**

- Fleet size, sites, roles, rings or patch lag: `buildFleet` and the mix tables in [Patch intelligence/script.ts](<Patch intelligence/script.ts>).
- Tracked products: the `SKUS` table in the same file.
- Months of history: `MONTHS_BACK` in the same file.
- Charts, KPIs and filters: [Patch dashboard/App.tsx](<Patch dashboard/App.tsx>).
