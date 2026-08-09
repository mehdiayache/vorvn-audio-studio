# Legacy migration

This is a temporary mission and progress tracker. GitHub remains the history,
rollback, and comparison system.

## Goal

Finish the existing migration from the legacy Audio Studio backend to the
current React + FastAPI architecture.

Completed runtime state:

```text
React -> FastAPI -> application services -> provider adapters / PostgreSQL
                         \-> durable Jobs for provider-backed work
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
- [x] Migrate Production document/timeline persistence
- [x] Migrate render/export persistence
- [x] Migrate media lookup persistence
- [x] Confirm zero active callers
- [x] Delete `db.py`

### Consolidation

- [x] One configuration path
- [x] One migration mechanism
- [x] API contracts improved as touched
- [x] Remove old UI after active dependencies are gone

## Current step

Migration complete. Keep this file as the final evidence record until the team
chooses to archive it; all new development starts on the native architecture.

## Last verified checkpoint

- Repository: `https://github.com/mehdiayache/vorvn-audio-studio` (private)
- Checkpoint: complete legacy backend and persistence removal (the commit
  carrying this record)
- Tests: 102 Python unit/integration tests against the real FastAPI application
  and PostgreSQL; 25 Alibaba contracts, 18 chunking checks, 4 transcription
  checks, 15 native renderer checks, 12 Phase 2 checks, 6 canonical domain
  checks and 3 accounting checks passed
- Frontend: OpenAPI generation, strict TypeScript build, Vite build, 20 Vitest
  files and 60 tests passed
- Database: all six ordered migrations bootstrap an empty PostgreSQL database,
  seed the required system containers and are idempotent on a second run
- Manual flow: restarted FastAPI and the worker after deleting `db.py`, loaded
  the real Genesis Production, verified the page controls and clean browser
  console, then verified byte-range delivery for a real Export and Generation.
  No preview, render, mutation or paid operation was triggered
- Runtime: one FastAPI supervisor and one durable worker. The legacy HTTP
  server and UI are deleted and port 7861 is gone from the configuration
- Remaining legacy module dependency: none; `server.py`, `db.py`, the legacy UI
  and the parallel schema bootstrap are deleted

## Findings

- A versioned base migration now owns empty-database bootstrap. It contains the
  exact schema and required fixture seeds formerly hidden in `db.py`; subsequent
  migrations remain ordered and checksummed. A small preparation migration
  preserves upgrade compatibility for databases that have not yet run the
  pronunciation Boolean conversion.
- Public Export and Generation downloads use focused native repositories.
  FastAPI preserves safe root containment, filenames, content types and byte
  ranges without importing a generic persistence module.
- `domain/schema.py` was a second, unversioned schema owner and is deleted. The
  migration runner is now the only schema creation and evolution mechanism.

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
- After the canonical Work checkpoint, the remaining callers were Work's
  Production editor, Production timeline, render and media.
- `ProductionDocumentRepository` now owns canonical Part reads, insertion,
  ordering, duplication, deletion, cross-Production moves, text state,
  historical Takes, Take promotion and background-music state. Its public
  methods accept canonical Production IDs; the temporary legacy container ID
  bridge is private to persistence.
- The Production editor loads Parts, Take counts and caption/translation state
  in one PostgreSQL query instead of issuing separate queries per card.
- Part deletion still materialises positive pre-ledger spend into the immutable
  Job ledger before removing content. Moving Parts also moves archived Takes
  and compacts the source sequence. Linked clips retain stable Asset/version
  identity, and music is validated against the Production's Venture.
- The replaced Timeline helpers were removed from `db.py`, reducing it from
  2,352 to 2,116 lines. The only active runtime imports of `db.py` are now
  `application/renders.py` and `application/media.py`.
- Production preview and export now read canonical Work, Parts, music and source
  captions through their focused repositories. `ProductionExportRepository`
  atomically creates the immutable Export and its temporary playback projection;
  no Render application code imports `db.py`.
- Export history is a first-class `Production.exports` collection rather than a
  synthetic Timeline Part. Release previously searched for excluded `stitch`
  Parts and linked an Export ID to the Generation download route. It now renders
  canonical Export identity and downloads through `/api/v1/exports/{id}/download`.
- The replaced render helpers were removed from `db.py`, reducing it from 2,116
  to 2,023 lines. `application/media.py` is the only active runtime importer.
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
