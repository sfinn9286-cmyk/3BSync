"""Shared storage + terraform helpers for the runner steps.

Request records live at /storage/infra/requests/<id>.json.
Per-request terraform workspaces live at /storage/infra/tf/<id>/.
A shared provider plugin cache lives at /storage/infra/plugin-cache.
"""
import json
import os
import subprocess
from typing import Any, Dict, List, Optional

REQ_DIR = "/storage/infra/requests"
TF_DIR = "/storage/infra/tf"
PLUGIN_CACHE = "/storage/infra/plugin-cache"


def _ts() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def load_all() -> List[Dict[str, Any]]:
    os.makedirs(REQ_DIR, exist_ok=True)
    out = []
    for f in os.listdir(REQ_DIR):
        if f.endswith(".json"):
            try:
                with open(os.path.join(REQ_DIR, f)) as fh:
                    out.append(json.load(fh))
            except Exception:
                pass
    return out


def save(rec: Dict[str, Any]) -> None:
    os.makedirs(REQ_DIR, exist_ok=True)
    path = os.path.join(REQ_DIR, f"{rec['id']}.json")
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(rec, fh, indent=2)
    os.replace(tmp, path)


def history(rec: Dict[str, Any], event: str, detail: Optional[str] = None) -> None:
    rec.setdefault("history", []).append({"at": _ts(), "event": event, "detail": detail})


def workspace(req_id: str) -> str:
    return os.path.join(TF_DIR, req_id)


def write_workspace(req_id: str, main_tf: str, tfvars: Dict[str, Any]) -> str:
    ws = workspace(req_id)
    os.makedirs(ws, exist_ok=True)
    with open(os.path.join(ws, "main.tf"), "w") as fh:
        fh.write(main_tf)
    with open(os.path.join(ws, "terraform.tfvars.json"), "w") as fh:
        json.dump(tfvars, fh, indent=2)
    return ws


def tf_env() -> Dict[str, str]:
    os.makedirs(PLUGIN_CACHE, exist_ok=True)
    env = dict(os.environ)
    env["TF_PLUGIN_CACHE_DIR"] = PLUGIN_CACHE
    env["TF_IN_AUTOMATION"] = "1"
    env["TF_INPUT"] = "0"
    return env


def _tf_bin() -> str:
    # Terraform is installed into ./tfcli (a build cache-mount dir) which
    # persists into the runtime working directory.
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (
        os.path.join(here, "tfcli", "terraform"),
        os.path.join(here, "terraform"),
        os.path.abspath("tfcli/terraform"),
    ):
        if os.path.exists(cand):
            return cand
    return "terraform"


def run_tf(ws: str, args: List[str], timeout: int = 240) -> Dict[str, Any]:
    """Run a terraform subcommand in workspace `ws`. Returns dict with rc/out."""
    proc = subprocess.run(
        [_tf_bin(), f"-chdir={ws}", *args],
        env=tf_env(),
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    combined = proc.stdout + ("\n" + proc.stderr if proc.stderr else "")
    return {"rc": proc.returncode, "output": combined}
