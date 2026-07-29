The study interface. HTTP route `/cka` (`route_type = "webpage"`), space-authenticated. A client-side React app — [App.tsx](App.tsx) for the views, [lib.ts](lib.ts) for the API client, the exam cheat sheet content and formatting helpers, [globals.css](globals.css) for the theme.

It renders immediately and fetches everything over the workflow's own API routes, so it is deliberately not downstream of any step:

- [`GET /cka/questions`](<../Questions API/script.ts>) — bank metadata on load, then question sets when a session starts
- [`POST /cka/grade`](<../Grade answer/script.ts>) — one call per answer
- [`/cka/progress`](<../Progress API/script.ts>) — dashboard on load, session results on finish

Four tabs:

- **progress** — questions answered, mean score, bank coverage, accuracy per domain against that domain's exam weight, weakest topics (click one to drill it), the review queue, and mock-exam score trend.
- **mock exam** — 17 tasks by default, drawn by domain weight, with a 120-minute countdown that auto-submits at zero. Flag-and-skip navigation, then a full report: overall score against a 66% study heuristic, per-domain bars, and every task with its grade, rubric breakdown, model answer and doc link.
- **drills** — filter by domain, topic and question type; check each answer as you go for instant feedback.
- **cheat sheet** — the verified imperative-command set (`--dry-run=client -o yaml`, `create ingress --rule`, `crictl`, static pod and cert paths, the etcdctl snapshot flags) plus the exam-day tactics that decide results.

Answers are typed into a terminal-styled pane and graded as text; nothing is executed against a real cluster. When embedding links back into this workflow the client appends `?branch=` from `window.__BRANCH__`, injected by [render.ts](render.ts), so a draft page talks to the draft's own API routes.
