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

### Provider truth and exact enrollment checkpoint

Migration `019_exact_enrollment_routes.sql` completes the remaining runtime
hardening found by the external architecture audit:

- every enrollment Job now snapshots its exact `provider`, `region`,
  `provider_model_id` and `adapter_key`; the worker dispatches through a small
  exact registry and has no fallback route;
- individual and bulk enrollment persist the same execution contract;
- an adapter/region/model mismatch fails locally before uploading a reference
  or calling the provider;
- a definite provider success is recorded before Take, binding or Batch-file
  persistence. Local persistence failure cannot relabel the provider call as
  ambiguous or trigger an automatic paid retry;
- clone creation receipts preserve the provider voice ID. A failed local
  binding write is recoverable on an explicit retry without calling the
  provider a second time; the local recovery Job is free so the original
  ProviderAttempt cost is counted exactly once;
- Speech and Batch preserve provider-result fingerprints when local media
  persistence fails and require an explicit operator decision before a new
  paid attempt;
- active Batch reservations retain the full reserved amount while individual
  row attempts finish, closing the concurrent daily-cap release hole;
- Activity, Production accounting and pre-call spend reads prefer
  `ProviderAttempt` truth, while retaining Job-only historical records;
- normal Create Voice always attempts every installed clone method from the
  single confirmed reference. Recording language is free-form provenance:
  undocumented values are Experimental, never ineligible;
- the canonical domain gate no longer equates new Parts with legacy
  Generations. It checks honest legacy provenance, Part/Take ownership,
  revision ordering and exact enrollment adapters instead;
- GitHub Actions now runs the domain integrity gate after the full application
  suite, against a clean PostgreSQL service.

No provider operation is executed by these tests. Catalogue/configuration and
health reads still create no business `ProviderAttempt`.

The clean-database CI integration test explicitly runs the documented
provider-catalogue bootstrap before reading catalogue routes. It therefore
tests the same lifecycle contract as the real runtime and cannot pass merely
because a developer database already contains catalogue rows.

### Cross-capability provider-evidence closure

The final audit applied the paid-provider boundary to every current durable
provider result, not only speech, Batch and cloning:

- transcription, subtitle translation and paid text preparation now record a
  definite provider success, cost, request IDs and a result fingerprint before
  local formatting, fidelity review or database persistence can fail;
- a rejected Tagged/Spoken preparation therefore preserves its real provider
  spend instead of leaving an attempt incorrectly stuck at `sent`;
- enrollment with existing masters exposes the exact selected Voice Reference.
  `preferred_reference_id` is returned only as a visible preselection; every
  queued enrollment still snapshots the explicitly submitted `reference_id`;
- the first attached reference becomes the UI preference only when no
  preference exists. Later references never replace it silently;
- domain verification now rejects active enrollment Jobs without a complete
  provider/region/model/adapter route and rejects preferred references owned by
  another Voice Identity;
- ASR publication and Batch destination creation now finish before budget
  reservation, so a local storage failure cannot leave paid work reserved;
- voice enrollment resolves its exact route and durable reference before paid
  authorization. Its adapter marks the attempt `sent` only immediately before
  the Alibaba creation request, after reference upload succeeds. A pre-request
  failure is therefore definitive and never presented as ambiguously billed.

The checkpoint is covered by 296 Python tests, 82 React tests and 11 live
PostgreSQL domain checks. Provider adapters remain faked in these tests; no
paid Alibaba operation is performed.

### Final foundation convergence

Migration `020_provider_model_catalogue_truth.sql` closes the three remaining
information-loss boundaries identified by the external audit:

- a Batch keeps one full active budget reservation, while every individual
  `ProviderAttempt` snapshots the estimate for its own prepared row. An
  ambiguous row therefore records its own possible spend without releasing the
  outstanding Batch budget or multiplying the Batch estimate across attempts;
- persisted active `provider_models` with enrollment support are the only
  canonical discovery source used by Create Voice, Complete Voice and Voice
  Profile coverage. Provider-specific catalogues may populate those records,
  but Application and Domain no longer reconstruct an Alibaba-only installed
  world;
- each enrollment Job snapshots its exact provider-model route and selected
  Voice Reference. Multiple ready bindings for the same model remain distinct
  by `binding_id`, and enrollment work remains distinct by exact Job ID. The
  Voice Library may group coverage for readability but displays every binding
  and reference variant independently.

