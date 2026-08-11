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

## Voice architecture checkpoint — complete

The canonical production chain is now:

```text
Venture Persona -> Production Cast Role -> Speech Part revision
Voice Identity -> durable Voice Reference -> exact Voice Binding
Composition Draft -> ProviderAttempt + budget reservation -> immutable Take
```

- Parts contain editorial truth; immutable Takes contain generation truth.
- Recast revises every affected Part transactionally, making old Takes
  deterministically outdated without modifying them.
- Owned voices use an exact `binding_id`; provider voices use an exact
  `catalogue_voice_id`. Language never selects or replaces a route.
- Provider capabilities are data records and support single- or multi-mode
  bindings without a closed enum.
- Paid/state-changing/durable provider calls retain ProviderAttempt evidence;
  ambiguous paid calls require an explicit human retry.
- Spend authorization, confirmation, atomic reservation and reconciliation are
  centralized for Speech, Batch, enrollment, transcription, translation and
  paid text preparation.
- Voice masters use ID-owned local/S3-compatible objects. Missing historical
  masters are marked unresolved and never fabricated or allowed to block app
  startup.
- Provider catalogue discovery stays technical and creates no business
  attempt; its exact routes are refreshed into one canonical PostgreSQL store.
- Speak, Production and Batch share the same exact speech pipeline.
- Migrations `011` through `018` install this model and retire Generation as a
  canonical Part identity while retaining honest historical provenance.

### Final invariant hardening

- Canonical Part script changes and Composition Draft changes are separate
  commands. Preparing Spoken/Tagged text never rewrites the Part script.
- A Take snapshots the canonical Part revision and script hash separately from
  the exact prepared text sent for synthesis.
- Re-enrollment retries target one exact enrollment Job ID; they cannot update
  another binding for the same voice/model combination.
- ProviderAttempt terminal state and budget-reservation reconciliation commit
  atomically. Spend truth is derived from terminal attempts plus genuinely
  outstanding reservations, not from a later Job status update.
- A worker loss converts every already-sent provider request to `ambiguous`,
  preserves its estimated billing evidence and forbids automatic retry.
- Exact speech adapters are selected through a small `(provider, adapter_key)`
  registry. The requested binding/catalogue route is validated before dispatch
  and cannot fall back to a different provider or model.
- Bulk enrollment classification is derived on the server from the selected
  Voice Reference and provider-model catalogue. Undocumented language remains
  selectable as Experimental and never becomes a language gate.
- Recasting to the identical assignment is a true no-op. A real recast still
  revises all affected Parts in one transaction.
- Recording language belongs to Voice Reference only. Voice Identity exposes a
  derived historical compatibility label but has no synthesis restriction.
- Migration `018_provider_attempt_reconciliation` repairs historical lost-job
  attempts to honest ambiguous state and backfills current enrollment-language
  facts.

## Architecture hardening

The post-legacy cleanup is guarded by shrink-only AST tests in
`test_architecture_boundaries.py`. Existing dependency debt is recorded as a
ceiling, never as approved architecture. A capability migration must remove its
edges from the matching allowlist in the same commit; new edges fail CI.

Current checkpoint: boundary baseline complete.

- Domain technical-dependency debt: 0.
- Application to Infrastructure edges: 0.
- Application direct technical edges: 0.
- HTTP to Infrastructure edges: 0.
- Infrastructure to Application edges: 0.
- Transitional root/`services` import edges: 0.
- Root business modules: 0.
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

Speech text preparation is now pure Domain policy: chunking, delivery-tag
handling, pronunciation rules, ambiguous date/phone normalization, output
names and supported request flags. Catalog, Settings and Production rendering
no longer depend on the root speech CLI.

Qwen Audio SDK execution, request formatting, retry policy and partial-audio
recovery now belong to the Alibaba Infrastructure adapter. Runtime credential
refresh has one Infrastructure owner shared by the API and worker processes.
The optional direct CLI is a thin client in `scripts/`; the root `say.py`
compatibility module and the final transitional import edges are removed.

The repository root now contains no Python business modules. The five
unreachable legacy facades for import, prompt preparation, realtime streaming,
translation and vocabulary management are removed; their active native
capabilities remain in the package architecture. The canonical data-integrity
gate is preserved as `scripts.check_domain`.

Settings and machine administration now have one injected Application service.
Environment persistence, Alibaba SDK refresh, S3 inspection and filesystem
maintenance belong to Infrastructure; HTTP imports the service from the
composition root. This removes eight Application-to-Infrastructure edges and
the Settings router's direct S3 dependency without changing API contracts.

