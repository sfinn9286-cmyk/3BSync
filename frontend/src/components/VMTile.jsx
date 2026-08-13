import { PROVIDER_THEME, STATUS_THEME, formatMemory } from "../providerTheme";

export default function VMTile({ vm, onSelect }) {
  const providerTheme = PROVIDER_THEME[vm.provider];
  const statusTheme = STATUS_THEME[vm.power_state] || STATUS_THEME.unknown;
  const tagEntries = Object.entries(vm.tags || {}).slice(0, 3);

  return (
    <button
      className="vm-tile"
      style={{ "--tile-accent": providerTheme.color }}
      onClick={() => onSelect(vm)}
    >
      <div className="vm-tile-top">
        <span className="vm-name">{vm.name}</span>
        <span
          className="status-led"
          style={{ "--led-color": statusTheme.color }}
          title={statusTheme.label}
        />
      </div>
      <div className="vm-meta">
        <span className="region">{vm.region_or_datacenter}</span>
        <span>
          {vm.cpu_count} vCPU &middot; {formatMemory(vm.memory_mb)}
        </span>
        {vm.private_ip && <span>{vm.private_ip}</span>}
      </div>
      {tagEntries.length > 0 && (
        <div className="vm-tags">
          {tagEntries.map(([k, v]) => (
            <span className="tag-pill" key={k}>
              {k}:{v}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