A future provider becomes discoverable by persisting its active enrollment
model facts and registering its exact adapter; the canonical Voice planner does
not require provider-specific changes. Undocumented source languages remain
Experimental and are still queued.

The historical API package ID `omni` remains a compatibility alias only. Its
canonical human label and description are provider-neutral Natural performance
language and no longer brand the package as Qwen-specific.

This checkpoint is covered by 299 Python tests, 82 React tests and 11 live
PostgreSQL domain checks. The provider-neutral discovery test includes a future
provider fixture, and the repository/UI tests preserve two bindings for one
provider model using different references. No paid provider operation is
executed by these tests.

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

## Composer contract migration — in progress

Checkpoint 1 installs the shared provider-neutral Composer backbone beneath
the existing Speak and Production presentation. It is deliberately not the
future dock and does not change Player or durable Job ownership.

- `CompositionContext` distinguishes a Standalone recording session from a
  Production new Part, Draft render or new Take.
- `CompositionDraft` owns mutable text, exact route, delivery and output state;
  `EditorialBaseline` remains read-only and `EditorialPatch` describes proposed
  changes without pretending they are already Part truth.
- `RouteSelection` is exactly one owned `binding_id` or one provider
  `catalogue_voice_id`. Multi-mode routes additionally require an explicit
  capability. Fresh Speak selects neither a first identity nor a first route.
- The Composer generation command contains no engine/model/provider-voice
  routing truth. The current HTTP payload receives those legacy display fields
  only through a temporary adapter that derives them from the selected exact
  route.
- Complete capability records remain attached to each route, so multiple modes
  on one binding are representable without reconstructing capability from an
  engine name.
- Delivery stores an open `modeId: string | null`; the temporary HTTP adapter
  alone translates today's Exact/Directed values for the current endpoint.
- Composer UI state is separate from the persistable Draft contract. Job and
  playback lifecycles remain outside Composer in this checkpoint.

Checkpoint 2 moves speech execution out of the submitting Composer without
changing the Composer layout, Part/Take semantics or provider retry policy.

- Speech enqueue now returns the durable backend Job immediately. A small
  application-wide observer owns polling by public Job ID, deduplicates reads,
  retains backend status as truth and continues after the submitting component
  unmounts.
- React consumers subscribe through `useJobExecution`; they do not own the Job
  lifetime. Compatibility Promise wrappers remain for unrelated tools that
  have not entered this migration checkpoint.
- Speak records the originating recording-session ID with every execution. A
  completion from an abandoned session remains durable in Activity/history but
  cannot refresh, play into or otherwise mutate the newly opened session.
- Production creates its pending presentation only after enqueue and uses the
  real backend Job ID. The previous random client task identity is gone. The
  temporary `RenderTask` shell now mirrors queued/running/retrying/blocked and
  terminal backend states; blocked work requires review and is not presented as
  a generic automatic retry.
- New Part, Draft render and new Take enqueue through the same observable Job
  path. Existing Part/Take persistence and successful settlement behavior are
  unchanged; successful completion refreshes the durable Production result.
- Two full-path defects exposed by the live smoke were fixed below the UI. The
  owned-voice repository now returns the same canonical provider/model/region
  route fields that the registry displays, so billing validation and execution
  resolve one binding record. Standalone Speak now persists no fabricated
  `part_id=0`; its durable truth is the Job/ProviderAttempt/session result.

Live verification used distinct, explicitly submitted paid operations. One
provider-successful request exposed the old standalone `part_id=0` persistence
fault; its evidence and cost were retained and it was not retried. After the
fix, a new standalone Qwen3 Voice Clone Job completed with playable audio. A
separate Production Qwen3 Voice Clone Job displayed an immediate pending card,
survived independently of the Composer, and settled into a persistent Part
using the exact backend Job route. Browser diagnostics remained clean.

Deferred to later approved checkpoints: persisted Draft recovery,
explicit Part editorial mutations, outdated-Take confirmation and the visual
Composer/Player redesign.

Checkpoint 3 makes the Production command lifecycle durable before any paid
provider work while preserving the existing Composer presentation.

- A new Production speech command creates its real editorial Part and durable
  Job in one PostgreSQL transaction. Provider execution starts only after both
  records exist; an enqueue failure creates neither record.
- Insertion uses the public UUID of the Part that should follow the new one.
  The repository locks the Production, resolves that anchor and assigns the
  position atomically. The old numeric position remains only as an HTTP
  compatibility input; React no longer uses it as command truth.
