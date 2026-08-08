# Audio Studio architecture

## Runtime topology

```text
Browser / external client
        |
        v
FastAPI :7860
  |-- /audio-studio/*  React build
  |-- /api/v1/*        typed native API
  |
  +--> PostgreSQL :5434 <--> durable worker
  |                           |
  |                           +--> provider adapters
  |
  +--> legacy loopback :7861 (temporary extraction boundary)
```

Only FastAPI is public. `server.py` is started on loopback solely as an
internal Alibaba execution adapter while those provider implementations are
extracted. It owns no browser, upload, media, timeline, preview or export
contract. New routes, UI links and external integrations must never target
port 7861 or import its HTTP handler.

The loopback process is not a second product surface. There is no public
compatibility gateway and no `/legacy/*` escape hatch.

## Backend boundaries

- HTTP routers validate transport input and format responses.
- Application services coordinate use cases and policy.
- Domain types describe state without FastAPI, PostgreSQL or Alibaba imports.
- Repositories own SQL and transaction boundaries.
- Provider adapters own external request/response contracts.
- Workers claim only jobs tagged `audio-studio-worker-v1` with `FOR UPDATE SKIP LOCKED`.

Paid operations are never automatically retried after an ambiguous transport failure. A provider may have billed a request even when its response was lost. Retry is an explicit operator action.

## Frontend boundaries

`frontend/src/features/*` owns page-level workflows. `frontend/src/components/*` owns reusable visual behavior. Hooks own lifecycle and interaction state; `lib/api.ts` is the sole HTTP client. Components do not calculate provider billing or call Alibaba endpoints.

The shell has one canonical route for every tool:

```text
/audio-studio/                 Ventures and Projects
/audio-studio/speak            standalone generation
/audio-studio/batch            spreadsheet generation
/audio-studio/voices           voice identities and bindings
/audio-studio/activity         immutable operational ledger
/audio-studio/subtitles        external transcription
/audio-studio/settings         application configuration
```

## Data and identity

Canonical resources keep both a public UUID and a compatibility integer ID during migration. External integrations should use public IDs once each resource router exposes them consistently. Display names are never identifiers.

Historical spend is immutable. Removing a Part, Take or audio file changes the current Production cost but never erases what was already billed. Jobs record requested/resolved routes, provider usage, price basis, outputs and failure state.

## Internal provider extraction rule

The loopback provider adapter is a measured extraction boundary, not a
destination for new code. A provider slice is complete only when:

1. FastAPI owns its contract.
2. The application service owns its policy.
3. React and external clients use only the v1 contract.
4. Contract and browser tests pass.
5. The corresponding internal operation can be removed without breaking another slice.

## Paid-operation invariant

The React client never invokes Alibaba-backed routes directly. New speech,
replacement takes, draft rendering, batch generation, transcription,
translation and AI text shaping/tagging all create a durable `/api/v1/jobs/*`
resource. The worker is the
only process allowed to execute those operations. A provider response that is
lost after billing is recorded as failed and is never retried automatically.

## Native media invariant

Browser playback no longer passes through the compatibility server. FastAPI
serves generated audio, voice samples, imports, blocks and batch results from
explicit roots. Every URL segment must be a basename, so media routes cannot
be used to browse arbitrary local files. Starlette handles byte ranges for
seeking and pause/resume behavior.
