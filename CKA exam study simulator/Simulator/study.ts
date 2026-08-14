export type Resource = { kind: "doc" | "video" | "course"; label: string; url: string };

const CKA_COURSE = "https://www.youtube.com/watch?v=Fr9GqFwl6NM";

// Chapter offsets inside the freeCodeCamp "Kubernetes – CKA Exam Preparation" course,
// taken from its published chapter list so a hint can drop the learner on the right section.
const CHAPTER = {
  fundamentals: 257,
  cluster: 1203,
  workloads: 3197,
  networking: 5038,
  storage: 6099,
  troubleshooting: 6805,
} as const;

function chapter(label: string, seconds: number): Resource {
  return { kind: "video", label, url: `${CKA_COURSE}&t=${seconds}s` };
}

const CHEATSHEET_DOC: Resource = {
  kind: "doc",
  label: "kubectl cheat sheet",
  url: "https://kubernetes.io/docs/reference/kubectl/quick-reference/",
};

const DOMAIN_RESOURCES: Record<string, Resource[]> = {
  Troubleshooting: [
    {
      kind: "doc",
      label: "Debug running pods",
      url: "https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/",
    },
    {
      kind: "doc",
      label: "Troubleshoot clusters",
      url: "https://kubernetes.io/docs/tasks/debug/debug-cluster/",
    },
    chapter("Course chapter: Troubleshooting", CHAPTER.troubleshooting),
  ],
  "Cluster Architecture, Installation & Configuration": [
    {
      kind: "doc",
      label: "Cluster administration",
      url: "https://kubernetes.io/docs/tasks/administer-cluster/",
    },
    {
      kind: "doc",
      label: "Bootstrapping clusters with kubeadm",
      url: "https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/",
    },
    chapter("Course chapter: Cluster architecture & install", CHAPTER.cluster),
  ],
  "Services & Networking": [
    {
      kind: "doc",
      label: "Services, load balancing & networking",
      url: "https://kubernetes.io/docs/concepts/services-networking/",
    },
    chapter("Course chapter: Services & networking", CHAPTER.networking),
  ],
  "Workloads & Scheduling": [
    {
      kind: "doc",
      label: "Workload management",
      url: "https://kubernetes.io/docs/concepts/workloads/",
    },
    {
      kind: "doc",
      label: "Scheduling, preemption & eviction",
      url: "https://kubernetes.io/docs/concepts/scheduling-eviction/",
    },
    chapter("Course chapter: Workloads & scheduling", CHAPTER.workloads),
  ],
  Storage: [
    { kind: "doc", label: "Storage concepts", url: "https://kubernetes.io/docs/concepts/storage/" },
    chapter("Course chapter: Storage", CHAPTER.storage),
  ],
};

