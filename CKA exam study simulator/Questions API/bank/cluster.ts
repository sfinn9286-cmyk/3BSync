import type { Question } from "./types";

const D = "Cluster Architecture, Installation & Configuration" as const;

export const cluster: Question[] = [
  {
    id: "ca-001",
    domain: D,
    topic: "RBAC",
    difficulty: "easy",
    type: "command",
    prompt:
      "Create a Role `pod-reader` in namespace `dev` allowing get/list/watch on pods, and bind it to ServiceAccount `ci` in the same namespace.",
    answer:
      "kubectl -n dev create role pod-reader --verb=get,list,watch --resource=pods\nkubectl -n dev create rolebinding ci-pod-reader --role=pod-reader --serviceaccount=dev:ci",
    accepted: [
      "kubectl create role pod-reader --verb=get --verb=list --verb=watch --resource=pods -n dev",
    ],
    explanation:
      "`--serviceaccount` takes `namespace:name`. Use `create clusterrole`/`create clusterrolebinding` for cluster-wide scope, and `--clusterrole` on a RoleBinding to grant a ClusterRole inside one namespace.",
    doc: "https://kubernetes.io/docs/reference/access-authn-authz/rbac/",
  },
  {
    id: "ca-002",
    domain: D,
    topic: "RBAC",
    difficulty: "medium",
    type: "command",
    prompt:
      "Verify whether ServiceAccount `ci` in namespace `dev` may delete deployments in namespace `dev`.",
    answer:
      "kubectl auth can-i delete deployments --as=system:serviceaccount:dev:ci -n dev",
    accepted: [
      "kubectl auth can-i delete deployment.apps --as system:serviceaccount:dev:ci -n dev",
    ],
    explanation:
      "`kubectl auth can-i --as=` impersonates. ServiceAccount usernames always take the form `system:serviceaccount:<namespace>:<name>`. `kubectl auth can-i --list` dumps everything a subject may do.",
    doc: "https://kubernetes.io/docs/reference/access-authn-authz/authorization/#checking-api-access",
  },
  {
    id: "ca-003",
    domain: D,
    topic: "RBAC",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "You bind a ClusterRole to a subject using a RoleBinding in namespace `dev`. What is the effective scope of the permissions?",
    options: [
      "Cluster-wide, because the role is a ClusterRole",
      "Only namespaced resources in `dev`",
      "The binding is rejected as invalid",
      "Only cluster-scoped resources, in read-only mode",
    ],
    answerIndex: 1,
    explanation:
      "A RoleBinding referencing a ClusterRole grants that ClusterRole's rules only within the RoleBinding's namespace. This is the idiomatic way to reuse built-in roles like `view` or `edit` per namespace. Access to cluster-scoped resources requires a ClusterRoleBinding.",
    doc: "https://kubernetes.io/docs/reference/access-authn-authz/rbac/#rolebinding-and-clusterrolebinding",
  },
  {
    id: "ca-004",
    domain: D,
    topic: "RBAC",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "A ServiceAccount `deployer` in namespace `apps` must be able to create and update Deployments and read Secrets in `apps`, and list Nodes cluster-wide. Produce the manifests.",
    answer:
      "kubectl -n apps create sa deployer\n\ncat <<'EOF' | kubectl apply -f -\napiVersion: rbac.authorization.k8s.io/v1\nkind: Role\nmetadata:\n  name: deployer\n  namespace: apps\nrules:\n- apiGroups: [\"apps\"]\n  resources: [\"deployments\"]\n  verbs: [\"create\",\"update\",\"patch\",\"get\",\"list\"]\n- apiGroups: [\"\"]\n  resources: [\"secrets\"]\n  verbs: [\"get\",\"list\"]\n---\napiVersion: rbac.authorization.k8s.io/v1\nkind: RoleBinding\nmetadata:\n  name: deployer\n  namespace: apps\nsubjects:\n- kind: ServiceAccount\n  name: deployer\n  namespace: apps\nroleRef:\n  kind: Role\n  name: deployer\n  apiGroup: rbac.authorization.k8s.io\n---\napiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata:\n  name: node-lister\nrules:\n- apiGroups: [\"\"]\n  resources: [\"nodes\"]\n  verbs: [\"list\"]\n---\napiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRoleBinding\nmetadata:\n  name: deployer-node-lister\nsubjects:\n- kind: ServiceAccount\n  name: deployer\n  namespace: apps\nroleRef:\n  kind: ClusterRole\n  name: node-lister\n  apiGroup: rbac.authorization.k8s.io\nEOF",
    rubric: [
      "Deployments use apiGroups: [\"apps\"]; secrets use the core group \"\"",
      "Namespaced permissions via Role + RoleBinding in apps",
      "Node listing via ClusterRole + ClusterRoleBinding (nodes are cluster-scoped)",
      "Subject kind ServiceAccount with its namespace set",
      "roleRef apiGroup is rbac.authorization.k8s.io",
    ],
    verify:
      "kubectl auth can-i list nodes --as=system:serviceaccount:apps:deployer",
    explanation:
      "Getting the apiGroup right is the most common RBAC mistake: core resources use an empty string, workloads use `apps`, RBAC objects use `rbac.authorization.k8s.io`.",
    doc: "https://kubernetes.io/docs/reference/access-authn-authz/rbac/",
  },
  {
    id: "ca-005",
    domain: D,
    topic: "kubeadm install",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "You must prepare a fresh Ubuntu node and join it to an existing kubeadm cluster as a worker. List the steps.",
    answer:
      "On the node:\nswapoff -a && sed -i '/ swap / s/^/#/' /etc/fstab\ncat <<EOF >/etc/modules-load.d/k8s.conf\noverlay\nbr_netfilter\nEOF\nmodprobe overlay && modprobe br_netfilter\ncat <<EOF >/etc/sysctl.d/k8s.conf\nnet.bridge.bridge-nf-call-iptables = 1\nnet.ipv4.ip_forward = 1\nEOF\nsysctl --system\n# install containerd, then kubeadm/kubelet/kubectl from pkgs.k8s.io\n\nOn a control-plane node:\nkubeadm token create --print-join-command\n\nBack on the worker, run the printed command:\nkubeadm join <apiserver>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>\n\nVerify: kubectl get nodes",
    rubric: [
      "Disables swap persistently",
      "Loads br_netfilter/overlay and sets ip_forward + bridge-nf-call-iptables",
      "Installs a container runtime plus kubeadm/kubelet",
      "Generates the join command with `kubeadm token create --print-join-command`",
      "Verifies the node reaches Ready from the control plane",
    ],
    verify: "kubectl get nodes",
    explanation:
      "The exam gives you package installation more often than not; the memorable parts are swapoff, the sysctl/module prerequisites, and `--print-join-command` for a fresh token and CA hash.",
    doc: "https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/",
  },
  {
    id: "ca-006",
    domain: D,
    topic: "kubeadm upgrade",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "Upgrade a kubeadm control-plane node from v1.34 to v1.35, then upgrade one worker. Give the ordered commands.",
    answer:
      "Control plane:\napt-mark unhold kubeadm && apt-get update && apt-get install -y kubeadm=1.35.0-* && apt-mark hold kubeadm\nkubeadm upgrade plan\nkubeadm upgrade apply v1.35.0\nkubectl drain <cp-node> --ignore-daemonsets\napt-mark unhold kubelet kubectl && apt-get install -y kubelet=1.35.0-* kubectl=1.35.0-* && apt-mark hold kubelet kubectl\nsystemctl daemon-reload && systemctl restart kubelet\nkubectl uncordon <cp-node>\n\nWorker (repeat per node):\nkubectl drain <worker> --ignore-daemonsets\n# on the worker: install kubeadm 1.35, then\nkubeadm upgrade node\n# install kubelet 1.35, then\nsystemctl daemon-reload && systemctl restart kubelet\nkubectl uncordon <worker>",
    rubric: [
      "Upgrades kubeadm binary before running any upgrade command",
      "Uses `kubeadm upgrade apply` on the first control plane and `kubeadm upgrade node` elsewhere",
      "Drains before upgrading the kubelet and uncordons afterwards",
      "Uses --ignore-daemonsets on drain",
      "Restarts the kubelet after daemon-reload",
    ],
    verify: "kubectl get nodes",
    explanation:
      "Skipping minor versions is unsupported: upgrade one minor at a time, control plane first, and never let the kubelet run a newer version than the API server.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/",
  },
  {
    id: "ca-007",
    domain: D,
    topic: "etcd backup",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "Take a snapshot of etcd on a kubeadm control-plane node and then restore it to /var/lib/etcd-restore.",
    answer:
      "ETCDCTL_API=3 etcdctl snapshot save /opt/etcd-backup.db \\\n  --endpoints=https://127.0.0.1:2379 \\\n  --cacert=/etc/kubernetes/pki/etcd/ca.crt \\\n  --cert=/etc/kubernetes/pki/etcd/server.crt \\\n  --key=/etc/kubernetes/pki/etcd/server.key\n\netcdctl snapshot status /opt/etcd-backup.db --write-out=table\n\nRestore:\nETCDCTL_API=3 etcdctl snapshot restore /opt/etcd-backup.db \\\n  --data-dir=/var/lib/etcd-restore\n\nThen point etcd at the new data dir by editing the hostPath volume for etcd-data in /etc/kubernetes/manifests/etcd.yaml and let the kubelet restart the static pod.",
    rubric: [
      "Uses etcdctl v3 with --endpoints and the three etcd cert flags",
      "Certs come from /etc/kubernetes/pki/etcd/",
      "Restore uses `snapshot restore --data-dir` to a NEW directory",
      "Edits /etc/kubernetes/manifests/etcd.yaml hostPath to the restored dir",
      "Knows the kubelet restarts the static pod automatically (no systemctl for etcd)",
    ],
    verify: "etcdctl snapshot status /opt/etcd-backup.db --write-out=table",
    explanation:
      "Restore never writes into a live data dir. After repointing the manifest, the API server briefly drops while etcd restarts — that is expected.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#backing-up-an-etcd-cluster",
  },
  {
    id: "ca-008",
    domain: D,
    topic: "etcd backup",
    difficulty: "medium",
    type: "mcq",
    prompt: "Which etcdctl environment variable must be set for snapshot commands to work against a modern etcd?",
    options: [
      "ETCD_VERSION=3",
      "ETCDCTL_API=3",
      "ETCDCTL_ENDPOINTS_V3=true",
      "None — v3 is always implied",
    ],
    answerIndex: 1,
    explanation:
      "etcdctl v3.4+ defaults to API v3, but the exam images and older builds still honour ETCDCTL_API=3; setting it explicitly is the safe habit and costs nothing.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/",
  },
  {
    id: "ca-009",
    domain: D,
    topic: "Cluster lifecycle",
    difficulty: "easy",
    type: "command",
    prompt:
      "Safely evacuate node `node02` for maintenance, ignoring DaemonSet pods and deleting pods backed by emptyDir data, then return it to service.",
    answer:
      "kubectl drain node02 --ignore-daemonsets --delete-emptydir-data\n# maintenance...\nkubectl uncordon node02",
    accepted: ["kubectl drain node02 --ignore-daemonsets --delete-emptydir-data --force"],
    explanation:
      "`cordon` only marks unschedulable; `drain` cordons and evicts. `--force` is additionally needed for pods not managed by any controller (bare pods), which are lost permanently.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/",
  },
  {
    id: "ca-010",
    domain: D,
    topic: "Cluster lifecycle",
    difficulty: "medium",
    type: "mcq",
    prompt: "What does a PodDisruptionBudget affect?",
    options: [
      "Scheduling decisions for new pods",
      "Voluntary disruptions such as `kubectl drain` evictions",
      "Node kernel OOM kills",
      "Rolling update speed of a Deployment",
    ],
    answerIndex: 1,
    explanation:
      "A PDB constrains the Eviction API, so a drain blocks rather than violating minAvailable/maxUnavailable. Involuntary disruptions (node crash, OOM kill) are not gated by a PDB, and rollout speed is controlled by the Deployment's own strategy.",
    doc: "https://kubernetes.io/docs/concepts/workloads/pods/disruptions/",
  },
  {
    id: "ca-011",
    domain: D,
    topic: "HA control plane",
    difficulty: "hard",
    type: "mcq",
    prompt:
      "In a stacked-etcd HA kubeadm cluster, how many control-plane nodes must remain healthy for the cluster to keep accepting writes when you have five?",
    options: ["2", "3", "4", "5"],
    answerIndex: 1,
    explanation:
      "etcd uses Raft: a quorum of (n/2)+1 is required, so 3 of 5. That is also why HA control planes come in odd numbers — 4 members tolerate the same single failure as 3 while adding latency.",
    doc: "https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/",
  },
  {
    id: "ca-012",
    domain: D,
    topic: "HA control plane",
    difficulty: "medium",
    type: "command",
    prompt:
      "Print the join command for adding an additional control-plane node to an existing kubeadm cluster (certificate keys included).",
    answer:
      "kubeadm init phase upload-certs --upload-certs\nkubeadm token create --print-join-command --certificate-key <key-from-above>",
    accepted: [
      "kubeadm token create --print-join-command then append --control-plane --certificate-key <key>",
    ],
    explanation:
      "Control-plane joins add `--control-plane --certificate-key <key>`; the certificate key decrypts the certs stored in the kubeadm-certs Secret, which expires after two hours.",
    doc: "https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/",
  },
  {
    id: "ca-013",
    domain: D,
    topic: "Helm",
    difficulty: "easy",
    type: "command",
    prompt:
      "Add the ingress-nginx Helm repo, install release `ingress` into namespace `ingress-nginx` (creating it), and list installed releases in that namespace.",
    answer:
      "helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx\nhelm repo update\nhelm install ingress ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace\nhelm list -n ingress-nginx",
    accepted: ["helm upgrade --install ingress ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace"],
    explanation:
      "`helm install <release> <repo>/<chart>`. `helm template` renders manifests without installing, useful when a task asks what a chart would create.",
    doc: "https://helm.sh/docs/intro/using_helm/",
  },
  {
    id: "ca-014",
    domain: D,
    topic: "Helm",
    difficulty: "medium",
    type: "command",
    prompt:
      "Show the values currently in effect for release `ingress` in namespace `ingress-nginx`, then upgrade it setting `controller.replicaCount=3`.",
    answer:
      "helm get values ingress -n ingress-nginx --all\nhelm upgrade ingress ingress-nginx/ingress-nginx -n ingress-nginx --set controller.replicaCount=3",
    accepted: ["helm show values ingress-nginx/ingress-nginx", "helm upgrade --reuse-values ..."],
    explanation:
      "`helm get values --all` shows computed values for a release; `helm show values <chart>` shows chart defaults. Without `--reuse-values`, an upgrade resets unspecified overrides.",
    doc: "https://helm.sh/docs/helm/helm_upgrade/",
  },
  {
    id: "ca-015",
    domain: D,
    topic: "Kustomize",
    difficulty: "medium",
    type: "command",
    prompt:
      "Render and apply a Kustomize overlay located at ./overlays/prod using kubectl only.",
    answer:
      "kubectl kustomize ./overlays/prod\nkubectl apply -k ./overlays/prod",
    accepted: ["kubectl apply --kustomize ./overlays/prod"],
    explanation:
      "kubectl embeds Kustomize: `-k` applies a kustomization directory, `kubectl kustomize` renders it to stdout so you can diff before applying.",
    doc: "https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/",
  },
  {
    id: "ca-016",
    domain: D,
    topic: "Kustomize",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "Which kustomization.yaml field changes the image tag of every matching container in the rendered output?",
    options: ["patchesJson6902", "images", "commonLabels", "replacements"],
    answerIndex: 1,
    explanation:
      "The `images:` field takes `name` plus `newName`/`newTag`. Strategic-merge or JSON patches also work, but `images:` is the purpose-built shortcut.",
    doc: "https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/#customizing",
  },
  {
    id: "ca-017",
    domain: D,
    topic: "CRDs and operators",
    difficulty: "medium",
    type: "command",
    prompt:
      "List all CustomResourceDefinitions in the cluster and show the fields of the custom resource kind `Backup`.",
    answer:
      "kubectl get crd\nkubectl explain backup --recursive\nkubectl api-resources | grep -i backup",
    accepted: ["kubectl get crds", "kubectl explain backups.spec"],
    explanation:
      "`kubectl explain` works on CRDs once their schema is registered, which makes it the fastest way to discover fields in the exam without internet docs for third-party APIs.",
    doc: "https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/",
  },
  {
    id: "ca-018",
    domain: D,
    topic: "CRDs and operators",
    difficulty: "medium",
    type: "mcq",
    prompt: "What does an operator add on top of a CRD?",
    options: [
      "A validating webhook that enforces the CRD schema",
      "A controller that reconciles the custom resource's desired state",
      "The storage layer for the custom resource in etcd",
      "The RBAC rules that allow reading the custom resource",
    ],
    answerIndex: 1,
    explanation:
      "A CRD only extends the API surface — objects are stored and served but nothing happens. The operator is the controller that watches those objects and drives real-world state.",
    doc: "https://kubernetes.io/docs/concepts/extend-kubernetes/operator/",
  },
  {
    id: "ca-019",
    domain: D,
    topic: "Extension interfaces",
    difficulty: "easy",
    type: "mcq",
    prompt: "Which component talks to the CRI?",
    options: ["kube-apiserver", "kube-proxy", "kubelet", "kube-controller-manager"],
    answerIndex: 2,
    explanation:
      "The kubelet is the only component that speaks the Container Runtime Interface (to containerd or CRI-O over a socket such as /run/containerd/containerd.sock). It also drives CSI node plugins and calls the CNI plugin for pod networking.",
    doc: "https://kubernetes.io/docs/concepts/architecture/cri/",
  },
  {
    id: "ca-020",
    domain: D,
    topic: "Extension interfaces",
    difficulty: "medium",
    type: "command",
    prompt:
      "On a node using containerd, list running containers and inspect the image of one of them without kubectl.",
    answer:
      "crictl ps\ncrictl inspect <container-id> | grep -i image\ncrictl images",
    accepted: ["sudo crictl ps -a", "crictl pods"],
    explanation:
      "crictl is the CRI-level equivalent of docker CLI; `crictl pods`, `ps -a`, `logs`, and `inspect` are the four you need when the API server or kubelet is unhealthy.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-cluster/crictl/",
  },
  {
    id: "ca-021",
    domain: D,
    topic: "Extension interfaces",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "Pods on a freshly-initialised kubeadm cluster stay Pending with `network plugin is not ready: cni config uninitialized`. What is missing?",
    options: [
      "A CSI driver",
      "A CNI plugin such as Calico, Cilium or Flannel",
      "The metrics-server",
      "A default StorageClass",
    ],
    answerIndex: 1,
    explanation:
      "kubeadm deliberately does not install pod networking. Until a CNI plugin is applied, the kubelet reports the network as uninitialised and CoreDNS stays Pending.",
    doc: "https://kubernetes.io/docs/concepts/cluster-administration/addons/",
  },
  {
    id: "ca-022",
    domain: D,
    topic: "Certificates",
    difficulty: "hard",
    type: "command",
    prompt:
      "Check the expiry dates of all kubeadm-managed control-plane certificates, then renew them all.",
    answer:
      "kubeadm certs check-expiration\nkubeadm certs renew all\n# restart the control-plane static pods afterwards, e.g. by moving the manifests\n# out of /etc/kubernetes/manifests and back, or rebooting the kubelet",
    accepted: [
      "openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -text | grep -A2 Validity",
    ],
    explanation:
      "kubeadm certs are valid one year and are renewed automatically on `kubeadm upgrade`. After a manual renewal the static pods must be restarted to pick up the new certs.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/",
  },
  {
    id: "ca-023",
    domain: D,
    topic: "Certificates",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "Grant a new human user `alice` cluster access using the CertificateSigningRequest API, with view rights in namespace `dev`.",
    answer:
      "openssl genrsa -out alice.key 2048\nopenssl req -new -key alice.key -out alice.csr -subj \"/CN=alice\"\n\ncat <<EOF | kubectl apply -f -\napiVersion: certificates.k8s.io/v1\nkind: CertificateSigningRequest\nmetadata:\n  name: alice\nspec:\n  request: $(cat alice.csr | base64 -w0)\n  signerName: kubernetes.io/kube-apiserver-client\n  usages: [\"client auth\"]\nEOF\n\nkubectl certificate approve alice\nkubectl get csr alice -o jsonpath='{.status.certificate}' | base64 -d > alice.crt\nkubectl -n dev create rolebinding alice-view --clusterrole=view --user=alice\nkubectl config set-credentials alice --client-certificate=alice.crt --client-key=alice.key",
    rubric: [
      "CN of the certificate becomes the username (O becomes groups)",
      "signerName kubernetes.io/kube-apiserver-client with usage client auth",
      "request field is the base64 of the CSR with no line wraps",
      "Approves with `kubectl certificate approve` and extracts .status.certificate",
      "Authorises separately with a RoleBinding — a signed cert only authenticates",
    ],
    verify: "kubectl get csr alice",
    explanation:
      "Kubernetes has no user objects: authentication comes from the certificate's subject, and authorisation must be granted separately through RBAC.",
    doc: "https://kubernetes.io/docs/reference/access-authn-authz/certificate-signing-requests/",
  },
  {
    id: "ca-024",
    domain: D,
    topic: "kubeconfig",
    difficulty: "easy",
    type: "command",
    prompt:
      "Show all contexts, switch to context `prod-admin`, and set its default namespace to `payments`.",
    answer:
      "kubectl config get-contexts\nkubectl config use-context prod-admin\nkubectl config set-context --current --namespace=payments",
    accepted: ["kubectl config set-context prod-admin --namespace=payments"],
    explanation:
      "Setting the current namespace saves keystrokes for the rest of a task. `kubectl config view --minify` prints only the active context, useful for confirming which cluster you are about to change.",
    doc: "https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/",
  },
  {
    id: "ca-025",
    domain: D,
    topic: "Control-plane architecture",
    difficulty: "easy",
    type: "mcq",
    prompt: "Which component is responsible for binding a pod to a node?",
    options: ["kubelet", "kube-scheduler", "kube-controller-manager", "kube-proxy"],
    answerIndex: 1,
    explanation:
      "The scheduler watches for pods with an empty `spec.nodeName`, filters and scores nodes, then writes a Binding. The kubelet on the chosen node then starts the containers.",
    doc: "https://kubernetes.io/docs/concepts/architecture/",
  },
  {
    id: "ca-026",
    domain: D,
    topic: "Control-plane architecture",
    difficulty: "medium",
    type: "mcq",
    prompt: "Which statement about kube-proxy is correct?",
    options: [
      "It proxies every pod-to-pod packet through userspace",
      "It programs node-level rules (iptables/IPVS/nftables) implementing Service VIPs",
      "It assigns pod IP addresses",
      "It resolves Service DNS names",
    ],
    answerIndex: 1,
    explanation:
      "kube-proxy watches Services and EndpointSlices and programs packet-rewriting rules on each node. Pod IPs come from the CNI plugin's IPAM, and DNS comes from CoreDNS.",
    doc: "https://kubernetes.io/docs/reference/networking/virtual-ips/",
  },
  {
    id: "ca-027",
    domain: D,
    topic: "Static pods",
    difficulty: "medium",
    type: "command",
    prompt:
      "Create a static pod named `web` running nginx:1.27 on node01 without going through the API server.",
    answer:
      "ssh node01\nkubectl run web --image=nginx:1.27 --dry-run=client -o yaml > /etc/kubernetes/manifests/web.yaml\n# the kubelet picks it up within seconds; verify with crictl ps or kubectl get pod web-node01",
    accepted: [
      "kubectl run web --image=nginx:1.27 -o yaml --dry-run=client | sudo tee /etc/kubernetes/manifests/web.yaml",
    ],
    explanation:
      "The staticPodPath comes from /var/lib/kubelet/config.yaml (default /etc/kubernetes/manifests). The mirror pod that appears in the API is named `<pod>-<nodename>` and cannot be edited via kubectl — deleting the file is how you remove it.",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/",
  },
  {
    id: "ca-028",
    domain: D,
    topic: "Namespaces and quotas",
    difficulty: "medium",
    type: "command",
    prompt:
      "Create namespace `team-a` with a ResourceQuota limiting it to 4 CPU requests, 8Gi memory requests and 10 pods.",
    answer:
      "kubectl create namespace team-a\nkubectl -n team-a create quota team-a-quota --hard=requests.cpu=4,requests.memory=8Gi,pods=10",
    accepted: [
      "kubectl create quota team-a-quota --hard=cpu=4,memory=8Gi,pods=10 -n team-a",
    ],
    explanation:
      "Once a quota names requests.cpu/requests.memory, every pod in the namespace must declare those requests or creation is rejected — pair it with a LimitRange providing defaults.",
    doc: "https://kubernetes.io/docs/concepts/policy/resource-quotas/",
  },
  {
    id: "ca-029",
    domain: D,
    topic: "API resources",
    difficulty: "easy",
    type: "command",
    prompt:
      "List every namespaced API resource in the cluster with its short name and API version, then show which verbs are supported for `deployments`.",
    answer:
      "kubectl api-resources --namespaced=true\nkubectl api-resources -o wide | grep deployments",
    accepted: ["kubectl api-resources --namespaced --sort-by=name", "kubectl explain deployment"],
    explanation:
      "`api-resources -o wide` prints the VERBS column, and `api-versions` lists served group/versions — both are fast ways to discover the correct apiVersion without docs.",
    doc: "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_api-resources/",
  },
  {
    id: "ca-030",
    domain: D,
    topic: "Cluster lifecycle",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "You must permanently remove worker node `node03` from the cluster. Give the full procedure.",
    answer:
      "kubectl drain node03 --ignore-daemonsets --delete-emptydir-data\nkubectl delete node node03\n# on node03 itself:\nkubeadm reset -f\niptables -F && iptables -t nat -F && iptables -t mangle -F && iptables -X\nrm -rf /etc/cni/net.d $HOME/.kube/config",
    rubric: [
      "Drains before deleting so workloads reschedule",
      "Deletes the Node object from the API",
      "Runs `kubeadm reset` on the node itself",
      "Cleans CNI config and iptables/ipvs leftovers",
      "Order is drain → delete node → reset",
    ],
    verify: "kubectl get nodes",
    explanation:
      "Deleting the Node object alone leaves the kubelet running and the node's CNI state dirty, which breaks any later re-join.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/",
  },
];
