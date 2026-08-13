Terraform **plan** runner (triggered downstream of the [Decision API](<../Decision API/script.ts>)).

Ignores stdin; scans `/storage/infra/requests` for status `approved`, renders Terraform config from [templates.py](templates.py), runs `terraform init` + `terraform plan -out=tfplan` in a per-request workspace under `/storage/infra/tf/<id>/`, stores the plan output, and moves the request to `planned` (or `plan_failed`). Idempotent.

Terraform CLI is installed into `./tfcli/` at build time (see [Dockerfile](Dockerfile)); shared helpers in [store.py](store.py). AWS credentials come from the attached AWS connector's environment. `plan` is read-only against AWS.
