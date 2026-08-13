import { useEffect, useMemo, useRef, useState } from "react";

/* ---------- types (mirror of Catalog API) ---------- */
type Field = {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  required?: boolean;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  help?: string;
  pattern?: string;
};
type ResourceType = { id: string; name: string; description: string; fields: Field[] };
type ReqStatus =
  | "submitted" | "approved" | "planning" | "planned" | "plan_failed"
  | "rejected" | "applying" | "applied" | "apply_failed";
type RequestRecord = {
  id: string; type: string; typeName: string; displayName: string; region: string;
  params: Record<string, unknown>; status: ReqStatus; createdAt: string; createdBy: string;
  history: { at: string; event: string; by?: string; detail?: string }[];
  planOutput?: string; planAt?: string; applyOutput?: string; applyAt?: string;
  outputs?: Record<string, unknown>;
};

/* ---------- api helper (branch-aware) ---------- */
const BRANCH = new URLSearchParams(window.location.search).get("branch");
const api = (p: string) => (BRANCH ? `${p}${p.includes("?") ? "&" : "?"}branch=${BRANCH}` : p);

/* ---------- status metadata ---------- */
const STATUS: Record<ReqStatus, { label: string; fg: string; bg: string; bd: string; pulse?: boolean }> = {
  submitted:    { label: "AWAITING REVIEW", fg: "text-amber",     bg: "bg-amber/10",   bd: "border-amber/40" },
  approved:     { label: "APPROVED",        fg: "text-sky-300",   bg: "bg-sky-500/10", bd: "border-sky-500/40" },
  planning:     { label: "PLANNING",        fg: "text-sky-300",   bg: "bg-sky-500/10", bd: "border-sky-500/40", pulse: true },
  planned:      { label: "PLAN READY",      fg: "text-cyan-300",  bg: "bg-cyan-500/10",bd: "border-cyan-500/40" },
  plan_failed:  { label: "PLAN FAILED",     fg: "text-rose-300",  bg: "bg-rose-500/10",bd: "border-rose-500/40" },
  rejected:     { label: "REJECTED",        fg: "text-zinc-400",  bg: "bg-zinc-500/10",bd: "border-zinc-600/50" },
  applying:     { label: "APPLYING",        fg: "text-emerald-300",bg:"bg-emerald-500/10",bd:"border-emerald-500/40", pulse: true },
  applied:      { label: "LIVE",            fg: "text-emerald-300",bg:"bg-emerald-500/15",bd:"border-emerald-500/50" },
  apply_failed: { label: "APPLY FAILED",    fg: "text-rose-300",  bg: "bg-rose-500/10",bd: "border-rose-500/40" },
};

const TYPE_GLYPH: Record<string, string> = {
  ec2_instance: "▚", s3_bucket: "▤", rds_postgres: "◈",
};

function fmtTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* ============================================================= */
export default function App() {
  const [types, setTypes] = useState<ResourceType[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await fetch(api("/api/requests"));
      const j = await r.json();
      setRequests(j.requests ?? []);
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    fetch(api("/api/catalog")).then((r) => r.json()).then((j) => setTypes(j.types ?? [])).catch(() => {});
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c = { awaiting: 0, progress: 0, live: 0, failed: 0 };
    for (const r of requests) {
      if (r.status === "submitted") c.awaiting++;
      else if (["approved", "planning", "planned", "applying"].includes(r.status)) c.progress++;
      else if (r.status === "applied") c.live++;
      else if (r.status.endsWith("failed")) c.failed++;
    }
    return c;
  }, [requests]);

  const FILTERS: { id: string; label: string; test: (s: ReqStatus) => boolean }[] = [
    { id: "all", label: "ALL", test: () => true },
    { id: "awaiting", label: "AWAITING", test: (s) => s === "submitted" },
    { id: "progress", label: "IN PROGRESS", test: (s) => ["approved", "planning", "planned", "applying"].includes(s) },
    { id: "live", label: "LIVE", test: (s) => s === "applied" },
    { id: "failed", label: "FAILED", test: (s) => s.endsWith("failed") || s === "rejected" },
  ];
  const activeFilter = FILTERS.find((f) => f.id === filter)!;
  const shown = requests.filter((r) => activeFilter.test(r.status));
  const selectedRec = requests.find((r) => r.id === selected) ?? null;

  return (
    <div className="min-h-full font-sans text-[#cdd6e0]">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center border border-amber/50 bg-amber/10 text-amber">
            <span className="font-mono text-lg leading-none">λ</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-mono text-sm font-semibold tracking-[0.25em] text-amber">
              INFRA&nbsp;·&nbsp;PROVISIONING&nbsp;CONSOLE
            </h1>
            <p className="font-mono text-[11px] tracking-wide text-zinc-500">
              terraform &rarr; aws &nbsp;//&nbsp; request · review · plan · apply
            </p>
          </div>
          <div className="ml-auto flex items-center gap-5">
            <div className="hidden items-center gap-2 font-mono text-[11px] sm:flex">
              <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400 blink" : "bg-rose-500"}`} />
              <span className="text-zinc-400">{online ? "LINK ACTIVE" : "OFFLINE"}</span>
            </div>
            <button
              onClick={() => setCreating(true)}
              className="border border-amber bg-amber px-4 py-2 font-mono text-xs font-semibold tracking-widest text-ink transition hover:bg-amber-dim hover:border-amber-dim"
            >
              + NEW REQUEST
            </button>
          </div>
        </div>
      </header>

      {/* ---------- stat strip ---------- */}
      <div className="border-b border-line bg-panel/40">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-line sm:grid-cols-4">
          <Stat label="AWAITING REVIEW" value={counts.awaiting} tone="text-amber" />
          <Stat label="IN PROGRESS" value={counts.progress} tone="text-sky-300" />
          <Stat label="LIVE" value={counts.live} tone="text-emerald-300" />
          <Stat label="FAILED / REJECTED" value={counts.failed} tone="text-rose-300" />
        </div>
      </div>

      {/* ---------- toolbar ---------- */}
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`border px-3 py-1.5 font-mono text-[11px] tracking-widest transition ${
                filter === f.id
                  ? "border-amber bg-amber/10 text-amber"
                  : "border-line text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[11px] text-zinc-600">
            {shown.length} record{shown.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* ---------- request grid ---------- */}
      <main className="mx-auto max-w-7xl px-6 py-6">
        {!loaded ? (
          <div className="py-24 text-center font-mono text-sm text-zinc-600">LOADING<span className="blink">_</span></div>
        ) : shown.length === 0 ? (
          <EmptyState onNew={() => setCreating(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((r, i) => (
              <RequestCard key={r.id} rec={r} index={i} onOpen={() => setSelected(r.id)} />
            ))}
          </div>
        )}
      </main>

      {creating && (
        <NewRequestModal types={types} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />
      )}
      {selectedRec && (
        <DetailDrawer rec={selectedRec} onClose={() => setSelected(null)} onChanged={refresh} />
      )}

      <footer className="mx-auto max-w-7xl px-6 py-8 font-mono text-[11px] text-zinc-700">
        state persisted · terraform state stored per-request · plans require explicit apply
      </footer>
    </div>
  );
}

/* ---------- small pieces ---------- */
function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="px-6 py-5">
      <div className={`font-mono text-3xl font-semibold ${tone}`}>{String(value).padStart(2, "0")}</div>
      <div className="mt-1 font-mono text-[10px] tracking-widest text-zinc-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReqStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] tracking-widest ${s.bg} ${s.fg} ${s.bd}`}>
      {s.pulse && <span className="h-1.5 w-1.5 rounded-full bg-current blink" />}
      {s.label}
    </span>
  );
}

function RequestCard({ rec, index, onOpen }: { rec: RequestRecord; index: number; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{ animationDelay: `${index * 40}ms` }}
      className="tick rise group flex flex-col border border-line bg-panel/70 p-4 text-left transition hover:border-amber/50 hover:bg-panel2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center border border-line text-amber text-lg group-hover:border-amber/50">
            {TYPE_GLYPH[rec.type] ?? "▩"}
          </span>
          <div>
            <div className="font-mono text-sm font-semibold text-zinc-100">{rec.displayName}</div>
            <div className="font-mono text-[11px] text-zinc-500">{rec.typeName}</div>
          </div>
        </div>
        <StatusBadge status={rec.status} />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 font-mono text-[11px] text-zinc-500">
        <span>{rec.region}</span>
        <span>{fmtTime(rec.createdAt)}</span>
      </div>
    </button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="tick mx-auto mt-10 max-w-lg border border-line bg-panel/50 p-12 text-center">
      <div className="font-mono text-4xl text-amber/70">∅</div>
      <p className="mt-4 font-mono text-sm text-zinc-400">No requests in this view.</p>
      <p className="mt-1 font-mono text-[11px] text-zinc-600">Submit an infrastructure request to get started.</p>
      <button onClick={onNew} className="mt-6 border border-amber bg-amber px-4 py-2 font-mono text-xs font-semibold tracking-widest text-ink hover:bg-amber-dim">
        + NEW REQUEST
      </button>
    </div>
  );
}

