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
- [ ] Remove obsolete Voice cloning implementation after the active package path is migrated
- [x] Confirm zero active runtime dependencies
- [ ] Delete `server.py`

### Legacy db.py

- [ ] Identify active callers
- [ ] Migrate responsibilities progressively
- [ ] Confirm zero active callers
- [ ] Delete `db.py`

### Consolidation

- [ ] One configuration path
- [ ] One migration mechanism
- [ ] API contracts improved as touched
- [ ] Remove old UI after active dependencies are gone

## Current step

Voice cloning is the next migration capability. The active React package flow
already bypasses `server.py`, but its worker still imports legacy `db.py` and
legacy package orchestration. Move that one active flow behind an application
service, a PostgreSQL repository and a provider adapter before removing only
the corresponding legacy code.

## Last verified checkpoint

- Repository: `https://github.com/mehdiayache/vorvn-audio-studio` (private)
- Checkpoint: native Speech generation slice (the commit carrying this record)
- Tests: 64 Python unit/integration tests including real PostgreSQL Speech,
  Batch and Job fixtures; 25 Alibaba contracts, 18 chunking checks, 4
  transcription checks, 22 HTTP checks, 15 Phase 1 checks, 12 Phase 2 checks
  and 6 canonical domain checks passed
- Frontend: OpenAPI generation, strict TypeScript build, Vite build, 19 Vitest
  files and 59 tests passed
- Manual flow: restarted React, verified Standalone Speak, Add Part, New Take
  and Record Draft, and removed the temporary Draft from the explicit test
  Production; no paid generation was submitted and the browser logged no error
- Runtime: one FastAPI supervisor and one durable worker. `server.py` is no
  longer started and port 7861 is gone from the application configuration
- Remaining dependency: Voice packages, rendering/timeline and several
  canonical services still call `db.py`; `server.py` remains in the repository
  only until its obsolete implementations receive a final deletion audit

## Findings

- `server.py` has zero active runtime callers and is no longer started. Keep it
  only until the remaining obsolete implementations have been audited against
  active FastAPI capabilities, then delete it in a separately verified step.
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
- Legacy-only prompt preview/save routes remain quarantined with the unreachable
  old UI and are not part of active Shape/Tag execution.
- `db.py` remains an active persistence compatibility layer.
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
