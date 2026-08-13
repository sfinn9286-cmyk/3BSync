// POST /api/decision  { id, decision: "approve" | "reject", reason? }
// Approve -> status "approved" (downstream "Terraform plan" step then runs a
// plan for it). Reject -> status "rejected". Responds with the updated record.
// The Terraform plan step is linked downstream and scans the volume for
// approved-but-unplanned requests, so it is safe to trigger on any decision.
import { parseRequest, respond, load, save } from "./lib";

const req = await parseRequest();

if (req.method !== "POST") {
  respond(400, { error: `Unsupported method ${req.method}` });
  process.exit(0);
}

let payload: { id?: string; decision?: string; reason?: string };
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
if (rec.status !== "submitted") {
  respond(409, { error: `Request is not awaiting a decision (status: ${rec.status})` });
  process.exit(0);
}

const now = new Date().toISOString();
const decision = String(payload.decision ?? "");

if (decision === "approve") {
  rec.status = "approved";
  rec.history.push({ at: now, event: "approved", by: req.email, detail: payload.reason });
} else if (decision === "reject") {
  rec.status = "rejected";
  rec.history.push({ at: now, event: "rejected", by: req.email, detail: payload.reason });
} else {
  respond(400, { error: 'decision must be "approve" or "reject"' });
  process.exit(0);
}

save(rec);
respond(200, { request: rec });
