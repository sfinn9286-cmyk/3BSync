import { Fragment, useEffect, useMemo, useState } from "react";

type Cve = { id: string; title: string; severity: string; impact: string; exploited: boolean; disclosed: boolean; cvss: number | null };
type Update = {
  kb: string;
  sku: string;
  skuLabel: string;
  family: string;
  month: string;
  monthIndex: number;
  releaseDate: string;
  url: string;
  severity: string;
  cveCount: number;
  exploitedCount: number;
  maxCvss: number | null;
  cves: Cve[];
};
type Asset = {
  id: string;
  hostname: string;
  kind: "Server" | "Endpoint";
  role: string;
  tier: string;
  site: string;
  region: string;
  ring: string;
  osSku: string;
  osLabel: string;
  lastCheckIn: string;
  daysSinceCheckIn: number;
  agentHealthy: boolean;
  rebootPending: boolean;
  products: { sku: string; lagMonths: number }[];
};
type Payload = {
  generatedAt: string;
  source: string;
  months: { id: string; index: number; releaseDate: string }[];
  skus: { key: string; label: string; family: string }[];
  updates: Update[];
  fleet: Asset[];
};

type Filters = {
  kind: string;
  region: string;
  ring: string;
  sku: string;
  severity: string;
  exploitedOnly: boolean;
  search: string;
};

const EMPTY: Filters = { kind: "", region: "", ring: "", sku: "", severity: "", exploitedOnly: false, search: "" };

const SEV_RANK: Record<string, number> = { Critical: 4, Important: 3, Moderate: 2, Low: 1, Unknown: 0 };
const SEV_COLOR: Record<string, string> = {
  Critical: "#ff4d6d",
  Important: "#ffa62b",
  Moderate: "#4cc9f0",
  Low: "#8d99ae",
  Unknown: "#5c6672",
};

function readFilters(): Filters {
  const q = new URLSearchParams(window.location.search);
  return {
    kind: q.get("kind") ?? "",
    region: q.get("region") ?? "",
    ring: q.get("ring") ?? "",
    sku: q.get("sku") ?? "",
    severity: q.get("severity") ?? "",
    exploitedOnly: q.get("exploited") === "1",
    search: q.get("q") ?? "",
  };
}

function writeFilters(f: Filters) {
  const q = new URLSearchParams(window.location.search);
  const set = (key: string, value: string) => (value ? q.set(key, value) : q.delete(key));
  set("kind", f.kind);
  set("region", f.region);
  set("ring", f.ring);
  set("sku", f.sku);
  set("severity", f.severity);
  set("exploited", f.exploitedOnly ? "1" : "");
  set("q", f.search);
  const search = q.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
}

function dataUrl() {
  const branch = new URLSearchParams(window.location.search).get("branch");
  return branch ? `/patch-data?branch=${encodeURIComponent(branch)}` : "/patch-data";
}

type MissingRow = { asset: Asset; updates: Update[] };

