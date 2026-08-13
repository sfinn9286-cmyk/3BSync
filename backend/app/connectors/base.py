"""
Base connector interface.

Every real connector (VMware/Azure/AWS) implements `fetch_vms()` and
returns a list of NormalizedVM objects. This lets main.py treat every
provider identically, and lets you swap mock -> real implementations
without touching any other code.
"""
from abc import ABC, abstractmethod

from app.models import NormalizedVM


class BaseConnector(ABC):
    provider_name: str

    @abstractmethod
    def fetch_vms(self) -> list[NormalizedVM]:
        """Return a normalized list of VMs from this provider."""
        raise NotImplementedError
