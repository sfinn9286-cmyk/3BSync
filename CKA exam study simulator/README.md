A practice environment for the Certified Kubernetes Administrator exam: a hands-on kubectl lab against a simulated cluster, a 139-item bank weighted to the published curriculum, timed mock exams, topic drills, AI-graded free-form answers, and per-user progress tracking.

Open **[/cka](/cka)** in a browser. Everything else is an API the page calls; all routes are space-authenticated, so only members of Shaun-Space can reach them.

### Verified against the source

Facts baked into the UI and the sampler come from [training.linuxfoundation.org](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/) and [cncf.io](https://www.cncf.io/training/certification/cka/): performance-based, 2 hours, 15–20 tasks, Kubernetes v1.35, and the domain weights Troubleshooting 30% · Cluster Architecture, Installation & Configuration 25% · Services & Networking 20% · Workloads & Scheduling 15% · Storage 10%. The exam is entirely performance-based, which is why a mock exam defaults to hands-on lab tasks driven from a terminal and scored on cluster state; a 14-task session covers the current lab set. Each question links the kubernetes.io page its answer was written from, so anything can be checked at the source.

### The flow

1. [Simulator](<Simulator/App.tsx>) renders the page and asks [Questions API](<Questions API/script.ts>) for bank metadata.
2. Starting a session pulls a weighted (exam) or filtered (drill) question set.
3. Each submitted answer goes to [Grade answer](<Grade answer/script.ts>): MCQs by exact match, commands by token overlap against accepted variants, scenarios by Claude against the model solution and rubric.
4. The finished session is posted to [Progress API](<Progress API/script.ts>), which writes SQLite on the `cka_progress` volume and serves the dashboard, weak-topic list and review queue.

There are no links between steps — each is an independent HTTP endpoint, and the browser orchestrates.

### External services

Only the **Anthropic** connector, attached to [Grade answer](<Grade answer/README.md>) for grading free-form kubectl/YAML answers. If it is unavailable the step returns the rubric for self-assessment rather than failing, so the app still works.

### Side effects

Writes only its own study history to the `cka_progress` volume, keyed by the authenticated user's email. Nothing outside 3B is modified, and no Kubernetes cluster is touched — answers are written and graded as text. Pair this with a real `kind` or `kubeadm` cluster for muscle memory.

### Common changes

- **Add or edit questions** — the per-domain files under [Questions API/bank/](<Questions API/bank>); nothing else needs updating.
- **Change exam length or the pass heuristic** — `EXAM_SECONDS` and `PASS_ESTIMATE` at the top of [Simulator/App.tsx](<Simulator/App.tsx>).
- **Change how hints work** — [Simulator/hints.ts](<Simulator/hints.ts>). Every command-typing task (labs, scenarios, command recall) shows a progressive hint section in exams and drills, derived from the model answer rather than authored per question.
- **Change domain weighting** — `WEIGHTS` in [Questions API/script.ts](<Questions API/script.ts>); update it if the CNCF curriculum changes.
- **Tune grading strictness** — `GRADER_SYSTEM` in [Grade answer/script.ts](<Grade answer/script.ts>).
- **Reset progress** — delete rows from the `attempts`/`sessions` tables via [Progress API](<Progress API/script.ts>); the volume is per-space and drafts are isolated.

### The kubectl lab

Hands-on tasks are graded on the state of a simulated Kubernetes cluster that runs entirely in the browser — [Simulator/cluster.ts](<Simulator/cluster.ts>) is the cluster engine and kubectl implementation, [Simulator/node.ts](<Simulator/node.ts>) the node shell, [Simulator/Terminal.tsx](<Simulator/Terminal.tsx>) the prompt, [Simulator/checks.ts](<Simulator/checks.ts>) the scorer, and the fixtures and checks live with the questions in [Questions API/bank/labs.ts](<Questions API/bank/labs.ts>) and [bank/nodelabs.ts](<Questions API/bank/nodelabs.ts>). No real cluster or API server is contacted, and labs never call the grader step. Node-level tasks are simulated too: `ssh <node>` gives a shell with systemd units, the kubelet journal, `crictl`, `etcdctl` and editable files under `/etc/kubernetes`, and those labs are graded on unit state and file contents.
