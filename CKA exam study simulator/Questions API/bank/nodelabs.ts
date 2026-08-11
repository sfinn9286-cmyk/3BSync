import type { Question } from "./types";

const TS_DOMAIN = "Troubleshooting" as const;
const CA = "Cluster Architecture, Installation & Configuration" as const;

const BROKEN_APISERVER = `apiVersion: v1
kind: Pod
metadata:
  name: kube-apiserver
  namespace: kube-system
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
    - --etcd-servers=https://127.0.0.1:2381
    - --secure-port=6443
    - --service-cluster-ip-range=10.96.0.0/12
`;

export const nodeLabs: Question[] = [
  {
    id: "lab-101",
    domain: TS_DOMAIN,
    topic: "Node troubleshooting",
    difficulty: "medium",
    type: "lab",
    prompt:
      "`node01` is NotReady. Log in to it, find out why, and bring it back — the kubelet must end up both running and enabled so it survives a reboot. Do not touch the workloads.",
    answer:
      "kubectl get nodes\nkubectl describe node node01        # Ready=False, kubelet stopped posting status\n\nssh node01\nsystemctl status kubelet            # inactive (dead), disabled\njournalctl -u kubelet -n 20\nsystemctl enable --now kubelet\nsystemctl is-active kubelet\nexit\n\nkubectl get nodes",
    explanation:
      "A node goes NotReady when the kubelet stops posting status, so the diagnosis always ends up on the node itself: `systemctl status kubelet` and its journal. `enable --now` both starts the unit now and marks it to start at boot — starting it alone leaves the node fragile across a reboot, which is exactly what the exam checks.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-cluster/",
    lab: {
      brief: "Two nodes; `node01` is NotReady and runs no workload right now.",
      init: {
        nodes: [
          { name: "controlplane", roles: "control-plane" },
          { name: "node01", ready: false },
        ],
        hosts: {
          node01: {
            services: {
              kubelet: {
                active: false,
                enabled: false,
                log: "kubelet: Stopped kubelet.service - kubelet: The Kubernetes Node Agent.\nsystemd: kubelet.service: Deactivated successfully.",
              },
            },
          },
        },
      },
      checks: [
        { description: "kubelet is running on node01", kind: "HostService", host: "node01", name: "kubelet", path: "active", equals: true },
        { description: "kubelet is enabled on node01 (survives reboot)", kind: "HostService", host: "node01", name: "kubelet", path: "enabled", equals: true },
        { description: "node01 reports Ready", kind: "Node", name: "node01", path: "status.conditions[0].status", equals: "True" },
      ],
    },
  },
  {
    id: "lab-102",
    domain: TS_DOMAIN,
    topic: "Cluster components",
    difficulty: "hard",
    type: "lab",
    prompt:
      "The API server is unreachable: `kubectl` reports a connection refused. Someone edited the static pod manifest and pointed it at the wrong etcd port. Fix the manifest on `controlplane` so kube-apiserver talks to etcd on port 2379 again.",
    answer:
      "ssh controlplane\ncrictl ps -a --name kube-apiserver     # exited\ncrictl logs kube-apiserver             # dial tcp 127.0.0.1:2381: connect: connection refused\ncat /etc/kubernetes/manifests/kube-apiserver.yaml | grep etcd-servers\n\ncat > /etc/kubernetes/manifests/kube-apiserver.yaml <<EOF\napiVersion: v1\nkind: Pod\nmetadata:\n  name: kube-apiserver\n  namespace: kube-system\nspec:\n  hostNetwork: true\n  containers:\n  - name: kube-apiserver\n    image: registry.k8s.io/kube-apiserver:v1.35.0\n    command:\n    - kube-apiserver\n    - --advertise-address=192.168.1.10\n    - --authorization-mode=Node,RBAC\n    - --client-ca-file=/etc/kubernetes/pki/ca.crt\n    - --etcd-servers=https://127.0.0.1:2379\n    - --secure-port=6443\n    - --service-cluster-ip-range=10.96.0.0/12\nEOF\n\nexit\nkubectl -n kube-system get pods | grep apiserver",
    explanation:
      "Control-plane components run as static pods: the kubelet watches /etc/kubernetes/manifests and re-creates the pod within seconds of the file changing — there is no `kubectl apply` step, and with the API server down kubectl could not help anyway. `crictl` (the CRI client) is how you read a crash-looping control-plane container's logs.",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/",
    lab: {
      brief: "`controlplane` has a kube-apiserver static pod manifest pointing at etcd port 2381.",
      init: {
        hosts: {
          controlplane: {
            files: { "/etc/kubernetes/manifests/kube-apiserver.yaml": BROKEN_APISERVER },
            containers: [
              {
                name: "kube-apiserver",
                pod: "kube-apiserver-controlplane",
                state: "Exited",
                log: 'W  dial tcp 127.0.0.1:2381: connect: connection refused\nF  failed to storage-backend: context deadline exceeded ("etcd-servers=https://127.0.0.1:2381")',
              },
              { name: "etcd", pod: "etcd-controlplane", state: "Running", log: "ready to serve client requests on 127.0.0.1:2379" },
            ],
          },
        },
      },
      checks: [
        { description: "Manifest points kube-apiserver at etcd on 2379", kind: "HostFile", host: "controlplane", name: "/etc/kubernetes/manifests/kube-apiserver.yaml", contains: "--etcd-servers=https://127.0.0.1:2379" },
        { description: "The wrong 2381 endpoint is gone", kind: "HostFile", host: "controlplane", name: "/etc/kubernetes/manifests/kube-apiserver.yaml", contains: "2381", absent: true },
        { description: "kube-apiserver static pod is running again", kind: "Pod", name: "kube-apiserver-controlplane", namespace: "kube-system", path: "status.phase", equals: "Running" },
      ],
    },
  },
  {
    id: "lab-103",
    domain: CA,
    topic: "etcd backup",
    difficulty: "hard",
    type: "lab",
    prompt:
      "Take an etcd snapshot on `controlplane` and save it to `/opt/etcd-backup.db`. etcd is TLS-only on https://127.0.0.1:2379 with the standard kubeadm certificate paths under /etc/kubernetes/pki/etcd. Then confirm the snapshot is readable.",
    answer:
      "ssh controlplane\nETCDCTL_API=3 etcdctl snapshot save /opt/etcd-backup.db \\\n  --endpoints=https://127.0.0.1:2379 \\\n  --cacert=/etc/kubernetes/pki/etcd/ca.crt \\\n  --cert=/etc/kubernetes/pki/etcd/server.crt \\\n  --key=/etc/kubernetes/pki/etcd/server.key\n\nETCDCTL_API=3 etcdctl snapshot status /opt/etcd-backup.db",
    explanation:
      "`snapshot save` talks to etcd's client API, so it needs the three TLS flags — without them it hangs and fails with a context deadline, the single most common lost mark on this task. The paths come from the etcd static pod manifest (`--trusted-ca-file`, `--cert-file`, `--key-file`), which is where to look if they differ. ETCDCTL_API=3 is required on older etcdctl builds and harmless on new ones.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#backing-up-an-etcd-cluster",
    lab: {
      brief: "Healthy kubeadm cluster; etcd runs as a static pod on `controlplane`.",
      init: {
        hosts: {
          controlplane: {
            containers: [{ name: "etcd", pod: "etcd-controlplane", state: "Running", log: "serving client traffic on 127.0.0.1:2379" }],
          },
        },
      },
      checks: [
        { description: "Snapshot file /opt/etcd-backup.db exists on controlplane", kind: "HostFile", host: "controlplane", name: "/opt/etcd-backup.db" },
        { description: "It contains a real etcd snapshot (revision recorded)", kind: "HostFile", host: "controlplane", name: "/opt/etcd-backup.db", contains: "revision" },
      ],
    },
  },
  {
    id: "lab-104",
    domain: CA,
    topic: "Static pods",
    difficulty: "medium",
    type: "lab",
    prompt:
      "Create a static pod named `node-agent` on `node01` (image `busybox:1.36`, command `sleep 3600`) by writing its manifest to the kubelet's static pod directory. It should appear in the `kube-system` namespace.",
    answer:
      "ssh node01\ncat /var/lib/kubelet/config.yaml | grep staticPodPath\n\ncat > /etc/kubernetes/manifests/node-agent.yaml <<EOF\napiVersion: v1\nkind: Pod\nmetadata:\n  name: node-agent\n  namespace: kube-system\nspec:\n  containers:\n  - name: node-agent\n    image: busybox:1.36\n    command: [\"sleep\", \"3600\"]\nEOF\n\nexit\nkubectl -n kube-system get pods | grep node-agent",
    explanation:
      "Static pods are created by the kubelet from files in `staticPodPath` (kubeadm sets /etc/kubernetes/manifests), not by the API server — so there is no controller, no ReplicaSet, and the mirror pod that shows up in the API gets the node name appended: `node-agent-node01`. Deleting the mirror pod with kubectl does nothing; you delete the file.",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/",
    lab: {
      brief: "Two healthy nodes. `node01` has an empty /etc/kubernetes/manifests.",
      init: {},
      checks: [
        { description: "Manifest written to the static pod path on node01", kind: "HostFile", host: "node01", name: "/etc/kubernetes/manifests/node-agent.yaml", contains: "busybox:1.36" },
        { description: "Mirror pod node-agent-node01 exists in kube-system", kind: "Pod", name: "node-agent-node01", namespace: "kube-system" },
        { description: "It is scheduled on node01 and running", kind: "Pod", name: "node-agent-node01", namespace: "kube-system", path: "status.phase", equals: "Running" },
      ],
    },
  },
  {
    id: "lab-105",
    domain: TS_DOMAIN,
    topic: "Node troubleshooting",
    difficulty: "medium",
    type: "lab",
    prompt:
      "`node01` went NotReady after a reboot. Its container runtime is down and swap was re-enabled. Repair both on the node so it reports Ready again, leaving containerd enabled at boot.",
    answer:
      "kubectl describe node node01          # container runtime is down\n\nssh node01\nsystemctl status containerd           # inactive (dead)\ncrictl ps                             # cannot connect to the containerd socket\nsystemctl enable --now containerd\nfree -h                               # swap is on\nswapoff -a                            # and remove the swap line from /etc/fstab\nsystemctl restart kubelet\nexit\n\nkubectl get nodes",
    explanation:
      "The kubelet refuses to run with swap enabled unless it is explicitly configured for it, and it cannot start containers at all when the CRI socket is unavailable — `crictl ps` failing to connect is the giveaway. Fix the runtime, turn swap off, restart the kubelet, then re-check `kubectl get nodes`.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-cluster/",
    lab: {
      brief: "`node01` is NotReady: containerd is stopped and swap is on.",
      init: {
        nodes: [
          { name: "controlplane", roles: "control-plane" },
          { name: "node01", ready: false },
        ],
        hosts: {
          node01: {
            swap: true,
            services: {
              containerd: { active: false, enabled: false, log: "containerd: Stopped containerd container runtime." },
              kubelet: { active: true, enabled: true, log: 'kubelet: "Failed to run kubelet" err="running with swap on is not supported"\nkubelet: failed to get container runtime status: rpc error: code = Unavailable' },
            },
          },
        },
      },
      checks: [
        { description: "containerd is running on node01", kind: "HostService", host: "node01", name: "containerd", path: "active", equals: true },
        { description: "containerd is enabled on node01", kind: "HostService", host: "node01", name: "containerd", path: "enabled", equals: true },
        { description: "kubelet is running on node01", kind: "HostService", host: "node01", name: "kubelet", path: "active", equals: true },
        { description: "node01 reports Ready", kind: "Node", name: "node01", path: "status.conditions[0].status", equals: "True" },
      ],
    },
  },
];
