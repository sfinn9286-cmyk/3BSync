import { useEffect, useMemo, useState } from "react";
import TopBar from "./components/TopBar";
import StatsBar from "./components/StatsBar";
import ProviderPanel from "./components/ProviderPanel";
import VMDrawer from "./components/VMDrawer";
import { fetchVMs, fetchStats } from "./api";

const ALL_PROVIDERS = ["vmware", "azure", "aws"];
const ALL_STATUSES = ["running", "stopped", "suspended", "unknown"];
const POLL_INTERVAL_MS = 30_000;

export default function App() {
  const [vms, setVMs] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);

  const [search, setSearch] = useState("");
  const [activeProviders, setActiveProviders] = useState(new Set(ALL_PROVIDERS));
  const [activeStatuses, setActiveStatuses] = useState(new Set(ALL_STATUSES));
  const [selectedVM, setSelectedVM] = useState(null);

  async function loadData() {
    try {
      const [vmData, statsData] = await Promise.all([fetchVMs(), fetchStats()]);
      setVMs(vmData);
      setStats(statsData);
      setIsLive(true);
      setError(null);
    } catch (err) {
      setError(err.message);
      setIsLive(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  function toggleProvider(key) {
    setActiveProviders((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleStatus(key) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const filteredVMs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vms.filter((vm) => {
      if (!activeProviders.has(vm.provider)) return false;
      if (!activeStatuses.has(vm.power_state)) return false;
      if (!q) return true;
      const haystack = [
        vm.name,
        vm.private_ip,
        vm.public_ip,
        vm.region_or_datacenter,
        ...Object.entries(vm.tags || {}).map(([k, v]) => `${k}:${v}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [vms, search, activeProviders, activeStatuses]);

  const vmsByProvider = useMemo(() => {
    const grouped = { vmware: [], azure: [], aws: [] };
    for (const vm of filteredVMs) {
      grouped[vm.provider]?.push(vm);
    }
    return grouped;
  }, [filteredVMs]);

  return (
    <div className="app">
      <TopBar
        search={search}
        onSearchChange={setSearch}
        activeProviders={activeProviders}
        onToggleProvider={toggleProvider}
        activeStatuses={activeStatuses}
        onToggleStatus={toggleStatus}
        isLive={isLive}
      />

      <StatsBar stats={stats} />

      <main>
        {error && (
          <div className="empty-state">
            <div className="empty-state-title">Can't reach the inventory API</div>
            <div>
              {error} — make sure the backend is running at <code>localhost:8000</code>.
            </div>
          </div>
        )}

        {!error && filteredVMs.length === 0 && vms.length > 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No VMs match these filters</div>
            <div>Try clearing the search or re-enabling a provider / status chip.</div>
          </div>
        )}

        {!error &&
          ALL_PROVIDERS.map((provider) => (
            <ProviderPanel
              key={provider}
              provider={provider}
              vms={vmsByProvider[provider]}
              onSelect={setSelectedVM}
            />
          ))}
      </main>

      <VMDrawer vm={selectedVM} onClose={() => setSelectedVM(null)} />
    </div>
  );
}
