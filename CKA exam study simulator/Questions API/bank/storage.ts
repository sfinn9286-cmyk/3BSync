import type { Question } from "./types";

const D = "Storage" as const;

export const storage: Question[] = [
  {
    id: "st-001",
    domain: D,
    topic: "PV & PVC",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Create a 1Gi hostPath PersistentVolume `pv-logs` at /mnt/logs with ReadWriteOnce and Retain, then a PVC `pvc-logs` in namespace `apps` that binds to it.",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: v1\nkind: PersistentVolume\nmetadata:\n  name: pv-logs\nspec:\n  capacity:\n    storage: 1Gi\n  accessModes: [\"ReadWriteOnce\"]\n  persistentVolumeReclaimPolicy: Retain\n  storageClassName: manual\n  hostPath:\n    path: /mnt/logs\n---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: pvc-logs\n  namespace: apps\nspec:\n  accessModes: [\"ReadWriteOnce\"]\n  storageClassName: manual\n  resources:\n    requests:\n      storage: 1Gi\nEOF",
    rubric: [
      "PV is cluster-scoped (no namespace); PVC is namespaced",
      "accessModes match between PV and PVC",
      "storageClassName matches on both sides (or is empty on both)",
      "persistentVolumeReclaimPolicy: Retain",
      "PVC requests <= PV capacity",
    ],
    verify: "kubectl -n apps get pvc pvc-logs",
    explanation:
      "Binding requires compatible accessModes, a big-enough capacity and a matching storageClassName. A mismatch leaves the PVC Pending — the single most common storage task failure.",
    doc: "https://kubernetes.io/docs/concepts/storage/persistent-volumes/",
  },
  {
    id: "st-002",
    domain: D,
    topic: "PV & PVC",
    difficulty: "easy",
    type: "mcq",
    prompt: "Which access mode allows the volume to be mounted read-write by many nodes?",
    options: ["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany", "ReadWriteOncePod"],
    answerIndex: 2,
    explanation:
      "RWO is read-write by a single node (multiple pods on that node may share it), ROX is read-only by many nodes, RWX is read-write by many nodes, and RWOP restricts access to a single pod.",
    doc: "https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes",
  },
  {
    id: "st-003",
    domain: D,
    topic: "Reclaim policies",
    difficulty: "medium",
    type: "mcq",
    prompt:
      "A PVC bound to a PV with `persistentVolumeReclaimPolicy: Delete` is deleted. What happens to the PV and its data?",
    options: [
      "The PV becomes Available for another claim, data intact",
      "The PV and the underlying storage asset are deleted",
      "The PV becomes Released and must be cleaned up manually",
      "The PV is unaffected until the node reboots",
    ],
    answerIndex: 1,
    explanation:
      "Delete removes the PV object and the backing volume. Retain leaves the PV in Released state with the data intact, requiring manual cleanup before it can be reused (clear spec.claimRef).",
    doc: "https://kubernetes.io/docs/concepts/storage/persistent-volumes/#reclaiming",
  },
  {
    id: "st-004",
    domain: D,
    topic: "StorageClass",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Create a StorageClass `fast` that is the cluster default, uses provisioner `csi.example.com`, binds late, and allows volume expansion.",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: storage.k8s.io/v1\nkind: StorageClass\nmetadata:\n  name: fast\n  annotations:\n    storageclass.kubernetes.io/is-default-class: \"true\"\nprovisioner: csi.example.com\nvolumeBindingMode: WaitForFirstConsumer\nallowVolumeExpansion: true\nreclaimPolicy: Delete\nEOF\n\nRemember to unset the annotation on the previous default:\nkubectl patch sc <old> -p '{\"metadata\":{\"annotations\":{\"storageclass.kubernetes.io/is-default-class\":\"false\"}}}'",
    rubric: [
      "Default marked with the storageclass.kubernetes.io/is-default-class annotation set to the string \"true\"",
      "volumeBindingMode: WaitForFirstConsumer",
      "allowVolumeExpansion: true",
      "provisioner field set correctly",
      "Mentions clearing the annotation on any existing default class",
    ],
    verify: "kubectl get sc",
    explanation:
      "WaitForFirstConsumer delays provisioning until a pod is scheduled, so zonal/topology-constrained volumes land where the pod can use them. Two default classes is a misconfiguration.",
    doc: "https://kubernetes.io/docs/concepts/storage/storage-classes/",
  },
  {
    id: "st-005",
    domain: D,
    topic: "Dynamic provisioning",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "A PVC `data` in namespace `apps` is stuck in Pending with a dynamic StorageClass. Diagnose it.",
    answer:
      "kubectl -n apps describe pvc data          # read the Events\nkubectl get sc                              # does the requested class exist? is there a default?\nkubectl -n kube-system get pods | grep -i csi   # is the provisioner running?\nkubectl get pv                              # anything Available that should have matched?\n\nCommon causes: no default StorageClass and none named; the named class does not exist; the CSI provisioner/controller is not running; volumeBindingMode is WaitForFirstConsumer and no pod consumes the PVC yet; requested size or accessMode unsupported by the backend.",
    rubric: [
      "Starts with describe pvc and reads events",
      "Checks whether the StorageClass exists / a default exists",
      "Checks the CSI provisioner pods",
      "Knows WaitForFirstConsumer keeps a PVC Pending until a pod uses it",
      "Considers unsupported accessMode/size",
    ],
    verify: "kubectl -n apps get pvc data",
    explanation:
      "A Pending PVC is either waiting on a provisioner, waiting on a consumer, or unmatchable. The Events block usually says which.",
    doc: "https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/",
  },
  {
    id: "st-006",
    domain: D,
    topic: "Using volumes in pods",
    difficulty: "medium",
    type: "scenario",
    prompt:
      "Create pod `writer` in namespace `apps` (image busybox:1.36) that mounts PVC `pvc-logs` at /data and appends the date to /data/out.log every 5 seconds.",
    answer:
      "cat <<'EOF' | kubectl apply -f -\napiVersion: v1\nkind: Pod\nmetadata:\n  name: writer\n  namespace: apps\nspec:\n  containers:\n  - name: writer\n    image: busybox:1.36\n    command: [\"sh\",\"-c\",\"while true; do date >> /data/out.log; sleep 5; done\"]\n    volumeMounts:\n    - name: data\n      mountPath: /data\n  volumes:\n  - name: data\n    persistentVolumeClaim:\n      claimName: pvc-logs\nEOF",
    rubric: [
      "volumes[].persistentVolumeClaim.claimName references the PVC",
      "volumeMounts name matches the volume name",
      "mountPath is /data",
      "Long-running command so the pod does not complete",
      "PVC and pod are in the same namespace",
    ],
    verify: "kubectl -n apps exec writer -- tail -3 /data/out.log",
    explanation:
      "A PVC can only be mounted by pods in its own namespace; the volume name is the join between `volumes` and `volumeMounts`.",
    doc: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/",
  },
  {
    id: "st-007",
    domain: D,
    topic: "Volume expansion",
    difficulty: "medium",
    type: "command",
    prompt: "Grow PVC `data` in namespace `apps` from 1Gi to 5Gi.",
    answer:
      "kubectl -n apps patch pvc data -p '{\"spec\":{\"resources\":{\"requests\":{\"storage\":\"5Gi\"}}}}'",
    accepted: ["kubectl -n apps edit pvc data  # change spec.resources.requests.storage to 5Gi"],
    explanation:
      "Only works when the StorageClass sets `allowVolumeExpansion: true`. PVCs can grow but never shrink; some drivers require a pod restart to complete the filesystem resize.",
    doc: "https://kubernetes.io/docs/concepts/storage/persistent-volumes/#expanding-persistent-volumes-claims",
  },
  {
    id: "st-008",
    domain: D,
    topic: "Volume types",
    difficulty: "easy",
    type: "mcq",
    prompt:
      "Which volume type shares data between containers in the same pod for the pod's lifetime and is deleted when the pod is removed?",
    options: ["hostPath", "emptyDir", "configMap", "persistentVolumeClaim"],
    answerIndex: 1,
    explanation:
      "emptyDir is created empty when the pod is assigned to a node and deleted with the pod. Container restarts preserve it; pod deletion does not. `emptyDir.medium: Memory` makes it a tmpfs.",
    doc: "https://kubernetes.io/docs/concepts/storage/volumes/#emptydir",
  },
  {
    id: "st-009",
    domain: D,
    topic: "Volume types",
    difficulty: "medium",
    type: "mcq",
    prompt: "Why is hostPath discouraged for production workloads?",
    options: [
      "It cannot be mounted read-only",
      "It ties the pod to a specific node's filesystem and can expose host paths, breaking portability and security",
      "It has a 1Gi size limit",
      "It is unsupported by the kubelet",
    ],
    answerIndex: 1,
    explanation:
      "hostPath data is node-local, so rescheduling loses it, and mounting host directories is a privilege-escalation vector — which is why the restricted Pod Security Standard forbids it. It remains handy for single-node exam-style exercises and node agents.",
    doc: "https://kubernetes.io/docs/concepts/storage/volumes/#hostpath",
  },
  {
    id: "st-010",
    domain: D,
    topic: "StatefulSet storage",
    difficulty: "hard",
    type: "mcq",
    prompt:
      "A StatefulSet uses `volumeClaimTemplates`. You scale it from 3 to 1 replica. What happens to the PVCs of the removed pods by default?",
    options: [
      "They are deleted along with the pods",
      "They are retained, so scaling back up reattaches the same data",
      "They are converted to hostPath volumes",
      "They become Available for any other claim",
    ],
    answerIndex: 1,
    explanation:
      "PVCs from volumeClaimTemplates persist beyond pod deletion and scale-down, and pod `web-1` reattaches `www-web-1` when scaled up again. `persistentVolumeClaimRetentionPolicy` can opt into deletion.",
    doc: "https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/#persistentvolumeclaim-retention",
  },
  {
    id: "st-011",
    domain: D,
    topic: "CSI",
    difficulty: "medium",
    type: "mcq",
    prompt: "What is the role of the Container Storage Interface (CSI) in Kubernetes?",
    options: [
      "It defines how the kubelet streams container logs",
      "It is a standard API that lets third-party storage drivers provision and attach volumes without in-tree code",
      "It replaces the PersistentVolume object",
      "It provides pod-to-pod networking",
    ],
    answerIndex: 1,
    explanation:
      "CSI is the out-of-tree storage plugin standard (CRI is for runtimes, CNI for networking). In-tree cloud volume plugins have been migrated to CSI drivers.",
    doc: "https://kubernetes.io/docs/concepts/storage/volumes/#csi",
  },
  {
    id: "st-012",
    domain: D,
    topic: "PV & PVC",
    difficulty: "medium",
    type: "command",
    prompt:
      "List all PersistentVolumes sorted by capacity, showing which claim each is bound to.",
    answer:
      "kubectl get pv --sort-by=.spec.capacity.storage -o custom-columns='NAME:.metadata.name,SIZE:.spec.capacity.storage,STATUS:.status.phase,CLAIM:.spec.claimRef.name'",
    accepted: ["kubectl get pv --sort-by=.spec.capacity.storage", "kubectl get pv -o wide"],
    explanation:
      "`spec.claimRef` is the back-reference from PV to PVC; clearing it is how you make a Released, Retain-policy PV bindable again.",
    doc: "https://kubernetes.io/docs/concepts/storage/persistent-volumes/",
  },
];
