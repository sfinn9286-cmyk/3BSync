// Alerts API
// Route: GET /soc-alerts  (private). Reads stored alerts from the `soc` volume
// (read-only) and returns them as JSON, newest first, for the Dashboard.

import { existsSync, readFileSync } from "fs";

const STORE_FILE = "/storage/soc/alerts.jsonl";

let alerts: unknown[] = [];
if (existsSync(STORE_FILE)) {
  const lines = readFileSync(STORE_FILE, "utf8").split("\n").filter((l) => l.trim());
  alerts = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((a) => a !== null)
    .reverse()
    .slice(0, 200);
}

const body = JSON.stringify({ count: alerts.length, alerts });

process.stdout.write(
  [
    "HTTP/1.1 200 OK",
    "Content-Type: application/json",
    "Access-Control-Allow-Origin: *",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "",
    body,
  ].join("\r\n")
);
