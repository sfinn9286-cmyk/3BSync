"""
AWS connector.

MOCK MODE (default): sample data shaped exactly like the response from
`boto3.client("ec2").describe_instances()` - a list of Reservations,
each containing a list of Instances with InstanceId, State, Tags, etc.

REAL MODE: see `_fetch_live()`. Requires:
  pip install boto3
Env vars: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (or a
configured `~/.aws/credentials` profile / instance role).
"""
import os

from app.connectors.base import BaseConnector
from app.models import NormalizedVM, PowerState, Provider

AWS_POWER_STATE_MAP = {
    "running": PowerState.RUNNING,
    "stopped": PowerState.STOPPED,
    "stopping": PowerState.STOPPED,
    "shutting-down": PowerState.STOPPED,
    "pending": PowerState.RUNNING,
    "terminated": PowerState.STOPPED,
}

_INSTANCE_TYPE_SPECS = {
    "t3.medium": (2, 4096),
    "t3.large": (2, 8192),
    "m5.xlarge": (4, 16384),
    "m5.2xlarge": (8, 32768),
    "r5.2xlarge": (8, 65536),
    "c5.large": (2, 4096),
}

# Shaped exactly like a boto3 ec2.describe_instances() "Reservations"
# list - each reservation wraps one or more "Instances".
_MOCK_AWS_RESERVATIONS = [
    {
        "Instances": [
            {
                "InstanceId": "i-0a1b2c3d4e5f60789",
                "InstanceType": "m5.xlarge",
                "State": {"Name": "running"},
                "Placement": {"AvailabilityZone": "us-east-1a"},
                "PrivateIpAddress": "172.31.4.10",
                "PublicIpAddress": "54.210.11.20",
                "Platform": "linux",
                "LaunchTime": "2024-02-01T14:00:00Z",
                "Tags": [
                    {"Key": "Name", "Value": "aws-api-prod-1"},
                    {"Key": "environment", "Value": "production"},
                ],
            }
        ]
    },
    {
        "Instances": [
            {
                "InstanceId": "i-0a1b2c3d4e5f60790",
                "InstanceType": "m5.xlarge",
                "State": {"Name": "running"},
                "Placement": {"AvailabilityZone": "us-east-1b"},
                "PrivateIpAddress": "172.31.4.11",
                "PublicIpAddress": "54.210.11.21",
                "Platform": "linux",
                "LaunchTime": "2024-02-01T14:02:00Z",
                "Tags": [
                    {"Key": "Name", "Value": "aws-api-prod-2"},
                    {"Key": "environment", "Value": "production"},
                ],
            }
        ]
    },
    {
        "Instances": [
            {
                "InstanceId": "i-0b2c3d4e5f607891",
                "InstanceType": "r5.2xlarge",
                "State": {"Name": "running"},
                "Placement": {"AvailabilityZone": "us-east-1a"},
                "PrivateIpAddress": "172.31.5.20",
                "PublicIpAddress": None,
                "Platform": None,  # None == Linux/UNIX in the real API
                "LaunchTime": "2023-12-15T10:30:00Z",
                "Tags": [
                    {"Key": "Name", "Value": "aws-cache-prod-1"},
                    {"Key": "environment", "Value": "production"},
                ],
            }
        ]
    },
    {
        "Instances": [
            {
                "InstanceId": "i-0c3d4e5f60789012",
                "InstanceType": "c5.large",
                "State": {"Name": "stopped"},
                "Placement": {"AvailabilityZone": "us-west-2a"},
                "PrivateIpAddress": "172.31.9.5",
                "PublicIpAddress": None,
                "Platform": "linux",
                "LaunchTime": "2024-04-20T09:12:00Z",
                "Tags": [
                    {"Key": "Name", "Value": "aws-batch-worker-3"},
                    {"Key": "environment", "Value": "staging"},
                ],
            }
        ]
    },
    {
        "Instances": [
            {
                "InstanceId": "i-0d4e5f6078901234",
                "InstanceType": "t3.large",
                "State": {"Name": "running"},
                "Placement": {"AvailabilityZone": "us-west-2b"},
                "PrivateIpAddress": "172.31.9.8",
                "PublicIpAddress": "35.166.2.9",
                "Platform": "windows",
                "LaunchTime": "2024-05-01T17:45:00Z",
                "Tags": [
                    {"Key": "Name", "Value": "aws-jenkins-agent-1"},
                    {"Key": "environment", "Value": "staging"},
                ],
            }
        ]
    },
    {
        "Instances": [
            {
                "InstanceId": "i-0e5f607890123456",
                "InstanceType": "t3.medium",
                "State": {"Name": "running"},
                "Placement": {"AvailabilityZone": "eu-west-1a"},
                "PrivateIpAddress": "172.31.20.4",
                "PublicIpAddress": None,
                "Platform": "linux",
                "LaunchTime": "2024-06-10T08:00:00Z",
                "Tags": [
                    {"Key": "Name", "Value": "aws-monitoring-eu-1"},
                    {"Key": "environment", "Value": "production"},
                ],
            }
        ]
    },
]


class AWSConnector(BaseConnector):
    provider_name = "aws"

    def __init__(self, use_mock: bool = True):
        self.use_mock = use_mock

    def fetch_vms(self) -> list[NormalizedVM]:
        if self.use_mock:
            instances = [
                inst
                for reservation in _MOCK_AWS_RESERVATIONS
                for inst in reservation["Instances"]
            ]
            return [self._normalize(raw) for raw in instances]
        return self._fetch_live()

    @staticmethod
    def _normalize(raw: dict) -> NormalizedVM:
        tags = {t["Key"]: t["Value"] for t in raw.get("Tags", [])}
        cpu, mem = _INSTANCE_TYPE_SPECS.get(raw["InstanceType"], (2, 4096))
        return NormalizedVM(
            id=raw["InstanceId"],
            name=tags.get("Name", raw["InstanceId"]),
            provider=Provider.AWS,
            power_state=AWS_POWER_STATE_MAP.get(
                raw["State"]["Name"], PowerState.UNKNOWN
            ),
            region_or_datacenter=raw["Placement"]["AvailabilityZone"],
            cpu_count=cpu,
            memory_mb=mem,
            os="windows" if raw.get("Platform") == "windows" else "linux",
            private_ip=raw.get("PrivateIpAddress"),
            public_ip=raw.get("PublicIpAddress"),
            tags=tags,
            created_at=raw.get("LaunchTime"),
            raw=raw,
        )

    def _fetch_live(self) -> list[NormalizedVM]:
        """
        Real AWS implementation using boto3. Paginates across all
        reservations/instances in the configured region.
        """
        import boto3

        client = boto3.client("ec2", region_name=os.getenv("AWS_REGION", "us-east-1"))
        paginator = client.get_paginator("describe_instances")

        instances = []
        for page in paginator.paginate():
            for reservation in page["Reservations"]:
                instances.extend(reservation["Instances"])

        return [self._normalize(raw) for raw in instances]
