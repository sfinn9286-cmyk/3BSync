Terraform **apply** runner (triggered downstream of the [Apply API](<../Apply API/script.ts>)).

Ignores stdin; scans `/storage/infra/requests` for status `applying`, runs `terraform apply tfplan` against the plan saved by the [Terraform plan](<../Terraform plan/script.py>) step, captures `terraform output` into the record, and moves the request to `applied` (or `apply_failed`). Idempotent.

**Side effect: creates real, billable AWS resources.** Terraform CLI is in `./tfcli/`; helpers in [store.py](store.py). AWS credentials come from the attached AWS connector.
