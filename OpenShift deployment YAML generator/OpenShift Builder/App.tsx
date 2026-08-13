import { useState } from "react";
import { SECTIONS, DEFAULTS } from "./fields";
import FieldInput from "./components/FieldInput";
import YamlView from "./components/YamlView";

declare global {
  interface Window {
    __BRANCH__?: string;
  }
}

const GENERATE_URL = (() => {
  const branch = window.__BRANCH__ || "";
  return "/generate-openshift" + (branch ? `?branch=${branch}` : "");
})();

export default function App() {
  const [form, setForm] = useState<Record<string, any>>({ ...DEFAULTS });
  const [yaml, setYaml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const requiredKeys = SECTIONS.flatMap((s) => s.fields.filter((f) => f.required).map((f) => f.key));
  const missing = requiredKeys.filter((k) => !form[k] || String(form[k]).trim() === "");

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(GENERATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          msg = JSON.parse(text).error || text;
        } catch {}
        setError(msg);
        setYaml("");
      } else {
        setYaml(text);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-console min-h-screen">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-5 md:px-10">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--violet)] shadow-[0_0_24px_rgba(139,109,255,0.5)]">
              <span className="font-display text-xl font-extrabold text-white">t</span>
            </div>
            <div>
              <h1 className="font-display text-[19px] font-extrabold leading-none tracking-tight text-white">
                OpenShift Manifest Builder
              </h1>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
                Tines · Helm chart 42.2.2
              </p>
            </div>
          </div>
          <a
            href="https://www.tines.com/docs/self-hosting/"
            target="_blank"
            className="hidden font-mono text-[12px] uppercase tracking-wider text-white/45 transition-colors hover:text-[var(--violet-bright)] sm:block"
          >
            Self-hosting docs ↗
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-1 gap-6 px-6 py-8 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Form column */}
        <div className="space-y-5">
          <div className="rise">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[40px] md:leading-[1.05]">
              Configure your
              <br />
              <span className="bg-gradient-to-r from-[var(--violet-bright)] to-sky-300 bg-clip-text text-transparent">
                self-hosted deployment
              </span>
            </h2>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/50">
              Enter your environment details. We render the latest Tines Helm chart with OpenShift
              capabilities enabled and hand back the exact manifests to <code className="font-mono text-[var(--violet-bright)]">oc apply</code>.
            </p>
          </div>

          {SECTIONS.map((section, si) => (
            <section
              key={section.id}
              className="rise rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6"
              style={{ animationDelay: `${si * 55}ms` }}
            >
              <div className="mb-4 flex items-baseline gap-3">
                <span className="font-mono text-[13px] text-[var(--violet)]/70">
                  {String(si + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold tracking-tight text-white">
                    {section.title}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-white/40">{section.blurb}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.fields.map((f) => {
                  const hidden =
                    section.id === "route" && f.key !== "routeEnabled" && !form.routeEnabled;
                  if (hidden) return null;
                  return (
                    <div key={f.key} className={f.span === 2 ? "sm:col-span-2" : ""}>
                      <FieldInput field={f} value={form[f.key]} onChange={(v) => set(f.key, v)} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Output column */}
        <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-6rem)]">
          <div className="flex h-full flex-col gap-4">
            <button
              onClick={generate}
              disabled={loading}
              className="group relative overflow-hidden rounded-xl bg-[var(--violet)] px-6 py-4 font-display text-lg font-bold tracking-tight text-white shadow-[0_8px_40px_-8px_rgba(139,109,255,0.6)] transition-all hover:bg-[var(--violet-bright)] disabled:opacity-60"
            >
              {loading ? "Rendering…" : "Generate OpenShift YAML"}
              <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span>
            </button>

            {missing.length > 0 && (
              <p className="-mt-1 font-mono text-[12px] text-amber-300/70">
                {missing.length} required field{missing.length > 1 ? "s" : ""} still empty — output may fail to render.
              </p>
            )}

            <div className="min-h-0 flex-1">
              <YamlView yaml={yaml} loading={loading} error={error} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 px-6 py-5 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-white/25 md:px-10">
        Rendered with helm template · api-versions security.openshift.io/v1
      </footer>
    </div>
  );
}
