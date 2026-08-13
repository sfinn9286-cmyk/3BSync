// Helpers shared by the request-handling TS steps: parse the inbound HTTP
// request, respond, and read/write request records on the `infra` volume.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";

export const DATA_DIR = "/storage/infra/requests";

export type ReqStatus =
  | "submitted"
  | "approved"
  | "planning"
  | "planned"
  | "plan_failed"
  | "rejected"
  | "applying"
  | "applied"
  | "apply_failed";

export type RequestRecord = {
  id: string;
  type: string;
  typeName: string;
  displayName: string;
  region: string;
  params: Record<string, unknown>;
  status: ReqStatus;
  createdAt: string;
  createdBy: string;
  history: { at: string; event: string; by?: string; detail?: string }[];
  planOutput?: string;
  planAt?: string;
  applyOutput?: string;
  applyAt?: string;
  outputs?: Record<string, unknown>;
};

export type ParsedRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: string;
  email: string;
};

export async function parseRequest(): Promise<ParsedRequest> {
  const raw = await Bun.stdin.arrayBuffer();
  const buf = Buffer.from(raw);
  const sep = buf.indexOf("\r\n\r\n");
  const headPart = sep === -1 ? buf.toString("utf8") : buf.subarray(0, sep).toString("utf8");
  const body = sep === -1 ? "" : buf.subarray(sep + 4).toString("utf8");
  const lines = headPart.split("\r\n");
  const [method = "GET", target = "/"] = (lines[0] ?? "").split(" ");
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  const url = new URL(target, "http://local");
  return {
    method: method.toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    headers,
    body,
    email: headers["x-3b-authenticated-email"] || "unknown",
  };
}

export function respond(status: number, obj: unknown): void {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  const statusText =
    status === 200 ? "OK" : status === 201 ? "Created" : status === 400 ? "Bad Request" : status === 404 ? "Not Found" : status === 409 ? "Conflict" : "Error";
  process.stdout.write(
    [
      `HTTP/1.1 ${status} ${statusText}`,
      "Content-Type: application/json",
      "Cache-Control: no-store",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "",
      body,
    ].join("\r\n"),
  );
}

export function ensureDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

export function loadAll(): RequestRecord[] {
  ensureDir();
  const out: RequestRecord[] = [];
  for (const f of readdirSync(DATA_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(`${DATA_DIR}/${f}`, "utf8")));
    } catch {}
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export function load(id: string): RequestRecord | null {
  const p = `${DATA_DIR}/${id}.json`;
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function save(rec: RequestRecord): void {
  ensureDir();
  writeFileSync(`${DATA_DIR}/${rec.id}.json`, JSON.stringify(rec, null, 2));
}
