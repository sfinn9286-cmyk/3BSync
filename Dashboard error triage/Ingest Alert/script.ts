// Ingest Alert
// Route: POST /soc-ingest  (private; space members only)
// Accepts a security alert as a JSON body. If no usable body is provided,
// generates a realistic synthetic alert (demo mode). Emits a normalized
// alert object to stdout for the Triage step.

interface Alert {
  id: string;
  source: string;
  type: string;
  title: string;
  description: string;
  host: string;
  user: string;
  srcIp: string;
  destIp: string;
  raw: Record<string, unknown>;
  detectedAt: string;
}

function parseHttpBody(input: string): string {
  // Route input is a full RFC 7230 HTTP request. Body follows the blank line.
  const sep = input.indexOf("\r\n\r\n");
  if (sep === -1) return "";
  return input.slice(sep + 4).trim();
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randIp(): string {
  return `${1 + Math.floor(Math.random() * 223)}.${Math.floor(Math.random() * 256)}.${Math.floor(
    Math.random() * 256
  )}.${1 + Math.floor(Math.random() * 254)}`;
}

function syntheticAlert(): Alert {
  const scenarios = [
    {
      type: "Brute Force",
      source: "Okta",
      title: "Multiple failed login attempts",
      description:
        "47 failed authentication attempts for a single account within 3 minutes, followed by a successful login from a new geolocation.",
      raw: { failedAttempts: 47, windowSeconds: 180, newGeo: "Lagos, NG", mfa: "not_satisfied" },
    },
    {
      type: "Malware",
      source: "CrowdStrike Falcon",
      title: "Suspicious process execution detected",
      description:
        "powershell.exe spawned by winword.exe with an encoded command line attempting to reach an external host.",
      raw: { parent: "winword.exe", child: "powershell.exe", cmdline: "-enc JABzAD0A...", reputation: "malicious" },
    },
    {
      type: "Data Exfiltration",
      source: "Zscaler",
      title: "Large outbound transfer to unknown destination",
      description:
        "2.3 GB uploaded to an unrecognized cloud storage endpoint outside business hours by a workstation account.",
      raw: { bytesOut: 2469606195, destination: "mega.nz", timeOfDay: "02:41", category: "uncategorized" },
    },
    {
      type: "Phishing",
      source: "Proofpoint",
      title: "User clicked credential-harvesting link",
      description:
        "An employee clicked a link in a flagged email leading to a spoofed Microsoft 365 login page.",
      raw: { sender: "billing@micros0ft-secure.com", url: "https://m365-verify.ru/login", clicked: true },
    },
    {
      type: "Privilege Escalation",
      source: "AWS GuardDuty",
      title: "Unusual IAM policy attachment",
      description:
        "An IAM user attached AdministratorAccess to itself shortly after access keys were created.",
      raw: { principal: "svc-ci-deploy", action: "AttachUserPolicy", policy: "AdministratorAccess" },
    },
  ];
  const s = rand(scenarios);
  const hosts = ["WIN-FIN-04", "ENG-LT-211", "srv-db-prod-02", "MKT-LT-118", "ci-runner-7"];
  const users = ["a.morgan", "j.patel", "svc-ci-deploy", "t.nguyen", "r.silva"];
  return {
    id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    source: s.source,
    type: s.type,
    title: s.title,
    description: s.description,
    host: rand(hosts),
    user: rand(users),
    srcIp: randIp(),
    destIp: randIp(),
    raw: s.raw,
    detectedAt: new Date().toISOString(),
  };
}

function normalize(obj: Record<string, unknown>): Alert {
  const base = syntheticAlert();
  return {
    id: typeof obj.id === "string" ? obj.id : base.id,
    source: typeof obj.source === "string" ? obj.source : "manual",
    type: typeof obj.type === "string" ? obj.type : "Unknown",
    title: typeof obj.title === "string" ? obj.title : "Untitled alert",
    description: typeof obj.description === "string" ? obj.description : "",
    host: typeof obj.host === "string" ? obj.host : "unknown",
    user: typeof obj.user === "string" ? obj.user : "unknown",
    srcIp: typeof obj.srcIp === "string" ? obj.srcIp : "",
    destIp: typeof obj.destIp === "string" ? obj.destIp : "",
    raw: typeof obj.raw === "object" && obj.raw !== null ? (obj.raw as Record<string, unknown>) : obj,
    detectedAt: typeof obj.detectedAt === "string" ? obj.detectedAt : new Date().toISOString(),
  };
}

const input = await Bun.stdin.text();
const body = parseHttpBody(input);

let alert: Alert;
if (body) {
  try {
    const parsed = JSON.parse(body);
    alert = normalize(parsed);
  } catch {
    alert = syntheticAlert();
    console.error("Body was not valid JSON; generated synthetic alert.");
  }
} else {
  alert = syntheticAlert();
  console.error("No body provided; generated synthetic alert.");
}

console.log(JSON.stringify(alert));
