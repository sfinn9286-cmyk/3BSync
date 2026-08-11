import { useEffect, useRef, useState } from "react";
import { Shell } from "./node";

type Entry = { kind: "cmd" | "out" | "err" | "note"; text: string; prompt?: string };

const BANNER = [
  "Exam workstation — a simulated cluster in your browser. No real cluster is contacted.",
  "kubectl runs here; 'ssh <node>' drops you onto a node for systemctl, journalctl, crictl and etcdctl.",
  "Heredocs work: kubectl apply -f - <<EOF … EOF, and cat > /path <<EOF … EOF on a node. Type 'help'.",
];

export function Terminal({
  shell,
  contextName,
  onRan,
  onReset,
  className = "",
}: {
  shell: Shell;
  contextName: string;
  onRan?: () => void;
  onReset?: () => void;
  className?: string;
}) {
  const [entries, setEntries] = useState<Entry[]>(() => BANNER.map((text) => ({ kind: "note", text })));
  const [input, setInput] = useState("");
  const [buffer, setBuffer] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyAt, setHistoryAt] = useState<number | null>(null);
  const [prompt, setPrompt] = useState(shell.prompt);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [entries, buffer]);

  useEffect(() => {
    setPrompt(shell.prompt);
  }, [shell]);

  const heredocOpen = buffer.length > 0;

  const submit = () => {
    const line = input;
    setInput("");
    setHistoryAt(null);

    if (heredocOpen) {
      const terminator = buffer[0].match(/<<-?'?([A-Za-z_][A-Za-z0-9_]*)'?/)?.[1] ?? "EOF";
      if (line.trim() === terminator) {
        const full = buffer.join("\n");
        setBuffer([]);
        run(full, [...buffer.slice(1), line]);
        return;
      }
      setBuffer((b) => [...b, line]);
      return;
    }

    if (!line.trim()) {
      setEntries((e) => [...e, { kind: "cmd", text: "" }]);
      return;
    }

    setHistory((h) => [line, ...h.filter((x) => x !== line)].slice(0, 100));

    if (line.trim() === "clear") {
      setEntries([]);
      return;
    }

    if (/<<-?'?[A-Za-z_][A-Za-z0-9_]*'?\s*$/.test(line)) {
      setBuffer([line]);
      return;
    }

    run(line, []);
  };

  const run = (command: string, extraEcho: string[]) => {
    const firstLine = command.includes("\n") ? command.slice(0, command.indexOf("\n")) : command;
    const at = shell.prompt;
    setEntries((e) => [
      ...e,
      { kind: "cmd", text: firstLine, prompt: at },
      ...extraEcho.map((text) => ({ kind: "cmd" as const, text: `> ${text}` })),
    ]);
    const result = shell.run(command);
    if (result.out) {
      setEntries((e) => [...e, { kind: result.code === 0 ? "out" : "err", text: result.out }]);
    }
    setPrompt(shell.prompt);
    onRan?.();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "ArrowUp" && !heredocOpen) {
      e.preventDefault();
      if (!history.length) return;
      const next = historyAt === null ? 0 : Math.min(history.length - 1, historyAt + 1);
      setHistoryAt(next);
      setInput(history[next]);
      return;
    }
    if (e.key === "ArrowDown" && !heredocOpen) {
      e.preventDefault();
      if (historyAt === null) return;
      const next = historyAt - 1;
      if (next < 0) {
        setHistoryAt(null);
        setInput("");
      } else {
        setHistoryAt(next);
        setInput(history[next]);
      }
      return;
    }
    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setEntries([]);
    }
  };

  const tone: Record<Entry["kind"], string> = {
    cmd: "text-ink",
    out: "text-teal/90",
    err: "text-bad",
    note: "text-dim",
  };

  return (
    <div
      className={`border border-edge bg-void/90 font-mono text-[12.5px] ${className}`}
      onClick={() => field.current?.focus()}
    >
      <div className="flex items-center justify-between border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-[0.2em] text-dim">
          {contextName} — simulated
        </span>
        <div className="flex items-center gap-3">
          {onReset && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEntries([...BANNER.map((text) => ({ kind: "note" as const, text })), { kind: "note", text: "cluster reset to its starting state." }]);
                setBuffer([]);
                onReset();
              }}
              className="text-[10px] uppercase tracking-[0.18em] text-dim hover:text-bad"
            >
              reset cluster
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEntries(BANNER.map((text) => ({ kind: "note", text })));
              setBuffer([]);
            }}
            className="text-[10px] uppercase tracking-[0.18em] text-dim hover:text-ink"
          >
            clear
          </button>
        </div>
      </div>
      <div ref={scroller} className="max-h-96 min-h-56 overflow-y-auto px-3 py-2">
        {entries.map((entry, i) => (
          <pre key={i} className={`whitespace-pre-wrap break-words ${tone[entry.kind]}`}>
            {entry.kind === "cmd" && !entry.text.startsWith("> ") ? (
              <>
                <span className="text-signal">{entry.prompt ?? prompt} </span>
                {entry.text}
              </>
            ) : (
              entry.text
            )}
          </pre>
        ))}
        {buffer.map((line, i) => (
          <pre key={`buf-${i}`} className="whitespace-pre-wrap break-words text-ink">
            {i === 0 ? (
              <>
                <span className="text-signal">{prompt} </span>
                {line}
              </>
            ) : (
              `> ${line}`
            )}
          </pre>
        ))}
        <div className="flex items-baseline">
          <span className={heredocOpen ? "text-dim" : "text-signal"}>{heredocOpen ? ">" : prompt}</span>
          <input
            ref={field}
            value={input}
            spellCheck={false}
            autoComplete="off"
            aria-label="shell command"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={heredocOpen ? "" : "kubectl get pods -A"}
            className="ml-1 flex-1 bg-transparent text-ink caret-signal outline-none placeholder:text-dim/40"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              submit();
            }}
            className="ml-3 shrink-0 border border-edge px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-dim hover:border-signal hover:text-signal"
          >
            {heredocOpen ? "line" : "run"}
          </button>
        </div>
        {heredocOpen && (
          <p className="mt-1 text-[11px] text-dim">
            heredoc open — enter the manifest line by line, then a line reading EOF
          </p>
        )}
      </div>
    </div>
  );
}
