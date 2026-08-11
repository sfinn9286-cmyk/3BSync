import { load, loadAll, dump } from "js-yaml";

export type Resource = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp?: string;
    ownerReferences?: { kind: string; name: string }[];
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  data?: Record<string, string>;
  stringData?: Record<string, string>;
  rules?: unknown[];
  roleRef?: { kind: string; name: string };
  subjects?: { kind: string; name: string; namespace?: string }[];
  type?: string;
};

export type Result = { out: string; code: number };

const KINDS: Record<string, { kind: string; apiVersion: string; namespaced: boolean; plural: string }> = {
  pod: { kind: "Pod", apiVersion: "v1", namespaced: true, plural: "pods" },
  node: { kind: "Node", apiVersion: "v1", namespaced: false, plural: "nodes" },
  namespace: { kind: "Namespace", apiVersion: "v1", namespaced: false, plural: "namespaces" },
  service: { kind: "Service", apiVersion: "v1", namespaced: true, plural: "services" },
  endpoints: { kind: "Endpoints", apiVersion: "v1", namespaced: true, plural: "endpoints" },
  configmap: { kind: "ConfigMap", apiVersion: "v1", namespaced: true, plural: "configmaps" },
  secret: { kind: "Secret", apiVersion: "v1", namespaced: true, plural: "secrets" },
  serviceaccount: { kind: "ServiceAccount", apiVersion: "v1", namespaced: true, plural: "serviceaccounts" },
  persistentvolume: { kind: "PersistentVolume", apiVersion: "v1", namespaced: false, plural: "persistentvolumes" },
  persistentvolumeclaim: { kind: "PersistentVolumeClaim", apiVersion: "v1", namespaced: true, plural: "persistentvolumeclaims" },
  storageclass: { kind: "StorageClass", apiVersion: "storage.k8s.io/v1", namespaced: false, plural: "storageclasses" },
  deployment: { kind: "Deployment", apiVersion: "apps/v1", namespaced: true, plural: "deployments" },
  replicaset: { kind: "ReplicaSet", apiVersion: "apps/v1", namespaced: true, plural: "replicasets" },
  statefulset: { kind: "StatefulSet", apiVersion: "apps/v1", namespaced: true, plural: "statefulsets" },
  daemonset: { kind: "DaemonSet", apiVersion: "apps/v1", namespaced: true, plural: "daemonsets" },
  job: { kind: "Job", apiVersion: "batch/v1", namespaced: true, plural: "jobs" },
  cronjob: { kind: "CronJob", apiVersion: "batch/v1", namespaced: true, plural: "cronjobs" },
  ingress: { kind: "Ingress", apiVersion: "networking.k8s.io/v1", namespaced: true, plural: "ingresses" },
  ingressclass: { kind: "IngressClass", apiVersion: "networking.k8s.io/v1", namespaced: false, plural: "ingressclasses" },
  networkpolicy: { kind: "NetworkPolicy", apiVersion: "networking.k8s.io/v1", namespaced: true, plural: "networkpolicies" },
  role: { kind: "Role", apiVersion: "rbac.authorization.k8s.io/v1", namespaced: true, plural: "roles" },
  rolebinding: { kind: "RoleBinding", apiVersion: "rbac.authorization.k8s.io/v1", namespaced: true, plural: "rolebindings" },
  clusterrole: { kind: "ClusterRole", apiVersion: "rbac.authorization.k8s.io/v1", namespaced: false, plural: "clusterroles" },
  clusterrolebinding: { kind: "ClusterRoleBinding", apiVersion: "rbac.authorization.k8s.io/v1", namespaced: false, plural: "clusterrolebindings" },
  horizontalpodautoscaler: { kind: "HorizontalPodAutoscaler", apiVersion: "autoscaling/v2", namespaced: true, plural: "horizontalpodautoscalers" },
  resourcequota: { kind: "ResourceQuota", apiVersion: "v1", namespaced: true, plural: "resourcequotas" },
  limitrange: { kind: "LimitRange", apiVersion: "v1", namespaced: true, plural: "limitranges" },
  priorityclass: { kind: "PriorityClass", apiVersion: "scheduling.k8s.io/v1", namespaced: false, plural: "priorityclasses" },
  event: { kind: "Event", apiVersion: "v1", namespaced: true, plural: "events" },
};

const ALIASES: Record<string, string> = {
  po: "pod", pods: "pod",
  no: "node", nodes: "node",
  ns: "namespace", namespaces: "namespace",
  svc: "service", services: "service",
  cm: "configmap", configmaps: "configmap",
  secrets: "secret",
  sa: "serviceaccount", serviceaccounts: "serviceaccount",
  pv: "persistentvolume", persistentvolumes: "persistentvolume",
  pvc: "persistentvolumeclaim", persistentvolumeclaims: "persistentvolumeclaim",
  sc: "storageclass", storageclasses: "storageclass",
  deploy: "deployment", deployments: "deployment", "deployment.apps": "deployment", "deployments.apps": "deployment",
  rs: "replicaset", replicasets: "replicaset",
  sts: "statefulset", statefulsets: "statefulset",
  ds: "daemonset", daemonsets: "daemonset",
  jobs: "job",
  cj: "cronjob", cronjobs: "cronjob",
  ing: "ingress", ingresses: "ingress",
  netpol: "networkpolicy", networkpolicies: "networkpolicy",
  roles: "role",
  rolebindings: "rolebinding",
  clusterroles: "clusterrole",
  clusterrolebindings: "clusterrolebinding",
  hpa: "horizontalpodautoscaler", horizontalpodautoscalers: "horizontalpodautoscaler",
  quota: "resourcequota", resourcequotas: "resourcequota",
  limits: "limitrange", limitranges: "limitrange",
  pc: "priorityclass", priorityclasses: "priorityclass",
  ep: "endpoints",
  events: "event", ev: "event",
};

