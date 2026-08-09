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

## Architecture hardening

The post-legacy cleanup is guarded by shrink-only AST tests in
`test_architecture_boundaries.py`. Existing dependency debt is recorded as a
ceiling, never as approved architecture. A capability migration must remove its
edges from the matching allowlist in the same commit; new edges fail CI.

Current checkpoint: boundary baseline complete.

- Domain technical-dependency debt: 0.
- Application to Infrastructure edges: 42.
- Application direct technical edges: 1.
- HTTP to Infrastructure edges: 7.
- Infrastructure to Application edges: 8.
- Transitional root/`services` import edges: 7.
- Root business modules: 7.
- `services` Python modules: 0.

Current slice: Alibaba's immutable capability/language/model catalogue and its
versioned voice snapshot now belong to Domain. Dynamic region, workspace and
key-presence configuration has one runtime owner; protocol-specific endpoint
resolution belongs to the Alibaba Infrastructure adapter.

Pricing and transcript-fidelity rules are now pure Domain modules; their
transitional `services/alibaba` files have been removed.

Voice-registry assembly and performance presets are now pure Domain assets;
the transitional registry module has been removed.

Voice/model routing is now a pure Domain policy; its transitional service has
been removed.

Voice-package planning is now deterministic Domain policy with an explicit
region input. The transitional endpoint and package-planning services have
been removed without adding an Application-to-Infrastructure edge.

Alibaba text completion now belongs to its Infrastructure adapter. Translation
and text preparation share that scoped client without a transitional
`services` dependency.

Qwen 3.5 Omni streaming and enrollment now belong to the Alibaba Infrastructure
adapter. Its transcript/audio envelope diagnostics and exact failure semantics
remain covered without provider calls.

Alibaba speech routing now lives with the speech-generation adapter that owns
both exact Audio TTS and Omni execution. The transitional `services/alibaba`
package has been removed without creating a replacement dependency edge.

Caption layout, word segmentation and SRT/VTT export are now pure Domain
policy. The transitional `services` package has been removed completely.

Production export rendering now consumes that Domain policy directly. The
root transcription compatibility facade has been removed; ASR contracts test
the Alibaba Infrastructure adapter that actually owns them.

Human-facing download names and ID3 values now belong to pure Domain policy;
lossless FFmpeg metadata writing belongs to Infrastructure. Settings and the
catalogue no longer depend on the root naming module.

Batch column policy now belongs to Domain; CSV/TSV/XLSX decoding and ZIP
assembly belong to Infrastructure. Batch intake still uses the same workspace
port, and the root Batch module has been removed.
