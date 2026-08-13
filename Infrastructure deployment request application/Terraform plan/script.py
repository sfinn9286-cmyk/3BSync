"""Terraform plan runner.

Triggered downstream of the Decision API. Scans the requests volume for
requests in status "approved", renders their Terraform config, runs
`terraform init` + `terraform plan`, stores the plan output, and moves each to
"planned" (or "plan_failed"). Ignores stdin — it works from volume state so it
is idempotent and safe to trigger repeatedly.

AWS credentials are read from the environment (provided by the attached AWS
connector). Region comes from each request's params.
"""
import sys
import templates
import store


def process(rec):
    req_id = rec["id"]
    print(f"[{req_id}] planning {rec['type']} in {rec.get('region')}", file=sys.stderr)
    rec["status"] = "planning"
    store.history(rec, "planning")
    store.save(rec)

    try:
        main_tf, tfvars = templates.build(rec["type"], rec["params"])
    except Exception as e:
        rec["status"] = "plan_failed"
        rec["planOutput"] = f"Template error: {e}"
        rec["planAt"] = store._ts()
        store.history(rec, "plan_failed", str(e))
        store.save(rec)
        return

    ws = store.write_workspace(req_id, main_tf, tfvars)

    init = store.run_tf(ws, ["init", "-no-color", "-input=false"])
    if init["rc"] != 0:
        rec["status"] = "plan_failed"
        rec["planOutput"] = "terraform init failed:\n" + init["output"]
        rec["planAt"] = store._ts()
        store.history(rec, "plan_failed", "init failed")
        store.save(rec)
        return

    plan = store.run_tf(ws, ["plan", "-no-color", "-input=false", "-out=tfplan"])
    rec["planOutput"] = plan["output"]
    rec["planAt"] = store._ts()
    if plan["rc"] == 0:
        rec["status"] = "planned"
        store.history(rec, "planned")
    else:
        rec["status"] = "plan_failed"
        store.history(rec, "plan_failed")
    store.save(rec)


def main():
    # Drain stdin so upstream doesn't block; we don't use it.
    try:
        sys.stdin.read()
    except Exception:
        pass

    approved = [r for r in store.load_all() if r.get("status") == "approved"]
    if not approved:
        print("No approved requests awaiting plan.", file=sys.stderr)
        print("ok")
        return
    for rec in approved:
        try:
            process(rec)
        except Exception as e:
            print(f"[{rec['id']}] error: {e}", file=sys.stderr)
            rec["status"] = "plan_failed"
            rec["planOutput"] = f"Runner error: {e}"
            store.history(rec, "plan_failed", str(e))
            store.save(rec)
    print("ok")


if __name__ == "__main__":
    main()
