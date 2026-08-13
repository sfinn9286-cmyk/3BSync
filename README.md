# Fleet Map — Multi-Cloud VM Inventory Dashboard

A demo inventory dashboard that aggregates virtual machine data across
**VMware vSphere**, **Microsoft Azure**, and **Amazon AWS** into a single
normalized view — grouped by provider, filterable by search/status, with
a detail drawer showing both the normalized record and the raw
source-API payload.

![stack](https://img.shields.io/badge/backend-FastAPI-009688) ![stack](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61DAFB)

## Why it's structured this way

Real inventory tools have to reconcile three very different APIs:

| Platform | Native shape | SDK |
|---|---|---|
| VMware vSphere | `vim.VirtualMachine.summary.{config,runtime,guest}` | `pyvmomi` |
| Azure | `VirtualMachine.as_dict()` + `instance_view()` | `azure-mgmt-compute` |
| AWS | `describe_instances()` → `Reservations[].Instances[]` | `boto3` |

Each backend connector (`backend/app/connectors/*.py`) speaks that
provider's native shape and normalizes it into one common `NormalizedVM`
model that the API and UI consume. **The mock data in each connector is
shaped exactly like the real SDK/API response** — so swapping mock →
live data is just implementing the already-stubbed `_fetch_live()`
method (a working real implementation is included, commented for
reference) and setting `USE_MOCK_DATA=false`.

## Project layout

```
vm-inventory-dashboard/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app + routes
│   │   ├── models.py                # Normalized Pydantic models
│   │   └── connectors/
│   │       ├── base.py
│   │       ├── vmware_connector.py  # pyvmomi-shaped mock + real impl
│   │       ├── azure_connector.py   # azure-mgmt-compute-shaped mock + real impl
│   │       └── aws_connector.py     # boto3-shaped mock + real impl
│   ├── tests/test_api.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # filters, polling, layout
│   │   ├── components/
│   │   │   ├── TopBar.jsx
│   │   │   ├── StatsBar.jsx
│   │   │   ├── ProviderPanel.jsx
│   │   │   ├── VMTile.jsx
│   │   │   └── VMDrawer.jsx
│   │   └── api.js
│   └── package.json
└── .github/workflows/ci.yml
```

## Running locally

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API is now live at `http://localhost:8000` (interactive docs at `/docs`).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*`
requests to `http://localhost:8000`, so both need to be running.

## Switching to real data

Set `USE_MOCK_DATA=false` and supply credentials for whichever
platform(s) you want live:

```bash
# VMware
pip install pyvmomi
export VMWARE_HOST=vcenter.example.com
export VMWARE_USER=administrator@vsphere.local
export VMWARE_PASSWORD=...

# Azure
pip install azure-identity azure-mgmt-compute
export AZURE_SUBSCRIPTION_ID=...
# auth via `az login` or AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET

# AWS
pip install boto3
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
```

You can mix mock and live per-provider by editing the `CONNECTORS` dict
in `backend/app/main.py`.

## API reference

| Endpoint | Description |
|---|---|
| `GET /api/vms` | All normalized VMs (optional `?provider=aws\|azure\|vmware`) |
| `GET /api/vms/{id}` | Single VM by its provider-native ID |
| `GET /api/stats` | Totals by provider and power state |
| `GET /api/providers` | List of configured connectors |
| `GET /api/health` | Liveness + whether mock data is active |

## Testing

```bash
# backend
cd backend && python -m pytest tests/ -v

# frontend
cd frontend && npm test
```

Both suites also run in CI on every push/PR — see
`.github/workflows/ci.yml`.

## Notes

This is a demo/reference project: the mock data is static and the
`_fetch_live()` methods are working examples, not hardened production
code (no retry/backoff, pagination limits, or secrets management). For a
production build, add a task queue or scheduled poller instead of
fetching all providers synchronously on every request, and put
credentials in a secrets manager rather than plain env vars.
