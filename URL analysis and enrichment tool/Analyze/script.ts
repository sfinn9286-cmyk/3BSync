// Analyze step — HTTP API endpoint.
// Receives POST { "indicator": "<url|ip|domain|hash>" }, detects the type,
// enriches with VirusTotal (v3) and URLScan, returns a JSON report.
// Credentials are injected by the connectors; no keys in code.

interface Req {
  method: string;
  path: string;
  body: string;
}

function parseRequest(raw: string): Req {
  const sepIdx = raw.indexOf("\r\n\r\n");
  const head = sepIdx === -1 ? raw : raw.slice(0, sepIdx);
  const body = sepIdx === -1 ? "" : raw.slice(sepIdx + 4);
  const [requestLine = ""] = head.split("\r\n");
  const [method = "GET", path = "/"] = requestLine.split(" ");
  return { method, path, body };
}

function jsonResponse(status: number, obj: unknown): string {
  const body = JSON.stringify(obj);
  const bytes = Buffer.byteLength(body);
  return [
    `HTTP/1.1 ${status} ${status === 200 ? "OK" : "Error"}`,
    "Content-Type: application/json; charset=utf-8",
    `Content-Length: ${bytes}`,
    "Access-Control-Allow-Origin: *",
    "",
    body,
  ].join("\r\n");
}

type Kind = "url" | "domain" | "ip" | "hash";

function detect(raw: string): { kind: Kind; value: string } | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/.test(v))
    return { kind: "hash", value: v.toLowerCase() };
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)) return { kind: "ip", value: v };
  if (/^https?:\/\//i.test(v)) return { kind: "url", value: v };
  // bare domain
  if (/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]+)+$/.test(v))
    return { kind: "domain", value: v };
  // fall back to treating as URL
  return { kind: "url", value: `http://${v}` };
}

const VT = "https://www.virustotal.com/api/v3";
const US = "https://urlscan.io/api/v1";

async function safe<T>(fn: () => Promise<T>): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function vtGet(pathPart: string) {
  const r = await fetch(`${VT}/${pathPart}`, { headers: { accept: "application/json" } });
  if (r.status === 404) return { notFound: true };
  if (!r.ok) throw new Error(`VirusTotal ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function summarizeVT(attrs: any) {
  const stats = attrs?.last_analysis_stats ?? {};
  return {
    malicious: stats.malicious ?? 0,
    suspicious: stats.suspicious ?? 0,
    harmless: stats.harmless ?? 0,
    undetected: stats.undetected ?? 0,
    reputation: attrs?.reputation,
    last_analysis_date: attrs?.last_analysis_date
      ? new Date(attrs.last_analysis_date * 1000).toISOString()
      : undefined,
  };
}

async function virusTotal(kind: Kind, value: string) {
  if (kind === "hash") {
    const res = await vtGet(`files/${value}`);
    if ((res as any).notFound) return { found: false, message: "No VirusTotal record for this hash." };
    const a = (res as any).data?.attributes ?? {};
    return {
      found: true,
      type: "file",
      stats: summarizeVT(a),
      names: a.names?.slice(0, 5),
      type_description: a.type_description,
      size: a.size,
      link: `https://www.virustotal.com/gui/file/${value}`,
    };
  }
  if (kind === "ip") {
    const res = await vtGet(`ip_addresses/${value}`);
    if ((res as any).notFound) return { found: false };
    const a = (res as any).data?.attributes ?? {};
    return {
      found: true,
      type: "ip_address",
      stats: summarizeVT(a),
      as_owner: a.as_owner,
      country: a.country,
      link: `https://www.virustotal.com/gui/ip-address/${value}`,
    };
  }
  if (kind === "domain") {
    const res = await vtGet(`domains/${value}`);
    if ((res as any).notFound) return { found: false };
    const a = (res as any).data?.attributes ?? {};
    return {
      found: true,
      type: "domain",
      stats: summarizeVT(a),
      registrar: a.registrar,
      link: `https://www.virustotal.com/gui/domain/${value}`,
    };
  }
  // url
  const id = Buffer.from(value).toString("base64url").replace(/=+$/, "");
  let res = await vtGet(`urls/${id}`);
  if ((res as any).notFound) {
    // submit for analysis
    const form = new URLSearchParams({ url: value });
    const sub = await fetch(`${VT}/urls`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!sub.ok) throw new Error(`VirusTotal submit ${sub.status}`);
    const analysisId = (await sub.json())?.data?.id;
    // poll analysis briefly
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const ar = await fetch(`${VT}/analyses/${analysisId}`, { headers: { accept: "application/json" } });
      if (ar.ok) {
        const aj = await ar.json();
        if (aj?.data?.attributes?.status === "completed") break;
      }
    }
    res = await vtGet(`urls/${id}`);
    if ((res as any).notFound) return { found: false, message: "Submitted to VirusTotal; results not ready yet." };
  }
  const a = (res as any).data?.attributes ?? {};
  return {
    found: true,
    type: "url",
    stats: summarizeVT(a),
    title: a.title,
    final_url: a.last_final_url,
    link: `https://www.virustotal.com/gui/url/${id}`,
  };
}

async function urlScan(kind: Kind, value: string) {
  if (kind === "hash") return { applicable: false, message: "URLScan does not apply to file hashes." };
  let q = "";
  if (kind === "ip") q = `ip:"${value}"`;
  else if (kind === "domain") q = `domain:"${value}"`;
  else {
    try {
      q = `domain:"${new URL(value).hostname}"`;
    } catch {
      q = `page.url:"${value}"`;
    }
  }
  const r = await fetch(`${US}/search/?q=${encodeURIComponent(q)}&size=10`, {
    headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`URLScan ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const results = (j.results ?? []).slice(0, 10).map((res: any) => ({
    url: res.page?.url,
    domain: res.page?.domain,
    ip: res.page?.ip,
    country: res.page?.country,
    server: res.page?.server,
    time: res.task?.time,
    screenshot: res.screenshot,
    report: res.result,
  }));
  return { applicable: true, total: j.total ?? results.length, results };
}

async function main() {
  const raw = await Bun.stdin.text();
  const req = parseRequest(raw);

  if (req.method === "OPTIONS") {
    process.stdout.write(
      [
        "HTTP/1.1 204 No Content",
        "Access-Control-Allow-Origin: *",
        "Access-Control-Allow-Methods: POST, OPTIONS",
        "Access-Control-Allow-Headers: Content-Type",
        "",
        "",
      ].join("\r\n"),
    );
    return;
  }

  let indicator = "";
  try {
    indicator = JSON.parse(req.body || "{}").indicator ?? "";
  } catch {
    /* ignore */
  }

  const det = detect(indicator);
  if (!det) {
    process.stdout.write(jsonResponse(400, { error: "Provide a URL, IP address, domain, or file hash." }));
    return;
  }

  const [vt, us] = await Promise.all([
    safe(() => virusTotal(det.kind, det.value)),
    safe(() => urlScan(det.kind, det.value)),
  ]);

  process.stdout.write(
    jsonResponse(200, {
      indicator: det.value,
      kind: det.kind,
      virustotal: vt.ok ? vt.data : { error: vt.error },
      urlscan: us.ok ? us.data : { error: us.error },
    }),
  );
}

main();