/* ---------- new request modal ---------- */
function NewRequestModal({ types, onClose, onCreated }: { types: ResourceType[]; onClose: () => void; onCreated: () => void }) {
  const [typeId, setTypeId] = useState<string | null>(null);
  const type = types.find((t) => t.id === typeId) ?? null;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function pick(t: ResourceType) {
    const init: Record<string, unknown> = {};
    for (const f of t.fields) if (f.default !== undefined) init[f.name] = f.default;
    setValues(init);
    setErrors([]);
    setTypeId(t.id);
  }

  async function submit() {
    if (!type) return;
    setSubmitting(true);
    setErrors([]);
    try {
      const r = await fetch(api("/api/requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: type.id, params: values }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErrors(j.details ?? [j.error ?? "Request failed"]);
        setSubmitting(false);
        return;
      }
      onCreated();
    } catch (e) {
      setErrors([String(e)]);
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="tick w-full max-w-2xl border border-line bg-panel shadow-2xl">
        <ModalHead title={type ? `NEW ${type.name.toUpperCase()}` : "NEW REQUEST"} onClose={onClose} />
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {!type ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {types.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pick(t)}
                  className="group flex flex-col border border-line bg-panel2/60 p-4 text-left transition hover:border-amber/60 hover:bg-panel2"
                >
                  <span className="text-2xl text-amber">{TYPE_GLYPH[t.id] ?? "▩"}</span>
                  <span className="mt-3 font-mono text-sm font-semibold text-zinc-100">{t.name}</span>
                  <span className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">{t.description}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <button onClick={() => setTypeId(null)} className="font-mono text-[11px] text-zinc-500 hover:text-amber">
                &larr; change type
              </button>
              {type.fields.map((f) => (
                <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
              ))}
              {errors.length > 0 && (
                <div className="border border-rose-500/40 bg-rose-500/10 p-3 font-mono text-[11px] text-rose-300">
                  {errors.map((e, i) => <div key={i}>! {e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
        {type && (
          <div className="flex items-center justify-end gap-3 border-t border-line bg-ink/40 px-6 py-4">
            <button onClick={onClose} className="border border-line px-4 py-2 font-mono text-xs tracking-widest text-zinc-400 hover:border-zinc-600">
              CANCEL
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="border border-amber bg-amber px-5 py-2 font-mono text-xs font-semibold tracking-widest text-ink hover:bg-amber-dim disabled:opacity-50"
            >
              {submitting ? "SUBMITTING…" : "SUBMIT REQUEST"}
            </button>
          </div>
        )}
      </div>
    </Overlay>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const base = "w-full border border-line bg-ink px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-amber";
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[11px] tracking-widest text-zinc-300">
          {field.label.toUpperCase()} {field.required && <span className="text-amber">*</span>}
        </span>
      </div>
      {field.type === "select" ? (
        <select className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : field.type === "boolean" ? (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`flex items-center gap-2 border px-3 py-2 font-mono text-xs tracking-widest ${value ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-line text-zinc-500"}`}
        >
          <span className={`h-3 w-3 border ${value ? "border-emerald-400 bg-emerald-400" : "border-zinc-600"}`} />
          {value ? "ENABLED" : "DISABLED"}
        </button>
      ) : (
        <input
          className={base}
          type={field.type === "number" ? "number" : "text"}
          value={String(value ?? "")}
          onChange={(e) => onChange(field.type === "number" ? e.target.value : e.target.value)}
        />
      )}
      {field.help && <p className="mt-1 font-mono text-[10px] text-zinc-600">{field.help}</p>}
    </label>
  );
}

/* ---------- detail drawer ---------- */
function DetailDrawer({ rec, onClose, onChanged }: { rec: RequestRecord; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(api(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? "Action failed");
      await onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = STATUS[rec.status];

  return (
    <Overlay onClose={onClose} align="right">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-line bg-panel shadow-2xl">
        <div className="flex items-start justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-line text-xl text-amber">{TYPE_GLYPH[rec.type] ?? "▩"}</span>
            <div>
              <div className="font-mono text-base font-semibold text-zinc-100">{rec.displayName}</div>
              <div className="font-mono text-[11px] text-zinc-500">{rec.typeName} · {rec.id}</div>
            </div>
          </div>
          <button onClick={onClose} className="font-mono text-lg text-zinc-500 hover:text-amber">✕</button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <StatusBadge status={rec.status} />
            <span className="font-mono text-[11px] text-zinc-500">requested by {rec.createdBy}</span>
          </div>

          {/* params */}
          <Section title="PARAMETERS">
            <div className="border border-line">
              {Object.entries(rec.params).map(([k, v], i) => (
                <div key={k} className={`flex justify-between px-3 py-2 font-mono text-[12px] ${i % 2 ? "bg-panel2/40" : ""}`}>
                  <span className="text-zinc-500">{k}</span>
                  <span className="text-zinc-200">{String(v)}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* outputs */}
          {rec.outputs && Object.keys(rec.outputs).length > 0 && (
            <Section title="OUTPUTS">
              <div className="border border-emerald-500/30">
                {Object.entries(rec.outputs).map(([k, v], i) => (
                  <div key={k} className={`flex justify-between gap-4 px-3 py-2 font-mono text-[12px] ${i % 2 ? "bg-emerald-500/5" : ""}`}>
                    <span className="text-emerald-500/80">{k}</span>
                    <span className="break-all text-right text-emerald-200">{String(v)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* terminal output */}
          {rec.planOutput && <Terminal title={`terraform plan · ${fmtTime(rec.planAt)}`} text={rec.planOutput} />}
          {rec.applyOutput && <Terminal title={`terraform apply · ${fmtTime(rec.applyAt)}`} text={rec.applyOutput} />}

          {/* history */}
          <Section title="HISTORY">
            <ol className="space-y-2">
              {[...rec.history].reverse().map((h, i) => (
                <li key={i} className="flex items-start gap-3 font-mono text-[11px]">
                  <span className="text-amber">◦</span>
                  <span className="text-zinc-300">{h.event}</span>
                  {h.by && <span className="text-zinc-600">· {h.by}</span>}
                  <span className="ml-auto text-zinc-600">{fmtTime(h.at)}</span>
                </li>
              ))}
            </ol>
          </Section>

          {err && <div className="border border-rose-500/40 bg-rose-500/10 p-3 font-mono text-[11px] text-rose-300">! {err}</div>}
        </div>

        {/* actions */}
        <div className="border-t border-line bg-ink/40 px-6 py-4">
          {rec.status === "submitted" && (
            <div className="flex gap-3">
              <button disabled={busy} onClick={() => post("/api/decision", { id: rec.id, decision: "reject" })}
                className="flex-1 border border-rose-500/50 bg-rose-500/10 py-2.5 font-mono text-xs font-semibold tracking-widest text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
                REJECT
              </button>
              <button disabled={busy} onClick={() => post("/api/decision", { id: rec.id, decision: "approve" })}
                className="flex-[2] border border-emerald-500 bg-emerald-500/90 py-2.5 font-mono text-xs font-semibold tracking-widest text-ink hover:bg-emerald-400 disabled:opacity-50">
                APPROVE &amp; GENERATE PLAN
              </button>
            </div>
          )}
          {rec.status === "planned" && (
            <div className="space-y-2">
              <p className="font-mono text-[11px] text-amber">⚠ apply creates real, billable AWS resources.</p>
              <button disabled={busy} onClick={() => post("/api/apply", { id: rec.id })}
                className="w-full border border-amber bg-amber py-2.5 font-mono text-xs font-semibold tracking-widest text-ink hover:bg-amber-dim disabled:opacity-50">
                {busy ? "SUBMITTING…" : "CONFIRM & APPLY"}
              </button>
            </div>
          )}
          {["planning", "applying", "approved"].includes(rec.status) && (
            <p className="text-center font-mono text-xs text-sky-300">
              <span className="blink">▮</span> {STATUS[rec.status].label} — updates automatically
            </p>
          )}
          {["applied", "rejected"].includes(rec.status) && (
            <p className="text-center font-mono text-xs text-zinc-500">Request {rec.status}. No further action.</p>
          )}
          {rec.status.endsWith("failed") && (
            <p className="text-center font-mono text-xs text-rose-300">Terraform reported a failure — review the output above.</p>
          )}
        </div>
      </div>
    </Overlay>
  );
}

function Terminal({ title, text }: { title: string; text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  return (
    <Section title={title}>
      <pre ref={ref} className="max-h-72 overflow-auto border border-line bg-ink p-3 font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap">
        {text}
      </pre>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] tracking-[0.25em] text-zinc-500">{title}</div>
      {children}
    </div>
  );
}

/* ---------- overlay + modal chrome ---------- */
function Overlay({ children, onClose, align = "center" }: { children: React.ReactNode; onClose: () => void; align?: "center" | "right" }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className={`fixed inset-0 z-40 flex bg-black/70 backdrop-blur-sm ${align === "right" ? "justify-end" : "items-center justify-center p-4"}`} onClick={onClose}>
      <div className={align === "right" ? "h-full rise-x" : "rise"} onClick={(e) => e.stopPropagation()} style={align === "right" ? { animation: "riseX .3s ease-out both" } : undefined}>
        {children}
      </div>
    </div>
  );
}

function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-6 py-4">
      <h2 className="font-mono text-sm font-semibold tracking-[0.2em] text-amber">{title}</h2>
      <button onClick={onClose} className="font-mono text-lg text-zinc-500 hover:text-amber">✕</button>
    </div>
  );
}
