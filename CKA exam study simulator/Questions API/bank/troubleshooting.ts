import type { Question } from "./types";

const D = "Troubleshooting" as const;

export const troubleshooting: Question[] = [
  {
    id: "ts-001",
    domain: D,
    topic: "Pod failures",
    difficulty: "easy",
    type: "command",
    prompt:
      "A pod named `web` in namespace `prod` is stuck. Show the events and scheduling detail for that pod, then show the logs of its previous, crashed container.",
    answer:
      "kubectl -n prod describe pod web\nkubectl -n prod logs web --previous",
    accepted: [
      "kubectl describe pod web -n prod",
      "kubectl logs -p web -n prod",
      "kubectl -n prod logs web -p",
    ],
    explanation:
      "`describe` shows the Events block (image pull failures, scheduling errors, probe failures, OOMKills). `--previous` (`-p`) reads the log of the last terminated container, which is the only way to see why a CrashLoopBackOff container died.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/",
  },
  {
    id: "ts-002",
    domain: D,
    topic: "Pod failures",
    difficulty: "easy",
    type: "mcq",
    prompt:
      "A pod's status is `ImagePullBackOff`. Which is NOT a plausible cause?",
    options: [
      "The image tag does not exist in the registry",
      "The registry requires credentials and no imagePullSecret is set",
      "The container's process exits immediately after starting",
      "The node cannot reach the registry over the network",
    ],
    answerIndex: 2,
    explanation:
      "A process that exits immediately produces CrashLoopBackOff, not ImagePullBackOff — the image was pulled successfully in that case. The other three all fail during the pull phase.",
    doc: "https://kubernetes.io/docs/concepts/containers/images/",
  },
  {
    id: "ts-003",
    domain: D,
    topic: "Pod failures",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Pod `api` in namespace `dev` is `Pending`. `kubectl describe` shows: `0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu.` Explain the fix that keeps the pod schedulable on the two worker nodes without changing the cluster size.",
    answer:
      "The pod's CPU request is larger than the allocatable CPU left on either worker. Lower the request:\n\nkubectl -n dev get pod api -o yaml > /tmp/api.yaml\n# edit spec.containers[0].resources.requests.cpu to a value that fits\nkubectl -n dev delete pod api\nkubectl -n dev apply -f /tmp/api.yaml\n\nCheck headroom first with:\nkubectl describe node <worker> | grep -A6 'Allocated resources'",
    rubric: [
      "Identifies that the CPU *request* (not limit, not actual usage) drives scheduling",
      "Does not propose tolerating the control-plane taint as the fix",
      "Reduces the request (or frees capacity by evicting/scaling down another workload)",
      "Recreates the pod, since resources on a bare pod are immutable in place",
      "Mentions inspecting node allocatable/allocated capacity",
    ],
    verify: "kubectl -n dev get pod api -o wide",
    explanation:
      "The scheduler fits pods by summing requests against node allocatable. Control-plane nodes are tainted `NoSchedule` by design, so the real blocker is the two workers reporting Insufficient cpu.",
    doc: "https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/",
  },
  {
    id: "ts-004",
    domain: D,
    topic: "Cluster components",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "`kubectl get nodes` returns `The connection to the server 127.0.0.1:6443 was refused`. You are SSH'd into the control-plane node, which was built with kubeadm. Walk through the diagnosis in order.",
    answer:
      "1. Is the kubelet up? `systemctl status kubelet` and `journalctl -u kubelet -f`\n2. Are the static pod containers running? `sudo crictl ps -a` / `sudo crictl ps -a --name kube-apiserver`\n3. Read the apiserver container log: `sudo crictl logs <apiserver-container-id>`\n4. Validate the manifest: `sudo cat /etc/kubernetes/manifests/kube-apiserver.yaml` (bad flag, bad YAML indentation, wrong etcd endpoint or cert path)\n5. Check etcd is healthy, since the apiserver crash-loops without it: `sudo crictl ps -a --name etcd` and its logs\n6. Fix the manifest; the kubelet reapplies it automatically within seconds — no `kubectl apply`, no restart needed.",
    rubric: [
      "Checks kubelet service status and journal",
      "Uses crictl (not kubectl/docker) because the API server is down",
      "Inspects /etc/kubernetes/manifests/kube-apiserver.yaml",
      "Knows the kubelet auto-restarts static pods after the manifest is edited",
      "Considers etcd as a dependency of the API server",
    ],
    explanation:
      "Control-plane components run as static pods managed directly by the kubelet from /etc/kubernetes/manifests. With the API server down, kubectl is useless and crictl plus the kubelet journal are your only windows.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-cluster/",
  },
  {
    id: "ts-005",
    domain: D,
    topic: "Cluster components",
    difficulty: "easy",
    type: "command",
    prompt:
      "Show the logs of the kube-scheduler that runs as a static pod on the control plane, using kubectl.",
    answer: "kubectl -n kube-system logs kube-scheduler-<node-name>",
    accepted: [
      "kubectl logs -n kube-system -l component=kube-scheduler",
      "kubectl -n kube-system logs pod/kube-scheduler-controlplane",
    ],
    explanation:
      "Static control-plane pods appear as mirror pods in kube-system named `<component>-<nodename>`. If the API server is unavailable, use `crictl logs` or `/var/log/pods` instead.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-cluster/",
  },
  {
    id: "ts-006",
    domain: D,
    topic: "Node troubleshooting",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Node `node01` shows `NotReady`. Diagnose and restore it. Assume the cluster was installed with kubeadm and containerd.",
    answer:
      "kubectl describe node node01     # read Conditions and the last heartbeat reason\nssh node01\nsystemctl status kubelet\njournalctl -u kubelet --no-pager | tail -50\nsystemctl status containerd\n# common causes: kubelet stopped/masked, wrong --kubeconfig or expired\n# /etc/kubernetes/kubelet.conf cert, container runtime down, disk pressure,\n# swap re-enabled, wrong apiserver address in kubelet.conf\nsystemctl enable --now kubelet\nsystemctl restart kubelet",
    rubric: [
      "Starts from `kubectl describe node` conditions (MemoryPressure/DiskPressure/Ready reason)",
      "Checks kubelet service and its journal on the node itself",
      "Checks the container runtime (containerd) as well",
      "Names at least one config-level cause (kubelet.conf, certs, swap, disk)",
      "Restarts/enables the kubelet and re-verifies with `kubectl get nodes`",
    ],
    verify: "kubectl get node node01",
    explanation:
      "NotReady almost always means the kubelet stopped posting status: the service is down, the runtime socket is unavailable, or the node is under resource pressure.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-cluster/",
  },
  {
    id: "ts-007",
    domain: D,
    topic: "Node troubleshooting",
    difficulty: "easy",
    type: "mcq",
    prompt: "Which directory holds the kubelet's own configuration file on a kubeadm node?",
    options: [
      "/etc/kubernetes/manifests/kubelet.yaml",
      "/var/lib/kubelet/config.yaml",
      "/etc/kubelet/kubelet.conf",
      "/etc/systemd/system/kubelet.service",
    ],
    answerIndex: 1,
    explanation:
      "kubeadm writes the kubelet's KubeletConfiguration to /var/lib/kubelet/config.yaml, with flags in /var/lib/kubelet/kubeadm-flags.env and the API credentials in /etc/kubernetes/kubelet.conf. /etc/kubernetes/manifests holds static pods.",
    doc: "https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/",
  },
  {
    id: "ts-008",
    domain: D,
    topic: "Resource usage",
    difficulty: "easy",
    type: "command",
    prompt:
      "List pods across all namespaces sorted by CPU consumption, and show per-container usage for the top pod.",
    answer:
      "kubectl top pod -A --sort-by=cpu\nkubectl top pod <pod> -n <ns> --containers",
    accepted: ["kubectl top pods --all-namespaces --sort-by=cpu"],
    explanation:
      "`kubectl top` requires the metrics-server. If it errors with `Metrics API not available`, check the metrics-server deployment in kube-system.",
    doc: "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_top/",
  },
  {
    id: "ts-009",
    domain: D,
    topic: "Resource usage",
    difficulty: "medium",
    type: "command",
    prompt:
      "Find the node consuming the most memory, then identify which pod on it is the largest memory consumer.",
    answer:
      "kubectl top node --sort-by=memory\nkubectl top pod -A --sort-by=memory --field-selector spec.nodeName=<node>",
    accepted: [
      "kubectl get pods -A -o wide | grep <node>",
      "kubectl top pod -A --sort-by=memory",
    ],
    explanation:
      "`kubectl top node` gives node-level pressure; narrowing pods by `spec.nodeName` (or `-o wide` plus grep) attributes it to a workload.",
    doc: "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_top/",
  },
  {
    id: "ts-010",
    domain: D,
    topic: "Container output streams",
    difficulty: "easy",
    type: "command",
    prompt:
      "Write the last 20 lines of the logs of container `sidecar` in pod `mesh` (namespace `apps`) to the file /opt/answers/sidecar.log.",
    answer:
      "kubectl -n apps logs mesh -c sidecar --tail=20 > /opt/answers/sidecar.log",
    accepted: ["kubectl logs mesh -c sidecar -n apps --tail 20 > /opt/answers/sidecar.log"],
    explanation:
      "`-c` selects the container in a multi-container pod; `--tail` limits lines. Exam tasks frequently ask you to redirect output to a specific file path — the path must match exactly.",
    doc: "https://kubernetes.io/docs/concepts/cluster-administration/logging/",
  },
  {
    id: "ts-011",
    domain: D,
    topic: "Container output streams",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "An application writes its logs to /var/log/app.log inside the container instead of stdout. What is the standard Kubernetes pattern to make those logs visible to `kubectl logs`?",
    options: [
      "Mount /var/log from the host into the container",
      "Add a sidecar container that shares an emptyDir volume with the app and tails the file to its stdout",
      "Set `spec.containers[].logPath` on the pod",
      "Enable the log-forwarding annotation on the namespace",
    ],
    answerIndex: 1,
    explanation:
      "kubectl logs reads only the container runtime's stdout/stderr capture. The sidecar-streaming pattern shares an emptyDir and runs something like `tail -F /var/log/app.log`, so the sidecar's stdout becomes retrievable. There is no logPath field.",
    doc: "https://kubernetes.io/docs/concepts/cluster-administration/logging/#sidecar-container-with-a-logging-agent",
  },
  {
    id: "ts-012",
    domain: D,
    topic: "Services & networking troubleshooting",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Service `web-svc` in namespace `prod` returns connection refused from inside the cluster, though the `web` pods are Running and Ready. Find the fault.",
    answer:
      "kubectl -n prod get endpointslices -l kubernetes.io/service-name=web-svc\nkubectl -n prod describe svc web-svc\nkubectl -n prod get pods --show-labels\n\nIf the EndpointSlice has no addresses, the Service selector does not match the pod labels — fix the selector (or the labels).\nIf endpoints exist, compare svc.spec.ports[].targetPort with the container's real listening port:\nkubectl -n prod get pod <pod> -o jsonpath='{.spec.containers[*].ports[*].containerPort}'\nTest directly:\nkubectl -n prod run tmp --image=nicolaka/netshoot --rm -it --restart=Never -- curl -s web-svc:80",
    rubric: [
      "Checks EndpointSlices/Endpoints first to split selector problems from port problems",
      "Compares Service selector against actual pod labels",
      "Compares targetPort against the container's listening port",
      "Tests connectivity from a throwaway pod inside the cluster, not from the node",
      "Considers a NetworkPolicy denying the traffic",
    ],
    verify: "kubectl -n prod get endpointslices -l kubernetes.io/service-name=web-svc",
    explanation:
      "Empty endpoints means selector/readiness; populated endpoints plus refused connections means the wrong targetPort, the app bound to 127.0.0.1, or a NetworkPolicy.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/",
  },
  {
    id: "ts-013",
    domain: D,
    topic: "Services & networking troubleshooting",
    difficulty: "medium",
    type: "command",
    prompt:
      "DNS resolution is failing cluster-wide. Show the CoreDNS pods, their logs, and the effective Corefile.",
    answer:
      "kubectl -n kube-system get pods -l k8s-app=kube-dns\nkubectl -n kube-system logs -l k8s-app=kube-dns\nkubectl -n kube-system get configmap coredns -o yaml",
    accepted: [
      "kubectl -n kube-system describe cm coredns",
      "kubectl get pods -n kube-system | grep coredns",
    ],
    explanation:
      "CoreDNS pods carry the label `k8s-app=kube-dns` for backward compatibility. A CrashLooping CoreDNS is usually a malformed Corefile or a `loop` plugin detection against the host resolver.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/",
  },
  {
    id: "ts-014",
    domain: D,
    topic: "Services & networking troubleshooting",
    difficulty: "easy",
    type: "command",
    prompt:
      "From a temporary pod, resolve the ClusterIP Service `db` in namespace `data` by its fully-qualified cluster DNS name.",
    answer:
      "kubectl run dnstest --image=busybox:1.36 --rm -it --restart=Never -- nslookup db.data.svc.cluster.local",
    accepted: [
      "kubectl run tmp --image=busybox --rm -it --restart=Never -- nslookup db.data.svc.cluster.local",
    ],
    explanation:
      "Service FQDN is `<service>.<namespace>.svc.cluster.local`. Pods get an A record too, but as `<pod-ip-with-dashes>.<namespace>.pod.cluster.local`.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/",
  },
  {
    id: "ts-015",
    domain: D,
    topic: "Pod failures",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "A pod is repeatedly restarting. `kubectl describe pod` shows `Last State: Terminated, Reason: OOMKilled, Exit Code: 137`. Give the fix and the reasoning.",
    answer:
      "The container exceeded its memory limit. Either raise the limit or reduce the app's footprint:\n\nkubectl -n <ns> set resources deployment <name> --limits=memory=512Mi --requests=memory=256Mi\n\nConfirm real consumption first with `kubectl top pod <pod> --containers`. Keep requests <= limits, and note that a memory limit is enforced hard by the kernel cgroup — unlike CPU, which is throttled.",
    rubric: [
      "Recognises exit code 137 / OOMKilled as hitting the memory limit",
      "Raises the memory limit (or reduces usage) rather than changing CPU",
      "Bases the new value on observed usage from kubectl top",
      "Notes memory is killed while CPU is throttled",
      "Applies the change on the controller (Deployment), not the transient pod",
    ],
    explanation:
      "137 = 128 + SIGKILL(9). The kernel OOM killer enforces the memory limit; only requests affect scheduling, only limits affect kills.",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/",
  },
  {
    id: "ts-016",
    domain: D,
    topic: "Pod failures",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "A pod stays in `Init:0/1` for several minutes. What does this tell you?",
    options: [
      "The readiness probe on the app container is failing",
      "The first init container has not completed successfully yet",
      "The pod cannot be scheduled to a node",
      "The image for the app container cannot be pulled",
    ],
    answerIndex: 1,
    explanation:
      "Init containers run to completion in order before app containers start. Debug with `kubectl logs <pod> -c <init-container>`. Unschedulable pods show `Pending` with no node assigned.",
    doc: "https://kubernetes.io/docs/concepts/workloads/pods/init-containers/",
  },
  {
    id: "ts-017",
    domain: D,
    topic: "Cluster components",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "After a control-plane reboot, `kubectl get pods` works but new Deployments create no ReplicaSets and no pods. Which component is at fault and how do you confirm and fix it?",
    answer:
      "kube-controller-manager is down or crash-looping — it owns the Deployment/ReplicaSet controllers.\n\nkubectl -n kube-system get pods | grep controller-manager\nkubectl -n kube-system logs kube-controller-manager-<node>\n# or on the node, if the mirror pod is missing:\nsudo crictl ps -a --name kube-controller-manager\nsudo crictl logs <id>\nsudo cat /etc/kubernetes/manifests/kube-controller-manager.yaml   # bad flag, wrong\n# --kubeconfig path, wrong volume hostPath for certs\n\nFix the manifest; the kubelet restarts the static pod automatically.",
    rubric: [
      "Names kube-controller-manager (not the scheduler, not the API server)",
      "Explains the reasoning: API reads work, so the API server and etcd are fine; nothing reconciles the spec",
      "Inspects the static pod manifest and/or the container logs",
      "Uses crictl when the mirror pod is absent",
      "Knows the kubelet reapplies the manifest with no restart command",
    ],
    explanation:
      "A missing scheduler leaves pods Pending with a node unassigned; a missing controller-manager means the ReplicaSet is never even created, so there are no pods at all.",
    doc: "https://kubernetes.io/docs/concepts/architecture/#kube-controller-manager",
  },
  {
    id: "ts-018",
    domain: D,
    topic: "Cluster components",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "Pods created by a Deployment stay `Pending` with no node assigned and no events from the scheduler. Which component should you check first?",
    options: ["kubelet on the workers", "kube-proxy", "kube-scheduler", "etcd"],
    answerIndex: 2,
    explanation:
      "The scheduler binds pods to nodes. If it is down, ReplicaSets still create pods (controller-manager works) but nothing sets spec.nodeName, so they sit Pending with no FailedScheduling events at all.",
    doc: "https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/",
  },
  {
    id: "ts-019",
    domain: D,
    topic: "Probes",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "A Deployment's pods flap between Ready and not Ready, and `describe` shows `Readiness probe failed: HTTP probe failed with statuscode: 404`. The app serves health at /healthz on port 8080. Fix it.",
    answer:
      "kubectl -n <ns> edit deployment <name>\n\nreadinessProbe:\n  httpGet:\n    path: /healthz\n    port: 8080\n  initialDelaySeconds: 5\n  periodSeconds: 10\n  failureThreshold: 3\n\nThe probe was pointing at the wrong path/port. Editing the Deployment triggers a rollout; verify with `kubectl rollout status deployment/<name>` and `kubectl get pods`.",
    rubric: [
      "Corrects the probe path/port to match the app",
      "Edits the Deployment template, not live pods",
      "Keeps sensible initialDelaySeconds/periodSeconds",
      "Verifies with rollout status and pod readiness",
      "Distinguishes readiness (traffic gating) from liveness (restarts)",
    ],
    explanation:
      "A failing readiness probe removes the pod from Service endpoints but does not restart it; a failing liveness probe restarts the container.",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/",
  },
  {
    id: "ts-020",
    domain: D,
    topic: "Events & auditing",
    difficulty: "easy",
    type: "command",
    prompt:
      "Show all events in namespace `staging` in the order they occurred, filtered to Warnings only.",
    answer:
      "kubectl -n staging get events --sort-by=.metadata.creationTimestamp --field-selector type=Warning",
    accepted: [
      "kubectl events -n staging --types=Warning",
      "kubectl get events -n staging --field-selector type=Warning",
    ],
    explanation:
      "Events are not sorted by default. `kubectl events` (GA since 1.29) is the newer command and supports `--for pod/<name>` to scope to one object.",
    doc: "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_events/",
  },
  {
    id: "ts-021",
    domain: D,
    topic: "kubeconfig & access",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "kubectl returns `error: You must be logged in to the server (Unauthorized)` on a kubeadm control-plane node. The cluster itself is healthy. What do you check?",
    answer:
      "1. Which kubeconfig are you using? `kubectl config view --minify` and `echo $KUBECONFIG`\n2. On the control plane, the admin file is /etc/kubernetes/admin.conf:\n   export KUBECONFIG=/etc/kubernetes/admin.conf   (or cp to ~/.kube/config)\n3. Client certs expire after one year — check them:\n   sudo kubeadm certs check-expiration\n   sudo kubeadm certs renew admin.conf   # then refresh ~/.kube/config\n4. Confirm identity and permissions: `kubectl auth whoami`, `kubectl auth can-i --list`",
    rubric: [
      "Checks which kubeconfig/context is active",
      "Points at /etc/kubernetes/admin.conf on the control plane",
      "Raises certificate expiry and `kubeadm certs check-expiration`",
      "Distinguishes Unauthorized (authentication) from Forbidden (authorization/RBAC)",
      "Verifies afterwards with auth whoami / can-i",
    ],
    explanation:
      "Unauthorized is an authentication failure — bad or expired credentials. Forbidden would mean the identity is known but RBAC denies the verb.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/",
  },
  {
    id: "ts-022",
    domain: D,
    topic: "Pod debugging",
    difficulty: "medium",
    type: "command",
    prompt:
      "The image of pod `hardened` has no shell. Attach a debugging container with networking tools to the running pod without restarting it.",
    answer:
      "kubectl debug -it hardened --image=nicolaka/netshoot --target=hardened -- /bin/bash",
    accepted: [
      "kubectl debug -it hardened --image=busybox --target=hardened",
      "kubectl debug pod/hardened -it --image=nicolaka/netshoot --target=hardened",
    ],
    explanation:
      "`kubectl debug` injects an ephemeral container sharing the pod's namespaces. `--target` shares the process namespace of a specific container. `kubectl debug node/<node> --image=...` gives you a host-namespace pod for node debugging.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/#ephemeral-container",
  },
  {
    id: "ts-023",
    domain: D,
    topic: "Node troubleshooting",
    difficulty: "medium",
    type: "command",
    prompt:
      "Safely take node01 out of service for maintenance, ignoring DaemonSet pods and deleting pods backed by emptyDir, then return it to service afterwards.",
    answer:
      "kubectl drain node01 --ignore-daemonsets --delete-emptydir-data\n# maintenance...\nkubectl uncordon node01",
    accepted: [
      "kubectl drain node01 --ignore-daemonsets --delete-emptydir-data --force",
    ],
    explanation:
      "`drain` cordons then evicts. DaemonSet pods cannot be evicted (they are recreated immediately) hence `--ignore-daemonsets`; `--force` is needed for unmanaged bare pods, which are lost permanently.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/",
  },
  {
    id: "ts-024",
    domain: D,
    topic: "Services & networking troubleshooting",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "Pod-to-pod traffic works within a node but not across nodes, and all CNI pods are Running. What do you investigate?",
    answer:
      "1. CNI plugin health beyond Running: `kubectl -n kube-system logs -l k8s-app=<cni>` and `kubectl get pods -A -o wide` to see whether pod CIDRs per node look right\n2. Node pod CIDRs: `kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{\"\\t\"}{.spec.podCIDR}{\"\\n\"}{end}'` — overlapping or missing CIDRs break routing\n3. Whether --pod-network-cidr given to kubeadm matches the CNI's configured CIDR (and controller-manager's --cluster-cidr)\n4. Host firewall / security groups blocking the overlay ports (e.g. VXLAN 8472, WireGuard 51820, IP-in-IP)\n5. NetworkPolicies: `kubectl get netpol -A` — a default-deny with only same-node traffic allowed by accident\n6. kube-proxy on each node: `kubectl -n kube-system logs -l k8s-app=kube-proxy`",
    rubric: [
      "Checks per-node podCIDR assignment and CIDR mismatch with the CNI config",
      "Reads CNI daemon logs rather than trusting pod status",
      "Considers host firewall / overlay encapsulation ports between nodes",
      "Checks NetworkPolicies",
      "Mentions kube-proxy / node routing table as part of the path",
    ],
    explanation:
      "Same-node traffic uses the local bridge and works even when the overlay is broken, so cross-node-only failure points at CIDR configuration, encapsulation, or firewalling between nodes.",
    doc: "https://kubernetes.io/docs/concepts/cluster-administration/networking/",
  },
  {
    id: "ts-025",
    domain: D,
    topic: "Resource usage",
    difficulty: "easy",
    type: "mcq",
    prompt:
      "`kubectl top pod` fails with `error: Metrics API not available`. What is the cause?",
    options: [
      "The pods have no resource requests set",
      "metrics-server is not installed or not healthy",
      "RBAC forbids reading pod status",
      "The kubelet's cAdvisor endpoint must be enabled with a feature gate",
    ],
    answerIndex: 1,
    explanation:
      "`kubectl top` reads metrics.k8s.io, served by the metrics-server APIService. Check `kubectl -n kube-system get deploy metrics-server` and `kubectl get apiservices v1beta1.metrics.k8s.io`.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-usage-monitoring/",
  },
  {
    id: "ts-026",
    domain: D,
    topic: "Pod failures",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "A pod fails to start with `CreateContainerConfigError`. What are the likely causes and how do you confirm?",
    answer:
      "kubectl -n <ns> describe pod <pod>    # the Events line names the missing object\n\nCauses: a referenced ConfigMap or Secret does not exist in that namespace, a referenced key is missing (`configMapKeyRef`/`secretKeyRef` without `optional: true`), or a bad subPath.\n\nkubectl -n <ns> get cm,secret\nkubectl -n <ns> get pod <pod> -o jsonpath='{.spec.containers[*].envFrom}{.spec.volumes}'\n\nCreate the missing object (or mark the reference optional) and the kubelet proceeds.",
    rubric: [
      "Names missing ConfigMap/Secret or missing key as the cause",
      "Reads the pod Events to identify the specific object",
      "Verifies existence in the correct namespace",
      "Distinguishes this from ImagePullBackOff and CrashLoopBackOff",
      "Fixes by creating the object or marking the ref optional",
    ],
    explanation:
      "CreateContainerConfigError happens after a successful image pull, while the kubelet is assembling the container config — almost always an unresolvable env/volume reference.",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/",
  },
  {
    id: "ts-027",
    domain: D,
    topic: "Cluster components",
    difficulty: "hard",
    type: "command",
    prompt:
      "Check etcd health from the control-plane node using etcdctl with the kubeadm-installed certificates.",
    answer:
      "sudo ETCDCTL_API=3 etcdctl \\\n  --endpoints=https://127.0.0.1:2379 \\\n  --cacert=/etc/kubernetes/pki/etcd/ca.crt \\\n  --cert=/etc/kubernetes/pki/etcd/server.crt \\\n  --key=/etc/kubernetes/pki/etcd/server.key \\\n  endpoint health",
    accepted: [
      "etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key member list",
    ],
    explanation:
      "etcd requires mutual TLS. The exact cert paths are visible in /etc/kubernetes/manifests/etcd.yaml — read them rather than memorising. Same flags apply to `snapshot save`.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/",
  },
  {
    id: "ts-028",
    domain: D,
    topic: "Pod debugging",
    difficulty: "easy",
    type: "command",
    prompt:
      "Forward local port 8080 to port 80 of pod `web` in namespace `prod` to test it without a Service.",
    answer: "kubectl -n prod port-forward pod/web 8080:80",
    accepted: ["kubectl port-forward web 8080:80 -n prod"],
    explanation:
      "port-forward bypasses Services, kube-proxy and NetworkPolicies, so it isolates 'is the app itself listening?' from 'is the Service wiring right?'. It also works against svc/<name> and deploy/<name>.",
    doc: "https://kubernetes.io/docs/tasks/access-application-cluster/port-forward-access-application-cluster/",
  },
  {
    id: "ts-029",
    domain: D,
    topic: "Troubleshooting workflow",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "A pod shows `Evicted` with the message `The node was low on resource: ephemeral-storage`. What is the appropriate remediation?",
    options: [
      "Increase the pod's CPU limit",
      "Free disk on the node and set ephemeral-storage requests/limits on the workload",
      "Add a toleration for the disk-pressure taint",
      "Restart kube-proxy on the node",
    ],
    answerIndex: 1,
    explanation:
      "The kubelet evicts pods under DiskPressure. Clear logs/images on the node (`crictl rmi --prune`) and constrain workloads with ephemeral-storage requests/limits. Tolerating the taint just re-invites eviction.",
    doc: "https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/",
  },
  {
    id: "ts-030",
    domain: D,
    topic: "RBAC troubleshooting",
    difficulty: "medium",
    type: "command",
    prompt:
      "Verify whether ServiceAccount `ci` in namespace `build` may create deployments in that namespace, and list everything it can do there.",
    answer:
      "kubectl auth can-i create deployments --as=system:serviceaccount:build:ci -n build\nkubectl auth can-i --list --as=system:serviceaccount:build:ci -n build",
    accepted: [
      "kubectl auth can-i create deploy -n build --as system:serviceaccount:build:ci",
    ],
    explanation:
      "`--as` impersonates (your own user needs impersonation rights). The ServiceAccount username format is `system:serviceaccount:<namespace>:<name>`.",
    doc: "https://kubernetes.io/docs/reference/access-authn-authz/authorization/#checking-api-access",
  },
  {
    id: "ts-031",
    domain: D,
    topic: "Node troubleshooting",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "A worker node was rebuilt and `kubeadm join` now fails with `error execution phase preflight: couldn't validate the identity of the API Server: could not find a JWS signature`. Explain and fix.",
    answer:
      "The bootstrap token expired (kubeadm tokens default to 24h). On the control plane, mint a new one and print a ready-to-run join command:\n\nsudo kubeadm token create --print-join-command\n\nThen run that command on the worker. Also useful:\nsudo kubeadm token list\nOn a partially-joined worker, reset first: sudo kubeadm reset -f\nAfterwards remove the stale Node object if any: kubectl delete node <old-name>",
    rubric: [
      "Identifies the expired/invalid bootstrap token",
      "Uses `kubeadm token create --print-join-command` on the control plane",
      "Runs `kubeadm reset` on the worker if a previous attempt left state",
      "Verifies with `kubectl get nodes`",
      "Mentions deleting a stale Node object where relevant",
    ],
    explanation:
      "Join uses a bootstrap token plus the CA hash. Tokens are short-lived by design, so rebuilt nodes routinely need a fresh join command.",
    doc: "https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-token/",
  },
  {
    id: "ts-032",
    domain: D,
    topic: "Pod debugging",
    difficulty: "easy",
    type: "command",
    prompt:
      "Copy /var/log/app/error.log out of container `app` in pod `web` (namespace `prod`) to /tmp/error.log on your machine.",
    answer: "kubectl -n prod cp web:/var/log/app/error.log /tmp/error.log -c app",
    accepted: ["kubectl cp prod/web:/var/log/app/error.log /tmp/error.log -c app"],
    explanation:
      "`kubectl cp` needs `tar` in the container image. Source paths inside the pod must be absolute without a leading slash duplication; the namespace can be given with -n or as `ns/pod:path`.",
    doc: "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_cp/",
  },
  {
    id: "ts-033",
    domain: D,
    topic: "Services & networking troubleshooting",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "One specific pod cannot resolve DNS, while other pods in the same namespace resolve fine. Diagnose.",
    answer:
      "kubectl -n <ns> get pod <pod> -o jsonpath='{.spec.dnsPolicy}{\"\\n\"}{.spec.dnsConfig}'\nkubectl -n <ns> exec <pod> -- cat /etc/resolv.conf\n\nLook for dnsPolicy: Default or None (which bypasses cluster DNS), hostNetwork: true without dnsPolicy: ClusterFirstWithHostNet, a custom dnsConfig with a wrong nameserver, or a NetworkPolicy in the namespace that blocks egress to kube-dns on UDP/TCP 53.\n\nFix: set dnsPolicy: ClusterFirst (or ClusterFirstWithHostNet for hostNetwork pods) and allow egress to kube-system/kube-dns:53.",
    rubric: [
      "Inspects the pod's /etc/resolv.conf",
      "Checks dnsPolicy, including the hostNetwork + ClusterFirstWithHostNet case",
      "Considers a NetworkPolicy blocking egress to port 53",
      "Scopes the problem as pod-specific rather than blaming CoreDNS",
      "States the concrete fix",
    ],
    explanation:
      "Cluster DNS is injected per pod via dnsPolicy. hostNetwork pods silently fall back to the node's resolver unless ClusterFirstWithHostNet is set.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/#pod-s-dns-policy",
  },
  {
    id: "ts-034",
    domain: D,
    topic: "Troubleshooting workflow",
    difficulty: "easy",
    type: "command",
    prompt:
      "Show, for every pod in the cluster, its name, node and phase in a single custom-columns table.",
    answer:
      "kubectl get pods -A -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,NODE:.spec.nodeName,PHASE:.status.phase'",
    accepted: ["kubectl get pods --all-namespaces -o wide"],
    explanation:
      "custom-columns is the fastest way to answer 'write X and Y to a file' tasks. `-o wide` is the quick equivalent when exact columns are not demanded.",
    doc: "https://kubernetes.io/docs/reference/kubectl/quick-reference/",
  },
  {
    id: "ts-035",
    domain: D,
    topic: "Cluster components",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "Services stop load balancing on one node: pods on it can be reached by IP but not via ClusterIP. Which component is broken on that node?",
    options: ["CoreDNS", "kube-proxy", "kube-controller-manager", "etcd"],
    answerIndex: 1,
    explanation:
      "kube-proxy programs the per-node iptables/IPVS rules that translate ClusterIP to pod endpoints. Direct pod IP reachability proves the CNI works, isolating the failure to kube-proxy on that node.",
    doc: "https://kubernetes.io/docs/reference/command-line-tools-reference/kube-proxy/",
  },
  {
    id: "ts-036",
    domain: D,
    topic: "Troubleshooting workflow",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "You must record why a Deployment's rollout is stuck. Write the commands you would use, in order, and say what each tells you.",
    answer:
      "kubectl -n <ns> rollout status deployment/<name> --timeout=30s   # confirms it is stuck\nkubectl -n <ns> describe deployment <name>                       # conditions: ProgressDeadlineExceeded, ReplicaFailure\nkubectl -n <ns> get rs -l app=<name>                             # which ReplicaSet is not scaling\nkubectl -n <ns> describe rs <new-rs>                             # quota/limit-range/admission failures\nkubectl -n <ns> get pods -l app=<name>                           # pod-level state\nkubectl -n <ns> describe pod <pending-or-crashing-pod>           # events: scheduling, image, probes\nkubectl -n <ns> logs <pod> --previous                            # app-level cause\n\nIf the new revision is bad: kubectl -n <ns> rollout undo deployment/<name>",
    rubric: [
      "Works top-down: Deployment → ReplicaSet → Pod → container logs",
      "Reads Deployment conditions (ProgressDeadlineExceeded / ReplicaFailure)",
      "Inspects the new ReplicaSet for admission/quota errors",
      "Uses logs --previous for crashed containers",
      "Knows `rollout undo` as the rollback escape hatch",
    ],
    explanation:
      "The controller chain is Deployment → ReplicaSet → Pod. Following it in order localises the failure instead of guessing.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
  },
];
