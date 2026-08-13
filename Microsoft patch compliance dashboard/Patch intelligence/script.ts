type Sku = { key: string; label: string; family: "server" | "client" | "app"; match: RegExp };

const SKUS: Sku[] = [
  { key: "ws2012r2", label: "Windows Server 2012 R2", family: "server", match: /^Windows Server 2012 R2( \(Server Core installation\))?$/i },
  { key: "ws2016", label: "Windows Server 2016", family: "server", match: /^Windows Server 2016( \(Server Core installation\))?$/i },
  { key: "ws2019", label: "Windows Server 2019", family: "server", match: /^Windows Server 2019( \(Server Core installation\))?$/i },
  { key: "ws2022", label: "Windows Server 2022", family: "server", match: /^Windows Server 2022( \(Server Core installation\))?$/i },
  { key: "ws2025", label: "Windows Server 2025", family: "server", match: /^Windows Server 2025( \(Server Core installation\))?$/i },
  { key: "w10-22h2", label: "Windows 10 22H2", family: "client", match: /^Windows 10 Version 22H2 for x64-based Systems$/i },
  { key: "w11-23h2", label: "Windows 11 23H2", family: "client", match: /^Windows 11 Version 23H2 for x64-based Systems$/i },
  { key: "w11-24h2", label: "Windows 11 24H2", family: "client", match: /^Windows 11 Version 24H2 for x64-based Systems$/i },
  { key: "w11-25h2", label: "Windows 11 25H2", family: "client", match: /^Windows 11 Version 25H2 for x64-based Systems$/i },
  { key: "edge", label: "Microsoft Edge (Chromium)", family: "app", match: /^Microsoft Edge \(Chromium-based\)$/i },
  { key: "m365apps", label: "Microsoft 365 Apps for Enterprise", family: "app", match: /^Microsoft 365 Apps for Enterprise for (32|64)-bit Systems$/i },
];

const SKU_BY_KEY = new Map(SKUS.map((s) => [s.key, s]));
const SEVERITY_RANK: Record<string, number> = { Critical: 4, Important: 3, Moderate: 2, Low: 1, Unknown: 0 };
const MONTHS_BACK = 4;

type Cve = { id: string; title: string; severity: string; impact: string; exploited: boolean; disclosed: boolean; cvss: number | null };

type Update = {
  kb: string;
  sku: string;
  skuLabel: string;
  family: string;
  month: string;
  monthIndex: number;
  releaseDate: string;
  url: string;
  severity: string;
  cveCount: number;
  exploitedCount: number;
  maxCvss: number | null;
  cves: Cve[];
};

