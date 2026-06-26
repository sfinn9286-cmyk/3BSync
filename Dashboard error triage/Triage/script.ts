// Triage
// Upstream: Ingest Alert. Calls Anthropic Claude to triage + investigate the
// alert: severity, summary, true/false-positive assessment, MITRE ATT&CK
// techniques, and recommended response actions. Emits the enriched alert.

interface Analysis {
  severity: "Low" | "Medium" | "High" | "Critical";
  confidence: number;
  verdict: "Likely True Positive" | "Likely False Positive" | "Needs Investigation";
  summary: string;
  mitre: { id: string; name: string }[];
  recommendedActions: string[];
  reasoning: string;
}

const raw = await Bun.stdin.text();
if (!raw.trim()) {
  console.error("No input alert; nothing to triage.");
  process.exit(0);
}
const alert = JSON.parse(raw);

const system = `You are a senior SOC analyst. Triage the security alert and respond with ONLY a JSON object (no markdown fences) matching this TypeScript type:
{
  "severity": "Low" | "Medium" | "High" | "Critical",
  "confidence": number (0-100),
  "verdict": "Likely True Positive" | "Likely False Positive" | "Needs Investigation",
  "summary": string (2-3 sentence plain-English summary for an on-call responder),
  "mitre": [ { "id": string, "name": string } ] (relevant MITRE ATT&CK techniques, may be empty),
  "recommendedActions": string[] (concrete next steps, most urgent first),
  "reasoning": string (brief justification for the severity and verdict)
}
Be decisive. Calibrate severity to real-world impact.`;

const model = "claude-sonnet-4-5";

const resp = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model,
    max_tokens: 1024,
    system,
    messages: [
      {
        role: "user",
        content: `Triage this alert:\n\n${JSON.stringify(alert, null, 2)}`,
      },
    ],
  }),
});

if (!resp.ok) {
  const errText = await resp.text();
  console.error(`Claude API error ${resp.status}: ${errText}`);
  process.exit(1);
}

const data = await resp.json();
const text: string = (data.content ?? [])
  .filter((b: { type: string }) => b.type === "text")
  .map((b: { text: string }) => b.text)
  .join("")
  .trim();

function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1) return s.slice(start, end + 1);
  return s;
}

let analysis: Analysis;
try {
  analysis = JSON.parse(extractJson(text));
} catch (e) {
  console.error("Failed to parse Claude response as JSON:", text);
  process.exit(1);
}

const enriched = {
  ...alert,
  analysis,
  triagedAt: new Date().toISOString(),
  model,
};

console.error(`Triaged ${alert.id}: ${analysis.severity} / ${analysis.verdict}`);
console.log(JSON.stringify(enriched));