export default function App() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => readFilters());
  const [openKb, setOpenKb] = useState<string | null>(null);
  const [tab, setTab] = useState<"updates" | "systems">("updates");

  useEffect(() => {
    const controller = new AbortController();
    fetch(dataUrl(), { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`Patch data endpoint returned ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== "AbortError") setError(String(err.message ?? err));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => writeFilters(filters), [filters]);

  const patch = (next: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...next }));
  const toggle = (key: keyof Filters, value: string) => patch({ [key]: filters[key] === value ? "" : value } as Partial<Filters>);

  const model = useMemo(() => {
    if (!data) return null;
    const latest = data.months.length - 1;
    const updatesBySku = new Map<string, Update[]>();
    for (const update of data.updates) {
      const list = updatesBySku.get(update.sku) ?? [];
      list.push(update);
      updatesBySku.set(update.sku, list);
    }

    const rows: MissingRow[] = data.fleet.map((asset) => {
      const missing: Update[] = [];
      for (const product of asset.products) {
        const installedThrough = latest - product.lagMonths;
        for (const update of updatesBySku.get(product.sku) ?? []) {
          if (update.monthIndex > installedThrough) missing.push(update);
        }
      }
      missing.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.monthIndex - a.monthIndex);
      return { asset, updates: missing };
    });
    return { rows, latest };
  }, [data]);

  const view = useMemo(() => {
    if (!data || !model) return null;
    const term = filters.search.trim().toLowerCase();

    const rows = model.rows
      .filter((row) => (filters.kind ? row.asset.kind === filters.kind : true))
      .filter((row) => (filters.region ? row.asset.region === filters.region : true))
      .filter((row) => (filters.ring ? row.asset.ring === filters.ring : true))
      .filter((row) => (filters.sku ? row.asset.products.some((p) => p.sku === filters.sku) : true))
      .filter((row) =>
        term
          ? row.asset.hostname.toLowerCase().includes(term) ||
            row.asset.role.toLowerCase().includes(term) ||
            row.asset.site.toLowerCase().includes(term)
          : true,
      )
      .map((row) => {
        const updates = row.updates
          .filter((u) => (filters.sku ? u.sku === filters.sku : true))
          .filter((u) => (filters.severity ? u.severity === filters.severity : true))
          .filter((u) => (filters.exploitedOnly ? u.exploitedCount > 0 : true));
        return { asset: row.asset, updates };
      });

    const affectedRows = rows.filter((row) => row.updates.length > 0);

    const updateStats = new Map<string, { update: Update; systems: number; servers: number; endpoints: number }>();
    for (const row of rows) {
      for (const update of row.updates) {
        const key = `${update.kb}:${update.sku}`;
        const entry = updateStats.get(key) ?? { update, systems: 0, servers: 0, endpoints: 0 };
        entry.systems += 1;
        if (row.asset.kind === "Server") entry.servers += 1;
        else entry.endpoints += 1;
        updateStats.set(key, entry);
      }
    }
    const applicable = [...updateStats.values()].sort(
      (a, b) => SEV_RANK[b.update.severity] - SEV_RANK[a.update.severity] || b.systems - a.systems,
    );

    const exposedCves = new Map<string, Cve>();
    for (const entry of updateStats.values()) for (const cve of entry.update.cves) exposedCves.set(cve.id, cve);
    const exploitedCves = [...exposedCves.values()].filter((c) => c.exploited);

    const bySku = data.skus
      .map((sku) => {
        const scoped = rows.filter((row) => row.asset.products.some((p) => p.sku === sku.key));
        const behind = scoped.filter((row) => row.updates.some((u) => u.sku === sku.key));
        return { ...sku, total: scoped.length, behind: behind.length };
      })
      .filter((s) => s.total > 0);

    const byMonth = data.months.map((month) => ({
      id: month.id,
      systems: rows.filter((row) => row.updates.some((u) => u.monthIndex === month.index)).length,
    }));

    const bySite = [...new Set(data.fleet.map((a) => a.site))]
      .map((site) => {
        const scoped = rows.filter((row) => row.asset.site === site);
        const behind = scoped.filter((row) => row.updates.length > 0);
        const critical = scoped.filter((row) => row.updates.some((u) => u.severity === "Critical"));
        return { site, total: scoped.length, behind: behind.length, critical: critical.length };
      })
      .filter((s) => s.total > 0)
      .sort((a, b) => b.behind - a.behind);

    const worst = [...affectedRows]
      .sort((a, b) => b.updates.length - a.updates.length || b.asset.daysSinceCheckIn - a.asset.daysSinceCheckIn)
      .slice(0, 40);

    return {
      rows,
      affectedRows,
      applicable,
      exposedCveCount: exposedCves.size,
      exploitedCves,
      bySku,
      byMonth,
      bySite,
      worst,
      stale: rows.filter((row) => !row.asset.agentHealthy).length,
      reboot: rows.filter((row) => row.asset.rebootPending).length,
    };
  }, [data, model, filters]);

  if (error) {
    return (
      <Shell>
        <div className="mx-auto mt-24 max-w-xl border border-rose-500/40 bg-rose-500/5 p-6 font-mono text-sm text-rose-200">
          Failed to load patch intelligence: {error}
        </div>
      </Shell>
    );
  }

  if (!data || !view) {
    return (
      <Shell>
        <div className="mx-auto mt-32 max-w-xl text-center">
          <div className="font-display text-3xl tracking-[0.3em] text-cyan-300/80 animate-pulse">SYNCING MSRC</div>
          <p className="mt-3 font-mono text-xs uppercase tracking-widest text-slate-500">Pulling security update revisions</p>
        </div>
      </Shell>
    );
  }

  const compliant = view.rows.length - view.affectedRows.length;
  const compliancePct = view.rows.length ? Math.round((compliant / view.rows.length) * 100) : 100;
  const activeFilters = Object.entries(filters).filter(([, v]) => v !== "" && v !== false).length;

  return (
    <Shell>
      <title>Patch Compliance Console — Contoso estate</title>
      <header className="border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-6 py-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.4em] text-cyan-400/80">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              contoso · patch compliance console
            </div>
            <h1 className="mt-3 font-display text-4xl leading-none tracking-tight text-slate-50 sm:text-5xl">
              Applicable updates, <span className="text-cyan-300">not pushed</span> — reported.
            </h1>
            <p className="mt-3 max-w-2xl font-mono text-xs leading-relaxed text-slate-400">
              Live severity data from the Microsoft Security Response Center CVRF API for {data.months.map((m) => m.id).join(" · ")}, joined
              against {data.fleet.length} simulated managed systems.
            </p>
          </div>
          <div className="shrink-0 border border-slate-800 bg-slate-900/60 px-5 py-4">
            <Gauge pct={compliancePct} />
            <div className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">fully patched</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-6 py-7">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Systems in scope" value={view.rows.length} sub={`${data.fleet.length} in estate`} />
          <Kpi label="Systems behind" value={view.affectedRows.length} sub={`${100 - compliancePct}% of scope`} tone="warn" />
          <Kpi label="Applicable KBs" value={view.applicable.length} sub="distinct package + SKU" />
          <Kpi label="Exposed CVEs" value={view.exposedCveCount} sub={`${view.exploitedCves.length} exploited in wild`} tone="bad" />
          <Kpi label="Pending reboots" value={view.reboot} sub="patched, awaiting restart" />
          <Kpi label="Stale agents" value={view.stale} sub="no check-in for 7+ days" tone={view.stale ? "warn" : "ok"} />
        </section>

        <section className="mt-6 border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Chips label="Class" options={["Server", "Endpoint"]} active={filters.kind} onPick={(v) => toggle("kind", v)} />
            <Chips label="Region" options={["EMEA", "AMER", "APAC"]} active={filters.region} onPick={(v) => toggle("region", v)} />
            <Chips label="Ring" options={["Pilot", "Broad", "Critical", "Legacy"]} active={filters.ring} onPick={(v) => toggle("ring", v)} />
            <Chips
              label="Severity"
              options={["Critical", "Important", "Moderate"]}
              active={filters.severity}
              onPick={(v) => toggle("severity", v)}
            />
            <button
              onClick={() => patch({ exploitedOnly: !filters.exploitedOnly })}
              className={`border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition ${
                filters.exploitedOnly
                  ? "border-rose-400 bg-rose-500/15 text-rose-200"
                  : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              exploited only
            </button>
            <input
              value={filters.search}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder="host, role or site…"
              className="min-w-[200px] flex-1 border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
            />
            {activeFilters > 0 && (
              <button
                onClick={() => setFilters(EMPTY)}
                className="border border-slate-700 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-slate-400 hover:border-cyan-400 hover:text-cyan-200"
              >
                reset ({activeFilters})
              </button>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <Panel title="Compliance by product" hint="click a bar to scope">
            <div className="space-y-2.5">
              {view.bySku.map((sku) => {
                const pct = sku.total ? (sku.behind / sku.total) * 100 : 0;
                const active = filters.sku === sku.key;
                return (
                  <button key={sku.key} onClick={() => toggle("sku", sku.key)} className="block w-full text-left group">
                    <div className="flex items-baseline justify-between font-mono text-[11px]">
                      <span className={active ? "text-cyan-300" : "text-slate-300 group-hover:text-slate-100"}>{sku.label}</span>
                      <span className="text-slate-500">
                        {sku.behind}/{sku.total}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full bg-slate-800/70">
                      <div
                        className="h-2 transition-all duration-500"
                        style={{
                          width: `${Math.max(pct, sku.behind ? 2 : 0)}%`,
                          background: active ? "#67e8f9" : pct > 60 ? "#ff4d6d" : pct > 25 ? "#ffa62b" : "#22d3ee",
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Systems missing each release" hint={`${data.months.length} patch Tuesdays`}>
            <div className="flex h-[210px] items-end gap-4">
              {view.byMonth.map((month) => {
                const max = Math.max(...view.byMonth.map((m) => m.systems), 1);
                return (
                  <div key={month.id} className="flex flex-1 flex-col items-center justify-end gap-2">
                    <span className="font-mono text-xs text-slate-300">{month.systems}</span>
                    <div
                      className="w-full bg-gradient-to-t from-cyan-500/20 to-cyan-300/80 transition-all duration-700"
                      style={{ height: `${(month.systems / max) * 150}px` }}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{month.id}</span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Exposure by site" hint="behind / critical">
            <div className="space-y-3">
              {view.bySite.map((site) => (
                <div key={site.site}>
                  <div className="flex items-baseline justify-between font-mono text-[11px] text-slate-300">
                    <span>{site.site}</span>
                    <span className="text-slate-500">
                      {site.behind}/{site.total}
                    </span>
                  </div>
                  <div className="mt-1 flex h-2 w-full gap-px bg-slate-800/70">
                    <div style={{ width: `${(site.critical / site.total) * 100}%`, background: SEV_COLOR.Critical }} />
                    <div style={{ width: `${((site.behind - site.critical) / site.total) * 100}%`, background: SEV_COLOR.Important }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        {view.exploitedCves.length > 0 && (
          <section className="mt-6 border border-rose-500/40 bg-rose-500/5 p-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-rose-300">exploited in the wild · in scope</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {view.exploitedCves.map((cve) => (
                <a
                  key={cve.id}
                  href={`https://msrc.microsoft.com/update-guide/vulnerability/${cve.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-rose-400/40 bg-slate-950/50 px-3 py-1.5 font-mono text-[11px] text-rose-100 hover:border-rose-300"
                  title={cve.title}
                >
                  {cve.id} · {cve.impact}
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-1 border-b border-slate-800 px-4 pt-3">
            {(["updates", "systems"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] transition ${
                  tab === key ? "border-b-2 border-cyan-400 text-cyan-200" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {key === "updates" ? `applicable updates (${view.applicable.length})` : `systems behind (${view.affectedRows.length})`}
              </button>
            ))}
          </div>

          {tab === "updates" ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    <Th>KB</Th>
                    <Th>Product</Th>
                    <Th>Release</Th>
                    <Th>Severity</Th>
                    <Th right>CVEs</Th>
                    <Th right>Max CVSS</Th>
                    <Th right>Servers</Th>
                    <Th right>Endpoints</Th>
                    <Th right>Systems</Th>
                  </tr>
                </thead>
                <tbody>
                  {view.applicable.map((entry) => {
                    const key = `${entry.update.kb}:${entry.update.sku}`;
                    const open = openKb === key;
                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => setOpenKb(open ? null : key)}
                          className="cursor-pointer border-t border-slate-800/70 font-mono text-xs text-slate-300 hover:bg-slate-800/40"
                        >
                          <Td>
                            <span className="text-cyan-300">KB{entry.update.kb}</span>
                          </Td>
                          <Td>{entry.update.skuLabel}</Td>
                          <Td>{entry.update.month}</Td>
                          <Td>
                            <SevBadge severity={entry.update.severity} />
                            {entry.update.exploitedCount > 0 && (
                              <span className="ml-2 text-[10px] uppercase tracking-widest text-rose-300">exploited</span>
                            )}
                          </Td>
                          <Td right>{entry.update.cveCount}</Td>
                          <Td right>{entry.update.maxCvss ?? "—"}</Td>
                          <Td right>{entry.servers}</Td>
                          <Td right>{entry.endpoints}</Td>
                          <Td right>
                            <span className="text-slate-100">{entry.systems}</span>
                          </Td>
                        </tr>
                        {open && (
                          <tr className="border-t border-slate-800/70 bg-slate-950/60">
                            <td colSpan={9} className="px-4 py-4">
                              <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                                <span>
                                  {entry.update.cveCount} vulnerabilities addressed · {entry.update.skuLabel}
                                </span>
                                <a href={entry.update.url} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">
                                  update catalog ↗
                                </a>
                              </div>
                              <div className="mt-3 grid gap-1.5 lg:grid-cols-2">
                                {entry.update.cves.slice(0, 40).map((cve) => (
                                  <div key={cve.id} className="flex items-start gap-3 border-l-2 pl-3" style={{ borderColor: SEV_COLOR[cve.severity] }}>
                                    <a
                                      href={`https://msrc.microsoft.com/update-guide/vulnerability/${cve.id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="shrink-0 font-mono text-[11px] text-cyan-200 hover:underline"
                                    >
                                      {cve.id}
                                    </a>
                                    <span className="text-[12px] leading-snug text-slate-400">
                                      {cve.title}
                                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-slate-600">{cve.impact}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {entry.update.cveCount > 40 && (
                                <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-slate-600">
                                  + {entry.update.cveCount - 40} more
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {view.applicable.length === 0 && <Empty />}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    <Th>Host</Th>
                    <Th>Role</Th>
                    <Th>OS</Th>
                    <Th>Site</Th>
                    <Th>Ring</Th>
                    <Th right>Missing KBs</Th>
                    <Th>Worst</Th>
                    <Th right>Last check-in</Th>
                    <Th>Flags</Th>
                  </tr>
                </thead>
                <tbody>
                  {view.worst.map((row) => (
                    <tr key={row.asset.id} className="border-t border-slate-800/70 font-mono text-xs text-slate-300">
                      <Td>
                        <span className="text-slate-100">{row.asset.hostname}</span>
                      </Td>
                      <Td>{row.asset.role}</Td>
                      <Td>{row.asset.osLabel}</Td>
                      <Td>{row.asset.site}</Td>
                      <Td>{row.asset.ring}</Td>
                      <Td right>{row.updates.length}</Td>
                      <Td>
                        <SevBadge severity={row.updates[0]?.severity ?? "Unknown"} />
                      </Td>
                      <Td right>{row.asset.daysSinceCheckIn === 0 ? "today" : `${row.asset.daysSinceCheckIn}d ago`}</Td>
                      <Td>
                        <span className="space-x-2 text-[10px] uppercase tracking-widest">
                          {row.asset.rebootPending && <span className="text-amber-300">reboot</span>}
                          {!row.asset.agentHealthy && <span className="text-rose-300">stale</span>}
                          {row.asset.tier === "Tier 0" && <span className="text-cyan-300">tier 0</span>}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {view.worst.length === 0 && <Empty />}
              {view.affectedRows.length > view.worst.length && (
                <div className="border-t border-slate-800/70 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-slate-600">
                  showing 40 worst of {view.affectedRows.length} — narrow the filters to see the rest
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-slate-600">
          <span>source: {data.source}</span>
          <span>snapshot {new Date(data.generatedAt).toISOString().replace("T", " ").slice(0, 16)}Z · fleet data is simulated</span>
        </footer>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-400/30">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap"
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: number; sub: string; tone?: "neutral" | "ok" | "warn" | "bad" }) {
  const accent = { neutral: "text-slate-100", ok: "text-cyan-300", warn: "text-amber-300", bad: "text-rose-300" }[tone];
  return (
    <div className="border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className={`mt-1 font-display text-3xl tabular-nums ${accent}`}>{value.toLocaleString()}</div>
      <div className="font-mono text-[10px] text-slate-600">{sub}</div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-slate-200">{title}</h2>
        {hint && <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">{hint}</span>}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Chips({ label, options, active, onPick }: { label: string; options: string[]; active: string; onPick: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-600">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onPick(option)}
          className={`border px-3 py-1.5 font-mono text-[11px] tracking-wide transition ${
            active === option
              ? "border-cyan-400 bg-cyan-400/10 text-cyan-200"
              : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function SevBadge({ severity }: { severity: string }) {
  return (
    <span
      className="border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest"
      style={{ color: SEV_COLOR[severity], borderColor: `${SEV_COLOR[severity]}66` }}
    >
      {severity}
    </span>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-2 font-normal ${right ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-2 align-top ${right ? "text-right tabular-nums" : ""}`}>{children}</td>;
}

function Empty() {
  return <div className="px-4 py-10 text-center font-mono text-xs uppercase tracking-widest text-slate-600">nothing matches these filters</div>;
}

function Gauge({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = pct >= 90 ? "#22d3ee" : pct >= 60 ? "#ffa62b" : "#ff4d6d";
  return (
    <svg viewBox="0 0 90 90" className="mx-auto h-24 w-24">
      <circle cx="45" cy="45" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        strokeLinecap="butt"
        transform="rotate(-90 45 45)"
      />
      <text x="45" y="45" textAnchor="middle" dominantBaseline="central" className="fill-slate-100 font-mono text-[18px]">
        {pct}%
      </text>
    </svg>
  );
}
