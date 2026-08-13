`POST /api/apply` (space-authenticated). Body: `{ "id": "..." }`.

Guarded: only requests in status `planned` may be applied. Sets status `applying` and links to [Terraform apply](<../Terraform apply/script.py>), which runs `terraform apply` against the plan saved during the plan phase. **This creates real, billable AWS resources.** Storage helpers in [lib.ts](lib.ts).
