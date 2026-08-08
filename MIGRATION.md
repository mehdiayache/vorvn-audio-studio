# Legacy migration

This is a temporary mission and progress tracker. GitHub remains the history,
rollback, and comparison system.

## Goal

Finish the existing migration from the legacy Audio Studio backend to the
current React + FastAPI architecture.

Current:

```text
React -> FastAPI -> Jobs -> legacy server.py / db.py
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
- [ ] Translation
- [ ] Transcription
- [ ] Batch
- [ ] Speech generation
- [ ] Voice cloning
- [ ] Confirm zero active runtime dependencies
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

Translation is the next migration capability.

Inspect the complete subtitle translation path before changing it. Preserve
its current language, quality, cost guard, provider and subtitle-persistence
behavior. Do not remove its loopback route until the native replacement is
verified.

## Last verified checkpoint

- Repository: `https://github.com/mehdiayache/vorvn-audio-studio` (private)
- Checkpoint: native Text preparation slice (the commit carrying this record)
- Tests: 29 focused Python tests, 19 HTTP integration checks, 15 Phase 1
  checks, 12 Phase 2 checks, 18 speech regression checks, and 6 canonical
  domain checks passed
- Frontend: OpenAPI generation, strict TypeScript build, Vite build, 19 Vitest
  files and 59 tests passed
- Manual flow: restarted React app opened a real Production and its Add speech
  Composer; no paid provider call was made
- Runtime: one supervisor, one loopback compatibility process and one current
  worker; stale development workers were stopped before verification
- Remaining dependency: Translation, Transcription, Batch, Speech and Voice
  cloning Jobs still delegate to `server.py`; several canonical services still
  call `db.py`

## Findings

- `server.py` remains an active loopback provider adapter and must not be
  deleted early.
- Shape/Tag Jobs now run through the native Text preparation service, canonical
  PostgreSQL reads and the Alibaba adapter. Their loopback routes were removed.
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
