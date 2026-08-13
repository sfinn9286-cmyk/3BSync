import { useState } from "react";

type Kind = "url" | "domain" | "ip" | "hash";

interface VTStats {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  reputation?: number;
  last_analysis_date?: string;
}
interface Report {
  indicator: string;
  kind: Kind;
  virustotal: any;
  urlscan: any;
}

const KIND_LABELS: Record<Kind, string> = {
  url: "URL",
  domain: "DOMAIN",
  ip: "IP ADDRESS",
  hash: "FILE HASH",
};

function analyzeUrl() {
  const base = (window as any).__ROUTE_PATH__ || "/url-analysis";
  // preserve ?branch=... for draft testing
  return `${base}/analyze${window.location.search}`;
}

function verdict(stats?: VTStats) {
  if (!stats) return { label: "UNKNOWN", tone: "muted" as const };
  if (stats.malicious > 0) return { label: "MALICIOUS", tone: "danger" as const };
  if (stats.suspicious > 0) return { label: "SUSPICIOUS", tone: "warn" as const };
  return { label: "CLEAN", tone: "clean" as const };
}

const toneStyles = {
  danger: "text-red-400 border-red-500/60 bg-red-500/10",
  warn: "text-amber-300 border-amber-400/60 bg-amber-400/10",
  clean: "text-emerald-300 border-emerald-400/60 bg-emerald-400/10",
  muted: "text-zinc-400 border-zinc-600/60 bg-zinc-500/10",
};

function StatCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="border border-zinc-800 bg-black/40 px-3 py-2">
      <div className={`font-mono text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
    </div>
  );
}

function VTPanel({ vt }: { vt: any }) {
  if (!vt) return null;
  if (vt.error)
    return <div className="font-mono text-sm text-red-400">VirusTotal error: {String(vt.error)}</div>;
  if (vt.found === false)
    return (
      <div className="font-mono text-sm text-zinc-500">
        {vt.message || "No VirusTotal record found for this indicator."}
      </div>
    );
  const v = verdict(vt.stats);
  const s: VTStats = vt.stats || {};
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`border px-3 py-1 font-mono text-xs font-bold tracking-widest ${toneStyles[v.tone]}`}>
          {v.label}
        </span>
        {typeof s.reputation === "number" && (
          <span className="font-mono text-xs text-zinc-500">reputation: <span className="text-zinc-300">{s.reputation}</span></span>
        )}
        {s.last_analysis_date && (
          <span className="font-mono text-xs text-zinc-500">
            last scan: {new Date(s.last_analysis_date).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCell label="malicious" value={s.malicious ?? 0} tone="text-red-400" />
        <StatCell label="suspicious" value={s.suspicious ?? 0} tone="text-amber-300" />
        <StatCell label="harmless" value={s.harmless ?? 0} tone="text-emerald-300" />
        <StatCell label="undetected" value={s.undetected ?? 0} tone="text-zinc-400" />
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-1 font-mono text-xs sm:grid-cols-2">
        {vt.title && <Row k="title" v={vt.title} />}
        {vt.final_url && <Row k="final url" v={vt.final_url} />}
        {vt.type_description && <Row k="file type" v={vt.type_description} />}
        {typeof vt.size === "number" && <Row k="size" v={`${vt.size} bytes`} />}
        {vt.names?.length ? <Row k="names" v={vt.names.join(", ")} /> : null}
        {vt.as_owner && <Row k="as owner" v={vt.as_owner} />}
        {vt.country && <Row k="country" v={vt.country} />}
        {vt.registrar && <Row k="registrar" v={vt.registrar} />}
      </dl>
      {vt.link && (
        <a href={vt.link} target="_blank" rel="noreferrer" className="inline-block font-mono text-xs text-emerald-400 underline underline-offset-4 hover:text-emerald-300">
          open in VirusTotal ↗
        </a>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 border-b border-zinc-900 py-1">
      <dt className="shrink-0 text-zinc-600">{k}</dt>
      <dd className="min-w-0 break-all text-zinc-300">{v}</dd>
    </div>
  );
}

function USPanel({ us }: { us: any }) {
  if (!us) return null;
  if (us.error) return <div className="font-mono text-sm text-red-400">URLScan error: {String(us.error)}</div>;
  if (us.applicable === false)
    return <div className="font-mono text-sm text-zinc-500">{us.message}</div>;
  if (!us.results?.length)
    return <div className="font-mono text-sm text-zinc-500">No URLScan submissions found for this indicator.</div>;
  return (
    <div className="space-y-3">
      <div className="font-mono text-xs text-zinc-500">{us.total} total result(s) — showing {us.results.length}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {us.results.map((r: any, i: number) => (
          <a
            key={i}
            href={r.report}
            target="_blank"
            rel="noreferrer"
            className="group flex gap-3 border border-zinc-800 bg-black/40 p-2 transition-colors hover:border-emerald-500/50"
          >
            {r.screenshot ? (
              <img src={r.screenshot} alt="" className="h-16 w-24 shrink-0 border border-zinc-800 object-cover" />
            ) : (
              <div className="grid h-16 w-24 shrink-0 place-items-center border border-zinc-800 font-mono text-[10px] text-zinc-600">no shot</div>
            )}
            <div className="min-w-0 font-mono text-[11px] leading-snug">
              <div className="truncate text-zinc-200 group-hover:text-emerald-300">{r.domain || r.url}</div>
              <div className="mt-0.5 truncate text-zinc-500">{r.ip}{r.country ? ` · ${r.country}` : ""}</div>
              {r.time && <div className="mt-0.5 text-zinc-600">{new Date(r.time).toLocaleDateString()}</div>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function Section({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <section className="border border-zinc-800 bg-zinc-950/60 p-5">
      <div className="mb-4 flex items-baseline justify-between border-b border-zinc-800 pb-2">
        <h2 className="font-display text-lg font-extrabold tracking-tight text-zinc-100">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/70">{tag}</span>
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const indicator = input.trim();
    if (!indicator || loading) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(analyzeUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicator }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-grid font-mono text-zinc-300">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:py-16">
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-2 font-mono text-xs text-emerald-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span className="tracking-widest">THREAT INTEL CONSOLE / ONLINE</span>
          </div>
          <h1 className="mt-3 font-display text-4xl font-black leading-none tracking-tighter text-zinc-50 sm:text-6xl">
            INDICATOR<span className="text-emerald-400">.</span>SCAN
          </h1>
          <p className="mt-3 max-w-xl text-sm text-zinc-500">
            Enrich a URL, IP address, domain, or file hash against VirusTotal and URLScan. Paste an
            indicator below and hit analyze.
          </p>
        </header>

        {/* Prompt */}
        <form onSubmit={submit} className="mb-8">
          <div className="flex items-stretch border border-zinc-700 bg-black focus-within:border-emerald-500/70">
            <span className="flex select-none items-center pl-3 pr-2 font-mono text-emerald-400">&gt;</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              autoFocus
              placeholder="https://example.com  ·  8.8.8.8  ·  evil.com  ·  <sha256>"
              className="min-w-0 flex-1 bg-transparent py-3 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="border-l border-zinc-700 bg-emerald-500/10 px-5 font-mono text-xs font-bold tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "SCANNING" : "ANALYZE"}
            </button>
          </div>
        </form>

        {/* Scanning indicator */}
        {loading && (
          <div className="mb-8 overflow-hidden border border-zinc-800 bg-black/40 p-4">
            <div className="mb-2 font-mono text-xs text-zinc-500">querying VirusTotal + URLScan…</div>
            <div className="relative h-1 overflow-hidden bg-zinc-900">
              <div className="scan-sweep absolute inset-y-0 w-1/4 bg-emerald-400/80" />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-8 border border-red-500/50 bg-red-500/10 p-4 font-mono text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Results */}
        {report && (
          <div className="space-y-5 animate-in fade-in duration-500">
            <div className="flex flex-wrap items-center gap-3 border border-zinc-800 bg-zinc-950/60 p-4">
              <span className="border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-emerald-300">
                {KIND_LABELS[report.kind]}
              </span>
              <code className="min-w-0 break-all font-mono text-sm text-zinc-100">{report.indicator}</code>
            </div>

            <Section title="VirusTotal" tag="reputation engine">
              <VTPanel vt={report.virustotal} />
            </Section>

            <Section title="URLScan" tag="scan history">
              <USPanel us={report.urlscan} />
            </Section>
          </div>
        )}

        {!report && !loading && !error && (
          <div className="border border-dashed border-zinc-800 p-10 text-center">
            <span className="font-mono text-sm text-zinc-600">
              awaiting indicator input<span className="cursor-blink">_</span>
            </span>
          </div>
        )}

        <footer className="mt-16 border-t border-zinc-900 pt-4 font-mono text-[10px] uppercase tracking-widest text-zinc-700">
          powered by VirusTotal v3 + URLScan.io
        </footer>
      </div>
    </div>
  );
}
