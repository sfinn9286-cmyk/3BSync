import { troubleshooting } from "./bank/troubleshooting";
import { cluster } from "./bank/cluster";
import { networking } from "./bank/networking";
import { workloads } from "./bank/workloads";
import { storage } from "./bank/storage";
import type { Domain, Question } from "./bank/types";

const BANK: Question[] = [
  ...troubleshooting,
  ...cluster,
  ...networking,
  ...workloads,
  ...storage,
];

const WEIGHTS: Record<Domain, number> = {
  Troubleshooting: 0.3,
  "Cluster Architecture, Installation & Configuration": 0.25,
  "Services & Networking": 0.2,
  "Workloads & Scheduling": 0.15,
  Storage: 0.1,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function weightedSample(count: number, rand: () => number, exclude: Set<string>): Question[] {
  const domains = Object.keys(WEIGHTS) as Domain[];
  const exact = domains.map((d) => ({ d, want: WEIGHTS[d] * count }));
  const quotas = new Map<Domain, number>(exact.map((e) => [e.d, Math.floor(e.want)]));
  let assigned = [...quotas.values()].reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .slice()
    .sort((a, b) => (b.want % 1) - (a.want % 1));
  let i = 0;
  while (assigned < count && byRemainder.length) {
    const d = byRemainder[i % byRemainder.length].d;
    quotas.set(d, (quotas.get(d) ?? 0) + 1);
    assigned++;
    i++;
  }

  const picked: Question[] = [];
  const leftovers: Question[] = [];
  for (const d of domains) {
    const pool = shuffle(
      BANK.filter((q) => q.domain === d && !exclude.has(q.id)),
      rand,
    );
    const quota = quotas.get(d) ?? 0;
    picked.push(...pool.slice(0, quota));
    leftovers.push(...pool.slice(quota));
  }
  // If a domain ran short (small bank or heavy exclusions), backfill from elsewhere.
  for (const q of shuffle(leftovers, rand)) {
    if (picked.length >= count) break;
    picked.push(q);
  }
  return shuffle(picked, rand);
}

function parseRequest(raw: string) {
  const [head] = raw.split("\r\n\r\n");
  const requestLine = head.split("\r\n")[0] ?? "GET / HTTP/1.1";
  const target = requestLine.split(" ")[1] ?? "/";
  const url = new URL(target, "http://local");
  return url.searchParams;
}

function respond(status: string, body: unknown) {
  const payload = JSON.stringify(body);
  process.stdout.write(
    `HTTP/1.1 ${status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`,
  );
}

const params = parseRequest(await Bun.stdin.text());
const mode = params.get("mode") ?? "exam";

if (mode === "meta") {
  const topics = new Map<string, Set<string>>();
  for (const q of BANK) {
    if (!topics.has(q.domain)) topics.set(q.domain, new Set());
    topics.get(q.domain)!.add(q.topic);
  }
  respond("200 OK", {
    total: BANK.length,
    domains: (Object.keys(WEIGHTS) as Domain[]).map((d) => ({
      domain: d,
      weight: WEIGHTS[d],
      count: BANK.filter((q) => q.domain === d).length,
      topics: [...(topics.get(d) ?? [])].sort(),
    })),
  });
  process.exit(0);
}

const seed = Number(params.get("seed") ?? Date.now()) || Date.now();
const rand = mulberry32(seed);
const exclude = new Set(
  (params.get("exclude") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

let selected: Question[];

if (mode === "exam") {
  const count = Math.min(Math.max(Number(params.get("count") ?? 17) || 17, 1), BANK.length);
  selected = weightedSample(count, rand, exclude);
} else if (mode === "review") {
  const ids = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  selected = ids.map((id) => BANK.find((q) => q.id === id)).filter((q): q is Question => !!q);
} else {
  const domain = params.get("domain");
  const topic = params.get("topic");
  const type = params.get("type");
  const count = Math.min(Math.max(Number(params.get("count") ?? 10) || 10, 1), BANK.length);
  const pool = BANK.filter(
    (q) =>
      !exclude.has(q.id) &&
      (!domain || q.domain === domain) &&
      (!topic || q.topic === topic) &&
      (!type || q.type === type),
  );
  selected = shuffle(pool, rand).slice(0, count);
}

respond("200 OK", { seed, mode, count: selected.length, questions: selected });
