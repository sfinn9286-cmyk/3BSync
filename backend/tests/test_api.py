from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_list_providers():
    resp = client.get("/api/providers")
    assert resp.status_code == 200
    providers = resp.json()["providers"]
    assert set(providers) == {"vmware", "azure", "aws"}


def test_get_all_vms():
    resp = client.get("/api/vms")
    assert resp.status_code == 200
    vms = resp.json()
    assert len(vms) > 0
    providers_seen = {vm["provider"] for vm in vms}
    assert providers_seen == {"vmware", "azure", "aws"}


def test_get_vms_filtered_by_provider():
    resp = client.get("/api/vms", params={"provider": "aws"})
    assert resp.status_code == 200
    vms = resp.json()
    assert all(vm["provider"] == "aws" for vm in vms)
    assert len(vms) > 0


def test_get_vms_unknown_provider():
    resp = client.get("/api/vms", params={"provider": "nonexistent"})
    assert resp.status_code == 404


def test_get_stats():
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["total"] == sum(stats["by_provider"].values())
    assert stats["total"] == sum(stats["by_power_state"].values())


def test_get_single_vm():
    all_vms = client.get("/api/vms").json()
    target = all_vms[0]
    resp = client.get(f"/api/vms/{target['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == target["id"]


def test_get_single_vm_not_found():
    resp = client.get("/api/vms/does-not-exist")
    assert resp.status_code == 404
