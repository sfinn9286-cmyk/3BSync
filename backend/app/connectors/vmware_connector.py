"""
VMware vSphere connector.

MOCK MODE (default): returns sample data shaped exactly like what you get
back from pyvmomi when you walk the vSphere inventory - i.e. each mock
record mirrors the fields you'd read off a `vim.VirtualMachine` object
(`.summary.config`, `.summary.runtime`, `.summary.guest`, etc).

REAL MODE: see `_fetch_live()` below for a working pyvmomi implementation.
To use it, `pip install pyvmomi` and set these env vars:
  VMWARE_HOST, VMWARE_USER, VMWARE_PASSWORD, VMWARE_VERIFY_SSL (optional)
then set USE_MOCK_DATA=false.
"""
import os

from app.connectors.base import BaseConnector
from app.models import NormalizedVM, PowerState, Provider

VMWARE_POWER_STATE_MAP = {
    "poweredOn": PowerState.RUNNING,
    "poweredOff": PowerState.STOPPED,
    "suspended": PowerState.SUSPENDED,
}

# Shaped like the fields you'd pull off vim.VirtualMachine.summary in
# pyvmomi: summary.config.{name,numCpu,memorySizeMB,guestFullName},
# summary.runtime.powerState, summary.guest.ipAddress, and the
# cluster/datacenter the VM lives in.
_MOCK_VSPHERE_VMS = [
    {
        "moId": "vm-1021",
        "summary.config.name": "vc-web-prod-01",
        "summary.config.numCpu": 4,
        "summary.config.memorySizeMB": 16384,
        "summary.config.guestFullName": "Ubuntu Linux (64-bit)",
        "summary.runtime.powerState": "poweredOn",
        "summary.guest.ipAddress": "10.20.4.11",
        "datacenter": "DC-East",
        "cluster": "Cluster-Prod-A",
        "resourcePool": "Production",
        "createDate": "2023-11-02T09:14:00Z",
        "tags": {"env": "prod", "app": "web"},
    },
    {
        "moId": "vm-1022",
        "summary.config.name": "vc-web-prod-02",
        "summary.config.numCpu": 4,
        "summary.config.memorySizeMB": 16384,
        "summary.config.guestFullName": "Ubuntu Linux (64-bit)",
        "summary.runtime.powerState": "poweredOn",
        "summary.guest.ipAddress": "10.20.4.12",
        "datacenter": "DC-East",
        "cluster": "Cluster-Prod-A",
        "resourcePool": "Production",
        "createDate": "2023-11-02T09:15:00Z",
        "tags": {"env": "prod", "app": "web"},
    },
    {
        "moId": "vm-1030",
        "summary.config.name": "vc-db-prod-01",
        "summary.config.numCpu": 8,
        "summary.config.memorySizeMB": 65536,
        "summary.config.guestFullName": "Red Hat Enterprise Linux 9 (64-bit)",
        "summary.runtime.powerState": "poweredOn",
        "summary.guest.ipAddress": "10.20.4.30",
        "datacenter": "DC-East",
        "cluster": "Cluster-Prod-A",
        "resourcePool": "Production",
        "createDate": "2023-09-18T13:40:00Z",
        "tags": {"env": "prod", "app": "database"},
    },
    {
        "moId": "vm-1044",
        "summary.config.name": "vc-cache-prod-01",
        "summary.config.numCpu": 2,
        "summary.config.memorySizeMB": 8192,
        "summary.config.guestFullName": "Ubuntu Linux (64-bit)",
        "summary.runtime.powerState": "poweredOn",
        "summary.guest.ipAddress": "10.20.4.44",
        "datacenter": "DC-East",
        "cluster": "Cluster-Prod-B",
        "resourcePool": "Production",
        "createDate": "2024-01-10T08:02:00Z",
        "tags": {"env": "prod", "app": "cache"},
    },
    {
        "moId": "vm-2011",
        "summary.config.name": "vc-web-stg-01",
        "summary.config.numCpu": 2,
        "summary.config.memorySizeMB": 8192,
        "summary.config.guestFullName": "Ubuntu Linux (64-bit)",
        "summary.runtime.powerState": "poweredOff",
        "summary.guest.ipAddress": None,
        "datacenter": "DC-West",
        "cluster": "Cluster-Stage",
        "resourcePool": "Staging",
        "createDate": "2024-03-22T11:00:00Z",
        "tags": {"env": "staging", "app": "web"},
    },
    {
        "moId": "vm-2020",
        "summary.config.name": "vc-build-agent-03",
        "summary.config.numCpu": 4,
        "summary.config.memorySizeMB": 16384,
        "summary.config.guestFullName": "Windows Server 2022",
        "summary.runtime.powerState": "poweredOn",
        "summary.guest.ipAddress": "10.30.1.23",
        "datacenter": "DC-West",
        "cluster": "Cluster-Stage",
        "resourcePool": "CI",
        "createDate": "2024-02-14T16:20:00Z",
        "tags": {"env": "staging", "app": "ci"},
    },
    {
        "moId": "vm-3050",
        "summary.config.name": "vc-legacy-app-01",
        "summary.config.numCpu": 2,
        "summary.config.memorySizeMB": 4096,
        "summary.config.guestFullName": "CentOS 7 (64-bit)",
        "summary.runtime.powerState": "suspended",
        "summary.guest.ipAddress": "10.10.9.5",
        "datacenter": "DC-East",
        "cluster": "Cluster-Legacy",
        "resourcePool": "Legacy",
        "createDate": "2019-06-01T10:00:00Z",
        "tags": {"env": "prod", "app": "legacy"},
    },
]


