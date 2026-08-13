import { PROVIDER_THEME, STATUS_THEME } from "../providerTheme";

export default function TopBar({
  search,
  onSearchChange,
  activeProviders,
  onToggleProvider,
  activeStatuses,
  onToggleStatus,
  isLive,
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <span className="bracket">[</span>fleet-map<span className="bracket">]</span>
        </span>
        <span className="brand-sub">VM Inventory</span>
      </div>

      <div className="search-box">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="search name, ip, tag..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search VMs"
        />
      </div>

      <div className="chip-row" role="group" aria-label="Filter by provider">
        {Object.entries(PROVIDER_THEME).map(([key, theme]) => (
          <button
            key={key}
            className={`chip ${activeProviders.has(key) ? "active" : ""}`}
            style={{ color: theme.color }}
            onClick={() => onToggleProvider(key)}
            aria-pressed={activeProviders.has(key)}
          >
            <span className="dot" />
            {key}
          </button>
        ))}
      </div>

      <div className="chip-row" role="group" aria-label="Filter by power state">
        {Object.entries(STATUS_THEME).map(([key, theme]) => (
          <button
            key={key}
            className={`chip ${activeStatuses.has(key) ? "active" : ""}`}
            style={{ color: theme.color }}
            onClick={() => onToggleStatus(key)}
            aria-pressed={activeStatuses.has(key)}
          >
            <span className="dot" />
            {key}
          </button>
        ))}
      </div>

      <div className="live-pill">
        <span className="led" />
        {isLive ? "live" : "connecting..."}
      </div>
    </header>
  );
}