- The Job stores its Part association, exact source Part revision and canonical
  script hash before the worker can claim it. The worker turns a successful
  provider result into an immutable Take on that same Part; it never creates a
  second Part after the provider returns.
- If the Part revision changes while the Job is running, the returned Take is
  retained as honest history but is not selected automatically. Its source
  revision and script hash remain the enqueue-time snapshot.
- A definitive or ambiguous failure leaves the Part and Job visible with no
  fabricated Take. Retry is an explicit new Job targeting the same Part.
  Existing ambiguous-paid-call rules still forbid automatic retry.
- Production reads expose the latest durable speech Job with each Part. React
  can reconstruct queued/running/blocked/failed state after Composer close,
  navigation or reload, using backend Job state rather than a client task ID.
- Pending Parts use the same normal sequence card and explicitly say that no
  Take exists yet. The temporary RenderTask only presents Job progress and is
  not a second Part identity.

Verification is provider-free: the PostgreSQL integration test proves atomic
Part/Job creation, UUID insertion, idempotent enqueue and explicit same-Part
retry; repository tests prove stale completions cannot replace the selected
Take. The complete checkpoint passes 302 Python tests and 101 React tests,
including generated OpenAPI, TypeScript build and production bundle. A freshly
restarted FastAPI/worker pair reported matching runtime IDs and healthy database
readiness; a live read-only Production smoke loaded all six current Parts,
exact route labels, player and timeline without an HTTP or UI error state. No Alibaba
generation was triggered for this checkpoint.

Checkpoint 4 makes Part editorial changes and Take selection explicit human
commands. It closes the last silent mutation paths without changing the visual
Composer architecture.

- Generating another Take no longer rewrites the canonical Part script inside
  a React action. When the prepared words or Cast Role differ, Composer asks
  the operator to either update the Part or create an unselected alternative.
- The explicit editorial command carries `expected_revision`. PostgreSQL locks
  the Part, rejects stale views with HTTP 409, applies script and Cast changes
  together, increments the revision once, and records an audit event.
- `Generate alternative only` snapshots the actual submitted script hash and
  creates an immutable Take with `select_result=false`. The worker cannot
  select it automatically. Backend validation rejects attempts to auto-select
  audio whose raw words differ from the Part.
- Take freshness compares both source Part revision and source script hash.
  An alternative or historical Take therefore remains visibly outdated after
  selection whenever its words no longer match the current Part.
- Selecting an outdated Take is a two-step human command. The first request
  returns `needs_confirmation` without mutation; the confirmed request uses
  the same expected Part revision, selects that exact Take, keeps its outdated
  status honest, marks captions stale and records an audit event.
- A stale Composer or Take sheet cannot overwrite a newer Part decision. No
  route, model, Take or editorial update is silently replaced or retried.

Verification is provider-free. PostgreSQL tests cover optimistic revision
conflicts, script-hash divergence, alternative Take non-selection and confirmed
outdated promotion. React tests cover the required editorial decision and the
explicit revision-guarded mutation. The complete checkpoint passes 304 Python
tests and 103 React tests plus generated OpenAPI, TypeScript and production
build. No Alibaba generation was triggered.

Checkpoint 5 gives the shared Composer one small durable preparation owner
without turning Drafts into Parts or Jobs and without changing the visual
Composer architecture.

- `composer_working_drafts` stores only recoverable preparation state: exact
  binding or catalogue route, Voice/Cast choice, Raw/Spoken/Tagged text,
  delivery and output. Editorial patches, UI sections, confirmation dialogs,
  Job state, Take history and Player state are deliberately excluded.
- One deterministic context owns each preparation. Speak uses its recording
  session UUID; an existing Production Part uses its operation and Part ID; a
  future Part uses the Production plus the public UUID of the Part before
  which it will be inserted (or an explicit end anchor). No timeline index is
  persistence truth.
- Speak and Production use the same HTTP contract, Application service,
  PostgreSQL repository, serializer and React recovery hook. There is no
  local-storage fallback or second per-tool persistence implementation.
- Saving is debounced and version guarded. Two open views cannot silently
  overwrite each other's preparation; HTTP 409 is surfaced as a Draft
  conflict. Deleted Productions, Parts and insertion anchors fail validation
  rather than restoring a Draft into the wrong context.
