export const PROVIDER_THEME = {
  vmware: { label: "VMware vSphere", color: "var(--vmware)" },
  azure: { label: "Microsoft Azure", color: "var(--azure)" },
  aws: { label: "Amazon AWS", color: "var(--aws)" },
};

export const STATUS_THEME = {
  running: { label: "running", color: "var(--running)" },
  stopped: { label: "stopped", color: "var(--stopped)" },
  suspended: { label: "suspended", color: "var(--suspended)" },
  unknown: { label: "unknown", color: "var(--unknown)" },
};

export function formatMemory(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
  return `${mb} MB`;
}
