---
name: salesforce-expert
description: >
  Work with Salesforce as an expert from a 3B workflow — authenticate, query with
  SOQL, read and write records via the REST API, run large jobs with the Bulk API 2.0,
  and handle the platform's quirks. Use this whenever a task touches Salesforce: querying
  or reporting on Accounts, Contacts, Leads, Opportunities, Cases or custom objects;
  creating, updating, upserting or deleting records; syncing data in or out of Salesforce;
  reacting to Salesforce events; or building any 3B integration against a Salesforce org —
  even if "SOQL", "REST API", or "Bulk API" is never mentioned.
---

# Working with Salesforce

Salesforce is a multi-tenant CRM with a REST/SOAP API surface over a relational-ish object
model. From a 3B workflow you talk to it over HTTPS, authenticated through a **connector** —
never hardcode tokens or credentials. Write plain `fetch`/HTTP requests; the proxy injects auth.

## Authentication (connector)

Connect the step to Salesforce with `connectToApp`, using the org's REST base as the target
URL, e.g. `https://<MyDomain>.my.salesforce.com/services/data/v60.0/sobjects`. Salesforce
connectors are OAuth 2.0; the proxy adds the `Authorization: Bearer <token>` header for you.

Key facts:
- **Instance URL matters.** Every API call goes to the org's *instance* host
  (`https://<MyDomain>.my.salesforce.com`), not `login.salesforce.com`. If the connector
  exposes the instance URL via an env var (check the `aiContext` returned after connecting),
  use it; otherwise the base URL is baked into the connector's target.
- **API version.** Pin a recent version in the path: `/services/data/v60.0/`. Don't leave it
  floating. `GET /services/data/` lists supported versions.
- Sandboxes use `test.salesforce.com` for login and a `--<sandbox>.sandbox.my.salesforce.com`
  instance host. Same code, different connector.

## The object model

- Standard objects: `Account`, `Contact`, `Lead`, `Opportunity`, `Case`, `User`, `Task`, `Event`.
- Custom objects and custom fields end in `__c` (e.g. `Invoice__c`, `Region__c`).
- Custom relationship fields use `__r` when traversed in SOQL (e.g. `Account.Owner.Name`,
  `MyCustom__r.Name`).
- Every record has a 15- or 18-character `Id`. The 18-char form is case-safe; treat Ids as
  opaque strings. Object metadata: `GET /sobjects/Account/describe`.

## SOQL — querying

SOQL is SELECT-only and requires you to name every field (no `SELECT *`).

```
GET /services/data/v60.0/query/?q=<url-encoded SOQL>
```

```sql
SELECT Id, Name, Amount, StageName, Account.Name, Owner.Email
FROM Opportunity
WHERE StageName = 'Closed Won' AND CloseDate = THIS_QUARTER
ORDER BY Amount DESC
LIMIT 200
```

Essentials and gotchas:
- **Always URL-encode** the query string. Single-quote string literals; escape embedded quotes.
- **Relationship queries:** parent traversal with dots (`Account.Name`); child subqueries with
  the relationship name (`(SELECT LastName FROM Contacts)` inside a query `FROM Account`).
- **Date literals** are unquoted keywords: `TODAY`, `YESTERDAY`, `LAST_N_DAYS:30`, `THIS_MONTH`.
- **Pagination:** responses include `totalSize`, `done`, and `nextRecordsUrl`. If `done` is
  false, GET the `nextRecordsUrl` (already a full path) and repeat until `done` is true. Default
  batch is 2000 records. Always loop — never assume one page.
- Use `query` for normal data; `queryAll` to include deleted/archived rows.
- Aggregates: `SELECT StageName, COUNT(Id), SUM(Amount) FROM Opportunity GROUP BY StageName`.
- **SOSL** (`/search/?q=FIND {term}`) is for full-text search across multiple objects; use it
  when the user wants "find anything matching X", not SOQL.

## REST API — single records

```
POST   /sobjects/Account                     create   → { id, success }
GET    /sobjects/Account/{id}                retrieve
GET    /sobjects/Account/{id}?fields=Name,...  retrieve selected fields
PATCH  /sobjects/Account/{id}                update   → 204 No Content
DELETE /sobjects/Account/{id}                delete   → 204
```

**Upsert by external id** (idempotent — the right tool for syncs, avoids duplicates):

```
PATCH /sobjects/Account/External_Id__c/{externalValue}
```

Returns 201 (created) or 204 (updated). The external id field must be marked "External ID" in
Salesforce. Prefer upsert over "query then insert-or-update" — it's atomic and race-free.

## Composite & bulk-ish operations (small-to-medium)

