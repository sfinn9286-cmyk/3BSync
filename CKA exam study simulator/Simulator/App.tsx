import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cluster, type ClusterInit } from "./cluster";
import { Shell } from "./node";
import { evaluateLab } from "./checks";
import { deriveHints } from "./hints";
import { Terminal } from "./Terminal";
import {
  api,
  CHEATSHEET,
  DOMAIN_SHORT,
  fmtClock,
  fmtPct,
  type Grade,
  type Meta,
  type Progress,
  type Question,
} from "./lib";

type Answer = { text: string; selectedIndex?: number; flagged: boolean };
type Mode = "exam" | "drill";
type Tab = "dashboard" | "exam" | "drill" | "cheatsheet";

const EXAM_SECONDS = 120 * 60;
const PASS_ESTIMATE = 0.66;

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-edge bg-panel/80 backdrop-blur-sm ${className}`}>{children}</div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-[0.22em] text-dim">{children}</span>
  );
}

function Bar({ value, tone = "signal" }: { value: number; tone?: "signal" | "teal" }) {
  const color = tone === "signal" ? "bg-signal" : "bg-teal";
  return (
    <div className="h-1.5 w-full bg-edge">
      <div
        className={`h-full ${color} transition-[width] duration-700`}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

function TypeTag({ type }: { type: Question["type"] }) {
  const map: Record<Question["type"], string> = {
    lab: "border-good/60 text-good",
    scenario: "border-signal/50 text-signal",
    command: "border-teal/50 text-teal",
    mcq: "border-dim/40 text-dim",
  };
  return (
    <span className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-widest ${map[type]}`}>
      {type === "lab" ? "hands-on" : type}
    </span>
  );
}

function VerdictTag({ grade }: { grade: Grade }) {
  const tone =
    grade.verdict === "correct"
      ? "border-good/60 text-good"
      : grade.verdict === "partial"
        ? "border-signal/60 text-signal"
        : "border-bad/60 text-bad";
  return (
    <span className={`border px-2 py-0.5 text-[11px] uppercase tracking-widest ${tone}`}>
      {grade.verdict} · {fmtPct(grade.score)}
    </span>
  );
}