class VMwareConnector(BaseConnector):
    provider_name = "vmware"

    def __init__(self, use_mock: bool = True):
        self.use_mock = use_mock

    def fetch_vms(self) -> list[NormalizedVM]:
        if self.use_mock:
            return [self._normalize(raw) for raw in _MOCK_VSPHERE_VMS]
        return self._fetch_live()

    @staticmethod
    def _normalize(raw: dict) -> NormalizedVM:
        return NormalizedVM(
            id=raw["moId"],
            name=raw["summary.config.name"],
            provider=Provider.VMWARE,
            power_state=VMWARE_POWER_STATE_MAP.get(
                raw["summary.runtime.powerState"], PowerState.UNKNOWN
            ),
            region_or_datacenter=f'{raw["datacenter"]} / {raw["cluster"]}',
            cpu_count=raw["summary.config.numCpu"],
            memory_mb=raw["summary.config.memorySizeMB"],
            os=raw["summary.config.guestFullName"],
            private_ip=raw["summary.guest.ipAddress"],
            public_ip=None,
            tags=raw.get("tags", {}),
            created_at=raw.get("createDate"),
            raw=raw,
        )

    def _fetch_live(self) -> list[NormalizedVM]:
        """
        Real vSphere implementation using pyvmomi. Requires:
          pip install pyvmomi
        Env vars: VMWARE_HOST, VMWARE_USER, VMWARE_PASSWORD
        """
        from pyVim.connect import SmartConnect, Disconnect
        from pyVmomi import vim
        import ssl
        import atexit

        context = None
        if os.getenv("VMWARE_VERIFY_SSL", "false").lower() != "true":
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            context.verify_mode = ssl.CERT_NONE

        si = SmartConnect(
            host=os.environ["VMWARE_HOST"],
            user=os.environ["VMWARE_USER"],
            pwd=os.environ["VMWARE_PASSWORD"],
            sslContext=context,
        )
        atexit.register(Disconnect, si)

        content = si.RetrieveContent()
        container = content.viewManager.CreateContainerView(
            content.rootFolder, [vim.VirtualMachine], True
        )

        results = []
        for vm in container.view:
            summary = vm.summary
            raw = {
                "moId": vm._moId,
                "summary.config.name": summary.config.name,
                "summary.config.numCpu": summary.config.numCpu,
                "summary.config.memorySizeMB": summary.config.memorySizeMB,
                "summary.config.guestFullName": summary.config.guestFullName,
                "summary.runtime.powerState": str(summary.runtime.powerState),
                "summary.guest.ipAddress": summary.guest.ipAddress,
                "datacenter": vm.summary.config.vmPathName,  # simplified
                "cluster": "",
                "resourcePool": "",
                "createDate": None,
                "tags": {},
            }
            results.append(self._normalize(raw))
        container.Destroy()
        return results
