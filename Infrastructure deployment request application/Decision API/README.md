`POST /api/decision` (space-authenticated). Body: `{ "id": "...", "decision": "approve" | "reject", "reason"? }`.

Only requests in status `submitted` can be decided. Approve → status `approved`; reject → `rejected`. This step links to [Terraform plan](<../Terraform plan/script.py>), which scans the volume for approved requests and generates a plan. Storage helpers in [lib.ts](lib.ts).
