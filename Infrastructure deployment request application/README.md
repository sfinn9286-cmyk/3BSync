Self-service portal for requesting AWS infrastructure, reviewing it, and provisioning it with Terraform — with a mandatory human approval gate and a two-stage plan/apply safety flow.

**Who uses it.** Engineers submit requests for infrastructure (EC2, S3, RDS). An approver reviews each request. Once approved, a Terraform *plan* is generated for inspection; provisioning only happens after a second, explicit "apply" confirmation.

**Entry point.** The [Portal](<Portal/App.tsx>) web app at route `/` (space-authenticated). It is a single-page console that talks to the JSON API steps below.

**The flow.**
1. `POST /api/requests` — a request is created in status `submitted` ([Requests API](<Requests API/script.ts>)).
2. `POST /api/decision` — an approver approves or rejects ([Decision API](<Decision API/script.ts>)). Approval triggers the [Terraform plan](<Terraform plan/script.py>) step.
3. The plan runner renders Terraform for the request, runs `init` + `plan`, and stores the output (status → `planned`).
4. `POST /api/apply` — after reviewing the plan, a user confirms apply ([Apply API](<Apply API/script.ts>)), triggering the [Terraform apply](<Terraform apply/script.py>) step which runs `terraform apply` against the saved plan (status → `applied`, with outputs captured).

Status lifecycle: `submitted → approved → planning → planned → applying → applied`, with `rejected`, `plan_failed`, `apply_failed` branches.

**Catalog.** Resource types and their form fields are defined once in [Catalog API/catalog.ts](<Catalog API/catalog.ts>) and served at `GET /api/catalog`. Terraform templates for each type live in [Terraform plan/templates.py](<Terraform plan/templates.py>). To add a resource type, add a catalog entry and a matching template builder.

**State.** Request records and per-request Terraform working directories/state are stored on the `infra` named volume (exclusive writers). Draft branches use isolated volume data that is discarded on publish.

**External services.** Terraform's AWS provider talks directly to AWS. AWS credentials are provided to the two runner steps via an attached AWS connector (environment credentials). Terraform providers are downloaded from the public registry at plan time (cached on the volume).

**Side effects.** `terraform apply` creates real, billable AWS resources. Everything up to and including `plan` is read-only against AWS.
