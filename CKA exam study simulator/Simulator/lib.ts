export type Question = {
  id: string;
  domain: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  doc: string;
  type: "mcq" | "command" | "scenario";
  prompt: string;
  explanation: string;
  options?: string[];
  answerIndex?: number;
  answer?: string;
  accepted?: string[];
  rubric?: string[];
  verify?: string;
};

export type Grade = {
  graded: "deterministic" | "ai" | "self";
  score: number;
  verdict: "correct" | "partial" | "incorrect";
  feedback: string;
  modelAnswer?: string;
  correctOption?: string;
  correctedAnswer?: string;
  rubric?: string[];
  rubricResults?: { point: string; met: boolean; note?: string }[];
};

export type Meta = {
  total: number;
  domains: { domain: string; weight: number; count: number; topics: string[] }[];
};

export type Progress = {
  user: string;
  totals: { answered: number; avgScore: number | null; uniqueQuestions: number };
  sessions: {
    session: string;
    mode: string;
    total: number;
    scored: number;
    startedAt: string;
    finishedAt: string;
  }[];
  byDomain: { domain: string; attempts: number; avgScore: number }[];
  byTopic: { domain: string; topic: string; attempts: number; avgScore: number }[];
  reviewQueue: {
    questionId: string;
    domain: string;
    topic: string;
    avgScore: number;
    attempts: number;
    lastSeen: string;
  }[];
};

const branch = (globalThis as { __BRANCH__?: string }).__BRANCH__ ?? "";

