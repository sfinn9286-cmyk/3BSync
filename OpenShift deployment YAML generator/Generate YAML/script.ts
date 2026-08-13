// Generate OpenShift YAML by rendering the Tines Helm chart with
// `helm template` and OpenShift API capabilities enabled.
//
// Input: an RFC 7230 HTTP request (POST) whose JSON body carries the
// environment details collected by the OpenShift Builder UI.
// Output: an HTTP response with the rendered multi-document YAML, or a JSON error.
//
// The helm binary and the Tines chart are downloaded on first use and cached in
// the `tinesbuild` volume (mounted at /storage/tinesbuild).

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, chmodSync, renameSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_VERSION = "42.2.2";
const CHART_VERSION = "42.2.2";
const HELM_VERSION = "v3.16.2";
const CACHE = "/storage/tinesbuild";
const HELM = join(CACHE, "helm");
const CHART_DIR = join(CACHE, "tines");

type Body = Record<string, any>;

function httpResponse(status: string, contentType: string, body: string): string {
  return (
    `HTTP/1.1 ${status}\r\n` +
    `Content-Type: ${contentType}\r\n` +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    `Access-Control-Allow-Origin: *\r\n` +
    `Access-Control-Allow-Headers: Content-Type\r\n` +
    `Access-Control-Allow-Methods: POST, OPTIONS\r\n` +
    `\r\n` +
    body
  );
}

