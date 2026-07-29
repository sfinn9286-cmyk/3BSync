import type { Question } from "./types";

const D = "Services & Networking" as const;

export const networking: Question[] = [
  {
    id: "sn-001",
    domain: D,
    topic: "Service types",
    difficulty: "easy",
    type: "command",
    prompt:
      "Expose Deployment `web` in namespace `apps` on port 80 targeting container port 8080 as a ClusterIP Service named `web-svc`.",
    answer:
      "kubectl -n apps expose deployment web --name=web-svc --port=80 --target-port=8080",
    accepted: [
      "kubectl expose deploy web -n apps --name web-svc --port 80 --target-port 8080 --type=ClusterIP",
    ],
    explanation:
      "`expose` copies the Deployment's pod-template labels into the selector, which is why it is faster and safer than hand-writing a Service in the exam.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/service/",
  },
  {
    id: "sn-002",
    domain: D,
    topic: "Service types",
    difficulty: "easy",
    type: "mcq",
    prompt: "Which statement about a NodePort Service is correct?",
    options: [
      "It replaces the ClusterIP; the Service has no cluster-internal address",
      "It allocates a port (default range 30000–32767) on every node and also keeps a ClusterIP",
      "It only works on the node where the pod runs",
      "It requires a cloud provider load balancer",
    ],
    answerIndex: 1,
    explanation:
      "NodePort is a superset of ClusterIP: the ClusterIP still exists, and every node forwards the allocated port to the Service. LoadBalancer is in turn a superset of NodePort.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport",
  },
  {
    id: "sn-003",
    domain: D,
    topic: "Service types",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Create a headless Service `db-headless` in namespace `data` for pods labelled `app=db` on port 5432, and explain what DNS returns for it.",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: v1\nkind: Service\nmetadata:\n  name: db-headless\n  namespace: data\nspec:\n  clusterIP: None\n  selector:\n    app: db\n  ports:\n  - port: 5432\n    targetPort: 5432\nEOF\n\nDNS for db-headless.data.svc.cluster.local returns the A/AAAA records of each ready pod IP rather than a single virtual IP, which is what StatefulSets use for stable per-pod names.",
    rubric: [
      "Sets clusterIP: None",
      "Selector matches app=db",
      "Explains DNS returns pod IPs, not a single virtual IP",
      "No kube-proxy virtual IP / load balancing happens",
      "Mentions the StatefulSet use case or per-pod DNS names",
    ],
    verify: "kubectl -n data get svc db-headless",
    explanation:
      "Headless Services skip kube-proxy entirely; clients do their own selection from the returned records.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/service/#headless-services",
  },
  {
    id: "sn-004",
    domain: D,
    topic: "Endpoints",
    difficulty: "medium",
    type: "command",
    prompt:
      "List the backend IPs currently serving Service `web-svc` in namespace `apps` using the modern API object.",
    answer:
      "kubectl -n apps get endpointslices -l kubernetes.io/service-name=web-svc -o wide",
    accepted: [
      "kubectl -n apps describe endpointslice -l kubernetes.io/service-name=web-svc",
      "kubectl -n apps get endpoints web-svc",
    ],
    explanation:
      "EndpointSlices are the current mechanism (the legacy Endpoints object is deprecated but still populated for compatibility). They are labelled with `kubernetes.io/service-name`.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/",
  },
  {
    id: "sn-005",
    domain: D,
    topic: "Pod connectivity",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "Two pods on different nodes cannot reach each other, though pods on the same node can. Which component is most likely at fault?",
    options: [
      "CoreDNS",
      "kube-proxy's ClusterIP rules",
      "The CNI plugin / pod network overlay",
      "The API server aggregation layer",
    ],
    answerIndex: 2,
    explanation:
      "Cross-node pod-to-pod IP reachability is exactly what the CNI plugin provides. Same-node traffic can work via the local bridge even when the overlay or its routes are broken.",
    doc: "https://kubernetes.io/docs/concepts/cluster-administration/networking/",
  },
  {
    id: "sn-006",
    domain: D,
    topic: "Pod connectivity",
    difficulty: "easy",
    type: "command",
    prompt:
      "Forward local port 8080 to port 80 of Service `web-svc` in namespace `apps` so you can curl it from the exam terminal.",
    answer: "kubectl -n apps port-forward svc/web-svc 8080:80",
    accepted: ["kubectl port-forward service/web-svc 8080:80 -n apps"],
    explanation:
      "port-forward tunnels through the API server, so it works even without ingress or NodePort. Add `&` and then `curl localhost:8080` in the same shell.",
    doc: "https://kubernetes.io/docs/tasks/access-application-cluster/port-forward-access-application-cluster/",
  },
  {
    id: "sn-007",
    domain: D,
    topic: "NetworkPolicy",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "In namespace `prod`, allow ingress to pods labelled `app=db` on TCP 5432 only from pods labelled `app=api` in the same namespace, and deny all other ingress to those db pods. Write the manifest.",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: db-allow-api\n  namespace: prod\nspec:\n  podSelector:\n    matchLabels:\n      app: db\n  policyTypes:\n  - Ingress\n  ingress:\n  - from:\n    - podSelector:\n        matchLabels:\n          app: api\n    ports:\n    - protocol: TCP\n      port: 5432\nEOF",
    rubric: [
      "podSelector targets app=db (the pods being protected)",
      "policyTypes includes Ingress",
      "from uses podSelector app=api (no namespaceSelector needed for same namespace)",
      "port 5432 with protocol TCP",
      "Understands that selecting the pods at all makes all other ingress implicitly denied",
    ],
    verify: "kubectl -n prod describe networkpolicy db-allow-api",
    explanation:
      "NetworkPolicies are allow-lists: once a pod is selected by any policy with Ingress in policyTypes, everything not explicitly allowed is denied. Enforcement requires a policy-capable CNI (Calico, Cilium, etc.).",
    doc: "https://kubernetes.io/docs/concepts/services-networking/network-policies/",
  },
  {
    id: "sn-008",
    domain: D,
    topic: "NetworkPolicy",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "A NetworkPolicy in namespace `prod` has `podSelector: {}` and `policyTypes: [Ingress]` with no `ingress` rules. What is the effect?",
    options: [
      "No effect — an empty policy is ignored",
      "All ingress to all pods in `prod` is denied",
      "All ingress to all pods in `prod` is allowed",
      "All egress from all pods in `prod` is denied",
    ],
    answerIndex: 1,
    explanation:
      "An empty podSelector selects every pod in the namespace, and listing Ingress in policyTypes with no rules is the canonical default-deny-ingress policy.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/network-policies/#default-deny-all-ingress-traffic",
  },
  {
    id: "sn-009",
    domain: D,
    topic: "NetworkPolicy",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "Pods in namespace `apps` must be able to send egress only to DNS (UDP/TCP 53 in kube-system) and to pods labelled `app=cache` in namespace `data`. Everything else must be blocked. Write the policy.",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: restricted-egress\n  namespace: apps\nspec:\n  podSelector: {}\n  policyTypes:\n  - Egress\n  egress:\n  - to:\n    - namespaceSelector:\n        matchLabels:\n          kubernetes.io/metadata.name: kube-system\n    ports:\n    - protocol: UDP\n      port: 53\n    - protocol: TCP\n      port: 53\n  - to:\n    - namespaceSelector:\n        matchLabels:\n          kubernetes.io/metadata.name: data\n      podSelector:\n        matchLabels:\n          app: cache\nEOF",
    rubric: [
      "podSelector: {} to cover all pods in apps",
      "policyTypes: [Egress]",
      "Explicitly allows DNS on port 53 (UDP at minimum)",
      "Uses namespaceSelector + podSelector as a single `to` element (AND), not two elements (OR)",
      "Uses the built-in kubernetes.io/metadata.name label to select namespaces",
    ],
    verify: "kubectl -n apps get networkpolicy restricted-egress -o yaml",
    explanation:
      "Forgetting to allow DNS is the classic egress-policy bug — every name lookup fails and applications appear to hang. Note the AND/OR subtlety: selectors inside one list item are ANDed.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/network-policies/",
  },
  {
    id: "sn-010",
    domain: D,
    topic: "Ingress",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Create an Ingress `shop` in namespace `apps` routing host `shop.example.com` path `/` (prefix) to Service `web-svc:80`, using ingress class `nginx`.",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: shop\n  namespace: apps\nspec:\n  ingressClassName: nginx\n  rules:\n  - host: shop.example.com\n    http:\n      paths:\n      - path: /\n        pathType: Prefix\n        backend:\n          service:\n            name: web-svc\n            port:\n              number: 80\nEOF\n\nOr imperatively:\nkubectl -n apps create ingress shop --class=nginx --rule='shop.example.com/*=web-svc:80'",
    rubric: [
      "apiVersion networking.k8s.io/v1",
      "ingressClassName set to nginx (not the deprecated annotation)",
      "pathType: Prefix present — it is required in v1",
      "backend.service.name/port.number structure correct",
      "Correct namespace: the Ingress must live with the Service",
    ],
    verify: "kubectl -n apps describe ingress shop",
    explanation:
      "`kubectl create ingress --rule='host/path=svc:port'` is far faster than YAML under time pressure. An Ingress can only reference Services in its own namespace.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/ingress/",
  },
  {
    id: "sn-011",
    domain: D,
    topic: "Ingress",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "An Ingress exists and looks correct, but requests return 404 from nowhere and `kubectl describe ingress` shows no Address. What is the most likely cause?",
    options: [
      "pathType is missing",
      "No ingress controller is installed or the ingressClassName matches no controller",
      "The Service is of type ClusterIP",
      "TLS is not configured",
    ],
    answerIndex: 1,
    explanation:
      "An Ingress is inert data without a controller reconciling it. A missing Address in describe output is the tell. ClusterIP backends are perfectly normal for Ingress.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/",
  },
  {
    id: "sn-012",
    domain: D,
    topic: "Gateway API",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "Using Gateway API, route host `api.example.com` path prefix `/v1` to Service `api-svc:8080` in namespace `apps`, through an existing Gateway named `prod-gw` in namespace `infra`. Write the HTTPRoute.",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: gateway.networking.k8s.io/v1\nkind: HTTPRoute\nmetadata:\n  name: api\n  namespace: apps\nspec:\n  parentRefs:\n  - name: prod-gw\n    namespace: infra\n    kind: Gateway\n  hostnames:\n  - api.example.com\n  rules:\n  - matches:\n    - path:\n        type: PathPrefix\n        value: /v1\n    backendRefs:\n    - name: api-svc\n      port: 8080\nEOF",
    rubric: [
      "apiVersion gateway.networking.k8s.io/v1, kind HTTPRoute",
      "parentRefs points at the Gateway, including its namespace",
      "hostnames contains api.example.com",
      "matches uses path type PathPrefix with value /v1",
      "backendRefs names the Service and port",
    ],
    verify: "kubectl -n apps describe httproute api",
    explanation:
      "Gateway API splits responsibilities: GatewayClass (infrastructure), Gateway (listener, usually owned by platform team), HTTPRoute (app routing). Cross-namespace attachment additionally needs the Gateway's listener to allow routes from that namespace (allowedRoutes) or a ReferenceGrant for cross-namespace backends.",
    doc: "https://gateway-api.sigs.k8s.io/api-types/httproute/",
  },
  {
    id: "sn-013",
    domain: D,
    topic: "Gateway API",
    difficulty: "medium",
    type: "mcq",
    prompt: "Which Gateway API resource is cluster-scoped and names the controller implementation?",
    options: ["Gateway", "GatewayClass", "HTTPRoute", "ReferenceGrant"],
    answerIndex: 1,
    explanation:
      "GatewayClass is cluster-scoped and carries `spec.controllerName`, analogous to IngressClass. Gateway, HTTPRoute and ReferenceGrant are namespaced.",
    doc: "https://gateway-api.sigs.k8s.io/api-types/gatewayclass/",
  },
  {
    id: "sn-014",
    domain: D,
    topic: "CoreDNS",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "Pod `web` in namespace `apps` runs `curl db` and it fails, but `curl db.data` works. Why?",
    options: [
      "CoreDNS is misconfigured",
      "The pod's /etc/resolv.conf search path only expands unqualified names within its own namespace first",
      "Cross-namespace DNS requires a NetworkPolicy",
      "Short names are never resolvable in Kubernetes",
    ],
    answerIndex: 1,
    explanation:
      "resolv.conf search is `<ns>.svc.cluster.local svc.cluster.local cluster.local`, so a bare `db` resolves only in the pod's own namespace. Cross-namespace access needs at least `<svc>.<ns>`.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/",
  },
  {
    id: "sn-015",
    domain: D,
    topic: "CoreDNS",
    difficulty: "medium",
    type: "command",
    prompt:
      "Change CoreDNS so that queries it cannot answer are forwarded to 8.8.8.8, then roll the CoreDNS pods.",
    answer:
      "kubectl -n kube-system edit configmap coredns\n# change:  forward . /etc/resolv.conf   ->   forward . 8.8.8.8\nkubectl -n kube-system rollout restart deployment coredns",
    accepted: ["kubectl -n kube-system delete pod -l k8s-app=kube-dns"],
    explanation:
      "The `forward` plugin in the Corefile controls upstream resolution. CoreDNS reloads periodically, but a rollout restart makes the change immediate and verifiable.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/",
  },
  {
    id: "sn-016",
    domain: D,
    topic: "kube-proxy",
    difficulty: "medium",
    type: "mcq",
    prompt: "What does kube-proxy do in iptables/IPVS mode?",
    options: [
      "Terminates TLS for Ingress traffic",
      "Programs node-local rules that DNAT Service virtual IPs to backend pod IPs",
      "Assigns pod IP addresses",
      "Proxies every packet through a userspace process",
    ],
    answerIndex: 1,
    explanation:
      "kube-proxy watches Services/EndpointSlices and programs kernel rules; the data path stays in the kernel. Pod IP assignment belongs to the CNI plugin, and userspace proxying is the removed legacy mode.",
    doc: "https://kubernetes.io/docs/reference/networking/virtual-ips/",
  },
  {
    id: "sn-017",
    domain: D,
    topic: "Service troubleshooting",
    difficulty: "medium",
    type: "command",
    prompt:
      "A Service has endpoints but requests time out. Show the Service definition, the pod's declared ports, and test from inside the cluster in three commands.",
    answer:
      "kubectl -n <ns> get svc <svc> -o yaml\nkubectl -n <ns> get pod <pod> -o jsonpath='{.spec.containers[*].ports[*].containerPort}{\"\\n\"}'\nkubectl -n <ns> run tmp --rm -it --restart=Never --image=busybox:1.36 -- wget -qO- <svc>:<port>",
    explanation:
      "Timeouts (as opposed to refused) usually point at a NetworkPolicy or the wrong targetPort silently pointing at a closed port; refused usually means nothing is listening.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/",
  },
  {
    id: "sn-018",
    domain: D,
    topic: "Service types",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "Which Service field preserves the client source IP for NodePort/LoadBalancer traffic at the cost of losing cluster-wide load balancing?",
    options: [
      "spec.sessionAffinity: ClientIP",
      "spec.externalTrafficPolicy: Local",
      "spec.internalTrafficPolicy: Local",
      "spec.allocateLoadBalancerNodePorts: false",
    ],
    answerIndex: 1,
    explanation:
      "`externalTrafficPolicy: Local` stops the second hop of SNAT/forwarding to other nodes, keeping the client IP but only routing to pods on the receiving node. `internalTrafficPolicy` affects cluster-internal traffic instead.",
    doc: "https://kubernetes.io/docs/tasks/access-application-cluster/create-external-load-balancer/#preserving-the-client-source-ip",
  },
  {
    id: "sn-019",
    domain: D,
    topic: "Ingress",
    difficulty: "medium",
    type: "command",
    prompt:
      "Create an Ingress `multi` in namespace `web` with two rules on host `example.com`: `/app` to `app-svc:80` and `/api` to `api-svc:8080`, class nginx — imperatively.",
    answer:
      "kubectl -n web create ingress multi --class=nginx \\\n  --rule='example.com/app*=app-svc:80' \\\n  --rule='example.com/api*=api-svc:8080'",
    accepted: [
      "kubectl create ingress multi -n web --class nginx --rule 'example.com/app*=app-svc:80' --rule 'example.com/api*=api-svc:8080'",
    ],
    explanation:
      "A trailing `*` in the rule makes pathType Prefix; without it you get Exact. Repeat `--rule` per path.",
    doc: "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_ingress/",
  },
  {
    id: "sn-020",
    domain: D,
    topic: "CoreDNS",
    difficulty: "easy",
    type: "mcq",
    prompt:
      "What DNS name does a StatefulSet pod `web-0` get, given a headless Service `web` in namespace `apps`?",
    options: [
      "web-0.apps.svc.cluster.local",
      "web-0.web.apps.svc.cluster.local",
      "web.apps.svc.cluster.local/web-0",
      "web-0.pod.apps.cluster.local",
    ],
    answerIndex: 1,
    explanation:
      "The pattern is `<pod-name>.<governing-service>.<namespace>.svc.cluster.local`. Stable per-pod DNS is the main reason StatefulSets require a headless Service.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/#stable-network-id",
  },
  {
    id: "sn-021",
    domain: D,
    topic: "NetworkPolicy",
    difficulty: "medium",
    type: "command",
    prompt:
      "List all NetworkPolicies in the cluster and show which pods policy `db-allow-api` in namespace `prod` selects.",
    answer:
      "kubectl get networkpolicies -A\nkubectl -n prod describe networkpolicy db-allow-api",
    accepted: ["kubectl get netpol -A", "kubectl -n prod get netpol db-allow-api -o yaml"],
    explanation:
      "`describe` prints a readable summary of the pod selector and the allowed peers, which is quicker to sanity-check than raw YAML.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/network-policies/",
  },
  {
    id: "sn-022",
    domain: D,
    topic: "Pod connectivity",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "After a node reboot, all pods on it are stuck in `ContainerCreating` with events mentioning `failed to set up sandbox network: plugin not initialized`. Diagnose.",
    answer:
      "kubectl describe pod <pod>          # confirm the CNI error\nkubectl -n kube-system get pods -o wide | grep <node>   # is the CNI DaemonSet pod running there?\nssh <node>\nls /etc/cni/net.d/                 # CNI config present?\njournalctl -u kubelet | grep -i cni\nsudo crictl pods\n# fix: restart/repair the CNI DaemonSet pod, restore the CNI conf, restart kubelet\nkubectl -n kube-system rollout restart daemonset <cni-daemonset>",
    rubric: [
      "Reads pod events to confirm it is a CNI sandbox failure",
      "Checks the CNI DaemonSet pod on that specific node",
      "Checks /etc/cni/net.d on the node",
      "Uses crictl / kubelet journal on the node",
      "Recovers by restarting the CNI pod or kubelet, then re-checks pod status",
    ],
    verify: "kubectl get pods -o wide --field-selector spec.nodeName=<node>",
    explanation:
      "The kubelet cannot create a pod sandbox until a CNI plugin config exists and the plugin binary works; this manifests as indefinite ContainerCreating rather than a crash.",
    doc: "https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/",
  },
  {
    id: "sn-023",
    domain: D,
    topic: "Ingress",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Terminate TLS for host `shop.example.com` on Ingress `shop` in namespace `apps` using an existing certificate and key file pair. Show the commands.",
    answer:
      "kubectl -n apps create secret tls shop-tls --cert=/opt/shop.crt --key=/opt/shop.key\n\nkubectl -n apps patch ingress shop --type=merge -p '{\"spec\":{\"tls\":[{\"hosts\":[\"shop.example.com\"],\"secretName\":\"shop-tls\"}]}}'",
    rubric: [
      "Creates a kubernetes.io/tls Secret with `create secret tls --cert --key`",
      "Secret is in the same namespace as the Ingress",
      "Adds spec.tls with hosts and secretName",
      "Host in tls matches the rule host",
      "Verifies with describe/curl",
    ],
    verify: "kubectl -n apps get ingress shop -o yaml | grep -A4 tls",
    explanation:
      "`create secret tls` produces the `kubernetes.io/tls` type with `tls.crt`/`tls.key` keys — the only shape an Ingress controller accepts.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/ingress/#tls",
  },
  {
    id: "sn-024",
    domain: D,
    topic: "Service types",
    difficulty: "easy",
    type: "command",
    prompt:
      "Create a NodePort Service for Deployment `web` in namespace `apps` on port 80, pinned to node port 30080.",
    answer:
      "kubectl -n apps expose deployment web --name=web-np --type=NodePort --port=80 --target-port=8080\nkubectl -n apps patch svc web-np -p '{\"spec\":{\"ports\":[{\"port\":80,\"targetPort\":8080,\"nodePort\":30080}]}}'",
    accepted: [
      "kubectl -n apps create service nodeport web-np --tcp=80:8080 --node-port=30080",
    ],
    explanation:
      "`expose` cannot set a specific nodePort, so either patch afterwards or use `create service nodeport --node-port`. Note `create service` writes its own selector (`app=<name>`), which may not match your pods.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport",
  },
];