function resolveKind(word: string): (typeof KINDS)[string] | null {
  const key = word.toLowerCase();
  const canonical = ALIASES[key] ?? key;
  const entry = KINDS[canonical];
  if (entry) return entry;
  const byKind = Object.values(KINDS).find((k) => k.kind.toLowerCase() === canonical);
  return byKind ?? null;
}

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const raw of path.split(".")) {
    if (!raw) continue;
    const m = raw.match(/^([^[]*)((\[\d+\])*)$/);
    const key = m ? m[1] : raw;
    if (key) {
      if (cur === null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    for (const idx of raw.matchAll(/\[(\d+)\]/g)) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[Number(idx[1])];
    }
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (const part of parts.slice(0, -1)) {
    if (typeof cur[part] !== "object" || cur[part] === null) cur[part] = {};
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function mergePatch(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete target[k];
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      if (typeof target[k] !== "object" || target[k] === null || Array.isArray(target[k])) target[k] = {};
      mergePatch(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      target[k] = v;
    }
  }
}

function age(created?: string): string {
  if (!created) return "<unknown>";
  const secs = Math.max(0, Math.round((Date.now() - new Date(created).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? (c ?? "") : (c ?? "").padEnd(widths[i] + 3)))
      .join("")
      .trimEnd();
  return [line(headers), ...rows.map(line)].join("\n");
}

function selectorMatches(labels: Record<string, string> | undefined, selector: string): boolean {
  if (!selector) return true;
  return selector.split(",").every((clause) => {
    const neq = clause.match(/^([^!=]+)!=(.*)$/);
    if (neq) return (labels?.[neq[1].trim()] ?? "") !== neq[2].trim();
    const eq = clause.match(/^([^!=]+)=(.*)$/);
    if (eq) return (labels?.[eq[1].trim()] ?? undefined) === eq[2].trim();
    const negated = clause.trim().startsWith("!");
    const key = clause.trim().replace(/^!/, "");
    return negated ? labels?.[key] === undefined : labels?.[key] !== undefined;
  });
}

function matchLabels(labels: Record<string, string> | undefined, match: Record<string, string>): boolean {
  return Object.entries(match).every(([k, v]) => labels?.[k] === v);
}

function randSuffix(len: number): string {
  const chars = "bcdfghjklmnpqrstvwxz2456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function parseKeyValues(items: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items) {
    const i = item.indexOf("=");
    if (i > 0) out[item.slice(0, i)] = item.slice(i + 1);
  }
  return out;
}

type FlagValue = string | true | string[];
type Flags = { flags: Record<string, FlagValue>; positional: string[]; passthrough: string[] };

function parseArgs(argv: string[]): Flags {
  const flags: Record<string, FlagValue> = {};
  const positional: string[] = [];
  const passthrough: string[] = [];
  let after = false;
  const record = (name: string, value: string | true) => {
    const existing = flags[name];
    if (existing === undefined) {
      flags[name] = value;
      return;
    }
    const list = Array.isArray(existing) ? existing : [String(existing)];
    flags[name] = [...list, String(value)];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (after) {
      passthrough.push(arg);
      continue;
    }
    if (arg === "--") {
      after = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const [name, ...rest] = arg.slice(2).split("=");
      if (rest.length) record(name, rest.join("="));
      else if (argv[i + 1] && !argv[i + 1].startsWith("-")) record(name, argv[++i]);
      else record(name, true);
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      const name = arg.slice(1, 2);
      const inline = arg.slice(2);
      if (inline) record(name, inline);
      else if (argv[i + 1] !== undefined && (argv[i + 1] === "-" || !argv[i + 1].startsWith("-"))) record(name, argv[++i]);
      else record(name, true);
      continue;
    }
    positional.push(arg);
  }
  return { flags, positional, passthrough };
}

function flagString(value: FlagValue | undefined): string | undefined {
  if (value === undefined || value === true) return undefined;
  return Array.isArray(value) ? value[value.length - 1] : value;
}

export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export type HostService = { active: boolean; enabled: boolean; log: string[] };

export type HostContainer = { id: string; name: string; pod?: string; state: string; log?: string };

export type HostState = {
  name: string;
  files: Record<string, string>;
  services: Record<string, HostService>;
  containers: HostContainer[];
  swap: boolean;
};

export type HostInit = {
  files?: Record<string, string>;
  services?: Record<string, { active?: boolean; enabled?: boolean; log?: string }>;
  containers?: { id?: string; name: string; pod?: string; state?: string; log?: string }[];
  swap?: boolean;
};

export type ClusterInit = {
  context?: string;
  nodes?: { name: string; roles?: string; version?: string; ready?: boolean; schedulable?: boolean; labels?: Record<string, string>; taints?: { key: string; value?: string; effect: string }[]; cpu?: string; memory?: string }[];
  namespaces?: string[];
  resources?: Partial<Resource>[];
  logs?: Record<string, string>;
  exec?: Record<string, string>;
  hosts?: Record<string, HostInit>;
};

export const STATIC_POD_PATH = "/etc/kubernetes/manifests";

const KUBELET_CONFIG = `apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
authentication:
  x509:
    clientCAFile: /etc/kubernetes/pki/ca.crt
cgroupDriver: systemd
clusterDNS:
- 10.96.0.10
clusterDomain: cluster.local
staticPodPath: /etc/kubernetes/manifests
`;

const APISERVER_MANIFEST = `apiVersion: v1
kind: Pod
metadata:
  name: kube-apiserver
  namespace: kube-system
  labels:
    component: kube-apiserver
    tier: control-plane
spec:
  hostNetwork: true
  containers:
  - name: kube-apiserver
    image: registry.k8s.io/kube-apiserver:v1.35.0
    command:
    - kube-apiserver
    - --advertise-address=192.168.1.10
    - --authorization-mode=Node,RBAC
    - --client-ca-file=/etc/kubernetes/pki/ca.crt
    - --etcd-servers=https://127.0.0.1:2379
    - --secure-port=6443
    - --service-cluster-ip-range=10.96.0.0/12
`;

const ETCD_MANIFEST = `apiVersion: v1
kind: Pod
metadata:
  name: etcd
  namespace: kube-system
  labels:
    component: etcd
    tier: control-plane
spec:
  hostNetwork: true
  containers:
  - name: etcd
    image: registry.k8s.io/etcd:3.6.4-0
    command:
    - etcd
    - --advertise-client-urls=https://192.168.1.10:2379
    - --cert-file=/etc/kubernetes/pki/etcd/server.crt
    - --key-file=/etc/kubernetes/pki/etcd/server.key
    - --trusted-ca-file=/etc/kubernetes/pki/etcd/ca.crt
    - --data-dir=/var/lib/etcd
`;


export class Cluster {
  resources: Resource[] = [];
  context: string;
  logs: Record<string, string>;
  execOutputs: Record<string, string>;
  events: string[] = [];
  hosts: Record<string, HostState> = {};

  constructor(init: ClusterInit = {}) {
    this.context = init.context ?? "kubernetes-admin@kubernetes";
    this.logs = init.logs ?? {};
    this.execOutputs = init.exec ?? {};

    const created = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    for (const ns of ["default", "kube-system", "kube-node-lease", "kube-public", ...(init.namespaces ?? [])]) {
      if (!this.find("Namespace", ns)) {
        this.resources.push({
          apiVersion: "v1",
          kind: "Namespace",
          metadata: { name: ns, creationTimestamp: created, labels: { "kubernetes.io/metadata.name": ns } },
          status: { phase: "Active" },
        });
      }
    }
    for (const node of init.nodes ?? [{ name: "controlplane", roles: "control-plane" }, { name: "node01" }]) {
      this.resources.push({
        apiVersion: "v1",
        kind: "Node",
        metadata: {
          name: node.name,
          creationTimestamp: created,
          labels: {
            "kubernetes.io/hostname": node.name,
            ...(node.roles === "control-plane" ? { "node-role.kubernetes.io/control-plane": "" } : {}),
            ...(node.labels ?? {}),
          },
        },
        spec: {
          unschedulable: node.schedulable === false ? true : undefined,
          taints:
            node.taints ??
            (node.roles === "control-plane"
              ? [{ key: "node-role.kubernetes.io/control-plane", effect: "NoSchedule" }]
              : undefined),
        },
        status: {
          conditions: [{ type: "Ready", status: node.ready === false ? "False" : "True", reason: node.ready === false ? "KubeletNotReady" : "KubeletReady" }],
          nodeInfo: { kubeletVersion: node.version ?? "v1.35.0", containerRuntimeVersion: "containerd://2.1.0", osImage: "Ubuntu 24.04.2 LTS" },
          capacity: { cpu: node.cpu ?? "2", memory: node.memory ?? "4Gi", pods: "110" },
          allocatable: { cpu: node.cpu ?? "2", memory: node.memory ?? "4Gi", pods: "110" },
        },
      });
    }
    for (const raw of init.resources ?? []) this.push(raw);

    for (const node of this.list("Node")) {
      const name = node.metadata.name;
      const controlPlane = node.metadata.labels?.["node-role.kubernetes.io/control-plane"] !== undefined;
      const supplied = init.hosts?.[name] ?? {};
      const files: Record<string, string> = {
        "/var/lib/kubelet/config.yaml": KUBELET_CONFIG,
        "/etc/kubernetes/kubelet.conf": `apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://192.168.1.10:6443\n`,
        ...(controlPlane
          ? {
              [`${STATIC_POD_PATH}/kube-apiserver.yaml`]: APISERVER_MANIFEST,
              [`${STATIC_POD_PATH}/etcd.yaml`]: ETCD_MANIFEST,
              "/etc/kubernetes/admin.conf": `apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://192.168.1.10:6443\n`,
            }
          : {}),
        ...(supplied.files ?? {}),
      };
      const kubeletUp =
        supplied.services?.kubelet?.active ?? (node.status?.conditions as { type: string; status: string }[] | undefined)?.find((c) => c.type === "Ready")?.status !== "False";
      this.hosts[name] = {
        name,
        files,
        services: {
          kubelet: {
            active: kubeletUp,
            enabled: supplied.services?.kubelet?.enabled ?? true,
            log: (supplied.services?.kubelet?.log ?? "").split("\n").filter(Boolean),
          },
          containerd: {
            active: supplied.services?.containerd?.active ?? true,
            enabled: supplied.services?.containerd?.enabled ?? true,
            log: (supplied.services?.containerd?.log ?? "").split("\n").filter(Boolean),
          },
          ...Object.fromEntries(
            Object.entries(supplied.services ?? {})
              .filter(([unit]) => unit !== "kubelet" && unit !== "containerd")
              .map(([unit, s]) => [
                unit,
                { active: s.active ?? true, enabled: s.enabled ?? true, log: (s.log ?? "").split("\n").filter(Boolean) },
              ]),
          ),
        },
        containers: (supplied.containers ?? []).map((c, i) => ({
          id: c.id ?? `${randSuffix(4)}${i}${randSuffix(7)}`,
          name: c.name,
          pod: c.pod,
          state: c.state ?? "Running",
          log: c.log,
        })),
        swap: supplied.swap ?? false,
      };
    }

    this.reconcile();
  }

  push(raw: Partial<Resource>): Resource {
    const copy = JSON.parse(JSON.stringify(raw)) as Partial<Resource>;
    const kind = copy.kind ?? "Pod";
    const info = resolveKind(kind);
    const res: Resource = {
      apiVersion: copy.apiVersion ?? info?.apiVersion ?? "v1",
      kind,
      ...copy,
      metadata: {
        creationTimestamp: new Date(Date.now() - 3600 * 1000).toISOString(),
        ...(copy.metadata ?? { name: "unnamed" }),
        namespace: info?.namespaced ? (copy.metadata?.namespace ?? "default") : undefined,
      },
    } as Resource;
    if (res.kind === "Pod" && !res.status) {
      res.status = { phase: "Running", nodeName: res.spec?.nodeName ?? this.schedulableNodes()[0]?.metadata.name };
    }
    this.resources.push(res);
    return res;
  }

  schedulableNodes(): Resource[] {
    return this.resources.filter(
      (r) =>
        r.kind === "Node" &&
        !r.spec?.unschedulable &&
        !((r.spec?.taints as { effect: string }[] | undefined) ?? []).some((t) => t.effect === "NoSchedule"),
    );
  }

  find(kind: string, name: string, namespace?: string): Resource | undefined {
    return this.resources.find(
      (r) =>
        r.kind === kind &&
        r.metadata.name === name &&
        (resolveKind(kind)?.namespaced ? r.metadata.namespace === (namespace ?? "default") : true),
    );
  }

  list(kind: string, namespace?: string): Resource[] {
    return this.resources.filter(
      (r) => r.kind === kind && (namespace === undefined || r.metadata.namespace === namespace),
    );
  }

  remove(res: Resource) {
    this.resources = this.resources.filter((r) => r !== res);
    if (res.kind === "Namespace") {
      this.resources = this.resources.filter((r) => r.metadata.namespace !== res.metadata.name);
    }
    if (["Deployment", "StatefulSet", "DaemonSet", "Job", "ReplicaSet"].includes(res.kind)) {
      this.resources = this.resources.filter(
        (r) =>
          !(r.metadata.ownerReferences ?? []).some(
            (o) => o.kind === res.kind && o.name === res.metadata.name,
          ),
      );
    }
  }

  ownedPods(owner: Resource): Resource[] {
    return this.resources.filter(
      (r) =>
        r.kind === "Pod" &&
        r.metadata.namespace === owner.metadata.namespace &&
        (r.metadata.ownerReferences ?? []).some((o) => o.kind === owner.kind && o.name === owner.metadata.name),
    );
  }

  reconcileHosts() {
    for (const host of Object.values(this.hosts)) {
      const node = this.find("Node", host.name);
      if (!node) continue;
      const kubelet = host.services.kubelet;
      const runtime = host.services.containerd;
      const healthy = kubelet.active && runtime.active && !host.swap;
      const reason = !runtime.active
        ? "ContainerRuntimeNotReady"
        : host.swap
          ? "KubeletNotReady"
          : kubelet.active
            ? "KubeletReady"
            : "KubeletNotPosting";
      node.status = {
        ...(node.status ?? {}),
        conditions: [
          {
            type: "Ready",
            status: healthy ? "True" : "False",
            reason,
            message: healthy
              ? "kubelet is posting ready status"
              : !runtime.active
                ? "container runtime is down"
                : host.swap
                  ? "swap is enabled on the node"
                  : "kubelet stopped posting node status",
          },
        ],
      };

      const staticPods = Object.entries(host.files).filter(
        ([path]) => path.startsWith(`${STATIC_POD_PATH}/`) && /\.ya?ml$/.test(path),
      );
      const wanted = new Map<string, Partial<Resource>>();
      for (const [path, body] of staticPods) {
        let doc: Partial<Resource> | undefined;
        try {
          doc = load(body) as Partial<Resource>;
        } catch (e) {
          kubelet.log.push(`kubelet: could not process manifest file "${path}": ${(e as Error).message}`);
          continue;
        }
        if (!doc || doc.kind !== "Pod" || !doc.metadata?.name) {
          kubelet.log.push(`kubelet: manifest file "${path}" is not a valid Pod manifest`);
          continue;
        }
        wanted.set(`${doc.metadata.namespace ?? "kube-system"}/${doc.metadata.name}-${host.name}`, doc);
      }

      for (const pod of this.resources.filter(
        (r) => r.kind === "Pod" && r.metadata.annotations?.["sim/static-host"] === host.name,
      )) {
        const key = `${pod.metadata.namespace}/${pod.metadata.name}`;
        if (!wanted.has(key)) this.resources = this.resources.filter((r) => r !== pod);
      }

      for (const [key, doc] of wanted) {
        const [namespace, name] = [key.slice(0, key.indexOf("/")), key.slice(key.indexOf("/") + 1)];
        const existing = this.find("Pod", name, namespace);
        const pod: Resource = {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name,
            namespace,
            labels: doc.metadata?.labels,
            annotations: {
              "kubernetes.io/config.source": "file",
              "sim/static-host": host.name,
            },
            creationTimestamp: existing?.metadata.creationTimestamp ?? new Date().toISOString(),
          },
          spec: { ...(doc.spec ?? {}), nodeName: host.name },
          status: {
            phase: kubelet.active && runtime.active ? "Running" : "Pending",
            nodeName: host.name,
            podIP: "192.168.1.10",
          },
        };
        if (existing) this.resources[this.resources.indexOf(existing)] = pod;
        else this.resources.push(pod);
      }
    }
  }

  reconcile() {
    this.reconcileHosts();
    for (const owner of this.resources.filter((r) => ["Deployment", "StatefulSet", "DaemonSet"].includes(r.kind))) {
      const template = get(owner, "spec.template") as Resource | undefined;
      const desired =
        owner.kind === "DaemonSet"
          ? this.schedulableNodes().length
          : Number(get(owner, "spec.replicas") ?? 1);
      const pods = this.ownedPods(owner);
      for (let i = pods.length; i < desired; i++) {
        const nodes = this.schedulableNodes();
        const suffix =
          owner.kind === "StatefulSet" ? String(i) : `${randSuffix(5)}`;
        const hash = owner.kind === "Deployment" ? `${randSuffix(5)}-` : "";
        this.resources.push({
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: `${owner.metadata.name}-${hash}${suffix}`,
            namespace: owner.metadata.namespace,
            labels: { ...(template?.metadata?.labels ?? {}) },
            creationTimestamp: new Date().toISOString(),
            ownerReferences: [{ kind: owner.kind, name: owner.metadata.name }],
          },
          spec: { ...(template?.spec ?? {}) },
          status: {
            phase: "Running",
            nodeName: nodes.length ? nodes[i % nodes.length].metadata.name : undefined,
          },
        });
      }
      for (const extra of pods.slice(desired)) this.remove(extra);
      const running = this.ownedPods(owner).filter((p) => p.status?.phase === "Running").length;
      owner.status = {
        ...(owner.status ?? {}),
        replicas: this.ownedPods(owner).length,
        readyReplicas: running,
        availableReplicas: running,
        updatedReplicas: this.ownedPods(owner).length,
        ...(owner.kind === "DaemonSet"
          ? { desiredNumberScheduled: desired, numberReady: running, currentNumberScheduled: desired }
          : {}),
      };
    }
    for (const pvc of this.list("PersistentVolumeClaim")) {
      if (pvc.status?.phase) continue;
      const requested = String(get(pvc, "spec.resources.requests.storage") ?? "");
      const className = get(pvc, "spec.storageClassName") as string | undefined;
      const sc = className ? this.find("StorageClass", className) : this.list("StorageClass").find((s) => s.metadata.annotations?.["storageclass.kubernetes.io/is-default-class"] === "true");
      const immediate = !sc || get(sc, "volumeBindingMode") !== "WaitForFirstConsumer";
      const pv = this.list("PersistentVolume").find(
        (v) => v.status?.phase !== "Bound" && (!className || get(v, "spec.storageClassName") === className),
      );
      if (pv) {
        pvc.status = { phase: "Bound", capacity: { storage: get(pv, "spec.capacity.storage") } };
        pvc.spec = { ...(pvc.spec ?? {}), volumeName: pv.metadata.name };
        pv.status = { phase: "Bound" };
        pv.spec = { ...(pv.spec ?? {}), claimRef: { name: pvc.metadata.name, namespace: pvc.metadata.namespace } };
      } else if (sc && immediate) {
        const name = `pvc-${randSuffix(8)}`;
        this.resources.push({
          apiVersion: "v1",
          kind: "PersistentVolume",
          metadata: { name, creationTimestamp: new Date().toISOString() },
          spec: {
            capacity: { storage: requested },
            accessModes: get(pvc, "spec.accessModes"),
            storageClassName: className ?? sc.metadata.name,
            persistentVolumeReclaimPolicy: (get(sc, "reclaimPolicy") as string) ?? "Delete",
            claimRef: { name: pvc.metadata.name, namespace: pvc.metadata.namespace },
          },
          status: { phase: "Bound" },
        });
        pvc.status = { phase: "Bound", capacity: { storage: requested } };
        pvc.spec = { ...(pvc.spec ?? {}), volumeName: name };
      } else {
        pvc.status = { phase: "Pending" };
      }
    }
    for (const svc of this.list("Service")) {
      const selector = (get(svc, "spec.selector") as Record<string, string> | undefined) ?? {};
      const pods = Object.keys(selector).length
        ? this.list("Pod", svc.metadata.namespace).filter((p) => matchLabels(p.metadata.labels, selector))
        : [];
      svc.status = { ...(svc.status ?? {}), endpointCount: pods.length };

      const port = ((get(svc, "spec.ports") as { targetPort?: number; port?: number }[] | undefined) ?? [])[0];
      const addresses = pods
        .filter((p) => (p.status?.phase ?? "Running") === "Running")
        .map((p) => `${p.status?.podIP ?? "10.244.1.10"}:${port?.targetPort ?? port?.port ?? 80}`);
      const endpoints: Resource = {
        apiVersion: "v1",
        kind: "Endpoints",
        metadata: {
          name: svc.metadata.name,
          namespace: svc.metadata.namespace,
          creationTimestamp: svc.metadata.creationTimestamp,
        },
        status: { endpointCount: addresses.length, addresses },
      };
      const existing = this.find("Endpoints", svc.metadata.name, svc.metadata.namespace);
      if (existing) this.resources[this.resources.indexOf(existing)] = endpoints;
      else this.resources.push(endpoints);
    }
    for (const ep of this.list("Endpoints")) {
      if (!this.find("Service", ep.metadata.name, ep.metadata.namespace)) {
        this.resources = this.resources.filter((r) => r !== ep);
      }
    }
  }
}

function ready(pod: Resource): string {
  const containers = ((get(pod, "spec.containers") as unknown[]) ?? [{}]).length;
  const phase = pod.status?.phase ?? "Running";
  const readyCount = phase === "Running" ? containers : 0;
  return `${readyCount}/${containers}`;
}

function podRow(pod: Resource, wide: boolean): string[] {
  const base = [
    pod.metadata.name,
    ready(pod),
    String(pod.status?.phase ?? "Running"),
    String(pod.status?.restartCount ?? 0),
    age(pod.metadata.creationTimestamp),
  ];
  if (!wide) return base;
  return [...base, String(pod.status?.podIP ?? "10.244.1.10"), String(pod.status?.nodeName ?? "<none>"), "<none>", "<none>"];
}

function svcPorts(svc: Resource): string {
  const ports = (get(svc, "spec.ports") as { port: number; protocol?: string; nodePort?: number }[] | undefined) ?? [];
  return ports.map((p) => (p.nodePort ? `${p.port}:${p.nodePort}/${p.protocol ?? "TCP"}` : `${p.port}/${p.protocol ?? "TCP"}`)).join(",") || "<none>";
}

function containerImages(res: Resource): string {
  const containers =
    (get(res, "spec.containers") as { image?: string }[] | undefined) ??
    (get(res, "spec.template.spec.containers") as { image?: string }[] | undefined) ??
    [];
  return containers.map((c) => c.image ?? "").join(",");
}

function nodeRoles(node: Resource): string {
  const roles = Object.keys(node.metadata.labels ?? {})
    .filter((l) => l.startsWith("node-role.kubernetes.io/"))
    .map((l) => l.slice("node-role.kubernetes.io/".length));
  return roles.length ? roles.join(",") : "<none>";
}

function nodeStatus(node: Resource): string {
  const conditions = (get(node, "status.conditions") as { type: string; status: string }[] | undefined) ?? [];
  const isReady = conditions.find((c) => c.type === "Ready")?.status === "True";
  const base = isReady ? "Ready" : "NotReady";
  return node.spec?.unschedulable ? `${base},SchedulingDisabled` : base;
}

function renderList(cluster: Cluster, kindKey: string, items: Resource[], flags: Record<string, FlagValue>, allNamespaces: boolean): string {
  const wide = flagString(flags.o) === "wide";
  const showLabels = flags["show-labels"] === true;
  const nsCol = allNamespaces ? ["NAMESPACE"] : [];
  const nsVal = (r: Resource) => (allNamespaces ? [r.metadata.namespace ?? ""] : []);
  const labelCol = showLabels ? ["LABELS"] : [];
  const labelVal = (r: Resource) =>
    showLabels
      ? [Object.entries(r.metadata.labels ?? {}).map(([k, v]) => `${k}=${v}`).join(",") || "<none>"]
      : [];

  const rows = (headers: string[], row: (r: Resource) => string[]) =>
    table([...nsCol, ...headers, ...labelCol], items.map((r) => [...nsVal(r), ...row(r), ...labelVal(r)]));

  switch (kindKey) {
    case "pod":
      return rows(
        wide
          ? ["NAME", "READY", "STATUS", "RESTARTS", "AGE", "IP", "NODE", "NOMINATED NODE", "READINESS GATES"]
          : ["NAME", "READY", "STATUS", "RESTARTS", "AGE"],
        (r) => podRow(r, wide),
      );
    case "node":
      return rows(
        wide ? ["NAME", "STATUS", "ROLES", "AGE", "VERSION", "INTERNAL-IP", "OS-IMAGE"] : ["NAME", "STATUS", "ROLES", "AGE", "VERSION"],
        (r) => {
          const base = [r.metadata.name, nodeStatus(r), nodeRoles(r), age(r.metadata.creationTimestamp), String(get(r, "status.nodeInfo.kubeletVersion"))];
          return wide ? [...base, "192.168.1.10", String(get(r, "status.nodeInfo.osImage"))] : base;
        },
      );
    case "namespace":
      return rows(["NAME", "STATUS", "AGE"], (r) => [r.metadata.name, String(r.status?.phase ?? "Active"), age(r.metadata.creationTimestamp)]);
    case "deployment":
      return rows(["NAME", "READY", "UP-TO-DATE", "AVAILABLE", "AGE"], (r) => [
        r.metadata.name,
        `${r.status?.readyReplicas ?? 0}/${get(r, "spec.replicas") ?? 1}`,
        String(r.status?.updatedReplicas ?? 0),
        String(r.status?.availableReplicas ?? 0),
        age(r.metadata.creationTimestamp),
      ]);
    case "replicaset":
      return rows(["NAME", "DESIRED", "CURRENT", "READY", "AGE"], (r) => [
        r.metadata.name,
        String(get(r, "spec.replicas") ?? 0),
        String(r.status?.replicas ?? 0),
        String(r.status?.readyReplicas ?? 0),
        age(r.metadata.creationTimestamp),
      ]);
    case "statefulset":
      return rows(["NAME", "READY", "AGE"], (r) => [
        r.metadata.name,
        `${r.status?.readyReplicas ?? 0}/${get(r, "spec.replicas") ?? 1}`,
        age(r.metadata.creationTimestamp),
      ]);
    case "daemonset":
      return rows(["NAME", "DESIRED", "CURRENT", "READY", "UP-TO-DATE", "AVAILABLE", "NODE SELECTOR", "AGE"], (r) => [
        r.metadata.name,
        String(r.status?.desiredNumberScheduled ?? 0),
        String(r.status?.currentNumberScheduled ?? 0),
        String(r.status?.numberReady ?? 0),
        String(r.status?.currentNumberScheduled ?? 0),
        String(r.status?.numberReady ?? 0),
        Object.entries((get(r, "spec.template.spec.nodeSelector") as Record<string, string>) ?? {}).map(([k, v]) => `${k}=${v}`).join(",") || "<none>",
        age(r.metadata.creationTimestamp),
      ]);
    case "service":
      return rows(["NAME", "TYPE", "CLUSTER-IP", "EXTERNAL-IP", "PORT(S)", "AGE"], (r) => [
        r.metadata.name,
        String(get(r, "spec.type") ?? "ClusterIP"),
        String(get(r, "spec.clusterIP") ?? "10.96.0.42"),
        "<none>",
        svcPorts(r),
        age(r.metadata.creationTimestamp),
      ]);
    case "endpoints":
      return rows(["NAME", "ENDPOINTS", "AGE"], (r) => [
        r.metadata.name,
        ((r.status?.addresses as string[] | undefined) ?? []).join(",") || "<none>",
        age(r.metadata.creationTimestamp),
      ]);
    case "configmap":
      return rows(["NAME", "DATA", "AGE"], (r) => [r.metadata.name, String(Object.keys(r.data ?? {}).length), age(r.metadata.creationTimestamp)]);
    case "secret":
      return rows(["NAME", "TYPE", "DATA", "AGE"], (r) => [
        r.metadata.name,
        r.type ?? "Opaque",
        String(Object.keys(r.data ?? r.stringData ?? {}).length),
        age(r.metadata.creationTimestamp),
      ]);
    case "serviceaccount":
      return rows(["NAME", "SECRETS", "AGE"], (r) => [r.metadata.name, "0", age(r.metadata.creationTimestamp)]);
    case "persistentvolumeclaim":
      return rows(["NAME", "STATUS", "VOLUME", "CAPACITY", "ACCESS MODES", "STORAGECLASS", "AGE"], (r) => [
        r.metadata.name,
        String(r.status?.phase ?? "Pending"),
        String(get(r, "spec.volumeName") ?? ""),
        String(get(r, "status.capacity.storage") ?? ""),
        ((get(r, "spec.accessModes") as string[]) ?? []).map(shortAccess).join(","),
        String(get(r, "spec.storageClassName") ?? "<none>"),
        age(r.metadata.creationTimestamp),
      ]);
    case "persistentvolume":
      return rows(["NAME", "CAPACITY", "ACCESS MODES", "RECLAIM POLICY", "STATUS", "CLAIM", "STORAGECLASS", "AGE"], (r) => {
        const claim = get(r, "spec.claimRef") as { namespace?: string; name?: string } | undefined;
        return [
          r.metadata.name,
          String(get(r, "spec.capacity.storage") ?? ""),
          ((get(r, "spec.accessModes") as string[]) ?? []).map(shortAccess).join(","),
          String(get(r, "spec.persistentVolumeReclaimPolicy") ?? "Retain"),
          String(r.status?.phase ?? "Available"),
          claim ? `${claim.namespace}/${claim.name}` : "",
          String(get(r, "spec.storageClassName") ?? "<none>"),
          age(r.metadata.creationTimestamp),
        ];
      });
    case "storageclass":
      return rows(["NAME", "PROVISIONER", "RECLAIMPOLICY", "VOLUMEBINDINGMODE", "ALLOWVOLUMEEXPANSION", "AGE"], (r) => [
        r.metadata.name + (r.metadata.annotations?.["storageclass.kubernetes.io/is-default-class"] === "true" ? " (default)" : ""),
        String((r as unknown as Record<string, unknown>).provisioner ?? ""),
        String((r as unknown as Record<string, unknown>).reclaimPolicy ?? "Delete"),
        String((r as unknown as Record<string, unknown>).volumeBindingMode ?? "Immediate"),
        String((r as unknown as Record<string, unknown>).allowVolumeExpansion ?? false),
        age(r.metadata.creationTimestamp),
      ]);
    case "ingress":
      return rows(["NAME", "CLASS", "HOSTS", "ADDRESS", "PORTS", "AGE"], (r) => [
        r.metadata.name,
        String(get(r, "spec.ingressClassName") ?? "<none>"),
        ((get(r, "spec.rules") as { host?: string }[]) ?? []).map((x) => x.host ?? "*").join(",") || "*",
        "",
        "80",
        age(r.metadata.creationTimestamp),
      ]);
    case "job":
      return rows(["NAME", "STATUS", "COMPLETIONS", "DURATION", "AGE"], (r) => [
        r.metadata.name,
        "Complete",
        `${get(r, "spec.completions") ?? 1}/${get(r, "spec.completions") ?? 1}`,
        "5s",
        age(r.metadata.creationTimestamp),
      ]);
    case "cronjob":
      return rows(["NAME", "SCHEDULE", "SUSPEND", "ACTIVE", "LAST SCHEDULE", "AGE"], (r) => [
        r.metadata.name,
        String(get(r, "spec.schedule") ?? ""),
        String(get(r, "spec.suspend") ?? false),
        "0",
        "<none>",
        age(r.metadata.creationTimestamp),
      ]);
    case "role":
    case "clusterrole":
      return rows(["NAME", "CREATED AT"], (r) => [r.metadata.name, r.metadata.creationTimestamp ?? ""]);
    case "rolebinding":
    case "clusterrolebinding":
      return rows(["NAME", "ROLE", "AGE", "USERS", "SERVICEACCOUNTS"], (r) => [
        r.metadata.name,
        `${r.roleRef?.kind}/${r.roleRef?.name}`,
        age(r.metadata.creationTimestamp),
        (r.subjects ?? []).filter((s) => s.kind === "User").map((s) => s.name).join(","),
        (r.subjects ?? []).filter((s) => s.kind === "ServiceAccount").map((s) => `${s.namespace}/${s.name}`).join(","),
      ]);
    case "networkpolicy":
      return rows(["NAME", "POD-SELECTOR", "AGE"], (r) => [
        r.metadata.name,
        Object.entries((get(r, "spec.podSelector.matchLabels") as Record<string, string>) ?? {}).map(([k, v]) => `${k}=${v}`).join(",") || "<none>",
        age(r.metadata.creationTimestamp),
      ]);
    default:
      return rows(["NAME", "AGE"], (r) => [r.metadata.name, age(r.metadata.creationTimestamp)]);
  }
}

function shortAccess(mode: string): string {
  return { ReadWriteOnce: "RWO", ReadOnlyMany: "ROX", ReadWriteMany: "RWX", ReadWriteOncePod: "RWOP" }[mode] ?? mode;
}

function clean(res: Resource): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(res)) as Record<string, unknown>;
  const meta = copy.metadata as Record<string, unknown>;
  delete meta.ownerReferences;
  return copy;
}