function parseHttp(raw: string): { method: string; body: string } {
  const sep = raw.indexOf("\r\n\r\n");
  const headPart = sep === -1 ? raw : raw.slice(0, sep);
  const body = sep === -1 ? "" : raw.slice(sep + 4);
  const method = headPart.split("\r\n")[0]?.split(" ")[0]?.toUpperCase() ?? "GET";
  return { method, body };
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

function tar(args: string[]): void {
  const res = spawnSync("tar", args, { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`tar failed: ${res.stderr || res.stdout}`);
}

// Ensure helm binary and chart are present in the cache volume.
async function ensureTooling(): Promise<void> {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

  if (!existsSync(HELM)) {
    const tgz = join(tmpdir(), "helm.tgz");
    await download(`https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz`, tgz);
    const ex = mkdtempSync(join(tmpdir(), "helm-"));
    tar(["xzf", tgz, "-C", ex]);
    const tmpBin = join(CACHE, "helm.tmp");
    copyFileSync(join(ex, "linux-amd64", "helm"), tmpBin);
    chmodSync(tmpBin, 0o755);
    renameSync(tmpBin, HELM);
    rmSync(ex, { recursive: true, force: true });
  }

  if (!existsSync(join(CHART_DIR, "Chart.yaml"))) {
    const tgz = join(tmpdir(), "tines-chart.tgz");
    await download(`https://helm.tines.com/tines-${CHART_VERSION}.tgz`, tgz);
    // extracts to <CACHE>/tines/
    tar(["xzf", tgz, "-C", CACHE]);
  }
}

function clean(v: any): boolean {
  return v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");
}

function buildOverlay(b: Body): Record<string, any> {
  const registry = b.imageRegistry?.trim() || "oci.tines.com";
  const repository = b.imageRepository?.trim() || "tines-openshift-fips/tines-app";
  const tag = clean(b.imageTag) ? b.imageTag.trim() : `v${APP_VERSION}`;
  const osImage = { registry, repository, tag };

  const overlay: Record<string, any> = {
    tinesContainerRegistryCredentials: {
      registry: b.registryUrl?.trim() || "oci.tines.com",
      username: b.registryUsername ?? "",
      password: b.registryPassword ?? "",
      email: b.registryEmail ?? "",
    },
    deployments: {
      tinesApp: { openshiftImage: { ...osImage } },
      tinesAppInit: { openshiftImage: { ...osImage } },
      tinesSidekiq: { openshiftImage: { ...osImage } },
    },
    tinesApp: {
      serverConfiguration: {},
      initialTenantConfiguration: {},
      databaseConfiguration: {},
      emailConfiguration: {},
    },
  };

  if (clean(b.appReplicas)) overlay.deployments.tinesApp.replicas = Number(b.appReplicas);
  if (clean(b.sidekiqReplicas)) overlay.deployments.tinesSidekiq.replicas = Number(b.sidekiqReplicas);

  const srv = overlay.tinesApp.serverConfiguration;
  if (clean(b.appSecretToken)) srv.APP_SECRET_TOKEN = b.appSecretToken;
  if (clean(b.port)) srv.PORT = Number(b.port);

  const tenant = overlay.tinesApp.initialTenantConfiguration;
  if (clean(b.domain)) tenant.DOMAIN = b.domain;
  if (clean(b.tenantName)) tenant.TENANT_NAME = b.tenantName;
  if (clean(b.seedEmail)) tenant.SEED_EMAIL = b.seedEmail;
  if (clean(b.seedFirstName)) tenant.SEED_FIRST_NAME = b.seedFirstName;
  if (clean(b.seedLastName)) tenant.SEED_LAST_NAME = b.seedLastName;

  const db = overlay.tinesApp.databaseConfiguration;
  if (clean(b.dbUsername)) db.DATABASE_USERNAME = b.dbUsername;
  if (clean(b.dbPassword)) db.DATABASE_PASSWORD = b.dbPassword;
  if (clean(b.dbName)) db.DATABASE_NAME = b.dbName;
  if (clean(b.dbHost)) db.DATABASE_HOST = b.dbHost;

  const em = overlay.tinesApp.emailConfiguration;
  if (clean(b.smtpServer)) em.SMTP_SERVER = b.smtpServer;
  if (clean(b.smtpDomain)) em.SMTP_DOMAIN = b.smtpDomain;
  if (clean(b.smtpUsername)) em.SMTP_USER_NAME = b.smtpUsername;
  if (clean(b.smtpPassword)) em.SMTP_PASSWORD = b.smtpPassword;

  if (b.routeEnabled) {
    overlay.route = { enabled: true, tls: { termination: b.routeTls?.trim() || "edge" }, wildcardPolicy: "None" };
    if (clean(b.routeHost)) overlay.route.host = b.routeHost;
  }

  return overlay;
}

function render(b: Body): string {
  const releaseName = (b.releaseName?.trim() || "tines").toLowerCase();
  const namespace = b.namespace?.trim() || "tines";
  const overlay = buildOverlay(b);

  const dir = mkdtempSync(join(tmpdir(), "tines-values-"));
  const valuesPath = join(dir, "values.json"); // JSON is valid YAML
  try {
    writeFileSync(valuesPath, JSON.stringify(overlay));
    const args = [
      "template",
      releaseName,
      CHART_DIR,
      "--namespace",
      namespace,
      "--api-versions",
      "security.openshift.io/v1",
      "--api-versions",
      "route.openshift.io/v1",
      "-f",
      valuesPath,
    ];
    const res = spawnSync(HELM, args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        HOME: dir,
        HELM_CACHE_HOME: join(dir, "cache"),
        HELM_CONFIG_HOME: join(dir, "config"),
        HELM_DATA_HOME: join(dir, "data"),
      },
    });
    if (res.error) throw new Error(`spawn helm: ${(res.error as any).message}`);
    if (res.status !== 0) {
      throw new Error(res.stderr?.trim() || res.stdout?.trim() || `helm exited ${res.status}`);
    }
    return res.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const raw = await Bun.stdin.text();
const { method, body } = parseHttp(raw);

if (method === "OPTIONS") {
  process.stdout.write(httpResponse("204 No Content", "text/plain", ""));
  process.exit(0);
}

try {
  const parsed: Body = body.trim() ? JSON.parse(body) : {};
  await ensureTooling();
  const yaml = render(parsed);
  process.stdout.write(httpResponse("200 OK", "text/yaml; charset=utf-8", yaml));
} catch (err: any) {
  const msg = err?.message ?? String(err);
  console.error("generate error:", msg);
  process.stdout.write(
    httpResponse("400 Bad Request", "application/json", JSON.stringify({ error: msg }))
  );
}
