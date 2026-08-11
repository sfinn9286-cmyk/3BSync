import type { Question } from "./types";

const TS = "Troubleshooting" as const;
const CA = "Cluster Architecture, Installation & Configuration" as const;
const SN = "Services & Networking" as const;
const WS = "Workloads & Scheduling" as const;
const ST = "Storage" as const;

const deployment = (
  name: string,
  namespace: string,
  image: string,
  replicas: number,
  extra: Record<string, unknown> = {},
) => ({
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: { name, namespace, labels: { app: name } },
  spec: {
    replicas,
    selector: { matchLabels: { app: name } },
    template: {
      metadata: { labels: { app: name } },
      spec: { containers: [{ name, image, ...extra }] },
    },
  },
});

export const labs: Question[] = [
  {
    id: "lab-001",
    domain: CA,
    topic: "RBAC",
    difficulty: "medium",
    type: "lab",
    prompt:
      "In namespace `dev`: create a ServiceAccount named `ci`, a Role named `pod-reader` that allows get, list and watch on pods, and a RoleBinding named `ci-pod-reader` that grants that Role to the `ci` ServiceAccount.",
    answer:
      "kubectl -n dev create serviceaccount ci\nkubectl -n dev create role pod-reader --verb=get,list,watch --resource=pods\nkubectl -n dev create rolebinding ci-pod-reader --role=pod-reader --serviceaccount=dev:ci\n\n# verify\nkubectl -n dev auth can-i list pods --as=system:serviceaccount:dev:ci",
    explanation:
      "`--serviceaccount` on a rolebinding takes `namespace:name`, and the binding must live in the namespace whose pods you are granting access to. `kubectl auth can-i --as=system:serviceaccount:<ns>:<name>` is the fastest confirmation that the three objects line up.",
    doc: "https://kubernetes.io/docs/reference/access-authn-authz/rbac/",
    lab: {
      brief: "Namespace `dev` exists and is empty.",
      init: { namespaces: ["dev"] },
      checks: [
        { description: "ServiceAccount dev/ci exists", kind: "ServiceAccount", name: "ci", namespace: "dev" },
        { description: "Role dev/pod-reader covers pods", kind: "Role", name: "pod-reader", namespace: "dev", path: "rules[0].resources", contains: "pods" },
        { description: "Role allows get, list and watch", kind: "Role", name: "pod-reader", namespace: "dev", path: "rules[0].verbs", contains: "watch" },
        { description: "RoleBinding ci-pod-reader references Role pod-reader", kind: "RoleBinding", name: "ci-pod-reader", namespace: "dev", path: "roleRef.name", equals: "pod-reader" },
        { description: "RoleBinding subject is ServiceAccount ci", kind: "RoleBinding", name: "ci-pod-reader", namespace: "dev", path: "subjects[0].name", equals: "ci" },
      ],
    },
  },
  {
    id: "lab-002",
    domain: WS,
    topic: "Deployments",
    difficulty: "easy",
    type: "lab",
    prompt:
      "Deployment `web` in the `default` namespace runs 2 replicas of `nginx:1.25`. Scale it to 4 replicas and roll it forward to `nginx:1.27`.",
    answer:
      "kubectl scale deployment web --replicas=4\nkubectl set image deployment/web web=nginx:1.27\nkubectl rollout status deployment/web",
    explanation:
      "`kubectl set image` names the *container*, not the deployment, on the left of the `=`. Scaling and image changes are independent: scaling edits `spec.replicas`, the image change edits the pod template and therefore triggers a new rollout.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
    lab: {
      brief: "Deployment `web` is healthy on nginx:1.25 with 2 replicas.",
      init: { resources: [deployment("web", "default", "nginx:1.25", 2)] },
      checks: [
        { description: "Deployment web has 4 replicas", kind: "Deployment", name: "web", namespace: "default", path: "spec.replicas", equals: 4 },
        { description: "Pod template uses nginx:1.27", kind: "Deployment", name: "web", namespace: "default", path: "spec.template.spec.containers[0].image", equals: "nginx:1.27" },
        { description: "4 web pods are running", kind: "Pod", namespace: "default", selector: "app=web", count: 4 },
      ],
    },
  },
  {
    id: "lab-003",
    domain: TS,
    topic: "Pod troubleshooting",
    difficulty: "medium",
    type: "lab",
    prompt:
      "Deployment `api` in namespace `prod` is not serving. Its pods never reach Ready. Diagnose the cause and roll the deployment onto the working image `nginx:1.27`.",
    answer:
      "kubectl -n prod get pods\nkubectl -n prod describe pods -l app=api          # Failed to pull image ... not found\nkubectl -n prod set image deployment/api api=nginx:1.27\nkubectl -n prod rollout status deployment/api",
    explanation:
      "`ImagePullBackOff` is a node-level failure to fetch the image, so the container never starts and no application log exists yet — `describe` (Events), not `logs`, is where the reason appears. Fixing the tag in the pod template is enough; the ReplicaSet controller replaces the broken pods.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/",
    lab: {
      brief: "Deployment `api` in `prod` has 2 replicas stuck pulling their image.",
      init: {
        namespaces: ["prod"],
        resources: [
          deployment("api", "prod", "nginx:1.99-hardened", 2),
          {
            apiVersion: "v1",
            kind: "Pod",
            metadata: {
              name: "api-7c9f4d8b6-2xk4p",
              namespace: "prod",
              labels: { app: "api" },
              ownerReferences: [{ kind: "Deployment", name: "api" }],
            },
            spec: { containers: [{ name: "api", image: "nginx:1.99-hardened" }] },
            status: {
              phase: "Pending",
              nodeName: "node01",
              containerStatuses: [
                {
                  name: "api",
                  ready: false,
                  restartCount: 0,
                  state: { waiting: { reason: "ImagePullBackOff", message: 'Back-off pulling image "nginx:1.99-hardened"' } },
                },
              ],
              events: [
                'Failed to pull image "nginx:1.99-hardened": failed to resolve reference: not found',
                "Error: ErrImagePull",
              ],
            },
          },
        ],
      },
      checks: [
        { description: "Deployment api runs nginx:1.27", kind: "Deployment", name: "api", namespace: "prod", path: "spec.template.spec.containers[0].image", equals: "nginx:1.27" },
        { description: "No pod is left in ImagePullBackOff", kind: "Pod", namespace: "prod", path: "status.containerStatuses[0].state.waiting.reason", contains: "ImagePull", absent: true },
        { description: "At least 2 api pods exist", kind: "Pod", namespace: "prod", selector: "app=api", minCount: 2 },
      ],
    },
  },
  {
    id: "lab-004",
    domain: WS,
    topic: "Scheduling",
    difficulty: "hard",
    type: "lab",
    prompt:
      "Create a pod named `admin-tool` in `default` using image `busybox:1.36` that runs *on the control-plane node* `controlplane`. It must tolerate the control-plane `NoSchedule` taint and be pinned to that node with a nodeSelector on `kubernetes.io/hostname`.",
    answer:
      "kubectl apply -f - <<EOF\napiVersion: v1\nkind: Pod\nmetadata:\n  name: admin-tool\nspec:\n  nodeSelector:\n    kubernetes.io/hostname: controlplane\n  tolerations:\n  - key: node-role.kubernetes.io/control-plane\n    operator: Exists\n    effect: NoSchedule\n  containers:\n  - name: admin-tool\n    image: busybox:1.36\n    command: [\"sleep\", \"3600\"]\nEOF",
    explanation:
      "A toleration only *permits* scheduling onto a tainted node; it never attracts a pod there. Pinning needs a nodeSelector (or nodeName/affinity) as well. `operator: Exists` matches the control-plane taint, which has an empty value.",
    doc: "https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/",
    lab: {
      brief: "Two nodes: `controlplane` (tainted NoSchedule) and `node01`.",
      init: {},
      checks: [
        { description: "Pod admin-tool exists in default", kind: "Pod", name: "admin-tool", namespace: "default" },
        { description: "Uses image busybox:1.36", kind: "Pod", name: "admin-tool", namespace: "default", path: "spec.containers[0].image", equals: "busybox:1.36" },
        { description: "Tolerates the control-plane taint", kind: "Pod", name: "admin-tool", namespace: "default", path: "spec.tolerations", contains: "node-role.kubernetes.io/control-plane" },
        { description: "Pinned to controlplane with a nodeSelector", kind: "Pod", name: "admin-tool", namespace: "default", path: "spec.nodeSelector", contains: "controlplane" },
      ],
    },
  },
  {
    id: "lab-005",
    domain: SN,
    topic: "Services",
    difficulty: "medium",
    type: "lab",
    prompt:
      "Service `web-svc` in namespace `prod` has no endpoints even though the `web` pods are Running. Find the mismatch and fix the Service so it selects those pods.",
    answer:
      "kubectl -n prod get endpoints web-svc            # <none>\nkubectl -n prod get pods --show-labels             # app=web\nkubectl -n prod get svc web-svc -o yaml | grep -A2 selector   # app=webapp\nkubectl -n prod patch svc web-svc -p '{\"spec\":{\"selector\":{\"app\":\"web\"}}}'\nkubectl -n prod get endpoints web-svc",
    explanation:
      "A Service builds its EndpointSlice by label-matching pods in its own namespace. An empty endpoint list with healthy pods is nearly always a selector/label mismatch or a wrong targetPort — compare `kubectl get pods --show-labels` against the Service selector.",
    doc: "https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/",
    lab: {
      brief: "Namespace `prod`: deployment `web` (2 pods, label app=web) and Service `web-svc`.",
      init: {
        namespaces: ["prod"],
        resources: [
          deployment("web", "prod", "nginx:1.27", 2),
          {
            apiVersion: "v1",
            kind: "Service",
            metadata: { name: "web-svc", namespace: "prod" },
            spec: {
              type: "ClusterIP",
              clusterIP: "10.96.11.4",
              selector: { app: "webapp" },
              ports: [{ port: 80, targetPort: 80, protocol: "TCP" }],
            },
          },
        ],
      },
      checks: [
        { description: "Service web-svc selects app=web", kind: "Service", name: "web-svc", namespace: "prod", path: "spec.selector.app", equals: "web" },
        { description: "web-svc has at least 2 endpoints", kind: "Service", name: "web-svc", namespace: "prod", path: "status.endpointCount", gte: 2 },
      ],
    },
  },
  {
    id: "lab-006",
    domain: SN,
    topic: "Services",
    difficulty: "easy",
    type: "lab",
    prompt:
      "Deployment `hello` in `default` listens on container port 80. Expose it as a NodePort Service named `hello-svc` on port 80.",
    answer:
      "kubectl expose deployment hello --name=hello-svc --port=80 --target-port=80 --type=NodePort\nkubectl get svc hello-svc",
    explanation:
      "`kubectl expose` copies the workload's selector into the Service, which is why it is safer than hand-writing one. `--port` is the Service port, `--target-port` is the container port; NodePort also allocates a port in 30000–32767 on every node.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/service/",
    lab: {
      brief: "Deployment `hello` runs 2 replicas of nginx:1.27 with label app=hello.",
      init: { resources: [deployment("hello", "default", "nginx:1.27", 2, { ports: [{ containerPort: 80 }] })] },
      checks: [
        { description: "Service hello-svc exists", kind: "Service", name: "hello-svc", namespace: "default" },
        { description: "Type is NodePort", kind: "Service", name: "hello-svc", namespace: "default", path: "spec.type", equals: "NodePort" },
        { description: "Service port is 80", kind: "Service", name: "hello-svc", namespace: "default", path: "spec.ports[0].port", equals: 80 },
        { description: "Selects the hello pods", kind: "Service", name: "hello-svc", namespace: "default", path: "spec.selector", contains: "hello" },
        { description: "Endpoints are populated", kind: "Service", name: "hello-svc", namespace: "default", path: "status.endpointCount", gte: 2 },
      ],
    },
  },
  {
    id: "lab-007",
    domain: SN,
    topic: "NetworkPolicy",
    difficulty: "medium",
    type: "lab",
    prompt:
      "In namespace `secure`, create a NetworkPolicy named `default-deny-ingress` that denies all incoming traffic to every pod in the namespace while leaving egress untouched.",
    answer:
      "kubectl apply -f - <<EOF\napiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: default-deny-ingress\n  namespace: secure\nspec:\n  podSelector: {}\n  policyTypes:\n  - Ingress\nEOF",
    explanation:
      "An empty `podSelector: {}` selects every pod in the namespace. Listing `Ingress` in `policyTypes` with no `ingress` rules denies all inbound traffic; because `Egress` is not listed, outbound traffic stays allowed. Policies are namespaced and additive — nothing else can re-allow what no rule permits.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/network-policies/",
    lab: {
      brief: "Namespace `secure` holds deployment `payments` (2 pods).",
      init: { namespaces: ["secure"], resources: [deployment("payments", "secure", "nginx:1.27", 2)] },
      checks: [
        { description: "NetworkPolicy secure/default-deny-ingress exists", kind: "NetworkPolicy", name: "default-deny-ingress", namespace: "secure" },
        { description: "Selects all pods (empty podSelector)", kind: "NetworkPolicy", name: "default-deny-ingress", namespace: "secure", path: "spec.podSelector", contains: "{}" },
        { description: "policyTypes contains Ingress", kind: "NetworkPolicy", name: "default-deny-ingress", namespace: "secure", path: "spec.policyTypes", contains: "Ingress" },
        { description: "Does not also deny egress", kind: "NetworkPolicy", name: "default-deny-ingress", namespace: "secure", path: "spec.policyTypes", contains: "Egress", absent: true },
      ],
    },
  },
  {
    id: "lab-008",
    domain: SN,
    topic: "Ingress",
    difficulty: "medium",
    type: "lab",
    prompt:
      "Create an Ingress named `shop` in `default`, ingress class `nginx`, that routes host `shop.example.com` path `/` to Service `shop-svc` on port 80.",
    answer:
      "kubectl create ingress shop --class=nginx --rule=\"shop.example.com/*=shop-svc:80\"\nkubectl get ingress shop",
    explanation:
      "`create ingress --rule=\"host/path=service:port\"` is the fastest route on the exam; a trailing `*` in the path makes it `pathType: Prefix`. The Ingress only publishes routes — an ingress controller matching `--class` must exist for traffic to flow.",
    doc: "https://kubernetes.io/docs/concepts/services-networking/ingress/",
    lab: {
      brief: "Service `shop-svc` already fronts the shop pods on port 80.",
      init: {
        resources: [
          deployment("shop", "default", "nginx:1.27", 2),
          {
            apiVersion: "v1",
            kind: "Service",
            metadata: { name: "shop-svc", namespace: "default" },
            spec: { type: "ClusterIP", clusterIP: "10.96.4.7", selector: { app: "shop" }, ports: [{ port: 80, targetPort: 80, protocol: "TCP" }] },
          },
        ],
      },
      checks: [
        { description: "Ingress shop exists in default", kind: "Ingress", name: "shop", namespace: "default" },
        { description: "Ingress class is nginx", kind: "Ingress", name: "shop", namespace: "default", path: "spec.ingressClassName", equals: "nginx" },
        { description: "Host is shop.example.com", kind: "Ingress", name: "shop", namespace: "default", path: "spec.rules[0].host", equals: "shop.example.com" },
        { description: "Backend is shop-svc:80", kind: "Ingress", name: "shop", namespace: "default", path: "spec.rules[0].http.paths[0].backend.service", contains: "shop-svc" },
      ],
    },
  },
  {
    id: "lab-009",
    domain: ST,
    topic: "PersistentVolumes",
    difficulty: "medium",
    type: "lab",
    prompt:
      "PersistentVolume `data-pv` (2Gi, storageClassName `manual`) is Available. In `default`, create a PersistentVolumeClaim `data-pvc` requesting 1Gi ReadWriteOnce from class `manual`, then a pod `data-user` (image `nginx:1.27`) that mounts it at `/data`.",
    answer:
      "kubectl apply -f - <<EOF\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: data-pvc\nspec:\n  storageClassName: manual\n  accessModes: [\"ReadWriteOnce\"]\n  resources:\n    requests:\n      storage: 1Gi\n---\napiVersion: v1\nkind: Pod\nmetadata:\n  name: data-user\nspec:\n  volumes:\n  - name: data\n    persistentVolumeClaim:\n      claimName: data-pvc\n  containers:\n  - name: web\n    image: nginx:1.27\n    volumeMounts:\n    - name: data\n      mountPath: /data\nEOF\n\nkubectl get pvc data-pvc",
    explanation:
      "A claim binds to any PV whose class, access modes and capacity satisfy it — a 1Gi request legitimately binds a 2Gi volume, and the pod then gets the full 2Gi. Pods reference storage only through the claim name, never the PV.",
    doc: "https://kubernetes.io/docs/concepts/storage/persistent-volumes/",
    lab: {
      brief: "One Available PV `data-pv`, 2Gi, class `manual`, hostPath /mnt/data.",
      init: {
        resources: [
          {
            apiVersion: "v1",
            kind: "PersistentVolume",
            metadata: { name: "data-pv" },
            spec: {
              capacity: { storage: "2Gi" },
              accessModes: ["ReadWriteOnce"],
              storageClassName: "manual",
              persistentVolumeReclaimPolicy: "Retain",
              hostPath: { path: "/mnt/data" },
            },
            status: { phase: "Available" },
          },
        ],
      },
      checks: [
        { description: "PVC default/data-pvc exists", kind: "PersistentVolumeClaim", name: "data-pvc", namespace: "default" },
        { description: "PVC requests class manual", kind: "PersistentVolumeClaim", name: "data-pvc", namespace: "default", path: "spec.storageClassName", equals: "manual" },
        { description: "PVC is Bound", kind: "PersistentVolumeClaim", name: "data-pvc", namespace: "default", path: "status.phase", equals: "Bound" },
        { description: "Pod data-user mounts the claim", kind: "Pod", name: "data-user", namespace: "default", path: "spec.volumes", contains: "data-pvc" },
        { description: "Mounted at /data", kind: "Pod", name: "data-user", namespace: "default", path: "spec.containers[0].volumeMounts", contains: "/data" },
      ],
    },
  },
  {
    id: "lab-010",
    domain: WS,
    topic: "ConfigMaps & Secrets",
    difficulty: "easy",
    type: "lab",
    prompt:
      "In `default`, create a ConfigMap `app-config` holding `APP_MODE=production` and `LOG_LEVEL=warn`, then a pod `configured` (image `nginx:1.27`) that loads every key from it as environment variables via `envFrom`.",
    answer:
      "kubectl create configmap app-config --from-literal=APP_MODE=production --from-literal=LOG_LEVEL=warn\n\nkubectl apply -f - <<EOF\napiVersion: v1\nkind: Pod\nmetadata:\n  name: configured\nspec:\n  containers:\n  - name: web\n    image: nginx:1.27\n    envFrom:\n    - configMapRef:\n        name: app-config\nEOF",
    explanation:
      "`envFrom.configMapRef` injects every key as an env var, whereas `env[].valueFrom.configMapKeyRef` picks one key and can rename it. Environment variables are read once at container start — editing the ConfigMap later does not update a running pod (mounted volumes do refresh).",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/",
    lab: {
      brief: "Empty `default` namespace.",
      init: {},
      checks: [
        { description: "ConfigMap app-config exists", kind: "ConfigMap", name: "app-config", namespace: "default" },
        { description: "APP_MODE=production", kind: "ConfigMap", name: "app-config", namespace: "default", path: "data.APP_MODE", equals: "production" },
        { description: "LOG_LEVEL=warn", kind: "ConfigMap", name: "app-config", namespace: "default", path: "data.LOG_LEVEL", equals: "warn" },
        { description: "Pod configured uses envFrom on app-config", kind: "Pod", name: "configured", namespace: "default", path: "spec.containers[0].envFrom", contains: "app-config" },
      ],
    },
  },
  {
    id: "lab-011",
    domain: CA,
    topic: "Node maintenance",
    difficulty: "medium",
    type: "lab",
    prompt:
      "`node01` needs a kernel patch. Safely evict its workload and mark it unschedulable, ignoring DaemonSet-managed pods.",
    answer:
      "kubectl drain node01 --ignore-daemonsets --delete-emptydir-data\nkubectl get nodes\n\n# once the patch is done, bring it back with:\n#   kubectl uncordon node01",
    explanation:
      "`drain` cordons the node first, then evicts pods honouring PodDisruptionBudgets. DaemonSet pods are never rescheduled elsewhere, so drain refuses to proceed until you pass `--ignore-daemonsets`; `--delete-emptydir-data` is required when a pod would lose emptyDir contents. Cordoning alone (`kubectl cordon`) stops new pods but leaves running ones in place.",
    doc: "https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/",
    lab: {
      brief: "Deployment `web` (3 replicas) spreads across `controlplane` and `node01`; a DaemonSet also runs there.",
      init: {
        resources: [
          deployment("web", "default", "nginx:1.27", 3),
          {
            apiVersion: "apps/v1",
            kind: "DaemonSet",
            metadata: { name: "log-agent", namespace: "kube-system", labels: { app: "log-agent" } },
            spec: {
              selector: { matchLabels: { app: "log-agent" } },
              template: { metadata: { labels: { app: "log-agent" } }, spec: { containers: [{ name: "agent", image: "fluent/fluent-bit:3.1" }] } },
            },
          },
        ],
      },
      checks: [
        { description: "node01 is unschedulable (cordoned)", kind: "Node", name: "node01", path: "spec.unschedulable", equals: true },
        { description: "No deployment pod is left running on node01", kind: "Pod", namespace: "default", selector: "app=web", path: "status.nodeName", equals: "node01", absent: true },
        { description: "The web deployment still has 3 pods", kind: "Pod", namespace: "default", selector: "app=web", count: 3 },
      ],
    },
  },
  {
    id: "lab-012",
    domain: WS,
    topic: "Jobs & CronJobs",
    difficulty: "easy",
    type: "lab",
    prompt:
      "Create a CronJob named `report` in `default` that runs `busybox:1.36` with the command `date` every five minutes.",
    answer:
      "kubectl create cronjob report --image=busybox:1.36 --schedule=\"*/5 * * * *\" -- date\nkubectl get cronjob report",
    explanation:
      "Everything after `--` becomes the container command. Cron fields are minute, hour, day-of-month, month, day-of-week, so `*/5 * * * *` is every fifth minute. A CronJob creates a Job per trigger; the Job creates the pod.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/",
    lab: {
      brief: "Empty `default` namespace.",
      init: {},
      checks: [
        { description: "CronJob report exists", kind: "CronJob", name: "report", namespace: "default" },
        { description: "Schedule is */5 * * * *", kind: "CronJob", name: "report", namespace: "default", path: "spec.schedule", equals: "*/5 * * * *" },
        { description: "Runs busybox:1.36", kind: "CronJob", name: "report", namespace: "default", path: "spec.jobTemplate.spec.template.spec.containers[0].image", equals: "busybox:1.36" },
        { description: "Command is date", kind: "CronJob", name: "report", namespace: "default", path: "spec.jobTemplate.spec.template.spec.containers[0].command", contains: "date" },
      ],
    },
  },
  {
    id: "lab-013",
    domain: CA,
    topic: "Namespaces & quotas",
    difficulty: "medium",
    type: "lab",
    prompt:
      "Create namespace `staging` and a ResourceQuota named `staging-quota` in it that caps the namespace at 5 pods and 2 CPU of total requests.",
    answer:
      "kubectl create namespace staging\n\nkubectl apply -f - <<EOF\napiVersion: v1\nkind: ResourceQuota\nmetadata:\n  name: staging-quota\n  namespace: staging\nspec:\n  hard:\n    pods: \"5\"\n    requests.cpu: \"2\"\nEOF",
    explanation:
      "Quota values are strings in `spec.hard`. Once a quota constrains `requests.cpu`, every new pod in that namespace must declare a CPU request or the API server rejects it — a classic cause of \"worked yesterday\" scheduling failures.",
    doc: "https://kubernetes.io/docs/concepts/policy/resource-quotas/",
    lab: {
      brief: "Fresh cluster, no `staging` namespace yet.",
      init: {},
      checks: [
        { description: "Namespace staging exists", kind: "Namespace", name: "staging" },
        { description: "ResourceQuota staging-quota exists in staging", kind: "ResourceQuota", name: "staging-quota", namespace: "staging" },
        { description: "Pod count capped at 5", kind: "ResourceQuota", name: "staging-quota", namespace: "staging", path: "spec.hard.pods", equals: "5" },
        { description: "requests.cpu capped at 2", kind: "ResourceQuota", name: "staging-quota", namespace: "staging", path: "spec.hard", contains: "requests.cpu\":\"2" },
      ],
    },
  },
  {
    id: "lab-014",
    domain: TS,
    topic: "Scheduling failures",
    difficulty: "hard",
    type: "lab",
    prompt:
      "Pod `api` in namespace `dev` is stuck `Pending`; the nodes have 2 CPU each. Recreate the pod (same name, same image `nginx:1.27`) with a CPU request of `500m` so it schedules.",
    answer:
      "kubectl -n dev describe pod api        # 0/2 nodes are available: Insufficient cpu\nkubectl -n dev delete pod api\n\nkubectl -n dev apply -f - <<EOF\napiVersion: v1\nkind: Pod\nmetadata:\n  name: api\n  namespace: dev\nspec:\n  containers:\n  - name: api\n    image: nginx:1.27\n    resources:\n      requests:\n        cpu: 500m\nEOF",
    explanation:
      "The scheduler fits pods by summing *requests* against node allocatable — actual usage and limits are irrelevant to placement. A container's resources are immutable on a running pod, so the fix is delete-and-recreate (or edit the controller's template, if one owns the pod).",
    doc: "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/",
    lab: {
      brief: "Namespace `dev` with one Pending pod `api` requesting 4 CPU.",
      init: {
        namespaces: ["dev"],
        resources: [
          {
            apiVersion: "v1",
            kind: "Pod",
            metadata: { name: "api", namespace: "dev", labels: { app: "api" } },
            spec: { containers: [{ name: "api", image: "nginx:1.27", resources: { requests: { cpu: "4" } } }] },
            status: {
              phase: "Pending",
              conditions: [{ type: "PodScheduled", status: "False", reason: "Unschedulable" }],
              events: ["0/2 nodes are available: 2 Insufficient cpu. preemption: 0/2 nodes are available"],
            },
          },
        ],
      },
      checks: [
        { description: "Pod dev/api exists", kind: "Pod", name: "api", namespace: "dev" },
        { description: "CPU request is 500m", kind: "Pod", name: "api", namespace: "dev", path: "spec.containers[0].resources.requests.cpu", equals: "500m" },
        { description: "Pod is Running", kind: "Pod", name: "api", namespace: "dev", path: "status.phase", equals: "Running" },
      ],
    },
  },
];