function GradeDetail({ question, grade }: { question: Question; grade: Grade }) {
  return (
    <div className="space-y-4 border-t border-edge pt-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictTag grade={grade} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-dim">
          graded: {grade.graded === "ai" ? "claude" : grade.graded}
        </span>
      </div>

      {grade.feedback && <p className="leading-relaxed text-ink/90">{grade.feedback}</p>}

      {grade.rubricResults && grade.rubricResults.length > 0 && (
        <ul className="space-y-1.5">
          {grade.rubricResults.map((r, i) => (
            <li key={i} className="flex gap-2 text-[13px]">
              <span className={r.met ? "text-good" : "text-bad"}>{r.met ? "✓" : "✗"}</span>
              <span className="text-ink/80">
                {r.point}
                {r.note && <span className="text-dim"> — {r.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {grade.graded === "self" && grade.rubric && grade.rubric.length > 0 && (
        <div>
          <Label>Self-assess against the rubric</Label>
          <ul className="mt-2 space-y-1.5">
            {grade.rubric.map((r, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-ink/80">
                <span className="text-dim">□</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(grade.modelAnswer || question.answer) && (
        <div>
          <Label>Model answer</Label>
          <pre className="mt-2 overflow-x-auto border border-edge bg-void/70 p-3 text-[12.5px] leading-relaxed text-teal">
            {grade.modelAnswer ?? question.answer}
          </pre>
        </div>
      )}

      {grade.correctOption && (
        <div>
          <Label>Correct option</Label>
          <p className="mt-1 text-teal">{grade.correctOption}</p>
        </div>
      )}

      {grade.correctedAnswer && (
        <div>
          <Label>Your answer, corrected</Label>
          <pre className="mt-2 overflow-x-auto border border-edge bg-void/70 p-3 text-[12.5px] leading-relaxed text-ink/90">
            {grade.correctedAnswer}
          </pre>
        </div>
      )}

      {question.verify && (
        <div>
          <Label>Verify with</Label>
          <pre className="mt-2 overflow-x-auto border border-edge bg-void/70 p-3 text-[12.5px] text-dim">
            {question.verify}
          </pre>
        </div>
      )}

      {question.explanation && question.explanation !== grade.feedback && (
        <p className="border-l-2 border-signal/60 pl-3 text-[13px] leading-relaxed text-dim">
          {question.explanation}
        </p>
      )}
    </div>
  );
}

function AnswerReveal({ question }: { question: Question }) {
  const correctOption =
    question.type === "mcq" && typeof question.answerIndex === "number"
      ? `${String.fromCharCode(65 + question.answerIndex)} — ${question.options?.[question.answerIndex] ?? ""}`
      : null;

  return (
    <div className="mt-5 space-y-4 border border-teal/40 bg-teal/5 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Label>answer preview</Label>
        <span className="text-[10px] uppercase tracking-[0.2em] text-dim">
          revealed before grading
        </span>
      </div>

      {correctOption && (
        <div>
          <Label>Correct option</Label>
          <p className="mt-1 text-[13.5px] text-teal">{correctOption}</p>
        </div>
      )}

      {question.answer && (
        <div>
          <Label>Model answer</Label>
          <pre className="mt-2 overflow-x-auto border border-edge bg-void/70 p-3 text-[12.5px] leading-relaxed text-teal">
            {question.answer}
          </pre>
        </div>
      )}

      {question.explanation && (
        <div>
          <Label>Why this is correct</Label>
          <p className="mt-1.5 border-l-2 border-signal/60 pl-3 text-[13px] leading-relaxed text-ink/85">
            {question.explanation}
          </p>
        </div>
      )}

      {question.rubric && question.rubric.length > 0 && (
        <div>
          <Label>What a grader looks for</Label>
          <ul className="mt-2 space-y-1.5">
            {question.rubric.map((r, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-ink/80">
                <span className="text-teal">·</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {question.accepted && question.accepted.length > 0 && (
        <div>
          <Label>Also accepted</Label>
          <ul className="mt-2 space-y-1.5">
            {question.accepted.map((a, i) => (
              <li key={i}>
                <code className="text-[12.5px] text-teal/85">{a}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {question.verify && (
        <div>
          <Label>Verify with</Label>
          <pre className="mt-2 overflow-x-auto border border-edge bg-void/70 p-3 text-[12.5px] text-dim">
            {question.verify}
          </pre>
        </div>
      )}

      <a
        href={question.doc}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-[12px] text-teal underline decoration-teal/40 underline-offset-4 hover:decoration-teal"
      >
        source: {question.doc.replace(/^https?:\/\//, "")}
      </a>
    </div>
  );
}

function HintSection({ question }: { question: Question }) {
  const hints = useMemo(() => deriveHints(question), [question]);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
  }, [question.id]);

  if (hints.length === 0) return null;

  return (
    <div className="mt-6 border border-signal/30 bg-signal/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Label>hints</Label>
          <span className="text-[10px] uppercase tracking-[0.2em] text-dim">
            {shown}/{hints.length} revealed · no effect on your score
          </span>
        </div>
        <div className="flex gap-2">
          {shown < hints.length && (
            <button
              type="button"
              onClick={() => setShown((n) => n + 1)}
              className="border border-signal/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-signal hover:bg-signal/10"
            >
              {shown === 0 ? "reveal a hint" : "another hint"}
            </button>
          )}
          {shown > 0 && (
            <button
              type="button"
              onClick={() => setShown(0)}
              className="border border-edge px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-dim hover:border-dim hover:text-ink"
            >
              hide
            </button>
          )}
        </div>
      </div>

      {shown === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-dim">
          Hints escalate: the shape of the command first, then the flags and fields that matter,
          then where to look it up. The model answer stays behind “preview answer”.
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {hints.slice(0, shown).map((hint, i) => (
            <li key={hint.label}>
              <Label>
                hint {i + 1} — {hint.label}
              </Label>
              <pre className="mt-1.5 overflow-x-auto border border-edge bg-void/70 p-3 text-[12.5px] leading-relaxed text-teal">
                {hint.lines.join("\n")}
              </pre>
              {hint.note && <p className="mt-1.5 text-[11.5px] text-dim">{hint.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LabPane({
  question,
  shell,
  mode,
  onRan,
  onReset,
}: {
  question: Question;
  shell: Shell;
  mode: Mode;
  onRan: () => void;
  onReset: () => void;
}) {
  const lab = question.lab!;
  return (
    <div className="space-y-4">
      <div className="border border-edge bg-void/50 p-3">
        <Label>environment given to you</Label>
        <p className="mt-1 text-[12.5px] leading-relaxed text-dim">{lab.brief}</p>
      </div>

      <Terminal shell={shell} contextName={lab.init.context ?? "kubernetes-admin@kubernetes"} onRan={onRan} onReset={onReset} />

      <div className="border border-edge p-3">
        <Label>graded on the resulting state</Label>
        <ul className="mt-2 space-y-1.5">
          {lab.checks.map((c, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] text-ink/75">
              <span className="text-dim">□</span>
              {c.description}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-dim">
          {mode === "exam"
            ? "Nothing is verified until you submit — exactly like the real exam. Each check is worth an equal share of the task."
            : "Press “verify cluster” to run these checks against the cluster and nodes as they stand."}
        </p>
      </div>
    </div>
  );
}

function QuestionView({
  question,
  index,
  total,
  answer,
  onChange,
  onFlag,
  grade,
  grading,
  onCheck,
  showActions,
  shell,
  mode,
  onRan,
  onResetLab,
}: {
  question: Question;
  index: number;
  total: number;
  answer: Answer;
  onChange: (a: Answer) => void;
  onFlag: () => void;
  grade?: Grade;
  grading?: boolean;
  onCheck?: () => void;
  showActions: boolean;
  shell?: Shell;
  mode: Mode;
  onRan?: () => void;
  onResetLab?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [question.id]);

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-2xl font-bold text-signal">
            {String(index + 1).padStart(2, "0")}
            <span className="text-dim">/{String(total).padStart(2, "0")}</span>
          </span>
          <TypeTag type={question.type} />
          <span className="text-[11px] uppercase tracking-[0.18em] text-dim">
            {DOMAIN_SHORT[question.domain] ?? question.domain} · {question.topic} ·{" "}
            {question.difficulty}
          </span>
        </div>
        <button
          type="button"
          onClick={onFlag}
          className={`border px-3 py-1 text-[11px] uppercase tracking-widest transition-colors ${
            answer.flagged
              ? "border-signal bg-signal/15 text-signal"
              : "border-edge text-dim hover:border-dim hover:text-ink"
          }`}
        >
          {answer.flagged ? "flagged" : "flag"}
        </button>
      </div>

      <p className="mt-5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
        {question.prompt}
      </p>

      <a
        href={question.doc}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-[12px] text-teal underline decoration-teal/40 underline-offset-4 hover:decoration-teal"
      >
        {question.doc.replace(/^https?:\/\//, "")}
      </a>

      <div className="mt-6">
        {question.type === "lab" && shell ? (
          <LabPane question={question} shell={shell} mode={mode} onRan={() => onRan?.()} onReset={() => onResetLab?.()} />
        ) : question.type === "mcq" ? (
          <div className="space-y-2">
            {(question.options ?? []).map((opt, i) => {
              const selected = answer.selectedIndex === i;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!!grade}
                  onClick={() => onChange({ ...answer, selectedIndex: i, text: opt })}
                  className={`flex w-full items-start gap-3 border p-3 text-left text-[13.5px] transition-colors ${
                    selected
                      ? "border-signal bg-signal/10 text-ink"
                      : "border-edge text-ink/80 hover:border-dim disabled:hover:border-edge"
                  }`}
                >
                  <span className={selected ? "text-signal" : "text-dim"}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <Label>
              {question.type === "command" ? "your command(s)" : "your solution — commands or yaml"}
            </Label>
            <textarea
              value={answer.text}
              disabled={!!grade}
              spellCheck={false}
              onChange={(e) => onChange({ ...answer, text: e.target.value })}
              placeholder={
                question.type === "command"
                  ? "kubectl ..."
                  : "kubectl ...\n\n# or a manifest:\napiVersion: v1\nkind: ..."
              }
              className="mt-2 min-h-40 w-full resize-y border border-edge bg-void/80 p-3 text-[13px] leading-relaxed text-teal caret-signal outline-none placeholder:text-dim/50 focus:border-signal/70 disabled:text-teal/60"
            />
          </div>
        )}
      </div>

      {showActions && (!grade || question.type === "lab") && (
        <button
          type="button"
          onClick={onCheck}
          disabled={
            grading ||
            (question.type === "lab"
              ? false
              : question.type === "mcq"
                ? answer.selectedIndex === undefined
                : !answer.text.trim())
          }
          className="mt-4 border border-signal bg-signal/10 px-5 py-2 text-[12px] uppercase tracking-[0.2em] text-signal transition-colors hover:bg-signal/20 disabled:border-edge disabled:bg-transparent disabled:text-dim"
        >
          {grading ? "grading…" : question.type === "lab" ? "verify cluster" : "check answer"}
        </button>
      )}

      {!grade && question.type !== "mcq" && <HintSection question={question} />}

      {!grade && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className={`border px-5 py-2 text-[12px] uppercase tracking-[0.2em] transition-colors ${
              revealed
                ? "border-teal bg-teal/10 text-teal"
                : "border-edge text-dim hover:border-teal hover:text-teal"
            }`}
          >
            {revealed ? "hide answer" : "preview answer"}
          </button>
          {revealed && <AnswerReveal question={question} />}
        </div>
      )}

      {grade && <div className="mt-6"><GradeDetail question={question} grade={grade} /></div>}
    </Panel>
  );
}

function Navigator({
  questions,
  answers,
  grades,
  touched,
  current,
  onPick,
}: {
  questions: Question[];
  answers: Record<string, Answer>;
  grades: Record<string, Grade>;
  touched: Record<string, boolean>;
  current: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {questions.map((q, i) => {
        const a = answers[q.id];
        const g = grades[q.id];
        const answered =
          q.type === "lab"
            ? !!touched[q.id]
            : a && (q.type === "mcq" ? a.selectedIndex !== undefined : a.text.trim());
        const tone = g
          ? g.score >= 0.9
            ? "border-good/70 text-good"
            : g.score > 0
              ? "border-signal/70 text-signal"
              : "border-bad/70 text-bad"
          : answered
            ? "border-teal/60 text-teal"
            : "border-edge text-dim";
        return (
          <button
            key={q.id}
            type="button"
            onClick={() => onPick(i)}
            className={`relative h-8 w-8 border text-[11px] transition-colors hover:border-ink ${tone} ${
              i === current ? "bg-ink/10 ring-1 ring-signal" : ""
            }`}
          >
            {i + 1}
            {a?.flagged && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 bg-signal" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function Report({
  questions,
  grades,
  mode,
  elapsed,
  onRestart,
  onReviewWrong,
}: {
  questions: Question[];
  grades: Record<string, Grade>;
  mode: Mode;
  elapsed: number;
  onRestart: () => void;
  onReviewWrong: (ids: string[]) => void;
}) {
  const scored = questions.reduce((a, q) => a + (grades[q.id]?.score ?? 0), 0);
  const overall = questions.length ? scored / questions.length : 0;
  const byDomain = new Map<string, { total: number; score: number }>();
  for (const q of questions) {
    const entry = byDomain.get(q.domain) ?? { total: 0, score: 0 };
    entry.total += 1;
    entry.score += grades[q.id]?.score ?? 0;
    byDomain.set(q.domain, entry);
  }
  const wrong = questions.filter((q) => (grades[q.id]?.score ?? 0) < 0.9).map((q) => q.id);

  return (
    <div className="space-y-6">
      <Panel className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Label>{mode === "exam" ? "mock exam result" : "drill result"}</Label>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-display text-6xl font-extrabold text-signal">
                {fmtPct(overall)}
              </span>
              <span
                className={`border px-2 py-1 text-[11px] uppercase tracking-widest ${
                  overall >= PASS_ESTIMATE ? "border-good/60 text-good" : "border-bad/60 text-bad"
                }`}
              >
                {overall >= PASS_ESTIMATE ? "above pass estimate" : "below pass estimate"}
              </span>
            </div>
            <p className="mt-2 max-w-lg text-[12px] leading-relaxed text-dim">
              {questions.length} tasks · {scored.toFixed(2)} points · {fmtClock(elapsed)} elapsed.
              The {Math.round(PASS_ESTIMATE * 100)}% line is a study heuristic, not the Linux
              Foundation's cut score, which is not published per-domain.
            </p>
          </div>
          <div className="flex gap-2">
            {wrong.length > 0 && (
              <button
                type="button"
                onClick={() => onReviewWrong(wrong)}
                className="border border-edge px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-dim hover:border-teal hover:text-teal"
              >
                redo {wrong.length} missed
              </button>
            )}
            <button
              type="button"
              onClick={onRestart}
              className="border border-signal bg-signal/10 px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-signal hover:bg-signal/20"
            >
              new session
            </button>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {[...byDomain.entries()].map(([domain, v]) => (
            <div key={domain}>
              <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                <span className="text-ink/80">{DOMAIN_SHORT[domain] ?? domain}</span>
                <span className="text-dim">
                  {fmtPct(v.score / v.total)} · {v.total} task{v.total === 1 ? "" : "s"}
                </span>
              </div>
              <Bar value={v.score / v.total} tone={v.score / v.total >= 0.66 ? "teal" : "signal"} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <Panel key={q.id} className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-lg font-bold text-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <TypeTag type={q.type} />
              {grades[q.id] ? <VerdictTag grade={grades[q.id]} /> : <Label>not graded</Label>}
              <span className="text-[11px] uppercase tracking-[0.18em] text-dim">
                {q.topic}
              </span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink/90">
              {q.prompt}
            </p>
            {grades[q.id] && <GradeDetail question={q} grade={grades[q.id]} />}
          </Panel>
        ))}
      </div>
    </div>
  );
}

function Session({
  mode,
  questions,
  onFinish,
  onExit,
}: {
  mode: Mode;
  questions: Question[];
  onFinish: (grades: Record<string, Grade>, elapsed: number) => void;
  onExit: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, { text: "", flagged: false }])),
  );
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [grading, setGrading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const [remaining, setRemaining] = useState(EXAM_SECONDS);
  const finished = useRef(false);
  const shells = useRef(new Map<string, Shell>());
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const shellFor = useCallback((q: Question) => {
    if (!q.lab) return undefined;
    const existing = shells.current.get(q.id);
    if (existing) return existing;
    const made = new Shell(new Cluster(q.lab.init as ClusterInit));
    shells.current.set(q.id, made);
    return made;
  }, []);

  const gradeLab = useCallback(
    (q: Question): Grade => {
      const shell = shellFor(q)!;
      const { results, score, verdict, met, total } = evaluateLab(shell.cluster, q.lab!.checks);
      return {
        graded: "deterministic",
        score,
        verdict,
        feedback: `${met}/${total} checks passed. Scoring reads the live state of your lab cluster and its nodes, not the commands you typed.`,
        rubricResults: results,
        modelAnswer: q.answer,
      };
    },
    [shellFor],
  );

  const elapsed = () => Math.round((Date.now() - startedAt.current) / 1000);

  const gradeOne = useCallback(
    async (q: Question) => {
      if (q.type === "lab") {
        const grade = gradeLab(q);
        setGrades((g) => ({ ...g, [q.id]: grade }));
        return grade;
      }
      const a = answers[q.id];
      setGrading((g) => ({ ...g, [q.id]: true }));
      try {
        const grade = await api.grade(q, a?.text ?? "", a?.selectedIndex);
        setGrades((g) => ({ ...g, [q.id]: grade }));
        return grade;
      } finally {
        setGrading((g) => ({ ...g, [q.id]: false }));
      }
    },
    [answers, gradeLab],
  );

  const submitAll = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    setSubmitting(true);
    setError(null);
    const spent = elapsed();
    const collected: Record<string, Grade> = {};
    const queue = questions.slice();
    const worker = async () => {
      while (queue.length) {
        const q = queue.shift();
        if (!q) return;
        if (q.type === "lab") {
          collected[q.id] = gradeLab(q);
          continue;
        }
        const a = answers[q.id];
        const empty = q.type === "mcq" ? a?.selectedIndex === undefined : !a?.text.trim();
        if (empty) {
          collected[q.id] = {
            graded: "deterministic",
            score: 0,
            verdict: "incorrect",
            feedback: "No answer submitted.",
            modelAnswer: q.answer,
            rubric: q.rubric,
            correctOption:
              q.type === "mcq" && typeof q.answerIndex === "number"
                ? q.options?.[q.answerIndex]
                : undefined,
          };
          continue;
        }
        try {
          collected[q.id] = await api.grade(q, a.text, a.selectedIndex);
        } catch (e) {
          collected[q.id] = {
            graded: "self",
            score: 0,
            verdict: "incorrect",
            feedback: `Grading failed: ${(e as Error).message}. Compare with the model answer.`,
            modelAnswer: q.answer,
            rubric: q.rubric,
          };
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setSubmitting(false);
    onFinish(collected, spent);
  }, [answers, questions, onFinish, gradeLab]);

  useEffect(() => {
    if (mode !== "exam") return;
    const timer = setInterval(() => {
      const left = EXAM_SECONDS - Math.round((Date.now() - startedAt.current) / 1000);
      setRemaining(left);
      if (left <= 0) void submitAll();
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, submitAll]);

  const q = questions[current];
  const answered = questions.filter((x) => {
    if (x.type === "lab") return !!touched[x.id];
    const a = answers[x.id];
    return a && (x.type === "mcq" ? a.selectedIndex !== undefined : a.text.trim());
  }).length;

  return (
    <div className="space-y-5">
      <Panel className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <Label>{mode === "exam" ? "time remaining" : "elapsed"}</Label>
            <div
              className={`font-display text-3xl font-bold tabular-nums ${
                mode === "exam" && remaining < 600 ? "text-bad" : "text-signal"
              }`}
            >
              {mode === "exam" ? fmtClock(remaining) : "untimed"}
            </div>
          </div>
          <div>
            <Label>answered</Label>
            <div className="font-display text-3xl font-bold text-ink">
              {answered}
              <span className="text-dim">/{questions.length}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExit}
            className="border border-edge px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-dim hover:border-bad hover:text-bad"
          >
            abandon
          </button>
          <button
            type="button"
            onClick={() => void submitAll()}
            disabled={submitting}
            className="border border-signal bg-signal/10 px-5 py-2 text-[11px] uppercase tracking-[0.2em] text-signal hover:bg-signal/20 disabled:text-dim"
          >
            {submitting ? "grading…" : mode === "exam" ? "submit exam" : "finish & score"}
          </button>
        </div>
      </Panel>

      <Panel className="p-4">
        <Navigator
          questions={questions}
          answers={answers}
          grades={grades}
          touched={touched}
          current={current}
          onPick={setCurrent}
        />
      </Panel>

      {error && <p className="text-[12px] text-bad">{error}</p>}

      {q && (
        <QuestionView
          key={q.id}
          question={q}
          index={current}
          total={questions.length}
          answer={answers[q.id]}
          onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
          onFlag={() =>
            setAnswers((prev) => ({
              ...prev,
              [q.id]: { ...prev[q.id], flagged: !prev[q.id].flagged },
            }))
          }
          grade={grades[q.id]}
          grading={grading[q.id]}
          showActions={mode === "drill"}
          shell={shellFor(q)}
          mode={mode}
          onRan={() => setTouched((t) => (t[q.id] ? t : { ...t, [q.id]: true }))}
          onResetLab={() => {
            shells.current.delete(q.id);
            shellFor(q);
            setTouched((t) => {
              const next = { ...t };
              delete next[q.id];
              return next;
            });
          }}
          onCheck={() => {
            gradeOne(q).catch((e) => setError((e as Error).message));
          }}
        />
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="border border-edge px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-dim hover:border-ink hover:text-ink disabled:opacity-40"
        >
          ← previous
        </button>
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
          disabled={current === questions.length - 1}
          className="border border-edge px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-dim hover:border-ink hover:text-ink disabled:opacity-40"
        >
          next →
        </button>
      </div>
    </div>
  );
}

function Dashboard({
  progress,
  meta,
  onDrillTopic,
  onReview,
}: {
  progress: Progress | null;
  meta: Meta | null;
  onDrillTopic: (domain: string, topic: string) => void;
  onReview: (ids: string[]) => void;
}) {
  const sessions = progress?.sessions ?? [];
  const exams = sessions.filter((s) => s.mode === "exam");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "questions answered", value: String(progress?.totals.answered ?? 0) },
          { label: "average score", value: fmtPct(progress?.totals.avgScore ?? null) },
          {
            label: "bank coverage",
            value: meta
              ? `${progress?.totals.uniqueQuestions ?? 0}/${meta.total}`
              : `${progress?.totals.uniqueQuestions ?? 0}`,
          },
        ].map((s) => (
          <Panel key={s.label} className="p-5">
            <Label>{s.label}</Label>
            <div className="mt-1 font-display text-4xl font-extrabold text-signal">{s.value}</div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <Label>accuracy by domain — exam weight in brackets</Label>
          <div className="mt-4 space-y-4">
            {(meta?.domains ?? []).map((d) => {
              const row = progress?.byDomain.find((x) => x.domain === d.domain);
              return (
                <div key={d.domain}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                    <span className="text-ink/85">
                      {DOMAIN_SHORT[d.domain] ?? d.domain}{" "}
                      <span className="text-dim">[{Math.round(d.weight * 100)}%]</span>
                    </span>
                    <span className="text-dim">
                      {row ? `${fmtPct(row.avgScore)} · ${row.attempts} answered` : "no data"}
                    </span>
                  </div>
                  <Bar
                    value={row?.avgScore ?? 0}
                    tone={(row?.avgScore ?? 0) >= 0.66 ? "teal" : "signal"}
                  />
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="p-5">
          <Label>weakest topics — click to drill</Label>
          {progress && progress.byTopic.length > 0 ? (
            <ul className="mt-4 divide-y divide-edge">
              {progress.byTopic.slice(0, 8).map((t) => (
                <li key={`${t.domain}/${t.topic}`}>
                  <button
                    type="button"
                    onClick={() => onDrillTopic(t.domain, t.topic)}
                    className="flex w-full items-center justify-between py-2.5 text-left text-[13px] text-ink/85 hover:text-signal"
                  >
                    <span>
                      {t.topic}
                      <span className="ml-2 text-[11px] text-dim">
                        {DOMAIN_SHORT[t.domain] ?? t.domain}
                      </span>
                    </span>
                    <span className={t.avgScore >= 0.66 ? "text-teal" : "text-bad"}>
                      {fmtPct(t.avgScore)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-dim">
              Answer some questions and your weak spots show up here, ordered worst first.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <Label>review queue</Label>
            {progress && progress.reviewQueue.length > 0 && (
              <button
                type="button"
                onClick={() => onReview(progress.reviewQueue.slice(0, 12).map((r) => r.questionId))}
                className="border border-teal/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-teal hover:bg-teal/10"
              >
                redo oldest 12
              </button>
            )}
          </div>
          {progress && progress.reviewQueue.length > 0 ? (
            <ul className="mt-4 space-y-1.5 text-[12.5px]">
              {progress.reviewQueue.slice(0, 10).map((r) => (
                <li key={r.questionId} className="flex items-center justify-between text-dim">
                  <span className="text-ink/80">
                    {r.questionId} · {r.topic}
                  </span>
                  <span className={r.avgScore > 0 ? "text-signal" : "text-bad"}>
                    {fmtPct(r.avgScore)} over {r.attempts}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-dim">
              Nothing queued. Questions you score under 70% on land here until you clear them.
            </p>
          )}
        </Panel>

        <Panel className="p-5">
          <Label>session history</Label>
          {sessions.length > 0 ? (
            <ul className="mt-4 divide-y divide-edge text-[12.5px]">
              {sessions.slice(0, 10).map((s) => (
                <li key={s.session} className="flex items-center justify-between py-2">
                  <span className="text-dim">
                    <span
                      className={`mr-2 text-[10px] uppercase tracking-widest ${
                        s.mode === "exam" ? "text-signal" : "text-teal"
                      }`}
                    >
                      {s.mode}
                    </span>
                    {s.finishedAt}
                  </span>
                  <span className="text-ink/85">
                    {fmtPct(s.scored / Math.max(1, s.total))}{" "}
                    <span className="text-dim">· {s.total} q</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-dim">No sessions yet.</p>
          )}
          {exams.length > 1 && (
            <p className="mt-4 text-[11px] text-dim">
              Mock exam trend:{" "}
              {exams
                .slice(0, 6)
                .reverse()
                .map((s) => fmtPct(s.scored / Math.max(1, s.total)))
                .join(" → ")}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Cheatsheet() {
  return (
    <div className="space-y-6">
      {CHEATSHEET.map((section) => (
        <Panel key={section.title} className="p-5">
          <h3 className="font-display text-lg font-bold tracking-tight text-signal">
            {section.title}
          </h3>
          <div className="mt-4 divide-y divide-edge">
            {section.lines.map(([cmd, note], i) => (
              <div key={i} className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                <code className="text-[12.5px] text-teal">{cmd}</code>
                <span className="text-[12px] text-dim">{note}</span>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [session, setSession] = useState<{ mode: Mode; questions: Question[] } | null>(null);
  const [report, setReport] = useState<{
    mode: Mode;
    questions: Question[];
    grades: Record<string, Grade>;
    elapsed: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [examCount, setExamCount] = useState(17);
  const [examStyle, setExamStyle] = useState<"lab" | "mixed" | "written">("lab");
  const [drillDomain, setDrillDomain] = useState("");
  const [drillTopic, setDrillTopic] = useState("");
  const [drillType, setDrillType] = useState("");
  const [drillCount, setDrillCount] = useState(8);

  const refresh = useCallback(() => {
    api.progress().then(setProgress).catch(() => undefined);
  }, []);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError((e as Error).message));
    refresh();
  }, [refresh]);

  const topics = useMemo(
    () => meta?.domains.find((d) => d.domain === drillDomain)?.topics ?? [],
    [meta, drillDomain],
  );

  const start = async (mode: Mode, load: () => Promise<{ questions: Question[] }>) => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const { questions } = await load();
      if (!questions.length) {
        setError("No questions matched that filter.");
        return;
      }
      setSession({ mode, questions });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const finish = async (grades: Record<string, Grade>, elapsed: number) => {
    if (!session) return;
    setReport({ mode: session.mode, questions: session.questions, grades, elapsed });
    setSession(null);
    try {
      await api.saveProgress({
        session: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode: session.mode,
        startedAt: new Date(Date.now() - elapsed * 1000).toISOString(),
        results: session.questions.map((q) => ({
          questionId: q.id,
          domain: q.domain,
          topic: q.topic,
          type: q.type,
          score: grades[q.id]?.score ?? 0,
          verdict: grades[q.id]?.verdict ?? "incorrect",
        })),
      });
    } catch (e) {
      setError(`Session graded but not saved: ${(e as Error).message}`);
    }
    refresh();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "progress" },
    { id: "exam", label: "mock exam" },
    { id: "drill", label: "drills" },
    { id: "cheatsheet", label: "cheat sheet" },
  ];

  const busy = loading;

  return (
    <div className="min-h-screen text-ink">
      <title>
        {session
          ? `${session.mode === "exam" ? "Mock exam" : "Drill"} in progress — CKA·SIM`
          : report
            ? "Session report — CKA·SIM"
            : `${tabs.find((t) => t.id === tab)?.label ?? "Progress"} — CKA·SIM exam simulator`}
      </title>
      <header className="border-b border-edge bg-void/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-5 py-7">
          <div>
            <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight">
              CKA<span className="text-signal">·</span>SIM
            </h1>
            <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-dim">
              Performance-style practice for the Certified Kubernetes Administrator exam —
              Kubernetes v1.35, 2 hours, 15–20 tasks, weighted Troubleshooting 30% · Cluster
              Architecture 25% · Services &amp; Networking 20% · Workloads &amp; Scheduling 15% ·
              Storage 10%.
            </p>
          </div>
          <nav className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setReport(null);
                }}
                className={`border px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition-colors ${
                  tab === t.id
                    ? "border-signal bg-signal/10 text-signal"
                    : "border-edge text-dim hover:border-dim hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        {error && (
          <p className="mb-5 border border-bad/50 bg-bad/10 p-3 text-[12.5px] text-bad">{error}</p>
        )}

        {session ? (
          <Session
            mode={session.mode}
            questions={session.questions}
            onFinish={finish}
            onExit={() => setSession(null)}
          />
        ) : report ? (
          <Report
            questions={report.questions}
            grades={report.grades}
            mode={report.mode}
            elapsed={report.elapsed}
            onRestart={() => setReport(null)}
            onReviewWrong={(ids) => void start("drill", () => api.review(ids))}
          />
        ) : tab === "dashboard" ? (
          <Dashboard
            progress={progress}
            meta={meta}
            onDrillTopic={(domain, topic) =>
              void start("drill", () => api.drill({ domain, topic, count: 8 }))
            }
            onReview={(ids) => void start("drill", () => api.review(ids))}
          />
        ) : tab === "exam" ? (
          <Panel className="p-6">
            <Label>timed mock exam</Label>
            <h2 className="mt-1 font-display text-2xl font-bold">
              {examCount} tasks · 2-hour countdown · weighted like the real curriculum
            </h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-dim">
              The real CKA is entirely performance-based: a terminal, a cluster, and tasks scored on
              the state you leave behind. In <span className="text-ink">hands-on</span> style every
              task hands you a simulated cluster and a terminal — run real kubectl, ssh onto a node for
              systemctl, journalctl, crictl and etcdctl work, apply manifests with heredocs — and the
              grader inspects the resulting cluster and node state when you submit, not the words you
              typed. Tasks are drawn by domain weight; flag and skip freely; nothing is verified until
              submit, exactly like exam day. “Preview answer” still reveals the model solution and the
              reasoning if you want to study instead of sit the clock.
            </p>
            <div className="mt-6 flex flex-wrap items-end gap-4">
              <label className="block">
                <Label>tasks</Label>
                <input
                  type="number"
                  min={5}
                  max={40}
                  value={examCount}
                  onChange={(e) => setExamCount(Number(e.target.value))}
                  className="mt-1 block w-24 border border-edge bg-void/80 px-3 py-2 text-[13px] text-teal outline-none focus:border-signal/70"
                />
              </label>
              <label className="block">
                <Label>style</Label>
                <select
                  value={examStyle}
                  onChange={(e) => setExamStyle(e.target.value as typeof examStyle)}
                  className="mt-1 block w-64 border border-edge bg-void/80 px-3 py-2 text-[13px] text-ink outline-none focus:border-signal/70"
                >
                  <option value="lab">hands-on labs (closest to the exam)</option>
                  <option value="mixed">mixed — labs plus written tasks</option>
                  <option value="written">written only — no terminal</option>
                </select>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void start("exam", () => api.exam(examCount, examStyle))}
                className="border border-signal bg-signal/10 px-6 py-2.5 text-[12px] uppercase tracking-[0.2em] text-signal hover:bg-signal/20 disabled:text-dim"
              >
                {busy ? "loading…" : "start exam"}
              </button>
            </div>
            {meta && examStyle === "lab" && examCount > meta.labs && (
              <p className="mt-4 text-[11.5px] text-dim">
                {meta.labs} hands-on labs exist right now, so a {examCount}-task session adds{" "}
                {examCount - meta.labs} written tasks to fill the domain weights.
              </p>
            )}
          </Panel>
        ) : tab === "drill" ? (
          <Panel className="p-6">
            <Label>topic drills</Label>
            <h2 className="mt-1 font-display text-2xl font-bold">
              Untimed practice with instant feedback
            </h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-dim">
              Pick a domain, topic, or question type and check each answer as you go. Every item
              carries the kubernetes.io page it was written from, so you can read the source
              immediately after seeing where you went wrong.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <Label>domain</Label>
                <select
                  value={drillDomain}
                  onChange={(e) => {
                    setDrillDomain(e.target.value);
                    setDrillTopic("");
                  }}
                  className="mt-1 w-full border border-edge bg-void/80 px-3 py-2 text-[13px] text-ink outline-none focus:border-signal/70"
                >
                  <option value="">all domains</option>
                  {(meta?.domains ?? []).map((d) => (
                    <option key={d.domain} value={d.domain}>
                      {DOMAIN_SHORT[d.domain] ?? d.domain} ({d.count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <Label>topic</Label>
                <select
                  value={drillTopic}
                  disabled={!drillDomain}
                  onChange={(e) => setDrillTopic(e.target.value)}
                  className="mt-1 w-full border border-edge bg-void/80 px-3 py-2 text-[13px] text-ink outline-none focus:border-signal/70 disabled:text-dim"
                >
                  <option value="">all topics</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <Label>type</Label>
                <select
                  value={drillType}
                  onChange={(e) => setDrillType(e.target.value)}
                  className="mt-1 w-full border border-edge bg-void/80 px-3 py-2 text-[13px] text-ink outline-none focus:border-signal/70"
                >
                  <option value="">all types</option>
                  <option value="lab">hands-on labs (terminal)</option>
                  <option value="scenario">scenario tasks</option>
                  <option value="command">command recall</option>
                  <option value="mcq">concept checks</option>
                </select>
              </label>
              <label className="block">
                <Label>questions</Label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={drillCount}
                  onChange={(e) => setDrillCount(Number(e.target.value))}
                  className="mt-1 w-full border border-edge bg-void/80 px-3 py-2 text-[13px] text-teal outline-none focus:border-signal/70"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void start("drill", () =>
                  api.drill({
                    domain: drillDomain || undefined,
                    topic: drillTopic || undefined,
                    type: drillType || undefined,
                    count: drillCount,
                  }),
                )
              }
              className="mt-6 border border-signal bg-signal/10 px-6 py-2.5 text-[12px] uppercase tracking-[0.2em] text-signal hover:bg-signal/20 disabled:text-dim"
            >
              {busy ? "loading…" : "start drill"}
            </button>
          </Panel>
        ) : (
          <Cheatsheet />
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-10 text-[11px] leading-relaxed text-dim">
        Domain weights and exam format verified against training.linuxfoundation.org and cncf.io.
        Hands-on tasks run against a simulated in-browser cluster: a faithful subset of kubectl plus
        a node shell (systemctl, journalctl, crictl, etcdctl, file editing) reached with ssh. It is a
        simulation, not a real API server or Linux box. Pair this with a real kubeadm or kind cluster for muscle memory.
      </footer>
    </div>
  );
}
