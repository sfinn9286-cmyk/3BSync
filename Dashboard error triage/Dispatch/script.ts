// Dispatch
// Upstream: Triage. Persists the enriched alert to the `soc` volume and, for
// High/Critical severity, builds Slack + Jira payloads. Slack/Jira are STUBBED
// (logged to stderr) until real connectors are wired up.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";

const STORE_DIR = "/storage/soc";
const STORE_FILE = `${STORE_DIR}/alerts.jsonl`;

const raw = await Bun.stdin.text();
if (!raw.trim()) {
  console.error("No enriched alert; nothing to dispatch.");
  process.exit(0);
}
const alert = JSON.parse(raw);
const severity: string = alert?.analysis?.severity ?? "Unknown";

if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });

// Store (append-only JSONL; Alerts API reads the latest N).
const record = { ...alert, storedAt: new Date().toISOString() };
appendFileSync(STORE_FILE, JSON.stringify(record) + "\n");
console.error(`Stored ${alert.id} (${severity}).`);

const escalate = severity === "High" || severity === "Critical";

if (escalate) {
  // --- Slack (stub) ---
  const slackMessage = {
    text: `:rotating_light: *${severity}* security alert — ${alert.title}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${severity}: ${alert.title}` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Source:* ${alert.source}\n*Host:* ${alert.host}  *User:* ${alert.user}\n*Verdict:* ${alert.analysis.verdict} (${alert.analysis.confidence}%)\n\n${alert.analysis.summary}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "*Recommended actions:*\n" +
            (alert.analysis.recommendedActions ?? []).map((a: string) => `• ${a}`).join("\n"),
        },
      },
    ],
  };
  console.error("[STUB] Would post to Slack:\n" + JSON.stringify(slackMessage, null, 2));

  // --- Jira (stub) ---
  const jiraTicket = {
    fields: {
      project: { key: "SEC" },
      issuetype: { name: "Bug" },
      priority: { name: severity === "Critical" ? "Highest" : "High" },
      summary: `[${severity}] ${alert.title} on ${alert.host}`,
      description:
        `${alert.analysis.summary}\n\n` +
        `Source: ${alert.source}\nType: ${alert.type}\nHost: ${alert.host}\nUser: ${alert.user}\n` +
        `Src IP: ${alert.srcIp}  Dest IP: ${alert.destIp}\n` +
        `Verdict: ${alert.analysis.verdict} (${alert.analysis.confidence}%)\n\n` +
        `MITRE: ${(alert.analysis.mitre ?? []).map((m: { id: string; name: string }) => `${m.id} ${m.name}`).join(", ") || "n/a"}\n\n` +
        `Recommended actions:\n${(alert.analysis.recommendedActions ?? []).map((a: string) => `- ${a}`).join("\n")}`,
    },
  };
  console.error("[STUB] Would create Jira ticket:\n" + JSON.stringify(jiraTicket, null, 2));
}

console.log(JSON.stringify({ ok: true, id: alert.id, severity, escalated: escalate }));
