import { PROVIDER_THEME } from "../providerTheme";
import VMTile from "./VMTile";

export default function ProviderPanel({ provider, vms, onSelect }) {
  const theme = PROVIDER_THEME[provider];
  if (vms.length === 0) return null;

  return (
    <section className="provider-panel">
      <div className="provider-panel-header">
        <span className="provider-swatch" style={{ background: theme.color }} />
        <span className="provider-panel-title" style={{ color: theme.color }}>
          {theme.label}
        </span>
        <span className="provider-panel-count">{vms.length} instance{vms.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="vm-grid">
        {vms.map((vm) => (
          <VMTile key={vm.id} vm={vm} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
