import { PROVIDER_THEME, STATUS_THEME, formatMemory } from "../providerTheme";

export default function VMDrawer({ vm, onClose }) {
  if (!vm) return null;

  const providerTheme = PROVIDER_THEME[vm.provider];
  const statusTheme = STATUS_THEME[vm.power_state] || STATUS_THEME.unknown;

  const fields = [
    { label: "Power state", value: statusTheme.label },
    { label: "Region / DC", value: vm.region_or_datacenter },
    { label: "vCPU", value: vm.cpu_count },
    { label: "Memory", value: formatMemory(vm.memory_mb) },
    { label: "OS", value: vm.os || "—" },
    { label: "Private IP", value: vm.private_ip || "—" },
    { label: "Public IP", value: vm.public_ip || "—" },
    { label: "Created", value: vm.created_at ? new Date(vm.created_at).toLocaleDateString() : "—" },
  ];

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={`Details for ${vm.name}`}>
        <div className="drawer-header">
          <div className="drawer-title">{vm.name}</div>
          <button className="drawer-close" onClick={onClose} aria-label="Close details">
            &times;
          </button>
        </div>
        <div className="drawer-provider" style={{ "--drawer-accent": providerTheme.color }}>
          {providerTheme.label} &middot; {vm.id}
        </div>

        <div className="drawer-field-grid">
          {fields.map((f) => (
            <div className="drawer-field" key={f.label}>
              <label>{f.label}</label>
              <div className="value">{f.value}</div>
            </div>
          ))}
        </div>

        {Object.keys(vm.tags || {}).length > 0 && (
          <>
            <div className="drawer-section-title">Tags</div>
            <div className="vm-tags">
              {Object.entries(vm.tags).map(([k, v]) => (
                <span className="tag-pill" key={k}>
                  {k}:{v}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="drawer-section-title">Raw source record</div>
        <pre className="raw-json">{JSON.stringify(vm.raw, null, 2)}</pre>
      </div>
    </>
  );
}