- A Composer restores its preparation after close, navigation or reload.
  Purely visual state resets normally. A successful Production enqueue or an
  explicit `Save as draft` removes the working preparation only after the
  durable backend action succeeds. Speak intentionally retains its setup so
  the operator can create another Take in the same recording session.
- A pristine Composer creates no database row. The loading boundary briefly
  prevents generation before recovery completes, so a restored Draft cannot
  be bypassed or erased by a fast click.

Verification is provider-free. PostgreSQL tests cover round-trip persistence,
optimistic conflicts, deletion and Production Part/insertion validation;
React tests cover exact serialization, meaningful-state detection, hydration,
autosave and cleanup. The full checkpoint passes 310 Python tests and 108 React
tests plus generated OpenAPI, TypeScript and the production build. Live browser
smoke proved Speak reload recovery and Production close/reopen recovery at a
real insertion point with no console warnings or errors. The temporary smoke
Draft rows were deleted afterward. No Alibaba generation was triggered.

Checkpoint 5b closes the paid Spoken/Tagged review seam without making the
Composer Draft a second Job store.

- Text preparation now enqueues and exposes the real durable Job before React
  waits for its result. The shared Job observer remains the sole owner of
  queued/running/terminal execution truth.
- The recoverable Composer Draft stores only the Job UUID and whether it is a
  Spoken or Tagged pass. Provider result, status, usage, cost and error remain
  canonical on the Job and ProviderAttempt; they are never copied into Draft
  state.
- The Job pointer is saved immediately after enqueue, rather than through the
  ordinary debounce. Closing the Composer, navigating away or reloading can
  therefore re-observe the same paid operation and restore its review result.
- Accept and Reject clear that pointer through the same immediate,
  version-guarded persistence path. Accept persists the chosen text state in
  the same save; a failed clear leaves the recoverable pointer intact rather
  than losing the paid result.
- Tag density is Draft preparation state and now survives close/reload. Busy,
  errors, open dialogs, selected panels and Player state remain UI/runtime
  state and are not persisted.
- A blocked spend-confirmation Job can also be rediscovered from its pointer.
  The larger confirmation-state contract remains a later checkpoint; this
  change does not redesign that workflow or trigger provider work.

Verification is provider-free. Contract tests prove that only a Job pointer is
persisted, immediate-save tests cover the pre-result window, and React tests
cover remount recovery plus durable Accept. The full checkpoint passes 311
Python tests and 112 React tests, generated OpenAPI, TypeScript and production
build. The exact-commit runtime smoke additionally caught and fixed UUID JSON
serialization at the HTTP boundary before release. No Alibaba operation was
called.

Checkpoint 6 makes the selected capability the sole owner of Composer
behavior, without redesigning the Composer or changing exact route selection.

- `capabilities.controls` now publishes the real creative controls available
  to a selected exact binding: inline tags, natural direction, supported
  direction modes, verified passages and numeric speed/pitch/volume controls.
  UI help belongs to the same dynamic capability record.
- Both owned bindings and Alibaba catalogue routes expose the same typed
  capability contract through PostgreSQL, FastAPI and generated OpenAPI.
  Future capabilities can add control data without adding an engine branch or
  changing the schema.
- The speech estimate rate now travels with the exact provider-model route
  from `provider_models.pricing`; Composer no longer looks up cost through an
  engine-keyed UI configuration table.
- Script, Delivery and Output no longer branch on `audio`, `omni` or
  `qwen_tts`. The exact provider model remains visible, while the selected
  capability alone determines which creative controls appear.
- Performance presets target capability IDs rather than provider adapter
  names. A future provider implementing an existing creative capability can
  reuse the same presets without pretending to be an Alibaba engine.
- Paid Spoken/Tagged preparation now carries the selected `capability_id`.
  PostgreSQL validates tag support from capability data; the public text-pass
  contract no longer accepts an engine as UI policy.
- Provider adapter branching remains only where it belongs: preparing and
  executing the exact provider request. No routing, fallback or language gate
  was added, and the operator still selects the exact binding/model.

Verification is provider-free. Tests cover existing and future capability
shapes, a genuinely multimode binding, dynamic tag authorization, catalogue
control persistence and fresh-database migration. Speak and Production still
share the same `SpeechTool`, Draft contract and generation command. No Alibaba
operation was called.