async function msrc<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`MSRC request failed: ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

function exploitability(text: string) {
  const field = (k: string) => new RegExp(`${k}:([^;]*)`).exec(text)?.[1]?.trim().toLowerCase() ?? "";
  return { exploited: field("Exploited") === "yes", disclosed: field("Publicly Disclosed") === "yes" };
}

async function loadUpdates() {
  const catalog = await msrc<{ value: { ID: string; InitialReleaseDate: string; CvrfUrl: string }[] }>(
    "https://api.msrc.microsoft.com/cvrf/v3.0/updates",
  );
  const now = Date.now();
  const months = catalog.value
    .filter((u) => /^\d{4}-[A-Z][a-z]{2}$/.test(u.ID) && Date.parse(u.InitialReleaseDate) <= now)
    .sort((a, b) => Date.parse(a.InitialReleaseDate) - Date.parse(b.InitialReleaseDate))
    .slice(-MONTHS_BACK);

  const updates: Update[] = [];

  for (const [monthIndex, month] of months.entries()) {
    const doc = await msrc<any>(month.CvrfUrl);
    const skuByProduct = new Map<string, Sku>();
    for (const product of doc.ProductTree?.FullProductName ?? []) {
      const sku = SKUS.find((s) => s.match.test(product.Value));
      if (sku) skuByProduct.set(String(product.ProductID), sku);
    }

    const byKey = new Map<string, Update>();

    for (const vuln of doc.Vulnerability ?? []) {
      const severityByProduct = new Map<string, string>();
      const impactByProduct = new Map<string, string>();
      let flags = { exploited: false, disclosed: false };
      for (const threat of vuln.Threats ?? []) {
        const value: string = threat.Description?.Value ?? "";
        const products: string[] = (threat.ProductID ?? []).map(String);
        if (threat.Type === 3) for (const p of products) severityByProduct.set(p, value);
        else if (threat.Type === 0) for (const p of products) impactByProduct.set(p, value);
        else if (threat.Type === 1) flags = exploitability(value);
      }
      const cvss: number | null = (vuln.CVSSScoreSets ?? []).reduce(
        (max: number | null, set: any) => (typeof set.BaseScore === "number" && (max === null || set.BaseScore > max) ? set.BaseScore : max),
        null,
      );

      for (const remediation of vuln.Remediations ?? []) {
        if (remediation.Type !== 2 || !/^\d{6,8}$/.test(String(remediation.Description?.Value ?? ""))) continue;
        const kb = String(remediation.Description.Value);
        for (const productId of (remediation.ProductID ?? []).map(String)) {
          const sku = skuByProduct.get(productId);
          if (!sku) continue;
          const key = `${kb}:${sku.key}`;
          let update = byKey.get(key);
          if (!update) {
            update = {
              kb,
              sku: sku.key,
              skuLabel: sku.label,
              family: sku.family,
              month: month.ID,
              monthIndex,
              releaseDate: month.InitialReleaseDate,
              url: remediation.URL || `https://catalog.update.microsoft.com/v7/site/Search.aspx?q=KB${kb}`,
              severity: "Unknown",
              cveCount: 0,
              exploitedCount: 0,
              maxCvss: null,
              cves: [],
            };
            byKey.set(key, update);
            updates.push(update);
          }
          if (update.cves.some((c) => c.id === vuln.CVE)) continue;
          const severity = severityByProduct.get(productId) ?? "Unknown";
          update.cves.push({
            id: vuln.CVE,
            title: vuln.Title?.Value ?? vuln.CVE,
            severity,
            impact: impactByProduct.get(productId) ?? "Unknown",
            exploited: flags.exploited,
            disclosed: flags.disclosed,
            cvss,
          });
          if (SEVERITY_RANK[severity] > SEVERITY_RANK[update.severity]) update.severity = severity;
          if (cvss !== null && (update.maxCvss === null || cvss > update.maxCvss)) update.maxCvss = cvss;
        }
      }
    }
  }

  for (const update of updates) {
    update.cves.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.id.localeCompare(b.id));
    update.cveCount = update.cves.length;
    update.exploitedCount = update.cves.filter((c) => c.exploited).length;
  }

  const monthMeta = months.map((m, i) => ({ id: m.ID, index: i, releaseDate: m.InitialReleaseDate }));
  return { updates, months: monthMeta };
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const SITES = [
  { name: "Dublin HQ", region: "EMEA" },
  { name: "London Docklands", region: "EMEA" },
  { name: "Frankfurt DC", region: "EMEA" },
  { name: "Boston", region: "AMER" },
  { name: "Austin DC", region: "AMER" },
  { name: "Singapore", region: "APAC" },
];

const SERVER_ROLES = [
  { role: "Domain Controller", prefix: "DC", tier: "Tier 0" },
  { role: "File Server", prefix: "FS", tier: "Tier 2" },
  { role: "SQL Server", prefix: "SQL", tier: "Tier 1" },
  { role: "IIS Web Front End", prefix: "WEB", tier: "Tier 1" },
  { role: "Exchange Hybrid", prefix: "EXCH", tier: "Tier 1" },
  { role: "Hyper-V Host", prefix: "HV", tier: "Tier 0" },
  { role: "RDS Session Host", prefix: "RDS", tier: "Tier 2" },
  { role: "Print Server", prefix: "PRN", tier: "Tier 3" },
];

const ENDPOINT_ROLES = [
  { role: "Executive Laptop", prefix: "LT", tier: "Tier 1" },
  { role: "Engineering Workstation", prefix: "WS", tier: "Tier 2" },
  { role: "Finance Desktop", prefix: "FIN", tier: "Tier 1" },
  { role: "Call Centre Desktop", prefix: "CC", tier: "Tier 3" },
  { role: "Field Sales Laptop", prefix: "SL", tier: "Tier 2" },
  { role: "Kiosk", prefix: "KSK", tier: "Tier 3" },
];

const SERVER_MIX: [string, number][] = [
  ["ws2012r2", 4],
  ["ws2016", 12],
  ["ws2019", 26],
  ["ws2022", 38],
  ["ws2025", 20],
];

