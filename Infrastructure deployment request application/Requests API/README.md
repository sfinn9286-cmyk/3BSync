`GET/POST /api/requests` (space-authenticated).

- `GET` — list all request records (newest first).
- `POST` — create a request. Body: `{ "type": "<catalog id>", "params": { ... } }`. Params are validated against the catalog schema ([catalog.ts](catalog.ts)); the record is stored on the `infra` volume with status `submitted`.

Shared storage/HTTP helpers are in [lib.ts](lib.ts). Records live at `/storage/infra/requests/<id>.json`.
