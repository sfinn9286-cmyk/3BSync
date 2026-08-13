Serves the CKA question bank. HTTP route `GET /cka/questions`, space-authenticated, called by the [Simulator](<../Simulator/App.tsx>) page — no external services.

The bank lives in [bank/](bank) as one TypeScript file per exam domain, sized to the published curriculum weights:

| File | Domain | Weight | Items |
| --- | --- | --- | --- |
| [bank/troubleshooting.ts](bank/troubleshooting.ts) | Troubleshooting | 30% | 36 |
| [bank/cluster.ts](bank/cluster.ts) | Cluster Architecture, Installation & Configuration | 25% | 30 |
| [bank/networking.ts](bank/networking.ts) | Services & Networking | 20% | 24 |
| [bank/workloads.ts](bank/workloads.ts) | Workloads & Scheduling | 15% | 18 |
| [bank/storage.ts](bank/storage.ts) | Storage | 10% | 12 |

Every item carries a `domain`, `topic`, `difficulty` and a `doc` link to the kubernetes.io (or gateway-api / helm) page the answer was written from. Three shapes, declared in [bank/types.ts](bank/types.ts):

- **`scenario`** — killer.sh-style task with a full model solution, a `rubric` of independently gradable points, and often a `verify` command.
- **`command`** — "write the kubectl command" with `answer` plus `accepted` alternative phrasings.
- **`mcq`** — concept check with `options` and `answerIndex`, for things a CLI answer cannot test.

### Modes

| `mode` | Behaviour |
| --- | --- |
| `exam` (default) | Weighted sample across domains using largest-remainder quotas, so `count=17` mirrors a killer.sh session's shape. |
| `drill` | Filtered by `domain`, `topic` and/or `type`. |
| `review` | Exact items by `ids`, used for the review queue and "redo missed". |
| `meta` | Bank statistics: totals, per-domain counts, weights and topic lists. Drives the dashboard and drill filters. |

`seed` makes sampling reproducible; `exclude` drops ids you have just seen. Responses include model answers and rubrics — the client needs them to render feedback and to pass them to [the grader](<../Grade answer/script.ts>), so this is a study tool, not an invigilated exam.

The request/response contract is published in [api.json](api.json). Sampling and request parsing are in [script.ts](script.ts).

**To add questions**, append to the relevant `bank/*.ts` file with a unique id prefix (`ts-`, `ca-`, `sn-`, `ws-`, `st-`) — no other file needs touching.