function url(path: string, params: Record<string, string | number | undefined> = {}) {
  const u = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  }
  if (branch) u.searchParams.set("branch", branch);
  return u.toString();
}

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  meta: () => json<Meta>(url("/cka/questions", { mode: "meta" })),
  exam: (count: number) =>
    json<{ seed: number; questions: Question[] }>(url("/cka/questions", { mode: "exam", count })),
  drill: (params: { domain?: string; topic?: string; type?: string; count: number }) =>
    json<{ seed: number; questions: Question[] }>(url("/cka/questions", { mode: "drill", ...params })),
  review: (ids: string[]) =>
    json<{ questions: Question[] }>(url("/cka/questions", { mode: "review", ids: ids.join(",") })),
  grade: (q: Question, userAnswer: string, selectedIndex?: number) =>
    json<Grade>(url("/cka/grade"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: q.type,
        prompt: q.prompt,
        userAnswer,
        selectedIndex,
        answerIndex: q.answerIndex,
        options: q.options,
        modelAnswer: q.answer,
        accepted: q.accepted,
        rubric: q.rubric,
        explanation: q.explanation,
      }),
    }),
  progress: () => json<Progress>(url("/cka/progress")),
  saveProgress: (body: unknown) =>
    json<{ saved: number }>(url("/cka/progress"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

export const DOMAIN_SHORT: Record<string, string> = {
  Troubleshooting: "Troubleshooting",
  "Cluster Architecture, Installation & Configuration": "Cluster Architecture",
  "Services & Networking": "Services & Networking",
  "Workloads & Scheduling": "Workloads & Scheduling",
  Storage: "Storage",
};

export function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export function fmtClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

export const CHEATSHEET: { title: string; lines: [string, string][] }[] = [
  {
    title: "Set up (first 60 seconds)",
    lines: [
      ["alias k=kubectl", "shorter everything"],
      ["export do='--dry-run=client -o yaml'", "k run x --image=nginx $do > x.yaml"],
      ["export now='--force --grace-period=0'", "immediate pod deletion"],
      ["source <(kubectl completion bash)", "tab completion for resources"],
      ["kubectl config set-context --current --namespace=<ns>", "stop typing -n"],
    ],
  },
  {
    title: "Generate manifests fast",
    lines: [
      ["k run pod1 --image=nginx $do", "pod skeleton"],
      ["k create deploy web --image=nginx --replicas=3 $do", "deployment skeleton"],
      ["k create job j --image=busybox $do -- /bin/sh -c 'date'", "job with command"],
      ["k create cronjob c --image=busybox --schedule='*/1 * * * *' $do -- date", "cronjob"],
      ["k expose deploy web --port=80 --target-port=8080 $do", "service from a deployment"],
      ["k create ingress web --class=nginx --rule='h.com/*=web-svc:80' $do", "ingress in one line"],
      ["k create role r --verb=get,list --resource=pods $do", "role"],
      ["k create rolebinding rb --role=r --serviceaccount=ns:sa $do", "rolebinding"],
      ["k create quota q --hard=cpu=1,memory=1G,pods=2 $do", "resourcequota"],
    ],
  },
  {
    title: "Inspect and filter",
    lines: [
      ["k get po -A -o wide", "everything, with node and IP"],
      ["k get po --show-labels", "labels inline"],
      ["k get po -l app=web,tier!=dev", "label selectors"],
      ["k get po --field-selector status.phase=Running,spec.nodeName=node01", "field selectors"],
      ["k get po -o jsonpath='{.items[*].spec.containers[*].image}'", "jsonpath extraction"],
      ["k get no -o custom-columns='N:.metadata.name,CPU:.status.capacity.cpu'", "custom columns"],
      ["k get ev -A --sort-by=.lastTimestamp", "recent cluster events"],
      ["k api-resources | grep -i policy", "find the resource name / apiGroup"],
      ["k explain deploy.spec.strategy --recursive", "field reference offline"],
    ],
  },
  {
    title: "Troubleshooting reflexes",
    lines: [
      ["k describe po X", "Events block first, always"],
      ["k logs X --previous -c container", "why the last container died"],
      ["k logs -l app=web --tail=50 --prefix", "logs across a label set"],
      ["k debug po/X -it --image=busybox --target=app", "ephemeral debug container"],
      ["k debug node/node01 -it --image=busybox", "shell onto a node"],
      ["k exec -it X -- sh", "get inside"],
      ["k top po -A --sort-by=cpu", "needs metrics-server"],
      ["k auth can-i list secrets --as=system:serviceaccount:ns:sa", "RBAC check"],
      ["k get --raw='/readyz?verbose'", "API server health detail"],
    ],
  },
  {
    title: "On the node (control plane down)",
    lines: [
      ["/etc/kubernetes/manifests/", "static pods: apiserver, etcd, scheduler, controller-manager"],
      ["/var/lib/kubelet/config.yaml", "kubelet configuration"],
      ["/etc/kubernetes/pki/", "cluster certs; etcd certs under pki/etcd/"],
      ["journalctl -u kubelet -f", "kubelet log"],
      ["crictl ps -a", "containers when kubectl cannot help"],
      ["crictl logs <id>", "container log via the runtime"],
      ["systemctl restart kubelet", "after editing kubelet config"],
    ],
  },
  {
    title: "etcd snapshot (memorise the flags)",
    lines: [
      ["ETCDCTL_API=3 etcdctl snapshot save /opt/s.db", "add the three cert flags"],
      ["--endpoints=https://127.0.0.1:2379", "local etcd"],
      ["--cacert=/etc/kubernetes/pki/etcd/ca.crt", ""],
      ["--cert=/etc/kubernetes/pki/etcd/server.crt", ""],
      ["--key=/etc/kubernetes/pki/etcd/server.key", ""],
      ["etcdctl snapshot restore /opt/s.db --data-dir=/var/lib/etcd-new", "then repoint etcd.yaml"],
    ],
  },
  {
    title: "Exam tactics that decide the result",
    lines: [
      ["Read the namespace and context in every task", "wrong cluster = zero marks"],
      ["kubectl config use-context <ctx>", "the task line usually gives it"],
      ["Flag and skip anything over ~7 minutes", "come back; partial credit exists"],
      ["Verify with get/describe before moving on", "cheap insurance"],
      ["Use the docs, not memory, for YAML fields", "the search bar is allowed"],
      ["Write output files to the exact path asked", "graders diff exact paths"],
    ],
  },
];