Activity and System health now depend only on ledger, database-status and
worker-status ports. Their PostgreSQL adapters are assembled in the operational
composition root, removing three more Application-to-Infrastructure edges while
preserving worker leases, cost history and public error sanitization.

The Studio catalogue now receives voice data, operational summaries and
deployment-owned media/storage facts through explicit Application ports. Its
composition root keeps PostgreSQL, filesystem and private S3 configuration out
of the use case, removing four more Application-to-Infrastructure edges.

Durable Job creation, observation, cancellation and worker execution now share
one Application service and one composed PostgreSQL adapter per process. HTTP
and the worker no longer create independent repository paths, removing one
Application-to-Infrastructure and one HTTP-to-Infrastructure edge.

Voice identities, historical links, capability plans and package budget checks
now belong to one injected Application service. PostgreSQL profile and package
stores are assembled only in Composition, removing two more direct
Application-to-Infrastructure edges without changing provider enrollment.

Upload rules and rollback orchestration now belong to one injected Application
service. Local files, FFmpeg and private S3 publication live in one workspace
adapter while PostgreSQL records live in one persistence adapter. This removes
five Application-to-Infrastructure edges and the final direct technical import.

Public media delivery now resolves persisted Export and Generation IDs through
an Application service. PostgreSQL identity lookup and contained local-path
resolution are composed adapters, removing three more direct infrastructure
dependencies while preserving every browser and download URL.

Production previews and immutable Exports now belong to an injected Render
service. FFmpeg and file lifecycle live in a workspace adapter; Production,
Part, transcript and Export persistence live in one PostgreSQL adapter. This
removes six Application-to-Infrastructure edges while preserving preview
caching, normalization, music mixing, manifests and timed subtitle exports.

Timeline commands now belong to one injected Application service. Ordered Part,
Take, Venture-library and transcript persistence live behind a PostgreSQL
adapter; contained media duplication lives behind a replaceable workspace port.
This removes four Application-to-Infrastructure edges and the Timeline router's
direct transcript dependency while preserving every existing HTTP contract.

The complete Work hierarchy now belongs to one injected Application service.
Venture, Project, Series and Production persistence, editor Parts, immutable
Exports, Venture assets and accounting are assembled behind one PostgreSQL
adapter. This removes five Application-to-Infrastructure edges while preserving
hierarchy semantics, Series defaults and historical Production accounting.

Speech generation now receives a provider-neutral `StoredAudio` value from its
workspace port. The filesystem adapter owns file creation and duration probing,
while Application owns no Infrastructure type. This removes the final
Application-to-Infrastructure edge without changing recordings, URLs or job
results.

Batch preview intake now uses one service assembled in Composition. HTTP owns
only request limits and the public response envelope; spreadsheet parsing,
temporary files and voice lookup remain behind Application ports. This removes
both Batch HTTP-to-Infrastructure edges without changing worker generation.

The saved Subtitle catalogue now belongs to one Application service composed
with PostgreSQL and the shared media resolver. HTTP owns only routes and public
not-found errors. This removes the final HTTP-to-Infrastructure edges while
preserving stored timings, layout profiles, costs and missing-audio behavior.

Provider-neutral transcription sources/results, ASR model identities and text
completion results now belong to Domain. Application services and Alibaba,
PostgreSQL and storage adapters share those contracts directly. This removes
all eight reverse Infrastructure-to-Application edges without changing provider
requests, pricing, job routing or public results.

Batch preview and saved Subtitle endpoints now publish explicit Pydantic
response envelopes. React consumes their generated OpenAPI path and component
types, while `domain.ts` keeps aliases only for UI-facing use. This removes the
duplicate handwritten wire contracts without changing Batch intake, saved
captions, layout profiles or deletion behavior.

The React Voice client now consumes generated OpenAPI request and response
contracts for the registry, metadata, usage, routing, profiles, historical
voices and package lifecycle. The client also distinguishes a cost-confirmation
response from a successfully queued package instead of casting both to the same
shape. Voice creation, provider routing and saved identities remain unchanged.

Work hierarchy and overview reads, Timeline commands, Settings, maintenance and
pronunciation routes now publish explicit Pydantic response envelopes. Their
React client paths consume the generated OpenAPI operations, and CI rejects any
future successful JSON operation that degrades to an unknown object. Binary
Export and Generation downloads are described as files rather than fake JSON.

The final responsive audit removed the Production metrics mini-scrollbar on
mobile: the same metric pills now wrap inside the available width. Desktop and
mobile route smoke checks show no document overflow or browser diagnostics.
