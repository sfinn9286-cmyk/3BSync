import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";

const MOCK_VMS = [
  {
    id: "vm-1",
    name: "vc-web-prod-01",
    provider: "vmware",
    power_state: "running",
    region_or_datacenter: "DC-East / Cluster-Prod-A",
    cpu_count: 4,
    memory_mb: 16384,
    os: "Ubuntu Linux",
    private_ip: "10.20.4.11",
    public_ip: null,
    tags: { env: "prod" },
    created_at: "2023-11-02T09:14:00Z",
    raw: {},
  },
  {
    id: "i-1",
    name: "aws-api-prod-1",
    provider: "aws",
    power_state: "running",
    region_or_datacenter: "us-east-1a",
    cpu_count: 4,
    memory_mb: 16384,
    os: "linux",
    private_ip: "172.31.4.10",
    public_ip: "54.210.11.20",
    tags: { environment: "production" },
    created_at: "2024-02-01T14:00:00Z",
    raw: {},
  },
];

const MOCK_STATS = {
  total: 2,
  by_provider: { vmware: 1, aws: 1 },
  by_power_state: { running: 2 },
};

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url.includes("/api/vms")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_VMS) });
    }
    if (url.includes("/api/stats")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_STATS) });
    }
    return Promise.reject(new Error(`Unhandled URL: ${url}`));
  });
});

describe("App", () => {
  it("renders VMs grouped by provider after loading", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("vc-web-prod-01")).toBeInTheDocument());
    expect(screen.getByText("aws-api-prod-1")).toBeInTheDocument();
    expect(screen.getByText("VMware vSphere")).toBeInTheDocument();
    expect(screen.getByText("Amazon AWS")).toBeInTheDocument();
  });

  it("filters VMs by search text", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("vc-web-prod-01")).toBeInTheDocument());

    const input = screen.getByPlaceholderText(/search name/i);
    input.focus();
    await import("@testing-library/user-event").then(({ default: userEvent }) =>
      userEvent.type(input, "aws-api")
    );

    await waitFor(() => {
      expect(screen.queryByText("vc-web-prod-01")).not.toBeInTheDocument();
      expect(screen.getByText("aws-api-prod-1")).toBeInTheDocument();
    });
  });
});
