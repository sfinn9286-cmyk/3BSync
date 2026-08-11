The study interface. HTTP route `/cka` (`route_type = "webpage"`), space-authenticated. A client-side React app — [App.tsx](App.tsx) for the views, [lib.ts](lib.ts) for the API client, the cheat sheet content and formatting helpers, [globals.css](globals.css) for the theme.

It renders immediately and fetches everything over the workflow's own API routes, so it is deliberately not downstream of any step:

- [`GET /cka/questions`](<../Questions API/script.ts>) — bank metadata on load, then question sets when a session starts
- [`POST /cka/grade`](<../Grade answer/script.ts>) — one call per written answer (hands-on labs are graded locally, see below)
- [`/cka/progress`](<../Progress API/script.ts>) — dashboard on load, session results on finish

Four tabs:

- **progress** — questions answered, mean score, bank coverage, accuracy per domain against that domain's exam weight, weakest topics (click one to drill it), the review queue, and mock-exam score trend.
- **mock exam** — 2-hour countdown that auto-submits at zero, tasks drawn by domain weight. Three styles: **hands-on labs** (the default, closest to the real performance-based exam), **mixed**, and **written only**. Flag-and-skip navigation, then a full report: overall score against a 66% study heuristic, per-domain bars, and every task with its grade, model answer and doc link.
- **drills** — filter by domain, topic and type (including hands-on labs); check each answer as you go.
- **cheat sheet** — the verified imperative-command set plus exam-day tactics.

Every task also has a **preview answer** toggle that reveals the model answer, the reasoning behind it, the rubric or checks, alternative accepted commands and the source doc without ending the session.

## The kubectl lab

Hands-on tasks run against a simulated Kubernetes cluster *and its nodes*, entirely in the browser — no real API server or machine is contacted.

- [cluster.ts](cluster.ts) is the cluster engine: a resource store with a small reconciler (Deployments/StatefulSets/DaemonSets materialise pods, PVCs bind to PVs, Services compute endpoints) and a `kubectl` implementation covering `get`, `describe`, `create`, `apply -f`, `delete`, `run`, `expose`, `scale`, `set image`, `label`, `annotate`, `taint`, `cordon`, `uncordon`, `drain`, `rollout`, `patch`, `logs`, `exec`, `auth can-i`, `top`, `config`, `api-resources`, `cluster-info` and `version`, with `-n`, `-A`, `-l`, `-o wide|yaml|json|name|jsonpath=`, `--show-labels` and `--dry-run=client`. Anything it does not simulate says so explicitly rather than pretending to succeed.
- [node.ts](node.ts) is the node shell reached with `ssh <node>`: `systemctl` (start/stop/restart/enable/disable/is-active/is-enabled on `kubelet` and `containerd`), `journalctl -u`, `crictl ps|pods|logs`, `etcdctl snapshot save|status|restore` (which fails without `--cacert/--cert/--key`, as the real one does), file reads and edits (`cat`, `cat > path <<EOF`, `ls`, `rm`, `cp`, `mv`), `swapoff`, `free`, `df`. Stopping the kubelet turns the node NotReady; writing a Pod manifest into `/etc/kubernetes/manifests` makes the kubelet materialise a mirror pod named `<pod>-<node>`; a broken manifest is reported in the kubelet journal. Simple pipelines into `grep`/`head`/`tail`/`wc -l` work in both contexts.
- [Terminal.tsx](Terminal.tsx) is the prompt: command history with the arrow keys, `clear`, `help`, a **reset cluster** control, a prompt that changes to `root@<node>:~#` after `ssh`, and multi-line heredocs.
- [checks.ts](checks.ts) scores a lab by inspecting the resulting cluster objects, unit states and node files against the task's declarative checks (from [the bank](<../Questions API/bank/labs.ts>)) — the commands typed are never graded, only the state left behind. Each check is an equal share of the task's score.

In drills you can press **verify cluster** whenever you like; in a mock exam nothing is verified until you submit, as on exam day. Each task keeps its own cluster for the length of the session, so you can flag it, move on and come back.

When embedding links back into this workflow the client appends `?branch=` from `window.__BRANCH__`, injected by [render.ts](render.ts), so a draft page talks to the draft's own API routes.