// Matched against the question's topic and prompt, most specific first.
const TOPIC_RESOURCES: { match: RegExp; resources: Resource[] }[] = [
  {
    match: /etcd|backup|restore|snapshot/i,
    resources: [
      {
        kind: "doc",
        label: "Back up and restore an etcd cluster",
        url: "https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#backing-up-an-etcd-cluster",
      },
      {
        kind: "doc",
        label: "etcd operations guide (recovery)",
        url: "https://etcd.io/docs/v3.5/op-guide/recovery/",
      },
      chapter("Course chapter: cluster lifecycle, etcd & backups", CHAPTER.cluster),
    ],
  },
  {
    match: /upgrade|kubeadm|version skew/i,
    resources: [
      {
        kind: "doc",
        label: "Upgrading kubeadm clusters",
        url: "https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/",
      },
      chapter("Course chapter: cluster lifecycle & upgrades", CHAPTER.cluster),
    ],
  },
  {
    match: /rbac|role|serviceaccount|authoriz|authent/i,
    resources: [
      {
        kind: "doc",
        label: "Using RBAC authorization",
        url: "https://kubernetes.io/docs/reference/access-authn-authz/rbac/",
      },
      {
        kind: "course",
        label: "KodeKloud CKA course — security & RBAC labs",
        url: "https://kodekloud.com/courses/cka-certification-course-certified-kubernetes-administrator",
      },
    ],
  },
  {
    match: /network ?polic/i,
    resources: [
      {
        kind: "doc",
        label: "Network policies",
        url: "https://kubernetes.io/docs/concepts/services-networking/network-policies/",
      },
      {
        kind: "doc",
        label: "Declare network policy (tutorial)",
        url: "https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/",
      },
    ],
  },
  {
    match: /ingress|gateway/i,
    resources: [
      {
        kind: "doc",
        label: "Ingress",
        url: "https://kubernetes.io/docs/concepts/services-networking/ingress/",
      },
      {
        kind: "doc",
        label: "Gateway API",
        url: "https://kubernetes.io/docs/concepts/services-networking/gateway/",
      },
    ],
  },
  {
    match: /dns|coredns|nslookup/i,
    resources: [
      {
        kind: "doc",
        label: "DNS for services and pods",
        url: "https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/",
      },
      {
        kind: "doc",
        label: "Debugging DNS resolution",
        url: "https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/",
      },
    ],
  },
  {
    match: /service|endpoint|nodeport|clusterip/i,
    resources: [
      {
        kind: "doc",
        label: "Service",
        url: "https://kubernetes.io/docs/concepts/services-networking/service/",
      },
      chapter("Course chapter: Services & networking", CHAPTER.networking),
    ],
  },
  {
    match: /persistentvolume|pvc|pv\b|storageclass|volume/i,
    resources: [
      {
        kind: "doc",
        label: "Persistent volumes",
        url: "https://kubernetes.io/docs/concepts/storage/persistent-volumes/",
      },
      {
        kind: "doc",
        label: "Configure a pod to use a PersistentVolume",
        url: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/",
      },
    ],
  },
  {
    match: /taint|toleration|affinity|nodeselector|schedul/i,
    resources: [
      {
        kind: "doc",
        label: "Taints and tolerations",
        url: "https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/",
      },
      {
        kind: "doc",
        label: "Assigning pods to nodes",
        url: "https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/",
      },
    ],
  },
  {
    match: /drain|cordon|maintenance|evict/i,
    resources: [
      {
        kind: "doc",
        label: "Safely drain a node",
        url: "https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/",
      },
    ],
  },
  {
    match: /configmap|secret/i,
    resources: [
      {
        kind: "doc",
        label: "ConfigMaps",
        url: "https://kubernetes.io/docs/concepts/configuration/configmap/",
      },
      { kind: "doc", label: "Secrets", url: "https://kubernetes.io/docs/concepts/configuration/secret/" },
    ],
  },
  {
    match: /deployment|rollout|replicaset|scal/i,
    resources: [
      {
        kind: "doc",
        label: "Deployments",
        url: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
      },
      chapter("Course chapter: Workloads & scheduling", CHAPTER.workloads),
    ],
  },
  {
    match: /daemonset|statefulset|job|cronjob/i,
    resources: [
      {
        kind: "doc",
        label: "Workload controllers",
        url: "https://kubernetes.io/docs/concepts/workloads/controllers/",
      },
    ],
  },
  {
    match: /autoscal|hpa|metrics/i,
    resources: [
      {
        kind: "doc",
        label: "Horizontal pod autoscaling",
        url: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/",
      },
    ],
  },
  {
    match: /static pod|kubelet|systemctl|journalctl|crictl/i,
    resources: [
      {
        kind: "doc",
        label: "Static pods",
        url: "https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/",
      },
      {
        kind: "doc",
        label: "Troubleshooting kubeadm",
        url: "https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/troubleshooting-kubeadm/",
      },
      chapter("Course chapter: Troubleshooting", CHAPTER.troubleshooting),
    ],
  },
  {
    match: /certificate|csr|openssl|pki/i,
    resources: [
      {
        kind: "doc",
        label: "Certificates and PKI",
        url: "https://kubernetes.io/docs/setup/best-practices/certificates/",
      },
      {
        kind: "doc",
        label: "Certificate management with kubeadm",
        url: "https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/",
      },
    ],
  },
  {
    match: /probe|liveness|readiness/i,
    resources: [
      {
        kind: "doc",
        label: "Configure liveness, readiness and startup probes",
        url: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/",
      },
    ],
  },
  {
    match: /resource|limit|request|quota/i,
    resources: [
      {
        kind: "doc",
        label: "Resource management for pods and containers",
        url: "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/",
      },
    ],
  },
  {
    match: /crd|custom resource|helm|kustomize/i,
    resources: [
      {
        kind: "doc",
        label: "Custom resources",
        url: "https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/",
      },
      {
        kind: "doc",
        label: "Declarative management with Kustomize",
        url: "https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/",
      },
    ],
  },
];

const EXAM_RESOURCES: Resource[] = [
  {
    kind: "course",
    label: "Linux Foundation CKA exam page — curriculum, allowed docs, simulator",
    url: "https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/",
  },
  {
    kind: "video",
    label: "Full CKA video course (freeCodeCamp, ~2h)",
    url: CKA_COURSE,
  },
];

export function studyResources(question: {
  domain: string;
  topic: string;
  prompt: string;
  doc: string;
}): Resource[] {
  const haystack = `${question.topic} ${question.prompt}`;
  const picked: Resource[] = [
    { kind: "doc", label: "The page this task was written from", url: question.doc },
  ];

  for (const rule of TOPIC_RESOURCES) {
    if (rule.match.test(haystack)) picked.push(...rule.resources);
    if (picked.length >= 5) break;
  }

  picked.push(...(DOMAIN_RESOURCES[question.domain] ?? []));
  picked.push(CHEATSHEET_DOC, ...EXAM_RESOURCES);

  const seen = new Set<string>();
  return picked.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true))).slice(0, 7);
}
