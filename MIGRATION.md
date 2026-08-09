# Legacy migration

This is a temporary mission and progress tracker. GitHub remains the history,
rollback, and comparison system.

## Goal

Finish the existing migration from the legacy Audio Studio backend to the
current React + FastAPI architecture.

Current mixed state:

```text
React -> FastAPI -> Jobs -> native application services -> provider adapters
                              \-> remaining legacy db.py responsibilities
```

Target:

```text
React -> FastAPI -> application services -> provider adapters / clean persistence
```

The application must continue working throughout the migration.

## Rules

Work on one meaningful capability at a time.

For each capability:

1. inspect the existing path;
2. identify legacy dependencies;
3. migrate the capability;
4. run relevant tests;
5. test the real application flow;
6. inspect the diff for regressions and unnecessary complexity;
7. commit the successful step;
8. update this file;
9. continue.

Keep legacy code until its replacement is verified. Avoid unrelated refactors.
Avoid introducing additional architecture unless the current migration
genuinely requires it.

The cleanup order is always:

```text
REPLACE -> TEST -> COMMIT -> REMOVE OLD PART
```

Never delete the old system first and rebuild everything at once.

## Current status

### Legacy server.py

- [x] Text preparation (active Shape/Tag execution)
- [x] Translation (active subtitle execution)
- [x] Transcription (active external and Production caption execution)
- [x] Batch (spreadsheet intake, native row generation and output delivery)
- [x] Speech generation (create, another Take and Draft recording)
- [x] Voice cloning and package execution
- [x] Confirm zero active runtime dependencies
- [x] Delete `server.py`

### Legacy db.py

- [x] Identify active callers
- [x] Migrate canonical Work hierarchy and lifecycle
- [ ] Migrate Production document/timeline persistence
- [ ] Migrate render/export persistence
- [ ] Migrate media lookup persistence
- [ ] Confirm zero active callers
- [ ] Delete `db.py`

### Consolidation

- [ ] One configuration path
- [ ] One migration mechanism
- [ ] API contracts improved as touched
- [x] Remove old UI after active dependencies are gone

## Current step

Move the Production document read model and timeline Part/Take/music mutations
out of `db.py` into focused native persistence. Keep rendering/export delivery
as the following independent slice.

## Last verified checkpoint

- Repository: `https://github.com/mehdiayache/vorvn-audio-studio` (private)
- Checkpoint: native canonical Work hierarchy, overviews and lifecycle
  (the commit carrying this record)
- Tests: 93 Python unit/integration tests against the real FastAPI application
  and PostgreSQL; 25 Alibaba contracts, 18 chunking checks, 4 transcription
  checks, 15 native renderer checks, 12 Phase 2 checks and 6 canonical domain
  checks passed
- Frontend: OpenAPI generation, strict TypeScript build, Vite build, 19 Vitest
  files and 59 tests passed
- Manual flow: restarted FastAPI and the worker, verified the hierarchy over
  HTTP, then navigated the real React flow in Chrome from Ventures to
  Heartsnotes and Sleeping guides. Venture media, Project metrics, Series and
  standalone Productions rendered with no console warning or error; no write
  or paid operation was triggered
- Runtime: one FastAPI supervisor and one durable worker. The legacy HTTP
  server and UI are deleted and port 7861 is gone from the configuration
- Remaining dependency: Production editor, timeline, render and media
  persistence still call `db.py`

## Findings

- The final parity audit mapped every historical HTTP responsibility to the
  active FastAPI/React path. `server.py`, the old UI and their obsolete audit
  scripts are deleted; FastAPI has no compatibility escape hatch.
- The old HTTP test harness now exercises the actual FastAPI application,
  including canonical redirects, v1 validation envelopes, upload bounds,
  seekable media and Work/Timeline contracts. Audio finishing tests call the
  native renderer rather than importing dead server helpers.
- System voice previews are runtime media, not UI source code. The existing
  1,025 local preview files moved intact from `ui/samples` to the dedicated,
  ignored `.voice-samples` store.
- Shape/Tag Jobs now run through the native Text preparation service, canonical
  PostgreSQL reads and the Alibaba adapter. Their loopback routes were removed.
- Subtitle Translation Jobs now run through the native application service,
  PostgreSQL repository and Qwen-MT adapter. Their loopback route was removed.
- Qwen-MT persistence records the exact provider model, region, request IDs and
  returned input/output token usage. The old character estimate remains only
  as the pre-call warning and daily-cap guard.
- `translate.py` is temporarily a small compatibility facade for the remaining
  multilingual Speech path; subtitle Translation no longer calls it.
- External and Production Transcription Jobs now run through the native
  application service, safe source resolver and Alibaba asynchronous ASR
  adapter. Their execution and upload loopback routes were removed.
- `TranscriptRepository` is the single PostgreSQL owner shared by
  Transcription, Translation, the Subtitles catalogue and Production caption
  state. The slice removed the translation-specific duplicate repository.
- Qwen3-ASR uses provider-reported billable seconds when available while saved
  subtitle duration remains the final timed cue. Word timings are always
  requested, with the documented language limitation still visible in React.
