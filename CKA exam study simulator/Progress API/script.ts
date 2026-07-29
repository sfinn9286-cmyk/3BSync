import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

const DIR = "/storage/cka_progress";
mkdirSync(DIR, { recursive: true });
const db = new Database(`${DIR}/progress.db`);
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    session TEXT NOT NULL,
    mode TEXT NOT NULL,
    question_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    topic TEXT NOT NULL,
    type TEXT NOT NULL,
    score REAL NOT NULL,
    verdict TEXT NOT NULL,
    answered_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS attempts_user ON attempts(user, answered_at);
  CREATE TABLE IF NOT EXISTS sessions (
    session TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    mode TEXT NOT NULL,
    total INTEGER NOT NULL,
    scored REAL NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

type Req = { method: string; params: URLSearchParams; headers: Map<string, string>; body: string };

function parseRequest(raw: string): Req {
  const split = raw.indexOf("\r\n\r\n");
  const head = split === -1 ? raw : raw.slice(0, split);
  const body = split === -1 ? "" : raw.slice(split + 4);
  const lines = head.split("\r\n");
  const [method = "GET", target = "/"] = lines[0].split(" ");
  const headers = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const i = line.indexOf(":");
    if (i > 0) headers.set(line.slice(0, i).toLowerCase(), line.slice(i + 1).trim());
  }
  return { method, params: new URL(target, "http://local").searchParams, headers, body };
}

function respond(status: string, body: unknown) {
  const payload = JSON.stringify(body);
  process.stdout.write(
    `HTTP/1.1 ${status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`,
  );
}

const req = parseRequest(await Bun.stdin.text());
const user = req.headers.get("x-3b-authenticated-email") ?? "anonymous";

if (req.method === "POST") {
  const payload = JSON.parse(req.body) as {
    session: string;
    mode: string;
    startedAt?: string;
    results: Array<{
      questionId: string;
      domain: string;
      topic: string;
      type: string;
      score: number;
      verdict: string;
    }>;
  };

  const insert = db.prepare(
    "INSERT INTO attempts (user, session, mode, question_id, domain, topic, type, score, verdict) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  const save = db.transaction((results: typeof payload.results) => {
    for (const r of results) {
      insert.run(
        user,
        payload.session,
        payload.mode,
        r.questionId,
        r.domain,
        r.topic,
        r.type,
        r.score,
        r.verdict,
      );
    }
    const total = results.length;
    const scored = results.reduce((a, r) => a + r.score, 0);
    db.prepare(
      "INSERT INTO sessions (session, user, mode, total, scored, started_at) VALUES (?,?,?,?,?,?) ON CONFLICT(session) DO UPDATE SET total=excluded.total, scored=excluded.scored",
    ).run(
      payload.session,
      user,
      payload.mode,
      total,
      scored,
      payload.startedAt ?? new Date().toISOString(),
    );
  });
  save(payload.results);
  respond("200 OK", { saved: payload.results.length, user });
  process.exit(0);
}

const sessions = db
  .query(
    "SELECT session, mode, total, scored, started_at AS startedAt, finished_at AS finishedAt FROM sessions WHERE user = ? ORDER BY finished_at DESC LIMIT 50",
  )
  .all(user);

const byDomain = db
  .query(
    "SELECT domain, COUNT(*) AS attempts, AVG(score) AS avgScore FROM attempts WHERE user = ? GROUP BY domain ORDER BY avgScore ASC",
  )
  .all(user);

const byTopic = db
  .query(
    "SELECT domain, topic, COUNT(*) AS attempts, AVG(score) AS avgScore FROM attempts WHERE user = ? GROUP BY domain, topic HAVING attempts >= 1 ORDER BY avgScore ASC, attempts DESC LIMIT 12",
  )
  .all(user);

const reviewQueue = db
  .query(
    `SELECT question_id AS questionId, domain, topic, AVG(score) AS avgScore, COUNT(*) AS attempts, MAX(answered_at) AS lastSeen
     FROM attempts WHERE user = ?
     GROUP BY question_id
     HAVING avgScore < 0.7
     ORDER BY lastSeen ASC LIMIT 40`,
  )
  .all(user);

const totals = db
  .query(
    "SELECT COUNT(*) AS answered, AVG(score) AS avgScore, COUNT(DISTINCT question_id) AS uniqueQuestions FROM attempts WHERE user = ?",
  )
  .get(user);

respond("200 OK", { user, totals, sessions, byDomain, byTopic, reviewQueue });