- **sObject Collections** — up to 200 records in one call:
  `POST /composite/sobjects` with `{ "allOrNone": false, "records": [{ "attributes": {"type":"Account"}, "Name": "..." }, ...] }`. PATCH/DELETE variants exist. Best for tens–low
  hundreds of records.
- **Composite** — chain up to 25 dependent subrequests, referencing earlier results with
  `@{refId.id}`: `POST /composite`.
- **Composite Graph** — for complex related-record trees in one transaction.

## Bulk API 2.0 — large jobs (thousands+)

Use for large exports/imports where synchronous calls would time out or hit limits.

Ingest (insert/update/upsert/delete) flow:
1. `POST /jobs/ingest` with `{ "object": "Contact", "operation": "upsert",
   "externalIdFieldName": "External_Id__c", "lineEnding": "LF" }` → returns job `id`.
2. `PUT /jobs/ingest/{id}/batches` with the **CSV body** (header row + rows), `Content-Type: text/csv`.
3. `PATCH /jobs/ingest/{id}` with `{ "state": "UploadComplete" }`.
4. Poll `GET /jobs/ingest/{id}` until `state` is `JobComplete` (or `Failed`).
5. Fetch results: `GET /jobs/ingest/{id}/successfulResults`, `/failedResults`, `/unprocessedRecords`.

Query flow: `POST /jobs/query` with `{ "operation": "query", "query": "SELECT ..." }`, poll,
then `GET /jobs/query/{id}/results` (paginated via `Sforce-Locator` header and `maxRecords`).

Bulk is CSV-based and asynchronous — architect the 3B workflow accordingly (a submit step, then
a polling step, driven by cron or a self-re-invoking loop; store the job id in a volume between polls).

## Governor limits & rate limits — design around them

- Org-wide **daily API request limit** (per 24h, tied to edition/licenses). Batch aggressively:
  one collections/bulk call beats N single calls. Check headers: responses carry
  `Sforce-Limit-Info: api-usage=<used>/<total>`.
- **SOQL:** query selectivity matters; filter on indexed fields (Id, Name, external ids,
  lookups) to avoid non-selective query errors on large tables.
- **Bulk 2.0** has its own daily record limits, separate from the REST request count — prefer it
  for volume precisely because it doesn't burn per-record API calls.

## Error handling

Salesforce returns errors as a JSON array: `[{ "message": "...", "errorCode": "..." }]`.

- `401 INVALID_SESSION_ID` — token expired; the connector should refresh. If it recurs, the
  connector needs reconnecting.
- `400 MALFORMED_QUERY` — SOQL syntax; check encoding and field names.
- `400 REQUIRED_FIELD_MISSING` / `INVALID_FIELD` — field name or required-field problem;
  `describe` the object to confirm API names (they differ from labels).
- `400 DUPLICATE_VALUE` / `DUPLICATES_DETECTED` — matching rules; use upsert or set the
  `Sforce-Duplicate-Rule-Header` to override where appropriate.
- `403 REQUEST_LIMIT_EXCEEDED` — daily API cap hit; back off, batch harder.
- `STORAGE_LIMIT_EXCEEDED`, `FIELD_CUSTOM_VALIDATION_EXCEPTION` — org-side; surface the message
  to the user, don't silently retry.

Retry `401` once (after refresh) and `5x` with exponential backoff; never blind-retry `4xx`
validation errors.

## Reports & analytics

To reuse an existing Salesforce report: `GET /analytics/reports/{reportId}` runs it and returns
the fact map. For ad-hoc metrics, a `GROUP BY` SOQL aggregate is usually simpler and cheaper
than the Reports API.

## Change events / triggers into 3B

Salesforce can push outbound. To trigger a 3B workflow from Salesforce, set up a **Flow /
Outbound Message / Platform Event → webhook** pointing at a 3B route step
(`route_auth = "external_id"`, `route_type = "webhook"`). Salesforce also offers CDC (Change
Data Capture) and the Streaming/Pub-Sub API, but those need a persistent subscriber; for
event-driven 3B integrations, an Apex-triggered or Flow-triggered callout to a 3B webhook is the
pragmatic path.

## Practical checklist for a 3B Salesforce step

1. `connectToApp` against the org's `/services/data/vXX.X/` base — no manual auth headers.
2. Pin the API version in every path.
3. Read the object's `describe` if you're unsure of API field names (label ≠ API name).
4. Prefer batched operations: collections for ≤200, Bulk 2.0 for large volumes.
5. Use upsert-by-external-id for syncs; it's idempotent.
6. Always paginate SOQL via `nextRecordsUrl` until `done`.
7. Check `Sforce-Limit-Info` and handle the error-array shape.
8. Log to stderr; write only the intended payload to stdout.
