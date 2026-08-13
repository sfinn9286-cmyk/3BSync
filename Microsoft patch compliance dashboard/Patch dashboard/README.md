The interactive patch compliance console — a reporting-only replacement for a WSUS console. It never deploys anything; it shows what *would* apply and to how many systems.

**Trigger:** HTTP `GET /patch-dashboard` (space members only). The page shell renders immediately, then fetches its data from [the Patch intelligence step](<../Patch intelligence/README.md>) at `/patch-data`, forwarding the current `branch` parameter so a draft page reads draft data.

**What it shows**

- Headline KPIs: systems in scope, systems behind, distinct applicable KBs, exposed CVEs (and how many are exploited in the wild), pending reboots, stale agents, plus an overall "fully patched" gauge.
- Compliance by product, systems missing each patch Tuesday release, and exposure by site.
- A banner listing every in-scope CVE Microsoft flags as exploited.
- Two tables: applicable updates (expand a KB to read its CVE list, linked to the MSRC update guide) and the worst-off systems with missing KB counts, rings, check-in age and flags.

**Interaction:** the chips (class, region, ring, severity, exploited-only), the product bars and the search box all cross-filter every number and chart on the page. Filter state lives in the query string, so a filtered view is shareable.

All aggregation happens client-side in [App.tsx](App.tsx); patch applicability is `missing = updates for a product released after the month that system is patched through`.