function jsonpath(res: Resource | Resource[], expr: string): string {
  const body = expr.replace(/^\{/, "").replace(/\}$/, "");
  if (body.startsWith(".items[*]")) {
    const list = Array.isArray(res) ? res : [res];
    return list.map((r) => String(get(r, body.slice(".items[*].".length)) ?? "")).join(" ");
  }
  const target = Array.isArray(res) ? res[0] : res;
  const value = get(target, body.replace(/^\./, ""));
  return typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
}

function describePod(cluster: Cluster, pod: Resource): string {
  const containers = (get(pod, "spec.containers") as Record<string, unknown>[]) ?? [];
  const lines = [
    `Name:             ${pod.metadata.name}`,
    `Namespace:        ${pod.metadata.namespace}`,
    `Priority:         0`,
    `Node:             ${pod.status?.nodeName ?? "<none>"}`,
    `Start Time:       ${pod.metadata.creationTimestamp}`,
    `Labels:           ${Object.entries(pod.metadata.labels ?? {}).map(([k, v]) => `${k}=${v}`).join("\n                  ") || "<none>"}`,
    `Annotations:      ${Object.entries(pod.metadata.annotations ?? {}).filter(([k]) => !k.startsWith("sim/")).map(([k, v]) => `${k}=${v}`).join("\n                  ") || "<none>"}`,
    `Status:           ${pod.status?.phase ?? "Running"}`,
    `IP:               ${pod.status?.podIP ?? "10.244.1.10"}`,
    `Containers:`,
  ];
  for (const c of containers) {
    lines.push(
      `  ${c.name}:`,
      `    Image:          ${c.image}`,
      `    Port:           ${(c.ports as { containerPort?: number }[] | undefined)?.[0]?.containerPort ?? "<none>"}`,
      `    State:          ${pod.status?.phase === "Running" ? "Running" : String(pod.status?.reason ?? pod.status?.phase ?? "Waiting")}`,
      `    Ready:          ${pod.status?.phase === "Running" ? "True" : "False"}`,
      `    Restart Count:  ${pod.status?.restartCount ?? 0}`,
      `    Requests:       ${JSON.stringify(get(c, "resources.requests") ?? {})}`,
      `    Limits:         ${JSON.stringify(get(c, "resources.limits") ?? {})}`,
      `    Environment:    ${JSON.stringify(get(c, "env") ?? [])}`,
      `    Mounts:         ${((c.volumeMounts as { mountPath: string; name: string }[] | undefined) ?? []).map((m) => `${m.mountPath} from ${m.name}`).join(", ") || "<none>"}`,
    );
  }
  const volumes = (get(pod, "spec.volumes") as Record<string, unknown>[]) ?? [];
  lines.push("Volumes:");
  if (!volumes.length) lines.push("  <none>");
  for (const v of volumes) lines.push(`  ${v.name}: ${JSON.stringify({ ...v, name: undefined })}`);
  lines.push(
    `Node-Selectors:   ${JSON.stringify(get(pod, "spec.nodeSelector") ?? {})}`,
    `Tolerations:      ${JSON.stringify(get(pod, "spec.tolerations") ?? [])}`,
    "Events:",
  );
  const events = cluster
    .list("Event", pod.metadata.namespace)
    .filter((e) => String(get(e, "involvedObject.name") ?? "") === pod.metadata.name);
  if (!events.length) lines.push("  <none>");
  for (const e of events) {
    lines.push(
      `  Type: ${get(e, "type")}  Reason: ${get(e, "reason")}  Message: ${get(e, "message")}`,
    );
  }
  return lines.join("\n");
}

