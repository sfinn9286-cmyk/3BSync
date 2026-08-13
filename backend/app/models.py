"""
Unified data models for the VM inventory dashboard.

Each cloud/virtualization platform returns VM info in a different shape.
`NormalizedVM` is the common shape the frontend consumes. Each connector
is responsible for mapping its provider's native SDK/REST response into
this shape (see connectors/*.py).
"""
from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class Provider(str, Enum):
    VMWARE = "vmware"
    AZURE = "azure"
    AWS = "aws"


class PowerState(str, Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    SUSPENDED = "suspended"
    UNKNOWN = "unknown"


class NormalizedVM(BaseModel):
    """Common shape used by the UI, regardless of source platform."""

    id: str = Field(..., description="Provider-native unique identifier")
    name: str
    provider: Provider
    power_state: PowerState
    region_or_datacenter: str = Field(
        ..., description="vSphere datacenter/cluster, Azure region, or AWS AZ"
    )
    cpu_count: int
    memory_mb: int
    os: Optional[str] = None
    private_ip: Optional[str] = None
    public_ip: Optional[str] = None
    tags: dict[str, str] = Field(default_factory=dict)
    created_at: Optional[str] = None

    # Raw, provider-native record kept for the detail drawer / debugging,
    # so users can see exactly what the source API returned.
    raw: dict = Field(default_factory=dict)


class InventoryStats(BaseModel):
    total: int
    by_provider: dict[str, int]
    by_power_state: dict[str, int]
