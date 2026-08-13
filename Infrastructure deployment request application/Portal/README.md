Single-page web console served at route `/` (space-authenticated). This is the human entry point to the portal.

It fetches the resource catalog from `GET /api/catalog` to build dynamic request forms, polls `GET /api/requests` every few seconds to show live status, and drives the workflow through `POST /api/requests`, `POST /api/decision`, and `POST /api/apply`.

Features: submit a new request (EC2 / S3 / RDS) with per-type fields, review pending requests, approve/reject, inspect the `terraform plan` output, and confirm apply. Apply is deliberately gated behind an explicit confirmation because it creates billable AWS resources.

The UI is a dark "control-room" theme (IBM Plex Mono/Sans). API calls are branch-aware — they forward the `?branch=` param so the console works on draft branches. See [App.tsx](App.tsx).