function describeNode(cluster: Cluster, node: Resource): string {
  const pods = cluster.resources.filter((r) => r.kind === "Pod" && r.status?.nodeName === node.metadata.name);
  return [
    `Name:               ${node.metadata.name}`,
    `Roles:              ${nodeRoles(node)}`,
    `Labels:             ${Object.entries(node.metadata.labels ?? {}).map(([k, v]) => `${k}=${v}`).join("\n                    ")}`,
    `Taints:             ${((node.spec?.taints as { key: string; value?: string; effect: string }[] | undefined) ?? []).map((t) => `${t.key}=${t.value ?? ""}:${t.effect}`).join("\n                    ") || "<none>"}`,
    `Unschedulable:      ${node.spec?.unschedulable ? "true" : "false"}`,
    "Conditions:",
    ...((get(node, "status.conditions") as { type: string; status: string; reason?: string }[]) ?? []).map(
      (c) => `  ${c.type.padEnd(18)}${c.status}${c.reason ? `   ${c.reason}` : ""}`,
    ),
    "Capacity:",
    ...Object.entries((get(node, "status.capacity") as Record<string, string>) ?? {}).map(([k, v]) => `  ${k}: ${v}`),
    "Allocatable:",
    ...Object.entries((get(node, "status.allocatable") as Record<string, string>) ?? {}).map(([k, v]) => `  ${k}: ${v}`),
    `System Info:`,
    `  Kubelet Version:          ${get(node, "status.nodeInfo.kubeletVersion")}`,
    `  Container Runtime:        ${get(node, "status.nodeInfo.containerRuntimeVersion")}`,
    `Non-terminated Pods:        (${pods.length} in total)`,
    ...pods.map((p) => `  ${p.metadata.namespace}/${p.metadata.name}`),
  ].join("\n");
}

