"""Terraform apply runner.

Triggered downstream of the Apply API. Scans the requests volume for requests
in status "applying", runs `terraform apply` against the plan saved during the
plan phase, captures outputs, and moves each to "applied" (or "apply_failed").
Ignores stdin — works from volume state, so it is idempotent.

AWS credentials come from the environment (attached AWS connector).
"""
import json
import sys
import store


def process(rec):
    req_id = rec["id"]
    ws = store.workspace(req_id)
    print(f"[{req_id}] applying {rec['type']}", file=sys.stderr)
    store.history(rec, "applying")
    store.save(rec)

    # Re-init in case the plugin cache/workspace needs it, then apply the saved plan.
    init = store.run_tf(ws, ["init", "-no-color", "-input=false"])
    if init["rc"] != 0:
        rec["status"] = "apply_failed"
        rec["applyOutput"] = "terraform init failed:\n" + init["output"]
        rec["applyAt"] = store._ts()
        store.history(rec, "apply_failed", "init failed")
        store.save(rec)
        return

    apply = store.run_tf(ws, ["apply", "-no-color", "-input=false", "tfplan"])
    rec["applyOutput"] = apply["output"]
    rec["applyAt"] = store._ts()

    if apply["rc"] == 0:
        rec["status"] = "applied"
        # Capture outputs (values only; sensitive values included for retrieval).
        out = store.run_tf(ws, ["output", "-json"])
        if out["rc"] == 0:
            try:
                parsed = json.loads(out["output"])
                rec["outputs"] = {k: v.get("value") for k, v in parsed.items()}
            except Exception:
                rec["outputs"] = {}
        store.history(rec, "applied")
    else:
        rec["status"] = "apply_failed"
        store.history(rec, "apply_failed")
    store.save(rec)


def main():
    try:
        sys.stdin.read()
    except Exception:
        pass

    pending = [r for r in store.load_all() if r.get("status") == "applying"]
    if not pending:
        print("No requests awaiting apply.", file=sys.stderr)
        print("ok")
        return
    for rec in pending:
        try:
            process(rec)
        except Exception as e:
            print(f"[{rec['id']}] error: {e}", file=sys.stderr)
            rec["status"] = "apply_failed"
            rec["applyOutput"] = f"Runner error: {e}"
            store.history(rec, "apply_failed", str(e))
            store.save(rec)
    print("ok")


if __name__ == "__main__":
    main()
