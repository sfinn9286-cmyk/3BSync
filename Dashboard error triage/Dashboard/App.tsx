import { useEffect, useState, useCallback } from "react";

// --- Types ---
interface Mitre {
  id: string;
  name: string;
}
interface Analysis {
  severity: "Low" | "Medium" | "High" | "Critical" | string;
  confidence: number;
  verdict: string;
  summary: string;
  mitre: Mitre[];
  recommendedActions: string[];
  reasoning: string;
}
interface Alert {
  id: string;
  source: string;
  type: string;
  title: string;
  description: string;
  host: string;
  user: string;
  srcIp: string;
  destIp: string;
  detectedAt: string;
  storedAt?: string;
  analysis?: Analysis;
}

// Forward the ?branch param so fetches stay on the same draft/published branch.
const branch = new URLSearchParams(location.search).get("branch");
const q = branch ? `?branch=${encodeURIComponent(branch)}` : "";
const ALERTS_URL = `/soc-alerts${q}`;
const INGEST_URL = `/soc-ingest${q}`;

const SEV: Record<string, { fg: string; bg: string; border: string; dot: string }> = {
  Critical: { fg: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/40", dot: "bg-rose-400" },
  High: { fg: "text-orange-300", bg: "bg-orange-500/10", border: "border-orange-500/40", dot: "bg-orange-400" },
  Medium: { fg: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/40", dot: "bg-amber-400" },
  Low: { fg: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/40", dot: "bg-emerald-400" },
};
const sevStyle = (s?: string) => SEV[s ?? ""] ?? { fg: "text-slate-300", bg: "bg-slate-500/10", border: "border-slate-500/40", dot: "bg-slate-400" };

function timeAgo(iso?: string) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function App() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Returns the current alert count so callers can detect new arrivals.
  const load = useCallback(async (): Promise<number> => {
    try {
      const r = await fetch(ALERTS_URL, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = (await r.text()).trim();
      // Empty body (no data yet on this branch, or a transient blank response)
      // is not an error — just means there's nothing to show yet.
      const j = text ? JSON.parse(text) : { alerts: [] };
      const list: Alert[] = Array.isArray(j.alerts) ? j.alerts : [];
      setAlerts(list);
      setErr(null);
      return list.length;
    } catch (e) {
      setErr(String(e));
      return -1;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setErr(null);
    const before = await load();
    const baseline = before < 0 ? alerts.length : before;
    try {
      setStatus("Injecting alert…");
      const resp = await fetch(INGEST_URL, { method: "POST", credentials: "same-origin", body: "" });
      if (!resp.ok) throw new Error(`Ingest returned HTTP ${resp.status}`);
      // Triage runs Claude downstream (~10-20s). Poll until the new alert
      // appears, then stop early. Cap at ~45s.
      setStatus("AI triaging the alert… (~15s)");
      const start = Date.now();
      while (Date.now() - start < 45000) {
        await new Promise((r) => setTimeout(r, 2000));
        const count = await load();
        if (count > baseline) {
          setStatus("New alert triaged ✓");
          setTimeout(() => setStatus(null), 3000);
          return;
        }
      }
      setStatus("Still processing — it will appear shortly.");
      setTimeout(() => setStatus(null), 5000);
    } catch (e) {
      setErr(String(e));
      setStatus(null);
    } finally {
      setGenerating(false);
    }
  };

  const counts = alerts.reduce<Record<string, number>>((a, x) => {
    const s = x.analysis?.severity ?? "Unknown";
    a[s] = (a[s] ?? 0) + 1;
    return a;
  }, {});
  const open = alerts.length;
  const crit = (counts.Critical ?? 0) + (counts.High ?? 0);

  const shown = filter === "All" ? alerts : alerts.filter((a) => a.analysis?.severity === filter);
  const sel = alerts.find((a) => a.id === selected) ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-mono">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 3px)" }}
      />
      {/* Header */}
      <header className="relative border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400 animate-pulse" />
            <div>
              <h1 className="text-lg tracking-[0.3em] text-emerald-300 font-bold">SENTINEL // AI SOC</h1>
              <p className="text-[11px] text-slate-500 tracking-widest uppercase">Autonomous Triage Console</p>
            </div>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="px-4 py-2 text-xs tracking-widest uppercase border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition rounded flex items-center gap-2"
          >
            {generating && (
              <span className="h-3 w-3 rounded-full border-2 border-emerald-400/40 border-t-emerald-300 animate-spin" />
            )}
            {generating ? "Triaging…" : "+ Generate Sample Alert"}
          </button>
        </div>
        {status && (
          <div className="max-w-7xl mx-auto px-6 pb-3 -mt-1">
            <span className="text-[11px] tracking-widest uppercase text-emerald-300/80">{status}</span>
          </div>
        )}
      </header>

      {/* Stat strip */}
      <div className="relative max-w-7xl mx-auto px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Open Alerts" value={open} accent="text-slate-100" />
        <Stat label="High / Critical" value={crit} accent="text-rose-300" />
        <Stat label="Critical" value={counts.Critical ?? 0} accent="text-rose-400" />
        <Stat label="AI Status" value={generating ? "TRIAGING" : "IDLE"} accent="text-emerald-300" small />
      </div>

      {err && (
        <div className="max-w-7xl mx-auto px-6 pb-2 text-xs text-rose-400">⚠ {err}</div>
      )}

      {/* Filters */}
      <div className="relative max-w-7xl mx-auto px-6 flex gap-2 flex-wrap">
        {["All", "Critical", "High", "Medium", "Low"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-[11px] tracking-widest uppercase rounded border transition ${
              filter === f
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                : "border-slate-800 text-slate-500 hover:text-slate-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Feed */}
      <main className="relative max-w-7xl mx-auto px-6 py-5">
        {loading ? (
          <p className="text-slate-600 text-sm py-20 text-center tracking-widest">LOADING FEED…</p>
        ) : shown.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-slate-800 rounded-lg">
            <p className="text-slate-500 text-sm tracking-widest">NO ALERTS</p>
            <p className="text-slate-600 text-xs mt-2">Click “Generate Sample Alert” to feed the pipeline.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {shown.map((a) => {
              const st = sevStyle(a.analysis?.severity);
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(a.id)}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-lg border ${st.border} ${st.bg} hover:brightness-125 transition`}
                >
                  <div className={`mt-1 h-2.5 w-2.5 rounded-full ${st.dot} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-[10px] font-bold tracking-widest uppercase ${st.fg}`}>
                        {a.analysis?.severity ?? "PENDING"}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">{a.type}</span>
                      <span className="text-[10px] text-slate-600">{a.source}</span>
                      <span className="text-[10px] text-slate-600 ml-auto">{timeAgo(a.storedAt ?? a.detectedAt)}</span>
                    </div>
                    <p className="text-sm text-slate-100 mt-1 truncate">{a.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {a.host} · {a.user} · {a.analysis?.verdict ?? "awaiting triage"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Detail drawer */}
      {sel && <Detail alert={sel} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: number | string; accent: string; small?: boolean }) {
  return (
    <div className="border border-slate-800 bg-slate-900/40 rounded-lg px-4 py-3">
      <p className="text-[10px] text-slate-500 tracking-widest uppercase">{label}</p>
      <p className={`${small ? "text-base" : "text-2xl"} font-bold ${accent} mt-1`}>{value}</p>
    </div>
  );
}

function Detail({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const st = sevStyle(alert.analysis?.severity);
  const an = alert.analysis;
  return (
    <div className="fixed inset-0 z-20 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative w-full max-w-xl h-full bg-slate-900 border-l border-slate-800 overflow-y-auto">
        <div className={`p-5 border-b border-slate-800 ${st.bg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold tracking-widest uppercase ${st.fg}`}>
              {an?.severity ?? "PENDING"} · {an?.verdict ?? "—"}
            </span>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg leading-none">✕</button>
          </div>
          <h2 className="text-lg text-slate-100 mt-2">{alert.title}</h2>
          <p className="text-xs text-slate-500 mt-1">
            {alert.source} · {alert.type} · confidence {an?.confidence ?? "?"}%
          </p>
        </div>

        <div className="p-5 space-y-5 text-sm">
          {an?.summary && (
            <Section title="AI Summary">
              <p className="text-slate-300 leading-relaxed">{an.summary}</p>
            </Section>
          )}

          <Section title="Entities">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Field k="Host" v={alert.host} />
              <Field k="User" v={alert.user} />
              <Field k="Source IP" v={alert.srcIp} />
              <Field k="Dest IP" v={alert.destIp} />
              <Field k="Detected" v={new Date(alert.detectedAt).toLocaleString()} />
              <Field k="Alert ID" v={alert.id} />
            </dl>
          </Section>

          {alert.description && (
            <Section title="Detection">
              <p className="text-slate-400 text-xs leading-relaxed">{alert.description}</p>
            </Section>
          )}

          {an?.recommendedActions?.length ? (
            <Section title="Recommended Actions">
              <ol className="space-y-1.5">
                {an.recommendedActions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-300">
                    <span className="text-emerald-400">{String(i + 1).padStart(2, "0")}</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          {an?.mitre?.length ? (
            <Section title="MITRE ATT&CK">
              <div className="flex flex-wrap gap-2">
                {an.mitre.map((m) => (
                  <span key={m.id} className="text-[11px] px-2 py-1 rounded border border-slate-700 bg-slate-800/50 text-slate-300">
                    {m.id} · {m.name}
                  </span>
                ))}
              </div>
            </Section>
          ) : null}

          {an?.reasoning && (
            <Section title="Analyst Reasoning">
              <p className="text-slate-400 text-xs leading-relaxed italic">{an.reasoning}</p>
            </Section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] text-slate-500 tracking-widest uppercase mb-2">{title}</h3>
      {children}
    </div>
  );
}
function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-slate-600 uppercase tracking-wider text-[10px]">{k}</dt>
      <dd className="text-slate-300 break-all">{v || "—"}</dd>
    </div>
  );
}