function describeGeneric(cluster: Cluster, res: Resource): string {
  if (res.kind === "Pod") return describePod(cluster, res);
  if (res.kind === "Node") return describeNode(cluster, res);
  const head = [
    `Name:         ${res.metadata.name}`,
    ...(res.metadata.namespace ? [`Namespace:    ${res.metadata.namespace}`] : []),
    `Labels:       ${Object.entries(res.metadata.labels ?? {}).map(([k, v]) => `${k}=${v}`).join(",") || "<none>"}`,
    `Annotations:  ${Object.entries(res.metadata.annotations ?? {}).map(([k, v]) => `${k}=${v}`).join(",") || "<none>"}`,
  ];
  if (res.kind === "Service") {
    head.push(
      `Type:         ${get(res, "spec.type") ?? "ClusterIP"}`,
      `Selector:     ${Object.entries((get(res, "spec.selector") as Record<string, string>) ?? {}).map(([k, v]) => `${k}=${v}`).join(",") || "<none>"}`,
      `IP:           ${get(res, "spec.clusterIP") ?? "10.96.0.42"}`,
      `Port:         ${svcPorts(res)}`,
      `TargetPort:   ${((get(res, "spec.ports") as { targetPort?: unknown }[]) ?? []).map((p) => String(p.targetPort ?? "")).join(",")}`,
      `Endpoints:    ${res.status?.endpointCount ?? 0} pod(s) matched`,
    );
    return head.join("\n");
  }
  if (res.kind === "Deployment") {
    head.push(
      `Replicas:     ${get(res, "spec.replicas") ?? 1} desired | ${res.status?.updatedReplicas ?? 0} updated | ${res.status?.replicas ?? 0} total | ${res.status?.readyReplicas ?? 0} available`,
      `Selector:     ${Object.entries((get(res, "spec.selector.matchLabels") as Record<string, string>) ?? {}).map(([k, v]) => `${k}=${v}`).join(",")}`,
      `StrategyType: ${get(res, "spec.strategy.type") ?? "RollingUpdate"}`,
      `Pod Template:`,
      `  Labels:  ${Object.entries((get(res, "spec.template.metadata.labels") as Record<string, string>) ?? {}).map(([k, v]) => `${k}=${v}`).join(",")}`,
      `  Containers: ${containerImages(res)}`,
    );
    return head.join("\n");
  }
  if (res.kind === "Role" || res.kind === "ClusterRole") {
    head.push("PolicyRule:", ...(res.rules ?? []).map((r) => `  ${JSON.stringify(r)}`));
    return head.join("\n");
  }
  if (res.kind === "RoleBinding" || res.kind === "ClusterRoleBinding") {
    head.push(
      `Role:`,
      `  Kind:  ${res.roleRef?.kind}`,
      `  Name:  ${res.roleRef?.name}`,
      "Subjects:",
      ...(res.subjects ?? []).map((s) => `  ${s.kind}  ${s.name}  ${s.namespace ?? ""}`),
    );
    return head.join("\n");
  }
  if (res.kind === "ConfigMap" || res.kind === "Secret") {
    head.push("Data:", ...Object.entries(res.data ?? res.stringData ?? {}).map(([k, v]) => `  ${k}: ${res.kind === "Secret" ? `${String(v).length} bytes` : v}`));
    return head.join("\n");
  }
  head.push("Spec:", ...dump(res.spec ?? {}).trimEnd().split("\n").map((l) => `  ${l}`));
  return head.join("\n");
}

const HELP = `Simulated kubectl. Supported verbs:

  get, describe, create, apply -f, delete, run, expose, scale, set image,
  label, annotate, taint, cordon, uncordon, drain, rollout, patch, logs,
  exec, auth can-i, top, config, api-resources, cluster-info, version

Common flags: -n/--namespace, -A/--all-namespaces, -l/--selector, -o
(wide|yaml|json|name|jsonpath=...), --show-labels, --dry-run=client.

Manifests: end a line with <<EOF to open a heredoc, e.g.

  kubectl apply -f - <<EOF
  apiVersion: v1
  ...
  EOF

Shell built-ins: help, clear, reset. Anything outside kubectl (ssh,
systemctl, crictl, etcdctl, vi) is not simulated in this lab.`;

