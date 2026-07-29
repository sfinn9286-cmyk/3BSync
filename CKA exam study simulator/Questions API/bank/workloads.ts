import type { Question } from "./types";

const D = "Workloads & Scheduling" as const;

export const workloads: Question[] = [
  {
    id: "ws-001",
    domain: D,
    topic: "Deployments",
    difficulty: "easy",
    type: "command",
    prompt:
      "Create Deployment `web` with image nginx:1.27, 3 replicas, in namespace `apps` — then generate the YAML for it without creating anything.",
    answer:
      "kubectl -n apps create deployment web --image=nginx:1.27 --replicas=3\nkubectl -n apps create deployment web --image=nginx:1.27 --replicas=3 --dry-run=client -o yaml > web.yaml",
    accepted: [
      "kubectl create deploy web --image nginx:1.27 --replicas 3 -n apps -o yaml --dry-run=client",
    ],
    explanation:
      "`--dry-run=client -o yaml` is the single most valuable exam habit: generate a skeleton, edit it, apply it, instead of typing manifests from memory.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
  },
  {
    id: "ws-002",
    domain: D,
    topic: "Rolling updates",
    difficulty: "medium",
    type: "command",
    prompt:
      "Update Deployment `web` in `apps` to image nginx:1.28, watch the rollout, then roll it back to the previous revision.",
    answer:
      "kubectl -n apps set image deployment/web nginx=nginx:1.28\nkubectl -n apps rollout status deployment/web\nkubectl -n apps rollout undo deployment/web",
    accepted: [
      "kubectl -n apps rollout history deployment/web then kubectl -n apps rollout undo deployment/web --to-revision=<n>",
    ],
    explanation:
      "`set image deployment/<name> <container>=<image>` — the container name matters. `rollout history` lists revisions; `rollout undo --to-revision` targets a specific one.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment",
  },
  {
    id: "ws-003",
    domain: D,
    topic: "Rolling updates",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "A Deployment with 10 replicas has `maxSurge: 2` and `maxUnavailable: 0`. During a rolling update, what is the maximum number of pods that can exist?",
    options: ["10", "11", "12", "20"],
    answerIndex: 2,
    explanation:
      "maxSurge allows 2 pods above the desired count, so at most 12 exist. maxUnavailable: 0 guarantees 10 remain available throughout, which is why surge capacity is required.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment",
  },
  {
    id: "ws-004",
    domain: D,
    topic: "Rolling updates",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "A rollout of Deployment `web` is stuck: `kubectl rollout status` never finishes and new pods are ImagePullBackOff. Restore service quickly and explain why old pods still serve traffic.",
    answer:
      "kubectl -n apps rollout undo deployment/web\nkubectl -n apps rollout status deployment/web\n\nThe RollingUpdate strategy only removes old pods as new ones become Ready. Because the new pods never pass readiness, maxUnavailable keeps most of the old ReplicaSet running, so the Service keeps routing to healthy old pods. Fix the image reference (typo/tag/imagePullSecret) before retrying.",
    rubric: [
      "Uses rollout undo (or corrects the image) rather than deleting the Deployment",
      "Explains that unready new pods are never added to Service endpoints",
      "References maxUnavailable / readiness gating of the rollout",
      "Diagnoses the image reference or pull secret as the root cause",
      "Re-checks with rollout status after the fix",
    ],
    verify: "kubectl -n apps rollout status deployment/web",
    explanation:
      "This is the standard 'safe by default' behaviour of RollingUpdate and a common exam scenario.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
  },
  {
    id: "ws-005",
    domain: D,
    topic: "ConfigMaps & Secrets",
    difficulty: "easy",
    type: "command",
    prompt:
      "Create ConfigMap `app-config` in `apps` with key LOG_LEVEL=debug, and Secret `db-cred` with username=admin and password=s3cr3t.",
    answer:
      "kubectl -n apps create configmap app-config --from-literal=LOG_LEVEL=debug\nkubectl -n apps create secret generic db-cred --from-literal=username=admin --from-literal=password=s3cr3t",
    accepted: [
      "kubectl create cm app-config --from-literal LOG_LEVEL=debug -n apps",
      "kubectl create secret generic db-cred --from-file=./creds -n apps",
    ],
    explanation:
      "Secret values are base64-encoded in the API, not encrypted by default; `--from-literal` handles the encoding for you. `--from-file` and `--from-env-file` are the other two sources.",
    doc: "https://kubernetes.io/docs/concepts/configuration/secret/",
  },
  {
    id: "ws-006",
    domain: D,
    topic: "ConfigMaps & Secrets",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Mount ConfigMap `app-config` as environment variables and Secret `db-cred` as files under /etc/db in a pod named `consumer` (namespace `apps`, image busybox:1.36 sleeping forever).",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: v1\nkind: Pod\nmetadata:\n  name: consumer\n  namespace: apps\nspec:\n  containers:\n  - name: app\n    image: busybox:1.36\n    command: [\"sleep\",\"infinity\"]\n    envFrom:\n    - configMapRef:\n        name: app-config\n    volumeMounts:\n    - name: db\n      mountPath: /etc/db\n      readOnly: true\n  volumes:\n  - name: db\n    secret:\n      secretName: db-cred\nEOF",
    rubric: [
      "envFrom.configMapRef pulls all ConfigMap keys as env vars",
      "Secret exposed as a volume with volumes[].secret.secretName",
      "volumeMounts.mountPath is /etc/db",
      "Container has a long-running command so the pod stays up",
      "Correct namespace",
    ],
    verify: "kubectl -n apps exec consumer -- sh -c 'env | grep LOG_LEVEL; ls /etc/db'",
    explanation:
      "Env vars from a ConfigMap are snapshotted at pod start; mounted volumes update in place (with a delay), which is why config files are preferred for values that change.",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/",
  },
  {
    id: "ws-007",
    domain: D,
    topic: "Autoscaling",
    difficulty: "medium",
    type: "command",
    prompt:
      "Autoscale Deployment `web` in `apps` between 2 and 10 replicas targeting 70% CPU utilisation, then inspect the result.",
    answer:
      "kubectl -n apps autoscale deployment web --min=2 --max=10 --cpu-percent=70\nkubectl -n apps get hpa web\nkubectl -n apps describe hpa web",
    accepted: ["kubectl autoscale deploy web --min 2 --max 10 --cpu-percent 70 -n apps"],
    explanation:
      "CPU-target HPAs require CPU *requests* on the containers and a working metrics-server; otherwise the HPA reports `<unknown>` and never scales.",
    doc: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/",
  },
  {
    id: "ws-008",
    domain: D,
    topic: "Autoscaling",
    difficulty: "medium",
    type: "mcq",
    prompt: "An HPA shows TARGETS as `<unknown>/70%`. Which is the most likely cause?",
    options: [
      "The Deployment has no replicas field",
      "The pods have no CPU resource requests, or metrics-server is unavailable",
      "The HPA apiVersion is autoscaling/v2",
      "minReplicas is set too low",
    ],
    answerIndex: 1,
    explanation:
      "Utilisation is computed as usage divided by the request, so a missing request makes the target uncomputable; a broken metrics pipeline has the same symptom.",
    doc: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/",
  },
  {
    id: "ws-009",
    domain: D,
    topic: "Autoscaling",
    difficulty: "hard",
    type: "mcq",
    prompt:
      "Which autoscaler can change the CPU/memory requests of running pods, and in recent Kubernetes can do so without recreating them?",
    options: [
      "HorizontalPodAutoscaler",
      "VerticalPodAutoscaler",
      "Cluster Autoscaler",
      "PodDisruptionBudget",
    ],
    answerIndex: 1,
    explanation:
      "VPA adjusts resource requests (vertical scaling). In-place pod resize graduated through recent releases, letting VPA apply changes without a restart in supported configurations; HPA changes replica count and Cluster Autoscaler changes node count.",
    doc: "https://kubernetes.io/docs/concepts/workloads/autoscaling/",
  },
  {
    id: "ws-010",
    domain: D,
    topic: "Self-healing primitives",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Add a readiness probe (HTTP GET /healthz on port 8080, initial delay 5s, period 10s) and a liveness probe (same endpoint, failureThreshold 3) to container `app` of Deployment `web` in `apps`. Explain the difference in effect.",
    answer:
      "kubectl -n apps edit deployment web    # add under containers[0]:\n\n        readinessProbe:\n          httpGet:\n            path: /healthz\n            port: 8080\n          initialDelaySeconds: 5\n          periodSeconds: 10\n        livenessProbe:\n          httpGet:\n            path: /healthz\n            port: 8080\n          failureThreshold: 3\n\nA failing readiness probe removes the pod from Service endpoints but leaves it running; a failing liveness probe makes the kubelet restart the container.",
    rubric: [
      "Both probes use httpGet with path /healthz and port 8080",
      "readinessProbe has initialDelaySeconds 5 and periodSeconds 10",
      "livenessProbe has failureThreshold 3",
      "States readiness gates Service endpoints",
      "States liveness triggers a container restart",
    ],
    verify: "kubectl -n apps get deploy web -o yaml | grep -A6 Probe",
    explanation:
      "Startup probes are the third kind: they suspend liveness/readiness checks until a slow-starting app is up, avoiding restart loops.",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/",
  },
  {
    id: "ws-011",
    domain: D,
    topic: "Self-healing primitives",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "You delete a pod that was created by a Deployment. What happens, and which object recreates it?",
    options: [
      "Nothing — the replica count drops permanently",
      "The Deployment controller recreates it directly",
      "The ReplicaSet owned by the Deployment recreates it",
      "The kubelet recreates it on the same node",
    ],
    answerIndex: 2,
    explanation:
      "The Deployment manages ReplicaSets; the ReplicaSet is the controller that maintains pod count and holds the ownerReference on each pod.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/",
  },
  {
    id: "ws-012",
    domain: D,
    topic: "Scheduling",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Taint `node01` with `env=prod:NoSchedule`, then create pod `prod-app` (image nginx) that tolerates it and is also required to land on a node labelled `disk=ssd`.",
    answer:
      "kubectl taint node node01 env=prod:NoSchedule\nkubectl label node node01 disk=ssd\n\ncat <<'EOF' | kubectl apply -f -\napiVersion: v1\nkind: Pod\nmetadata:\n  name: prod-app\nspec:\n  tolerations:\n  - key: env\n    operator: Equal\n    value: prod\n    effect: NoSchedule\n  affinity:\n    nodeAffinity:\n      requiredDuringSchedulingIgnoredDuringExecution:\n        nodeSelectorTerms:\n        - matchExpressions:\n          - key: disk\n            operator: In\n            values: [\"ssd\"]\n  containers:\n  - name: nginx\n    image: nginx\nEOF\n\nRemove a taint with a trailing dash: kubectl taint node node01 env=prod:NoSchedule-",
    rubric: [
      "Taint syntax key=value:Effect",
      "Toleration matches key, value, and effect",
      "Uses requiredDuringSchedulingIgnoredDuringExecution nodeAffinity (or nodeSelector) for disk=ssd",
      "Understands a toleration permits but does not require placement",
      "Knows the trailing-dash syntax to remove a taint",
    ],
    verify: "kubectl get pod prod-app -o wide",
    explanation:
      "Taints repel, tolerations permit, affinity attracts. A toleration alone never guarantees the pod lands on the tainted node.",
    doc: "https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/",
  },
  {
    id: "ws-013",
    domain: D,
    topic: "Scheduling",
    difficulty: "medium",
    type: "mcq",
    prompt: "What does the taint effect `NoExecute` do that `NoSchedule` does not?",
    options: [
      "Prevents new pods from scheduling",
      "Evicts pods already running on the node that do not tolerate the taint",
      "Marks the node unschedulable in `kubectl get nodes`",
      "Applies only to DaemonSet pods",
    ],
    answerIndex: 1,
    explanation:
      "NoSchedule affects future scheduling only; NoExecute also evicts non-tolerating running pods (with an optional tolerationSeconds grace). PreferNoSchedule is the soft variant.",
    doc: "https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/",
  },
  {
    id: "ws-014",
    domain: D,
    topic: "Scheduling",
    difficulty: "hard",
    type: "scenario",
    prompt:
      "Spread the 6 replicas of Deployment `web` as evenly as possible across zones, tolerating a skew of at most 1, and refuse to schedule if that is impossible. Show the pod-template addition.",
    answer:
      "      topologySpreadConstraints:\n      - maxSkew: 1\n        topologyKey: topology.kubernetes.io/zone\n        whenUnsatisfiable: DoNotSchedule\n        labelSelector:\n          matchLabels:\n            app: web",
    rubric: [
      "Uses topologySpreadConstraints in the pod spec (pod template)",
      "maxSkew: 1",
      "topologyKey topology.kubernetes.io/zone",
      "whenUnsatisfiable: DoNotSchedule (not ScheduleAnyway)",
      "labelSelector matches the deployment's pod labels",
    ],
    verify: "kubectl -n apps get pods -o wide -l app=web",
    explanation:
      "ScheduleAnyway makes the constraint a soft preference; DoNotSchedule makes pods Pending rather than violating the skew.",
    doc: "https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/",
  },
  {
    id: "ws-015",
    domain: D,
    topic: "Pod admission",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Namespace `tenant-a` must reject pods that do not satisfy the restricted Pod Security Standard, and warn on the baseline level for auditing. Apply it.",
    answer:
      "kubectl label ns tenant-a \\\n  pod-security.kubernetes.io/enforce=restricted \\\n  pod-security.kubernetes.io/enforce-version=latest \\\n  pod-security.kubernetes.io/warn=baseline --overwrite",
    rubric: [
      "Uses pod-security.kubernetes.io/* namespace labels (Pod Security Admission)",
      "enforce=restricted",
      "warn (or audit) set to baseline",
      "Uses --overwrite so existing labels are replaced",
      "Does not reach for the removed PodSecurityPolicy API",
    ],
    verify: "kubectl get ns tenant-a --show-labels",
    explanation:
      "PSP was removed in v1.25; Pod Security Admission is built in and driven purely by namespace labels with three modes (enforce, audit, warn) and three levels (privileged, baseline, restricted).",
    doc: "https://kubernetes.io/docs/concepts/security/pod-security-admission/",
  },
  {
    id: "ws-016",
    domain: D,
    topic: "Resource limits",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "A pod has one container with `requests: cpu 200m, memory 256Mi` and `limits: cpu 500m, memory 256Mi`. What is its QoS class?",
    options: ["Guaranteed", "Burstable", "BestEffort", "Undefined"],
    answerIndex: 1,
    explanation:
      "Guaranteed requires requests == limits for both CPU and memory in every container. Here CPU differs, so it is Burstable. BestEffort means no requests or limits at all — and is evicted first under node pressure.",
    doc: "https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/",
  },
  {
    id: "ws-017",
    domain: D,
    topic: "Resource limits",
    difficulty: "medium",
    type: "command",
    prompt:
      "Create a ResourceQuota in namespace `tenant-a` limiting the namespace to 4 CPUs and 8Gi of memory in requests and 10 pods.",
    answer:
      "kubectl -n tenant-a create quota tenant-quota \\\n  --hard=requests.cpu=4,requests.memory=8Gi,pods=10",
    accepted: [
      "kubectl create quota tenant-quota --hard=cpu=4,memory=8Gi,pods=10 -n tenant-a",
    ],
    explanation:
      "Once a quota covers a compute resource, every pod in the namespace must declare the corresponding request/limit or creation is rejected — pair it with a LimitRange to supply defaults.",
    doc: "https://kubernetes.io/docs/concepts/policy/resource-quotas/",
  },
  {
    id: "ws-018",
    domain: D,
    topic: "Jobs & DaemonSets",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Create a CronJob `report` in `apps` running every day at 02:30, image busybox:1.36, command `sh -c 'echo report'`, keeping 3 successful and 1 failed job in history, and never running two at once.",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: report\n  namespace: apps\nspec:\n  schedule: \"30 2 * * *\"\n  concurrencyPolicy: Forbid\n  successfulJobsHistoryLimit: 3\n  failedJobsHistoryLimit: 1\n  jobTemplate:\n    spec:\n      template:\n        spec:\n          restartPolicy: OnFailure\n          containers:\n          - name: report\n            image: busybox:1.36\n            command: [\"sh\",\"-c\",\"echo report\"]\nEOF",
    rubric: [
      "apiVersion batch/v1, kind CronJob",
      "schedule \"30 2 * * *\"",
      "concurrencyPolicy: Forbid",
      "History limits 3 successful / 1 failed",
      "restartPolicy OnFailure or Never in the pod template (Always is invalid for Jobs)",
    ],
    verify: "kubectl -n apps get cronjob report",
    explanation:
      "`kubectl create cronjob report --image=busybox:1.36 --schedule='30 2 * * *' -- sh -c 'echo report'` gets you a skeleton fast; then add the history and concurrency fields.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/",
  },
];
