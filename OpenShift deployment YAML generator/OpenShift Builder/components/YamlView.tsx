import { useMemo, useState } from "react";

// Lightweight YAML highlighter — enough to make the manifest readable.
function highlightLine(line: string, i: number) {
  if (line.startsWith("---")) {
    return <span className="text-[var(--violet-bright)]">{line}</span>;
  }
  if (/^\s*#/.test(line)) {
    return <span className="text-emerald-300/50 italic">{line}</span>;
  }
  const m = line.match(/^(\s*-?\s*)([A-Za-z0-9_.\/-]+)(:)(.*)$/);
  if (m) {
    return (
      <>
        <span>{m[1]}</span>
        <span className="text-sky-300">{m[2]}</span>
        <span className="text-white/30">{m[3]}</span>
        <span className="text-amber-200/90">{m[4]}</span>
      </>
    );
  }
  return <span className="text-white/80">{line}</span>;
}

export default function YamlView({
  yaml,
  loading,
  error,
}: {
  yaml: string;
  loading: boolean;
  error: string;
}) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => yaml.split("\n"), [yaml]);

  const copy = () => {
    navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tines-openshift.yaml";
    a.click();
    URL.revokeObjectURL(url);
  };

  const docCount = yaml ? yaml.split(/^---$/m).filter((s) => s.trim()).length : 0;

  return (
    <div className="flex flex-col h-full rounded-2xl border border-white/10 bg-[#0b0a11]/80 backdrop-blur-sm overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-400/60" />
            <span className="h-3 w-3 rounded-full bg-amber-300/60" />
            <span className="h-3 w-3 rounded-full bg-emerald-400/60" />
          </div>
          <span className="ml-1 font-mono text-[13px] text-white/45">tines-openshift.yaml</span>
          {docCount > 0 && (
            <span className="ml-1 rounded-md bg-[var(--violet)]/15 px-2 py-0.5 font-mono text-[11px] text-[var(--violet-bright)]">
              {docCount} objects
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            disabled={!yaml}
            className="rounded-md border border-white/10 px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider text-white/70 transition-colors hover:border-[var(--violet)] hover:text-white disabled:opacity-30"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button
            onClick={download}
            disabled={!yaml}
            className="rounded-md bg-[var(--violet)] px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider text-white transition-colors hover:bg-[var(--violet-bright)] disabled:opacity-30"
          >
            Download
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-auto">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0a11]/70 backdrop-blur-sm">
            <div className="flex items-center gap-3 font-mono text-sm text-[var(--violet-bright)]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--violet)] border-t-transparent" />
              Rendering chart…
            </div>
          </div>
        )}

        {error && (
          <div className="m-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 font-mono text-[13px] leading-relaxed text-rose-200 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {!error && yaml && (
          <pre className="p-4 font-mono text-[12.5px] leading-[1.65]">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="w-10 flex-none select-none pr-4 text-right text-white/15">{i + 1}</span>
                <code className="flex-1 whitespace-pre-wrap break-all">{highlightLine(line, i)}</code>
              </div>
            ))}
          </pre>
        )}

        {!error && !yaml && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="font-display text-2xl text-white/25">Awaiting configuration</div>
            <p className="max-w-xs text-sm text-white/30">
              Fill in the environment details and hit Generate to render the OpenShift manifests
              from the latest Tines Helm chart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