export function kubectl(cluster: Cluster, line: string): Result {
  const heredoc = line.includes("\n") ? line.slice(line.indexOf("\n") + 1) : "";
  const command = line.includes("\n") ? line.slice(0, line.indexOf("\n")) : line;
  const tokens = tokenize(command.replace(/<<-?'?EOF'?\s*$/, ""));
  if (!tokens.length) return { out: "", code: 0 };
  const [bin, ...rest] = tokens;

  if (bin === "help") return { out: HELP, code: 0 };
  if (bin !== "kubectl" && bin !== "k") {
    return {
      out: `${bin}: not simulated. This lab only runs kubectl against an in-browser cluster — type 'help' for the supported surface.`,
      code: 127,
    };
  }

  const parsed = parseArgs(rest);
  const verb = parsed.positional[0] ?? "";
  const positional = parsed.positional.slice(1);
  const { flags, passthrough } = parsed;
  const allNs = flags.A === true || flags["all-namespaces"] === true;
  const ns = flagString(flags.n) ?? flagString(flags.namespace) ?? "default";
  const dryRun = flagString(flags["dry-run"]) === "client" || flags["dry-run"] === true;
  const selector = flagString(flags.l) ?? flagString(flags.selector) ?? "";
  const outFmt = flagString(flags.o) ?? flagString(flags.output) ?? "";

  const notFound = (kindPlural: string, name: string) => ({
    out: `Error from server (NotFound): ${kindPlural} "${name}" not found`,
    code: 1,
  });

  const finish = (res: Resource[], created: boolean, verbText = "created"): Result => {
    if (dryRun) {
      return { out: res.map((r) => `${resolveKind(r.kind)?.plural.replace(/es$|s$/, "") ?? r.kind.toLowerCase()}/${r.metadata.name} ${verbText} (dry run)`).join("\n"), code: 0 };
    }
    if (created) cluster.reconcile();
    return { out: res.map((r) => `${resolveKind(r.kind)?.kind.toLowerCase()}/${r.metadata.name} ${verbText}`).join("\n"), code: 0 };
  };

  const renderObjects = (items: Resource[], single: boolean): Result | null => {
    if (outFmt === "yaml") {
      const docs = items.map(clean);
      return { out: single ? dump(docs[0]) : dump({ apiVersion: "v1", kind: "List", items: docs }), code: 0 };
    }
    if (outFmt === "json") {
      const docs = items.map(clean);
      return { out: JSON.stringify(single ? docs[0] : { apiVersion: "v1", kind: "List", items: docs }, null, 4), code: 0 };
    }
    if (outFmt === "name") {
      return { out: items.map((r) => `${resolveKind(r.kind)?.plural}/${r.metadata.name}`).join("\n"), code: 0 };
    }
    if (outFmt.startsWith("jsonpath=")) {
      const expr = outFmt.slice("jsonpath=".length);
      return { out: single ? jsonpath(items[0], expr) : jsonpath(items, expr.includes(".items") ? expr : `{.items[*]${expr.replace(/^\{/, "").replace(/\}$/, "")}}`), code: 0 };
    }
    return null;
  };

  const manifests = (): Partial<Resource>[] | null => {
    const file = flags.f ?? flags.filename;
    if (file === undefined) return null;
    if (!heredoc.trim()) {
      return [];
    }
    const body = heredoc.replace(/\nEOF\s*$/, "\n");
    return (loadAll(body) as Partial<Resource>[]).filter(Boolean);
  };

  switch (verb) {
    case "version":
      return { out: "Client Version: v1.35.0\nKustomize Version: v5.7.1\nServer Version: v1.35.0", code: 0 };
    case "cluster-info":
      return { out: "Kubernetes control plane is running at https://192.168.1.10:6443\nCoreDNS is running at https://192.168.1.10:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy", code: 0 };
    case "api-resources":
      return {
        out: table(
          ["NAME", "SHORTNAMES", "APIVERSION", "NAMESPACED", "KIND"],
          Object.entries(KINDS).map(([key, k]) => [
            k.plural,
            Object.entries(ALIASES).filter(([, v]) => v === key && !KINDS[key].plural.startsWith(key)).map(([a]) => a).join(","),
            k.apiVersion,
            String(k.namespaced),
            k.kind,
          ]),
        ),
        code: 0,
      };
    case "config": {
      const sub = positional[0];
      if (sub === "current-context") return { out: cluster.context, code: 0 };
      if (sub === "get-contexts") return { out: table(["CURRENT", "NAME", "CLUSTER", "AUTHINFO"], [["*", cluster.context, "kubernetes", "kubernetes-admin"]]), code: 0 };
      if (sub === "use-context") {
        if (positional[1] !== cluster.context) return { out: `error: no context exists with the name: "${positional[1]}"`, code: 1 };
        return { out: `Switched to context "${positional[1]}".`, code: 0 };
      }
      if (sub === "set-context" || sub === "view") return { out: `current-context: ${cluster.context}`, code: 0 };
      return { out: `error: unknown or unsupported command "config ${sub ?? ""}" in this lab`, code: 1 };
    }
    case "explain":
      return { out: "error: explain is not simulated in this lab — use the docs link on the task instead.", code: 1 };
    case "edit":
      return {
        out: "error: interactive editors are not simulated. Use `kubectl get <type> <name> -o yaml`, then re-apply with a heredoc:\n  kubectl apply -f - <<EOF\n  ...\n  EOF\nor use `kubectl patch`/`kubectl set`.",
        code: 1,
      };
    case "top": {
      const what = resolveKind(positional[0] ?? "node");
      if (what?.kind === "Node") {
        return {
          out: table(
            ["NAME", "CPU(cores)", "CPU%", "MEMORY(bytes)", "MEMORY%"],
            cluster.list("Node").map((n) => [n.metadata.name, "142m", "7%", "1204Mi", "31%"]),
          ),
          code: 0,
        };
      }
      const pods = allNs ? cluster.list("Pod") : cluster.list("Pod", ns);
      return { out: table(["NAME", "CPU(cores)", "MEMORY(bytes)"], pods.map((p) => [p.metadata.name, "3m", "24Mi"])), code: 0 };
    }
    case "get": {
      if (!positional.length) return { out: "error: You must specify the type of resource to get.", code: 1 };
      const typeWords = positional[0].split(",");
      const name = positional[1];
      const blocks: string[] = [];
      const collected: Resource[] = [];
      for (const word of typeWords) {
        const slash = word.split("/");
        const info = resolveKind(slash[0]);
        if (!info) return { out: `error: the server doesn't have a resource type "${slash[0]}"`, code: 1 };
        const targetName = slash[1] ?? name;
        let items = cluster.resources.filter((r) => r.kind === info.kind);
        if (info.namespaced && !allNs) items = items.filter((r) => r.metadata.namespace === ns);
        if (targetName) items = items.filter((r) => r.metadata.name === targetName);
        if (selector) items = items.filter((r) => selectorMatches(r.metadata.labels, selector));
        if (targetName && !items.length) return notFound(info.plural, targetName);
        collected.push(...items);
        if (!items.length) {
          blocks.push(allNs ? `No resources found` : `No resources found in ${ns} namespace.`);
          continue;
        }
        const key = Object.entries(KINDS).find(([, v]) => v.kind === info.kind)?.[0] ?? "";
        blocks.push(renderList(cluster, key, items, flags, allNs && info.namespaced));
      }
      const rendered = renderObjects(collected, !!(name || typeWords[0].includes("/")));
      if (rendered) return rendered;
      return { out: blocks.join("\n\n"), code: 0 };
    }
    case "describe": {
      const slash = positional[0]?.split("/") ?? [];
      const info = resolveKind(slash[0] ?? "");
      if (!info) return { out: `error: the server doesn't have a resource type "${positional[0] ?? ""}"`, code: 1 };
      const name = slash[1] ?? positional[1];
      let items = cluster.resources.filter((r) => r.kind === info.kind);
      if (info.namespaced && !allNs) items = items.filter((r) => r.metadata.namespace === ns);
      if (name) items = items.filter((r) => r.metadata.name === name);
      if (selector) items = items.filter((r) => selectorMatches(r.metadata.labels, selector));
      if (!items.length) return name ? notFound(info.plural, name) : { out: `No resources found in ${ns} namespace.`, code: 0 };
      return { out: items.map((r) => describeGeneric(cluster, r)).join("\n\n\n"), code: 0 };
    }
    case "logs": {
      const target = positional[0]?.replace(/^pods?\//, "");
      if (!target) return { out: "error: expected 'logs (POD | TYPE/NAME) [CONTAINER_NAME]'.", code: 1 };
      const pod = cluster.find("Pod", target, ns);
      if (!pod) return notFound("pods", target);
      const key = `${ns}/${target}`;
      const body = cluster.logs[key] ?? cluster.logs[target];
      if (body === undefined) {
        return { out: `No log output recorded for ${key} in this lab fixture.`, code: 0 };
      }
      return { out: body, code: 0 };
    }
    case "exec": {
      const target = positional[0]?.replace(/^pods?\//, "");
      const pod = cluster.find("Pod", target ?? "", ns);
      if (!pod) return notFound("pods", target ?? "");
      const cmd = passthrough.join(" ");
      const body = cluster.execOutputs[`${ns}/${target}: ${cmd}`] ?? cluster.execOutputs[`${target}: ${cmd}`] ?? cluster.execOutputs[cmd];
      if (body === undefined) {
        return { out: `command "${cmd}" is not simulated inside ${target}. This lab records output only for the commands its fixture defines.`, code: 1 };
      }
      return { out: body, code: 0 };
    }
    case "auth": {
      if (positional[0] !== "can-i") return { out: `error: unsupported subcommand "auth ${positional[0] ?? ""}"`, code: 1 };
      const verbWanted = positional[1];
      const resourceWanted = resolveKind(positional[2] ?? "")?.plural ?? positional[2];
      const as = (flagString(flags.as) as string) ?? "kubernetes-admin";
      if (as === "kubernetes-admin") return { out: "yes", code: 0 };
      const sa = as.match(/^system:serviceaccount:([^:]+):(.+)$/);
      const subjectMatch = (s: { kind: string; name: string; namespace?: string }) =>
        sa ? s.kind === "ServiceAccount" && s.name === sa[2] && s.namespace === sa[1] : s.kind === "User" && s.name === as;
      const rulesFor = (bindings: Resource[]) =>
        bindings
          .filter((b) => (b.subjects ?? []).some(subjectMatch))
          .flatMap((b) => {
            const role =
              b.roleRef?.kind === "ClusterRole"
                ? cluster.find("ClusterRole", b.roleRef.name)
                : cluster.find("Role", b.roleRef?.name ?? "", b.metadata.namespace);
            return (role?.rules ?? []) as { verbs: string[]; resources: string[] }[];
          });
      const applicable = [
        ...rulesFor(cluster.list("ClusterRoleBinding")),
        ...rulesFor(cluster.list("RoleBinding", ns)),
      ];
      const allowed = applicable.some(
        (r) =>
          (r.verbs ?? []).some((v) => v === "*" || v === verbWanted) &&
          (r.resources ?? []).some((res) => res === "*" || res === resourceWanted),
      );
      return allowed ? { out: "yes", code: 0 } : { out: `no - no RBAC policy matched`, code: 1 };
    }
    case "create": {
      const docs = manifests();
      if (docs) {
        if (!docs.length) return { out: "error: no manifest provided. Pipe one in with `-f - <<EOF ... EOF`.", code: 1 };
        const made = docs.map((d) => (dryRun ? ({ ...d, kind: d.kind ?? "Pod" } as Resource) : cluster.push({ ...d, metadata: { name: "unnamed", ...(d.metadata ?? {}), namespace: d.metadata?.namespace ?? (flags.n ? ns : undefined) } })));
        return finish(made, true);
      }
      const sub = positional[0];
      const name = positional[1];
      if (!sub) return { out: "error: must specify one of -f or a resource type", code: 1 };
      if (!name) return { out: `error: name is required for create ${sub}`, code: 1 };
      const info = resolveKind(sub);
      const meta = { name, namespace: info?.namespaced ? ns : undefined, creationTimestamp: new Date().toISOString() };
      const make = (res: Partial<Resource>) => finish([dryRun ? (res as Resource) : cluster.push(res)], true);

      switch (resolveKind(sub)?.kind) {
        case "Namespace":
          return make({ apiVersion: "v1", kind: "Namespace", metadata: { name }, status: { phase: "Active" } });
        case "ServiceAccount":
          return make({ apiVersion: "v1", kind: "ServiceAccount", metadata: meta });
        case "ConfigMap": {
          const data = parseKeyValues([...(asArray(flags["from-literal"]) ?? [])]);
          return make({ apiVersion: "v1", kind: "ConfigMap", metadata: meta, data });
        }
        case "Secret": {
          if (positional[1] === "generic" || positional[0] === "secret") {
            const secretName = positional[1] === "generic" ? positional[2] : positional[1];
            if (!secretName) return { out: "error: name is required for create secret generic", code: 1 };
            const data = parseKeyValues(asArray(flags["from-literal"]) ?? []);
            return make({
              apiVersion: "v1",
              kind: "Secret",
              type: "Opaque",
              metadata: { ...meta, name: secretName },
              data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, btoa(v)])),
              stringData: data,
            });
          }
          return { out: "error: unsupported secret type in this lab (use `create secret generic`)", code: 1 };
        }
        case "Deployment": {
          const image = flagString(flags.image) as string;
          if (!image) return { out: "error: --image is required", code: 1 };
          const replicas = Number(flagString(flags.replicas) ?? 1);
          return make({
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: { ...meta, labels: { app: name } },
            spec: {
              replicas,
              selector: { matchLabels: { app: name } },
              template: { metadata: { labels: { app: name } }, spec: { containers: [{ name, image }] } },
            },
          });
        }
        case "Job":
          return make({
            apiVersion: "batch/v1",
            kind: "Job",
            metadata: meta,
            spec: {
              completions: 1,
              template: { metadata: {}, spec: { restartPolicy: "Never", containers: [{ name, image: flagString(flags.image) as string, ...(passthrough.length ? { command: passthrough } : {}) }] } },
            },
          });
        case "CronJob":
          return make({
            apiVersion: "batch/v1",
            kind: "CronJob",
            metadata: meta,
            spec: {
              schedule: flagString(flags.schedule) as string,
              jobTemplate: { spec: { template: { spec: { restartPolicy: "OnFailure", containers: [{ name, image: flagString(flags.image) as string, ...(passthrough.length ? { command: passthrough } : {}) }] } } } },
            },
          });
        case "Role":
        case "ClusterRole": {
          const verbs = (asArray(flags.verb) ?? []).flatMap((v) => v.split(","));
          const resources = (asArray(flags.resource) ?? []).flatMap((v) => v.split(","));
          if (!verbs.length || !resources.length) return { out: "error: --verb and --resource are required", code: 1 };
          const groups = [...new Set(resources.map((r) => (r.includes(".") ? r.split(".").slice(1).join(".") : "")))];
          return make({
            apiVersion: "rbac.authorization.k8s.io/v1",
            kind: resolveKind(sub)!.kind,
            metadata: resolveKind(sub)!.namespaced ? meta : { name },
            rules: [{ apiGroups: groups, resources: resources.map((r) => (r.includes(".") ? r.split(".")[0] : r)), verbs }],
          });
        }
        case "RoleBinding":
        case "ClusterRoleBinding": {
          const kind = resolveKind(sub)!.kind;
          const roleFlag = flagString(flags.role);
          const clusterRoleFlag = flagString(flags["clusterrole"]);
          if (!roleFlag && !clusterRoleFlag) return { out: "error: exactly one of --role or --clusterrole must be specified", code: 1 };
          if (kind === "ClusterRoleBinding" && roleFlag) return { out: "error: a ClusterRoleBinding can only reference a ClusterRole", code: 1 };
          const subjects = [
            ...(asArray(flags.serviceaccount) ?? []).map((sa) => {
              const [sans, san] = sa.split(":");
              return { kind: "ServiceAccount", name: san ?? sans, namespace: san ? sans : ns };
            }),
            ...(asArray(flags.user) ?? []).map((u) => ({ kind: "User", name: u })),
            ...(asArray(flags.group) ?? []).map((g) => ({ kind: "Group", name: g })),
          ];
          return make({
            apiVersion: "rbac.authorization.k8s.io/v1",
            kind,
            metadata: kind === "RoleBinding" ? meta : { name },
            roleRef: { kind: roleFlag ? "Role" : "ClusterRole", name: (roleFlag ?? clusterRoleFlag)! },
            subjects,
          });
        }
        case "Ingress": {
          const rules = (asArray(flags.rule) ?? []).map((rule) => {
            const [hostPath, backend] = rule.split("=");
            const [host, ...pathParts] = hostPath.split("/");
            const [svcName, svcPort] = (backend ?? "").split(":");
            return {
              host: host || undefined,
              http: {
                paths: [
                  {
                    path: `/${pathParts.join("/")}`.replace(/\*$/, ""),
                    pathType: rule.includes("*") ? "Prefix" : "Exact",
                    backend: { service: { name: svcName, port: { number: Number(svcPort ?? 80) } } },
                  },
                ],
              },
            };
          });
          if (!rules.length) return { out: "error: at least one --rule is required", code: 1 };
          return make({
            apiVersion: "networking.k8s.io/v1",
            kind: "Ingress",
            metadata: meta,
            spec: { ingressClassName: flagString(flags.class), rules },
          });
        }
        case "Service": {
          const type = positional[1];
          const svcName = positional[2];
          if (!svcName) return { out: "error: name is required for create service", code: 1 };
          const [port, targetPort] = String(flagString(flags.tcp) ?? "80:80").split(":");
          return make({
            apiVersion: "v1",
            kind: "Service",
            metadata: { ...meta, name: svcName },
            spec: {
              type: { clusterip: "ClusterIP", nodeport: "NodePort", loadbalancer: "LoadBalancer", externalname: "ExternalName" }[type ?? "clusterip"] ?? "ClusterIP",
              clusterIP: "10.96.0.42",
              selector: { app: svcName },
              ports: [{ port: Number(port), targetPort: Number(targetPort ?? port), protocol: "TCP" }],
            },
          });
        }
        default:
          return { out: `error: create ${sub} is not simulated in this lab. Use a manifest with \`kubectl apply -f - <<EOF\`.`, code: 1 };
      }
    }
    case "apply": {
      const docs = manifests();
      if (!docs) return { out: "error: must specify -f", code: 1 };
      if (!docs.length) return { out: "error: no manifest provided. Pipe one in with `-f - <<EOF ... EOF`.", code: 1 };
      const results: string[] = [];
      for (const doc of docs) {
        const info = resolveKind(doc.kind ?? "");
        if (!info) {
          results.push(`error: unknown kind "${doc.kind ?? ""}"`);
          continue;
        }
        const docNs = info.namespaced ? (doc.metadata?.namespace ?? (flags.n ? ns : "default")) : undefined;
        const existing = cluster.find(info.kind, doc.metadata?.name ?? "", docNs);
        if (dryRun) {
          results.push(`${info.kind.toLowerCase()}/${doc.metadata?.name} ${existing ? "configured" : "created"} (dry run)`);
          continue;
        }
        if (existing) {
          const idx = cluster.resources.indexOf(existing);
          cluster.resources[idx] = {
            ...existing,
            ...doc,
            metadata: { ...existing.metadata, ...(doc.metadata ?? {}), namespace: docNs },
          } as Resource;
          if (["Deployment", "StatefulSet", "DaemonSet"].includes(info.kind)) {
            for (const pod of cluster.ownedPods(cluster.resources[idx])) cluster.remove(pod);
          }
          results.push(`${info.kind.toLowerCase()}/${doc.metadata?.name} configured`);
        } else {
          cluster.push({ ...doc, metadata: { name: "unnamed", ...(doc.metadata ?? {}), namespace: docNs } });
          results.push(`${info.kind.toLowerCase()}/${doc.metadata?.name} created`);
        }
      }
      cluster.reconcile();
      return { out: results.join("\n"), code: results.some((r) => r.startsWith("error")) ? 1 : 0 };
    }
    case "delete": {
      const docs = manifests();
      if (docs?.length) {
        const removed: string[] = [];
        for (const doc of docs) {
          const info = resolveKind(doc.kind ?? "");
          const existing = info && cluster.find(info.kind, doc.metadata?.name ?? "", doc.metadata?.namespace ?? ns);
          if (existing) {
            cluster.remove(existing);
            removed.push(`${info!.kind.toLowerCase()}/${existing.metadata.name} deleted`);
          }
        }
        cluster.reconcile();
        return { out: removed.join("\n"), code: 0 };
      }
      const slash = positional[0]?.split("/") ?? [];
      const info = resolveKind(slash[0] ?? "");
      if (!info) return { out: `error: the server doesn't have a resource type "${positional[0] ?? ""}"`, code: 1 };
      const names = slash[1] ? [slash[1]] : positional.slice(1);
      let targets: Resource[] = [];
      if (names.length) {
        for (const name of names) {
          const found = cluster.find(info.kind, name, ns);
          if (!found) return notFound(info.plural, name);
          targets.push(found);
        }
      } else if (selector || flags.all === true) {
        targets = cluster.resources.filter(
          (r) => r.kind === info.kind && (!info.namespaced || r.metadata.namespace === ns) && selectorMatches(r.metadata.labels, selector),
        );
      } else {
        return { out: "error: resource(s) were provided, but no name was specified", code: 1 };
      }
      for (const t of targets) cluster.remove(t);
      cluster.reconcile();
      return { out: targets.map((t) => `${info.kind.toLowerCase()} "${t.metadata.name}" deleted`).join("\n") || "No resources found", code: 0 };
    }
    case "run": {
      const name = positional[0];
      const image = flagString(flags.image) as string;
      if (!name) return { out: "error: NAME is required for run", code: 1 };
      if (!image) return { out: "error: --image is required", code: 1 };
      const labels = { run: name, ...parseKeyValues((asArray(flags.l) ?? asArray(flags.labels) ?? []).flatMap((v) => v.split(","))) };
      const container: Record<string, unknown> = { name, image };
      if (passthrough.length) container.command = passthrough;
      if (flags.port) container.ports = [{ containerPort: Number(flagString(flags.port)) }];
      const pod: Partial<Resource> = {
        apiVersion: "v1",
        kind: "Pod",
        metadata: { name, namespace: ns, labels, creationTimestamp: new Date().toISOString() },
        spec: { containers: [container], restartPolicy: flagString(flags.restart) === "Never" ? "Never" : "Always" },
      };
      if (dryRun) {
        if (outFmt === "yaml") return { out: dump({ ...pod, status: {} }), code: 0 };
        if (outFmt === "json") return { out: JSON.stringify(pod, null, 4), code: 0 };
        return { out: `pod/${name} created (dry run)`, code: 0 };
      }
      cluster.push(pod);
      cluster.reconcile();
      return { out: `pod/${name} created`, code: 0 };
    }
    case "expose": {
      const slash = positional[0]?.split("/") ?? [];
      const info = resolveKind(slash[0] ?? "");
      const targetName = slash[1] ?? positional[1];
      if (!info || !targetName) return { out: "error: expected 'expose TYPE NAME --port=PORT'", code: 1 };
      const target = cluster.find(info.kind, targetName, ns);
      if (!target) return notFound(info.plural, targetName);
      if (!flags.port) return { out: "error: --port is required", code: 1 };
      const svcName = flagString(flags.name) ?? targetName;
      const podLabels =
        info.kind === "Pod"
          ? (target.metadata.labels ?? {})
          : ((get(target, "spec.selector.matchLabels") as Record<string, string>) ?? (get(target, "spec.template.metadata.labels") as Record<string, string>) ?? {});
      const svc: Partial<Resource> = {
        apiVersion: "v1",
        kind: "Service",
        metadata: { name: svcName, namespace: ns, labels: target.metadata.labels, creationTimestamp: new Date().toISOString() },
        spec: {
          type: flagString(flags.type) ?? "ClusterIP",
          clusterIP: "10.96.0.42",
          selector: podLabels,
          ports: [
            {
              port: Number(flagString(flags.port)),
              targetPort: Number(flagString(flags["target-port"]) ?? flagString(flags.port)),
              protocol: flagString(flags.protocol) ?? "TCP",
              ...(flagString(flags.type) === "NodePort" ? { nodePort: 30000 + Math.floor(Math.random() * 2000) } : {}),
            },
          ],
        },
      };
      if (dryRun) return { out: outFmt === "yaml" ? dump(svc) : `service/${svcName} exposed (dry run)`, code: 0 };
      cluster.push(svc);
      cluster.reconcile();
      return { out: `service/${svcName} exposed`, code: 0 };
    }
    case "scale": {
      const slash = positional[0]?.split("/") ?? [];
      const info = resolveKind(slash[0] ?? "");
      const name = slash[1] ?? positional[1];
      if (flags.replicas === undefined) return { out: "error: --replicas is required", code: 1 };
      if (!info || !name) return { out: "error: expected 'scale TYPE NAME --replicas=N'", code: 1 };
      const target = cluster.find(info.kind, name, ns);
      if (!target) return notFound(info.plural, name);
      target.spec = { ...(target.spec ?? {}), replicas: Number(flagString(flags.replicas)) };
      cluster.reconcile();
      return { out: `${info.kind.toLowerCase()}.${info.apiVersion.split("/")[0]}/${name} scaled`, code: 0 };
    }
    case "set": {
      const what = positional[0];
      if (what !== "image") return { out: `error: 'set ${what ?? ""}' is not simulated (only 'set image')`, code: 1 };
      const slash = positional[1]?.split("/") ?? [];
      const info = resolveKind(slash[0] ?? "");
      const name = slash[1] ?? positional[1];
      const target = info && cluster.find(info.kind, name ?? "", ns);
      if (!target) return notFound(info?.plural ?? "resources", name ?? "");
      const updates = parseKeyValues(positional.slice(2));
      const containers = (get(target, "spec.template.spec.containers") ?? get(target, "spec.containers")) as { name: string; image: string }[] | undefined;
      if (!containers) return { out: "error: no containers found", code: 1 };
      for (const [cName, image] of Object.entries(updates)) {
        const c = cName === "*" ? containers[0] : containers.find((x) => x.name === cName);
        if (!c) return { out: `error: unable to find container named "${cName}"`, code: 1 };
        c.image = image;
      }
      for (const pod of cluster.ownedPods(target)) cluster.remove(pod);
      cluster.reconcile();
      return { out: `${info!.kind.toLowerCase()}.apps/${target.metadata.name} image updated`, code: 0 };
    }
    case "label":
    case "annotate": {
      const slash = positional[0]?.split("/") ?? [];
      const info = resolveKind(slash[0] ?? "");
      const name = slash[1] ?? positional[1];
      if (!info || !name) return { out: `error: expected '${verb} TYPE NAME KEY=VALUE'`, code: 1 };
      const target = cluster.find(info.kind, name, ns);
      if (!target) return notFound(info.plural, name);
      const field = verb === "label" ? "labels" : "annotations";
      const current = { ...(target.metadata[field] ?? {}) } as Record<string, string>;
      for (const token of positional.slice(slash[1] ? 1 : 2)) {
        if (token.endsWith("-")) delete current[token.slice(0, -1)];
        else {
          const [k, ...v] = token.split("=");
          if (current[k] !== undefined && flags.overwrite !== true) {
            return { out: `error: '${k}' already has a value (${current[k]}), and --overwrite is false`, code: 1 };
          }
          current[k] = v.join("=");
        }
      }
      target.metadata[field] = current;
      cluster.reconcile();
      return { out: `${info.kind.toLowerCase()}/${name} ${verb === "label" ? "labeled" : "annotated"}`, code: 0 };
    }
    case "taint": {
      if (resolveKind(positional[0] ?? "")?.kind !== "Node") return { out: "error: expected 'taint nodes NAME KEY=VALUE:EFFECT'", code: 1 };
      const node = cluster.find("Node", positional[1] ?? "");
      if (!node) return notFound("nodes", positional[1] ?? "");
      const taints = [...((node.spec?.taints as { key: string; value?: string; effect: string }[] | undefined) ?? [])];
      for (const spec of positional.slice(2)) {
        if (spec.endsWith("-")) {
          const body = spec.slice(0, -1);
          const key = body.split(/[=:]/)[0];
          const effect = body.includes(":") ? body.split(":")[1] : undefined;
          const before = taints.length;
          const kept = taints.filter((t) => !(t.key === key && (!effect || t.effect === effect)));
          taints.length = 0;
          taints.push(...kept);
          if (before === taints.length) return { out: `error: taint "${key}" not found`, code: 1 };
          continue;
        }
        const m = spec.match(/^([^=:]+)(?:=([^:]*))?:(.+)$/);
        if (!m) return { out: `error: invalid taint spec: ${spec}`, code: 1 };
        if (taints.some((t) => t.key === m[1] && t.effect === m[3]) && flags.overwrite !== true) {
          return { out: `error: node ${node.metadata.name} already has ${m[1]} taint(s) with same effect`, code: 1 };
        }
        taints.push({ key: m[1], value: m[2], effect: m[3] });
      }
      node.spec = { ...(node.spec ?? {}), taints };
      cluster.reconcile();
      return { out: `node/${node.metadata.name} ${positional.slice(2).some((s) => s.endsWith("-")) ? "untainted" : "tainted"}`, code: 0 };
    }
    case "cordon":
    case "uncordon": {
      const name = positional[0]?.replace(/^node(s)?\//, "");
      const node = cluster.find("Node", name ?? "");
      if (!node) return notFound("nodes", name ?? "");
      node.spec = { ...(node.spec ?? {}), unschedulable: verb === "cordon" ? true : undefined };
      cluster.reconcile();
      return { out: `node/${node.metadata.name} ${verb === "cordon" ? "cordoned" : "uncordoned"}`, code: 0 };
    }
    case "drain": {
      const name = positional[0]?.replace(/^node(s)?\//, "");
      const node = cluster.find("Node", name ?? "");
      if (!node) return notFound("nodes", name ?? "");
      const pods = cluster.resources.filter((r) => r.kind === "Pod" && r.status?.nodeName === node.metadata.name);
      const standalone = pods.filter((p) => !(p.metadata.ownerReferences ?? []).length);
      const daemonSetPods = pods.filter((p) => (p.metadata.ownerReferences ?? []).some((o) => o.kind === "DaemonSet"));
      if (standalone.length && flags.force !== true) {
        return {
          out: `error: cannot delete Pods declare no controller (use --force to override): ${standalone.map((p) => `${p.metadata.namespace}/${p.metadata.name}`).join(", ")}`,
          code: 1,
        };
      }
      if (daemonSetPods.length && flags["ignore-daemonsets"] !== true) {
        return {
          out: `error: cannot delete DaemonSet-managed Pods (use --ignore-daemonsets to ignore): ${daemonSetPods.map((p) => `${p.metadata.namespace}/${p.metadata.name}`).join(", ")}`,
          code: 1,
        };
      }
      node.spec = { ...(node.spec ?? {}), unschedulable: true };
      for (const pod of pods) {
        if (daemonSetPods.includes(pod)) continue;
        cluster.remove(pod);
      }
      cluster.reconcile();
      return {
        out: [`node/${node.metadata.name} cordoned`, ...pods.filter((p) => !daemonSetPods.includes(p)).map((p) => `evicting pod ${p.metadata.namespace}/${p.metadata.name}`), `node/${node.metadata.name} drained`].join("\n"),
        code: 0,
      };
    }
    case "rollout": {
      const sub = positional[0];
      const slash = positional[1]?.split("/") ?? [];
      const info = resolveKind(slash[0] ?? "");
      const name = slash[1] ?? positional[2];
      const target = info && cluster.find(info.kind, name ?? "", ns);
      if (!target) return notFound(info?.plural ?? "deployments", name ?? "");
      if (sub === "status") return { out: `deployment "${target.metadata.name}" successfully rolled out`, code: 0 };
      if (sub === "history") {
        return { out: `deployment.apps/${target.metadata.name} \nREVISION   CHANGE-CAUSE\n1          <none>\n2          <none>`, code: 0 };
      }
      if (sub === "restart") {
        for (const pod of cluster.ownedPods(target)) cluster.remove(pod);
        cluster.reconcile();
        return { out: `deployment.apps/${target.metadata.name} restarted`, code: 0 };
      }
      if (sub === "undo") {
        return { out: `deployment.apps/${target.metadata.name} rolled back — note: this lab keeps no revision history, so the spec is unchanged.`, code: 0 };
      }
      if (sub === "pause" || sub === "resume") {
        target.spec = { ...(target.spec ?? {}), paused: sub === "pause" ? true : undefined };
        return { out: `deployment.apps/${target.metadata.name} ${sub}d`, code: 0 };
      }
      return { out: `error: unsupported rollout subcommand "${sub ?? ""}"`, code: 1 };
    }
    case "patch": {
      const slash = positional[0]?.split("/") ?? [];
      const info = resolveKind(slash[0] ?? "");
      const name = slash[1] ?? positional[1];
      const target = info && cluster.find(info.kind, name ?? "", ns);
      if (!target) return notFound(info?.plural ?? "resources", name ?? "");
      const body = flagString(flags.p) ?? flagString(flags.patch);
      if (!body) return { out: "error: -p is required", code: 1 };
      let patch: Record<string, unknown>;
      try {
        patch = (body.trim().startsWith("{") ? JSON.parse(body) : load(body)) as Record<string, unknown>;
      } catch (e) {
        return { out: `error: unable to parse patch: ${(e as Error).message}`, code: 1 };
      }
      mergePatch(target as unknown as Record<string, unknown>, patch);
      if (["Deployment", "StatefulSet", "DaemonSet"].includes(target.kind)) {
        for (const pod of cluster.ownedPods(target)) cluster.remove(pod);
      }
      cluster.reconcile();
      return { out: `${info!.kind.toLowerCase()}/${target.metadata.name} patched`, code: 0 };
    }
    default:
      return { out: `error: unknown or unsupported command "kubectl ${verb}" in this lab — type 'help' for the supported surface.`, code: 1 };
  }
}

function asArray(value: FlagValue | undefined): string[] | null {
  if (Array.isArray(value)) return value;
  if (value === undefined) return null;
  if (value === true) return [];
  return [value];
}

export { get as getPath, table, selectorMatches, matchLabels };
