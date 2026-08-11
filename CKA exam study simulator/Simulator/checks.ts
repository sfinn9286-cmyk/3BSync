import { Cluster, getPath, matchLabels, type Resource } from "./cluster";
import type { LabCheck } from "./lib";

export type CheckResult = { point: string; met: boolean; note?: string };

function parseSelector(selector: string): Record<string, string> {
  return Object.fromEntries(
    selector
      .split(",")
      .map((c) => c.split("="))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()]),
  );
}

function candidates(cluster: Cluster, check: LabCheck): Resource[] {
  const inNamespace = (r: Resource) =>
    check.namespace === undefined || r.metadata.namespace === check.namespace;
  return cluster.resources.filter((r) => {
    if (r.kind !== check.kind) return false;
    if (check.name !== undefined && r.metadata.name !== check.name) return false;
    if (check.selector && !matchLabels(r.metadata.labels, parseSelector(check.selector))) return false;
    return inNamespace(r);
  });
}

function describeValue(value: unknown): string {
  if (value === undefined) return "unset";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function pathMatches(res: Resource, check: LabCheck): boolean {
  const value = getPath(res, check.path!);
  if (check.equals !== undefined) return value === check.equals || String(value) === String(check.equals);
  if (check.contains !== undefined) {
    return JSON.stringify(value ?? "").toLowerCase().includes(check.contains.toLowerCase());
  }
  if (check.gte !== undefined) return Number(value) >= check.gte;
  return value !== undefined && value !== null;
}

function evaluateHost(cluster: Cluster, check: LabCheck): CheckResult {
  const host = check.host ? cluster.hosts[check.host] : undefined;
  if (!host) {
    return { point: check.description, met: false, note: `no node named ${check.host ?? "(unset)"} in this lab` };
  }

  if (check.kind === "HostFile") {
    const content = host.files[check.name ?? ""];
    if (check.absent) {
      if (check.contains !== undefined) {
        const offending = content !== undefined && content.toLowerCase().includes(check.contains.toLowerCase());
        return offending
          ? { point: check.description, met: false, note: `${check.name} still contains "${check.contains}"` }
          : { point: check.description, met: true };
      }
      return content === undefined
        ? { point: check.description, met: true }
        : { point: check.description, met: false, note: `${check.name} still exists on ${host.name}` };
    }
    if (content === undefined) {
      return { point: check.description, met: false, note: `${check.name} does not exist on ${host.name}` };
    }
    if (check.contains !== undefined) {
      const met = content.toLowerCase().includes(check.contains.toLowerCase());
      return { point: check.description, met, note: met ? undefined : `${check.name} does not contain "${check.contains}"` };
    }
    if (check.equals !== undefined) {
      const met = content.trim() === String(check.equals).trim();
      return { point: check.description, met, note: met ? undefined : `${check.name} has different contents` };
    }
    return { point: check.description, met: true };
  }

  const unit = host.services[check.name ?? ""];
  if (!unit) {
    return { point: check.description, met: false, note: `${check.name} is not a unit on ${host.name}` };
  }
  const field = check.path === "enabled" ? "enabled" : "active";
  const want = check.equals === undefined ? true : check.equals === true || check.equals === "true";
  const met = unit[field] === want;
  return {
    point: check.description,
    met,
    note: met ? undefined : `${check.name}.service on ${host.name} is ${unit[field] ? field : `not ${field}`}`,
  };
}

function evaluate(cluster: Cluster, check: LabCheck): CheckResult {
  if (check.kind === "HostService" || check.kind === "HostFile") return evaluateHost(cluster, check);
  const found = candidates(cluster, check);
  const label = `${check.kind}${check.name ? ` ${check.name}` : ""}${check.namespace ? ` in ${check.namespace}` : ""}`;

  if (check.absent) {
    const offenders = check.path ? found.filter((res) => pathMatches(res, check)) : found;
    return offenders.length === 0
      ? { point: check.description, met: true }
      : {
          point: check.description,
          met: false,
          note: check.path
            ? `${offenders[0].kind} ${offenders[0].metadata.name} still has ${check.path} = ${describeValue(getPath(offenders[0], check.path))}`
            : `${label} still exists`,
        };
  }

  if (check.count !== undefined || check.minCount !== undefined) {
    const want = check.count ?? check.minCount!;
    const met = check.count !== undefined ? found.length === check.count : found.length >= check.minCount!;
    return {
      point: check.description,
      met,
      note: met ? undefined : `found ${found.length}, expected ${check.count !== undefined ? want : `at least ${want}`}`,
    };
  }

  if (!found.length) return { point: check.description, met: false, note: `${label} not found` };

  if (!check.path) return { point: check.description, met: true };

  const matching = found.filter((res) => pathMatches(res, check));

  if (matching.length) return { point: check.description, met: true };

  const actual = describeValue(getPath(found[0], check.path));
  const expected =
    check.equals !== undefined
      ? `= ${check.equals}`
      : check.contains !== undefined
        ? `containing "${check.contains}"`
        : check.gte !== undefined
          ? `>= ${check.gte}`
          : "set";
  return {
    point: check.description,
    met: false,
    note: `${label}: ${check.path} is ${actual}, expected ${expected}`,
  };
}

export function evaluateLab(cluster: Cluster, checks: LabCheck[]) {
  cluster.reconcile();
  const results = checks.map((c) => evaluate(cluster, c));
  const met = results.filter((r) => r.met).length;
  const score = results.length ? met / results.length : 0;
  return {
    results,
    score,
    met,
    total: results.length,
    verdict: (score >= 0.999 ? "correct" : score > 0 ? "partial" : "incorrect") as
      | "correct"
      | "partial"
      | "incorrect",
  };
}
