"""
Azure connector.

MOCK MODE (default): sample data shaped like what the azure-mgmt-compute
SDK returns from `ComputeManagementClient.virtual_machines.list_all()`
combined with `.instance_view()` for power state - i.e. the same fields
you'd see in `vm.as_dict()`.

REAL MODE: see `_fetch_live()`. Requires:
  pip install azure-identity azure-mgmt-compute
Env vars: AZURE_SUBSCRIPTION_ID (auth via DefaultAzureCredential, so also
AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET or `az login`).
"""
import os

from app.connectors.base import BaseConnector
from app.models import NormalizedVM, PowerState, Provider

AZURE_POWER_STATE_MAP = {
    "PowerState/running": PowerState.RUNNING,
    "PowerState/deallocated": PowerState.STOPPED,
    "PowerState/stopped": PowerState.STOPPED,
}

# Shaped like azure-mgmt-compute's VirtualMachine.as_dict(), trimmed to
# the fields the dashboard cares about, plus the instance_view power
# state code that a second API call would normally supply.
_MOCK_AZURE_VMS = [
    {
        "id": "/subscriptions/xxxx/resourceGroups/rg-prod-app/providers/Microsoft.Compute/virtualMachines/az-app-prod-vm1",
        "name": "az-app-prod-vm1",
        "location": "eastus",
        "hardware_profile": {"vm_size": "Standard_D4s_v5"},
        "storage_profile": {
            "os_disk": {"os_type": "Linux"},
            "image_reference": {"offer": "0001-com-ubuntu-server-jammy"},
        },
        "provisioning_state": "Succeeded",
        "instance_view_power_state": "PowerState/running",
        "tags": {"environment": "production", "team": "platform"},
        "private_ip": "10.1.0.4",
        "public_ip": "20.115.44.10",
        "time_created": "2024-01-05T18:22:00Z",
    },
    {
        "id": "/subscriptions/xxxx/resourceGroups/rg-prod-app/providers/Microsoft.Compute/virtualMachines/az-app-prod-vm2",
        "name": "az-app-prod-vm2",
        "location": "eastus",
        "hardware_profile": {"vm_size": "Standard_D4s_v5"},
        "storage_profile": {
            "os_disk": {"os_type": "Linux"},
            "image_reference": {"offer": "0001-com-ubuntu-server-jammy"},
        },
        "provisioning_state": "Succeeded",
        "instance_view_power_state": "PowerState/running",
        "tags": {"environment": "production", "team": "platform"},
        "private_ip": "10.1.0.5",
        "public_ip": "20.115.44.11",
        "time_created": "2024-01-05T18:24:00Z",
    },
    {
        "id": "/subscriptions/xxxx/resourceGroups/rg-prod-data/providers/Microsoft.Compute/virtualMachines/az-sql-prod-vm1",
        "name": "az-sql-prod-vm1",
        "location": "eastus2",
        "hardware_profile": {"vm_size": "Standard_E8s_v5"},
        "storage_profile": {
            "os_disk": {"os_type": "Windows"},
            "image_reference": {"offer": "sql2022-ws2022"},
        },
        "provisioning_state": "Succeeded",
        "instance_view_power_state": "PowerState/running",
        "tags": {"environment": "production", "team": "data"},
        "private_ip": "10.2.0.4",
        "public_ip": None,
        "time_created": "2023-08-11T09:00:00Z",
    },
    {
        "id": "/subscriptions/xxxx/resourceGroups/rg-dev/providers/Microsoft.Compute/virtualMachines/az-dev-sandbox-01",
        "name": "az-dev-sandbox-01",
        "location": "westus2",
        "hardware_profile": {"vm_size": "Standard_B2s"},
        "storage_profile": {
            "os_disk": {"os_type": "Linux"},
            "image_reference": {"offer": "0001-com-ubuntu-server-jammy"},
        },
        "provisioning_state": "Succeeded",
        "instance_view_power_state": "PowerState/deallocated",
        "tags": {"environment": "dev", "team": "platform"},
        "private_ip": "10.5.0.9",
        "public_ip": None,
        "time_created": "2024-05-30T12:11:00Z",
    },
    {
        "id": "/subscriptions/xxxx/resourceGroups/rg-prod-app/providers/Microsoft.Compute/virtualMachines/az-worker-prod-01",
        "name": "az-worker-prod-01",
        "location": "eastus",
        "hardware_profile": {"vm_size": "Standard_F8s_v2"},
        "storage_profile": {
            "os_disk": {"os_type": "Linux"},
            "image_reference": {"offer": "0001-com-ubuntu-server-jammy"},
        },
        "provisioning_state": "Succeeded",
        "instance_view_power_state": "PowerState/running",
        "tags": {"environment": "production", "team": "platform"},
        "private_ip": "10.1.0.20",
        "public_ip": None,
        "time_created": "2024-04-02T07:45:00Z",
    },
    {
        "id": "/subscriptions/xxxx/resourceGroups/rg-qa/providers/Microsoft.Compute/virtualMachines/az-qa-runner-02",
        "name": "az-qa-runner-02",
        "location": "westeurope",
        "hardware_profile": {"vm_size": "Standard_D2s_v5"},
        "storage_profile": {
            "os_disk": {"os_type": "Windows"},
            "image_reference": {"offer": "WindowsServer"},
        },
        "provisioning_state": "Succeeded",
        "instance_view_power_state": "PowerState/stopped",
        "tags": {"environment": "qa", "team": "qa"},
        "private_ip": "10.9.0.6",
        "public_ip": None,
        "time_created": "2024-06-19T15:30:00Z",
    },
]


