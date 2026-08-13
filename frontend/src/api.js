const BASE = "/api";

async function request(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status}`);
  }
  return res.json();
}

export function fetchVMs() {
  return request("/vms");
}

export function fetchStats() {
  return request("/stats");
}

export function fetchHealth() {
  return request("/health");
}
