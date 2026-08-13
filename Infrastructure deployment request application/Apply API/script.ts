// POST /api/apply  { id }
// Marks a request that has a successful plan as "applying" so the linked
// "Terraform apply" step (which scans the volume) will run terraform apply.
// Guarded: only requests in status "planned" may be applied.
import { parseRequest, respond, load, save } from "./lib";

const req = await parseRequest();

if (req.method !== "POST") {
  respond(400, { error: `Unsupported method ${req.method}` });
  process.exit(0);
}

let payload: { id?: string };
try {
  payload = JSON.parse(req.body || "{}");
} catch {
  respond(400, { error: "Invalid JSON body" });
  process.exit(0);
}

const rec = load(String(payload.id ?? ""));
if (!rec) {
  respond(404, { error: "Request not found" });
  process.exit(0);
}
if (rec.status !== "planned") {
  respond(409, { error: `Request must be in "planned" status to apply (status: ${rec.status})` });
  process.exit(0);
}

const now = new Date().toISOString();
rec.status = "applying";
rec.history.push({ at: now, event: "apply_requested", by: req.email });
save(rec);
respond(200, { request: rec });