The exact-runtime smoke exposed and closed one final projection gap: the Voice
registry's cloned-binding reader had been dropping capability controls and
route pricing even though the speech repository already read them correctly.
The registry now joins the same provider-model capability records and preserves
provider, adapter and price facts through assembly. Speak and Production both
showed the expected tag/direction/tuning controls for the same cloned routes,
with a clean browser console. Final verification passes 312 Python tests and
114 React tests plus generated OpenAPI, TypeScript and the production build.

Checkpoint 7 closes the shared Composer execution lifecycle from durable Job
through pending presentation to Take, without moving execution truth into the
Composer or Player.

- Production still creates its pending Speech Part transactionally with the
  Job before a provider call. Closing the Composer therefore leaves an
  immediate durable card, and Production recovers that card from the Part's
  latest speech Job after navigation or reload.
- Speak now recovers queued/running/retrying Jobs from its durable recording
  session ledger. A Job observer can be mounted before discovery and then
  attach by public Job ID, so remounting the page no longer leaves a frozen
  pending card or requires the original enqueue Promise to survive.
- The shared Job observer owns polling independently of any mounted Composer.
  Speak and Production only project its state; unmounting either UI does not
  cancel the Job or create another polling owner.
- Paid-call uncertainty is now a backend state invariant. Failures containing
  ambiguous or provider-succeeded evidence become `blocked`, never an ordinary
  retryable failure—even if a caller asks for automatic retry. A lost worker
  lease also promotes a sent ProviderAttempt and its Job to review-required.
- Definitive provider rejection remains `failed` and may be explicitly retried.
  Speak and Production both render `blocked` as Review required with no Retry
  action; evidence and cost remain attached to the original Job/Attempt.
- Successful Speak Jobs refresh the recording-session ledger and become normal
  immutable Take cards. Pending projections are filtered from the ledger while
  observed, avoiding duplicate cards during the handoff.
- Player ownership is unchanged: execution never owns playback. The global
  player receives a source only after a successful result; blocked, failed and
  pending states cannot expose false playback controls.

Verification is provider-free. PostgreSQL tests prove definitive failure,
ambiguous review, refusal of unsafe automatic retry and stale sent-attempt
recovery. React tests prove observer rediscovery after navigation, active Speak
session recovery, review presentation and the absence of retry/play controls
for non-results. Final verification passes 313 Python tests and 119 React tests
plus generated OpenAPI, TypeScript and the production build. No Alibaba
operation was called.

Checkpoint 8 closes the human continuation contract for work stopped before a
paid provider request, without weakening the ambiguous-payment invariant.

- `blocked` is now projected as two distinct operator states. A safe
  `needs_confirmation` block means no provider request was sent and exposes a
  cost-confirmation action. `requires_review`/`ambiguous` means a request may
  already have been billed and never exposes that action.
- Confirmation never mutates or replays the original Job. It creates one new
  durable child Job linked through `parent_id`, copying the original exact
  route, payload, Production, Part and source metadata while changing only the
  explicit `confirmed` authorization. The original evidence remains intact.
- The repository locks the source Job and returns an already-created child for
  every later confirmation, even when a second browser click uses a different
  Idempotency-Key. A double click therefore cannot enqueue duplicate paid work.
- Production retains the same pending Part. Confirmation does not create a
  second Part, and the latest linked Job is recovered from the Production read
  model after close, navigation or reload.
- Speak stores no execution truth in React. Its durable recording-session
  ledger exposes the confirmation/review classification and the continuation
  Job ID, so the historical blocked card becomes `Cost confirmed · continued`
  while the child Job is observed normally.
- Paid Spoken/Tagged preparation uses the same confirmation endpoint. It
  continues the persisted Job UUID rather than enqueueing again from the
  Composer's potentially changed text. Accept/Reject behavior remains
  unchanged after the continued result arrives.
- The text-preparation recovery hook now keys restored work by stable Job ID
  and operation kind. Recreated parent objects cannot trigger an effect loop or
  repeatedly re-observe the same Job.
- The public OpenAPI contract includes the confirmation operation and all
  recovered confirmation fields. No provider-specific branch, route fallback,
  silent model change or language gate was introduced.

Verification is provider-free. HTTP and PostgreSQL tests prove safe
confirmation, distinct-key double-click idempotence, ambiguous rejection,
linked audit/events, exact Production Part reuse and full reload projections.
React tests prove Speak classification, Production pending-card continuation,
safe-vs-ambiguous actions and exact Job continuation for Spoken/Tagged. The
full checkpoint passes 316 Python tests and 122 React tests plus generated
OpenAPI, TypeScript and the production build. No Alibaba operation was called.
