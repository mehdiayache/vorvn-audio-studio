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

- [ ] Text preparation
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

Protect the current working version with a local baseline commit and the
`baseline-pre-migration` tag, then publish that exact checkpoint to a private
GitHub repository after GitHub authentication is restored.

No capability migration is active yet.

## Last verified checkpoint

- Commit: resolve from the `baseline-pre-migration` tag
- Tests: Python architecture/provider/application suites passed
- Frontend: OpenAPI generation, strict TypeScript build, Vite build, and 59
  Vitest tests passed
- Manual flow: previously verified React Settings, Activity, and Subtitles
- Remaining dependency: FastAPI Jobs still delegate paid provider operations to
  the loopback `server.py`; canonical product services still call `db.py`

## Findings

- `server.py` remains an active loopback provider adapter and must not be
  deleted early.
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
