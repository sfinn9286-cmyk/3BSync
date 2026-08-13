export default function StatsBar({ stats }) {
  if (!stats) return null;

  const cells = [
    { label: "Total VMs", value: stats.total },
    { label: "Running", value: stats.by_power_state.running || 0, accent: "accent-running" },
    { label: "Stopped", value: stats.by_power_state.stopped || 0, accent: "accent-stopped" },
    { label: "VMware", value: stats.by_provider.vmware || 0 },
    { label: "Azure", value: stats.by_provider.azure || 0 },
    { label: "AWS", value: stats.by_provider.aws || 0 },
  ];

  return (
    <div className="stats-strip">
      {cells.map((cell) => (
        <div className={`stat-cell ${cell.accent || ""}`} key={cell.label}>
          <div className="stat-value">{cell.value}</div>
          <div className="stat-label">{cell.label}</div>
        </div>
      ))}
    </div>
  );
}
