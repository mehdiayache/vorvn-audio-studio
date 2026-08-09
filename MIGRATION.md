# Legacy migration — completed

This record is intentionally short. Git history contains the detailed sequence
and rollback points.

## Runtime now

```text
React -> FastAPI -> application services -> provider adapters / PostgreSQL
                         \-> durable supervised Jobs
```

- React is the only UI.
- FastAPI is the only HTTP application server.
- `server.py`, `db.py`, the legacy UI and port 7861 are deleted.
- Ordered, checksummed PostgreSQL migrations are the only schema bootstrap.
- Provider work runs through durable Jobs with worker leases and heartbeats.
- Media paths have one deployment owner; voice masters are durable.
- S3-compatible provider inputs use private, ID-scoped objects and short-lived
  presigned URLs.

## Current safeguards

- The process refuses non-loopback binding because remote authentication and
  tenant authorization are not implemented yet.
- A worker crash is detected and the local supervisor restarts it.
- Running Jobs use heartbeat leases; cancellation and terminal transitions are
  guarded.
- Work URLs use public IDs while numeric database keys remain internal.
- OpenAPI is generated during `pnpm check`; the shared Job contract is consumed
  by the frontend.
- GitHub Actions verifies the frontend build/tests and Python suite against a
  clean PostgreSQL service.

## Deliberate future work

Before SaaS or remote API exposure: add identity, tenant authorization, rate
limits, per-tenant budget reservation, structured observability and a tested
database + media backup/restore procedure. Retire compatibility columns and
dual-write triggers only through their own measured data migration; they are
not an active dependency on deleted Python legacy modules.
