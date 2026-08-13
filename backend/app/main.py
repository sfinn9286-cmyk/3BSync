import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.connectors.aws_connector import AWSConnector
from app.connectors.azure_connector import AzureConnector
from app.connectors.vmware_connector import VMwareConnector
from app.models import InventoryStats, NormalizedVM

USE_MOCK_DATA = os.getenv("USE_MOCK_DATA", "true").lower() != "false"

app = FastAPI(
    title="VM Inventory Dashboard API",
    description="Aggregates VM inventory across VMware, Azure, and AWS into one normalized API.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this for a real deployment
    allow_methods=["*"],
    allow_headers=["*"],
)

CONNECTORS = {
    "vmware": VMwareConnector(use_mock=USE_MOCK_DATA),
    "azure": AzureConnector(use_mock=USE_MOCK_DATA),
    "aws": AWSConnector(use_mock=USE_MOCK_DATA),
}


@app.get("/api/health")
def health():
    return {"status": "ok", "mock_data": USE_MOCK_DATA}


@app.get("/api/providers")
def list_providers():
    return {"providers": list(CONNECTORS.keys())}


@app.get("/api/vms", response_model=list[NormalizedVM])
def get_vms(provider: str | None = None):
    """Return the normalized VM inventory, optionally filtered by provider."""
    if provider:
        connector = CONNECTORS.get(provider.lower())
        if not connector:
            raise HTTPException(status_code=404, detail=f"Unknown provider '{provider}'")
        return connector.fetch_vms()

    all_vms: list[NormalizedVM] = []
    for connector in CONNECTORS.values():
        all_vms.extend(connector.fetch_vms())
    return all_vms


@app.get("/api/stats", response_model=InventoryStats)
def get_stats():
    all_vms: list[NormalizedVM] = []
    for connector in CONNECTORS.values():
        all_vms.extend(connector.fetch_vms())

    by_provider: dict[str, int] = {}
    by_power_state: dict[str, int] = {}
    for vm in all_vms:
        by_provider[vm.provider.value] = by_provider.get(vm.provider.value, 0) + 1
        by_power_state[vm.power_state.value] = by_power_state.get(vm.power_state.value, 0) + 1

    return InventoryStats(total=len(all_vms), by_provider=by_provider, by_power_state=by_power_state)


@app.get("/api/vms/{vm_id}", response_model=NormalizedVM)
def get_vm(vm_id: str):
    for connector in CONNECTORS.values():
        for vm in connector.fetch_vms():
            if vm.id == vm_id:
                return vm
    raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found")