- Batch preview and generation now use native application services, a contained
  filesystem workspace, a PostgreSQL speech-policy repository and the Alibaba
  speech adapter. The worker no longer calls the Batch loopback route.
- Batch validates column bounds, tokens and mapped provider voice IDs before
  any paid call. Duplicate spreadsheet names cannot overwrite prior rows, and
  partial row failures preserve successful audio and mark the durable Job.
- Batch accounting records each resolved row route and aggregates actual Omni
  token usage or regional Qwen Audio catalogue character cost. Completed Jobs
  now also retain resolved model/engine/voice and elapsed time.
- Standalone Speak, Add Part, another Take and Record Draft now share one
  native Speech application service, one PostgreSQL repository, one safe audio
  workspace and the same Alibaba adapter as Batch. No operation calls the
  legacy HTTP handler.
- Speech validates Production ownership, Part kind, live voice binding,
  delivery compatibility, daily cap and confirmation threshold before any
  provider call. Take replacement is transactional and rejects concurrent
  edits after preserving the paid file on disk.
- Speech Jobs retain actual Omni token usage or versioned regional Qwen Audio
  character cost, provider route, fidelity result and the generated Part ID.
  Canonical requests now use `production_id`; `project_id` remains read-only
  input compatibility for older clients.
- Removing the last loopback Job handler made the 7861 compatibility process
  unnecessary. The runtime now starts only FastAPI and the durable worker.
- Voice reference intake, package creation, package state, clone attempt
  accounting and worker execution now use a native application service,
  contained workspace, PostgreSQL repository and Alibaba adapter. The active
  worker and runtime no longer import `db.py` for this capability.
- A resubmitted package cannot silently restart a creating, failed or
  interrupted capability. Interrupted provider calls require an explicit
  operator retry, because Alibaba may have completed an ambiguously interrupted
  request. Package Activity totals are scoped to the models in that request.
- The Voice package planner now displays Beijing or Singapore from the same
  canonical region value used by provider routing.
- Voice profile editing, cloned binding catalogues, source-reference lookup,
  usage rollups and historical provider-voice linking now share one native
  `VoiceRepository`. History linking and its Activity record commit atomically.
- Active Voice and catalogue code contains no `db.voice_*` calls. The replaced
  legacy functions were removed from `db.py`, reducing it from 3,286 to 2,861
  lines without changing its still-active schema initialization.
- Settings, global naming, spend summaries and database health now share a
  native `ControlPlaneRepository`; pronunciation rules and Activity use their
  own focused repositories. HTTP routers contain no persistence calls.
- Migration `004_pronunciation_phoneme_boolean.sql` repairs the historical
  mismatch where the API sent a Boolean but PostgreSQL stored text. A disabled
  phoneme flag can no longer become the truthy string `"false"` and suppress a
  normal pronunciation replacement. Qwen Audio hot-fix entries now correctly
  use the rule's replacement as the phoneme spelling.
- The replaced control-plane functions and the already-unused legacy Activity
  read/write block were removed from `db.py`, reducing it from 2,861 to 2,535
  lines. Its schema initializer remains active until migration consolidation.
- `db.py` remains an active persistence compatibility layer.
- `VentureAssetRepository` now owns the four fixed collection identities,
  Asset reads, immutable current versions and same-Venture/type authorization.
  Reading a library is side-effect free; creating a Venture explicitly creates
  its Intros, Outros, Music and Stingers collections.
- A local Asset upload now commits its compatibility generation, stable Asset
  identity and first immutable version in one PostgreSQL transaction. Failure
  cannot leave an orphan card or half-registered file record.
- Work, Uploads and timeline authorization no longer call legacy Asset helpers.
  The replaced library read/upload functions were removed from `db.py`, reducing
  it from 2,535 to 2,412 lines. Timeline writes still use the compatibility
  layer and remain deliberately outside this checkpoint.
- Canonical Work hierarchy, Venture/Project/Series overviews, Production
  identity, lifecycle rules and historical/current accounting now use focused
  PostgreSQL repositories. HTTP handles transport errors while Work conflicts
  and validation errors live in the domain boundary.
- Direct Production reads now reject archived Productions and Productions
  hidden by an archived Project or Venture. The real lifecycle test caught and
  closed the prior direct-URL visibility leak.
- The compatibility `domain/repository.py` and legacy accounting helpers were
  removed, reducing `db.py` from 2,412 to 2,352 lines.
- The active runtime `db.py` callers are now exactly Work's Production editor,
  Production timeline, render and media. Uploads and canonical Work are native.
- The versioned migration runner under `audio_studio/migrations` is the target
  migration mechanism.
- New functionality must not add another legacy dependency.

## Working loop

```text
UNDERSTAND
   -> CHOOSE ONE STEP
   -> IMPLEMENT
   -> TEST
   -> REVIEW THE DIFF
   -> FIX
   -> TEST AGAIN
   -> COMMIT
   -> UPDATE MIGRATION.md
   -> NEXT STEP
```