const CLIENT_MIX: [string, number][] = [
  ["w10-22h2", 22],
  ["w11-23h2", 18],
  ["w11-24h2", 40],
  ["w11-25h2", 20],
];

const RING_LAG: Record<string, number[]> = {
  Pilot: [0, 0, 0, 1],
  Broad: [0, 1, 1, 2],
  Critical: [1, 2, 3],
  Legacy: [2, 3, 4],
};

function pickWeighted(mix: [string, number][], r: number) {
  const total = mix.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  const target = r * total;
  for (const [key, weight] of mix) {
    acc += weight;
    if (target <= acc) return key;
  }
  return mix[mix.length - 1][0];
}

type Asset = {
  id: string;
  hostname: string;
  kind: "Server" | "Endpoint";
  role: string;
  tier: string;
  site: string;
  region: string;
  ring: string;
  osSku: string;
  osLabel: string;
  lastCheckIn: string;
  daysSinceCheckIn: number;
  agentHealthy: boolean;
  rebootPending: boolean;
  products: { sku: string; lagMonths: number }[];
};

function buildFleet(monthCount: number, generatedAt: Date): Asset[] {
  const random = rng(20260814);
  const assets: Asset[] = [];
  const counters = new Map<string, number>();

  const make = (kind: "Server" | "Endpoint", roles: typeof SERVER_ROLES, mix: [string, number][]) => {
    const roleDef = roles[Math.floor(random() * roles.length)];
    const site = SITES[Math.floor(random() * SITES.length)];
    const osSku = pickWeighted(mix, random());
    const ring =
      roleDef.tier === "Tier 0" ? "Critical" : osSku === "ws2012r2" || osSku === "w10-22h2" ? "Legacy" : random() < 0.22 ? "Pilot" : "Broad";
    const lagOptions = RING_LAG[ring];
    const osLag = Math.min(monthCount, lagOptions[Math.floor(random() * lagOptions.length)]);
    const seq = (counters.get(roleDef.prefix) ?? 0) + 1;
    counters.set(roleDef.prefix, seq);
    const daysSinceCheckIn = osLag >= 3 && random() < 0.5 ? Math.floor(8 + random() * 40) : Math.floor(random() * 4);
    const products = [{ sku: osSku, lagMonths: osLag }];
    products.push({ sku: "edge", lagMonths: Math.min(monthCount, random() < 0.7 ? 0 : Math.floor(random() * 3)) });
    if (kind === "Endpoint" || random() < 0.2) {
      products.push({ sku: "m365apps", lagMonths: Math.min(monthCount, random() < 0.6 ? 0 : Math.floor(random() * 3)) });
    }

    assets.push({
      id: `${roleDef.prefix}-${String(seq).padStart(3, "0")}`,
      hostname: `${roleDef.prefix}-${site.region}-${String(seq).padStart(3, "0")}.contoso.local`,
      kind,
      role: roleDef.role,
      tier: roleDef.tier,
      site: site.name,
      region: site.region,
      ring,
      osSku,
      osLabel: SKU_BY_KEY.get(osSku)!.label,
      lastCheckIn: new Date(generatedAt.getTime() - daysSinceCheckIn * 86400000 - Math.floor(random() * 20) * 3600000).toISOString(),
      daysSinceCheckIn,
      agentHealthy: daysSinceCheckIn < 7,
      rebootPending: random() < 0.14,
      products,
    });
  };

  for (let i = 0; i < 96; i++) make("Server", SERVER_ROLES, SERVER_MIX);
  for (let i = 0; i < 264; i++) make("Endpoint", ENDPOINT_ROLES, CLIENT_MIX);
  return assets;
}

const { updates, months } = await loadUpdates();
if (updates.length === 0) throw new Error("No Windows updates matched the tracked SKUs");

const generatedAt = new Date();
const fleet = buildFleet(months.length, generatedAt);

const payload = {
  generatedAt: generatedAt.toISOString(),
  source: "Microsoft Security Response Center CVRF API (api.msrc.microsoft.com)",
  months,
  skus: SKUS.map(({ key, label, family }) => ({ key, label, family })),
  updates,
  fleet,
};

const body = JSON.stringify(payload);
process.stdout.write(
  [
    "HTTP/1.1 200 OK",
    "Content-Type: application/json",
    "Cache-Control: no-store",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "",
    body,
  ].join("\r\n"),
);