class AzureConnector(BaseConnector):
    provider_name = "azure"

    def __init__(self, use_mock: bool = True):
        self.use_mock = use_mock

    def fetch_vms(self) -> list[NormalizedVM]:
        if self.use_mock:
            return [self._normalize(raw) for raw in _MOCK_AZURE_VMS]
        return self._fetch_live()

    @staticmethod
    def _normalize(raw: dict) -> NormalizedVM:
        return NormalizedVM(
            id=raw["id"],
            name=raw["name"],
            provider=Provider.AZURE,
            power_state=AZURE_POWER_STATE_MAP.get(
                raw["instance_view_power_state"], PowerState.UNKNOWN
            ),
            region_or_datacenter=raw["location"],
            cpu_count=_vcpu_from_size(raw["hardware_profile"]["vm_size"]),
            memory_mb=_mem_from_size(raw["hardware_profile"]["vm_size"]),
            os=raw["storage_profile"]["os_disk"]["os_type"],
            private_ip=raw.get("private_ip"),
            public_ip=raw.get("public_ip"),
            tags=raw.get("tags", {}),
            created_at=raw.get("time_created"),
            raw=raw,
        )

    def _fetch_live(self) -> list[NormalizedVM]:
        """
        Real Azure implementation using azure-mgmt-compute + azure-identity.
        """
        from azure.identity import DefaultAzureCredential
        from azure.mgmt.compute import ComputeManagementClient

        subscription_id = os.environ["AZURE_SUBSCRIPTION_ID"]
        credential = DefaultAzureCredential()
        client = ComputeManagementClient(credential, subscription_id)

        results = []
        for vm in client.virtual_machines.list_all():
            rg = vm.id.split("/")[4]
            instance_view = client.virtual_machines.instance_view(rg, vm.name)
            power_state = next(
                (
                    s.code
                    for s in instance_view.statuses
                    if s.code.startswith("PowerState/")
                ),
                "PowerState/unknown",
            )
            raw = {
                "id": vm.id,
                "name": vm.name,
                "location": vm.location,
                "hardware_profile": {"vm_size": vm.hardware_profile.vm_size},
                "storage_profile": {
                    "os_disk": {"os_type": str(vm.storage_profile.os_disk.os_type)},
                    "image_reference": {},
                },
                "provisioning_state": vm.provisioning_state,
                "instance_view_power_state": power_state,
                "tags": vm.tags or {},
                "private_ip": None,
                "public_ip": None,
                "time_created": str(vm.time_created) if vm.time_created else None,
            }
            results.append(self._normalize(raw))
        return results


# Rough Azure vm_size -> (vCPU, memory) lookup for common sizes, so mock
# and live data render consistently without an extra API call per VM.
_SIZE_TABLE = {
    "Standard_B2s": (2, 4096),
    "Standard_D2s_v5": (2, 8192),
    "Standard_D4s_v5": (4, 16384),
    "Standard_E8s_v5": (8, 65536),
    "Standard_F8s_v2": (8, 16384),
}


def _vcpu_from_size(size: str) -> int:
    return _SIZE_TABLE.get(size, (2, 4096))[0]


def _mem_from_size(size: str) -> int:
    return _SIZE_TABLE.get(size, (2, 4096))[1]
