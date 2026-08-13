// /api/requests
//   GET  -> list all requests (newest first)
//   POST -> create a new request { type, params } in status "submitted"
import { parseRequest, respond, loadAll, save, type RequestRecord } from "./lib";
import { findType, validateParams } from "./catalog";

const req = await parseRequest();

if (req.method === "GET") {
  respond(200, { requests: loadAll() });
} else if (req.method === "POST") {
  let payload: { type?: string; params?: Record<string, unknown> };
  try {
    payload = JSON.parse(req.body || "{}");
  } catch {
    respond(400, { error: "Invalid JSON body" });
    process.exit(0);
  }
  const type = findType(String(payload.type ?? ""));
  if (!type) {
    respond(400, { error: `Unknown resource type: ${payload.type}` });
    process.exit(0);
  }
  const { ok, value, errors } = validateParams(type, payload.params ?? {});
  if (!ok) {
    respond(400, { error: "Validation failed", details: errors });
    process.exit(0);
  }
  const now = new Date().toISOString();
  const id = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const displayName =
    (value.name as string) ||
    (value.bucket_name as string) ||
    (value.identifier as string) ||
    type.id;
  const rec: RequestRecord = {
    id,
    type: type.id,
    typeName: type.name,
    displayName,
    region: String(value.region ?? "us-east-1"),
    params: value,
    status: "submitted",
    createdAt: now,
    createdBy: req.email,
    history: [{ at: now, event: "submitted", by: req.email }],
  };
  save(rec);
  respond(201, { request: rec });
} else {
  respond(400, { error: `Unsupported method ${req.method}` });
}
