`GET /api/catalog` (space-authenticated) — returns the resource catalog: the resource types users can request and the form-field schema for each. This is the single source of truth for the request form (Portal) and for validation ([Requests API](<../Requests API/script.ts>)).

Edit [catalog.ts](catalog.ts) to add or change resource types. Terraform templates for each type live in [Terraform plan/templates.py](<../Terraform plan/templates.py>) — keep the two in sync (same `id`).
