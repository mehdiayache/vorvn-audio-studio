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
                              |
                              +--> provider adapters
```

FastAPI is the only HTTP process. The historical server and UI have been
deleted after parity verification, and there is no loopback compatibility
port, compatibility gateway or `/legacy/*` escape hatch.

## Backend boundaries

- HTTP routers validate transport input and format responses.
- Application services coordinate use cases and policy.
- Domain types describe state without FastAPI, PostgreSQL or Alibaba imports.
- Repositories own SQL and transaction boundaries.
- Provider adapters own external request/response contracts.
- Workers claim durable work with `FOR UPDATE SKIP LOCKED`.

Paid operations are never automatically retried after an ambiguous transport failure. A provider may have billed a request even when its response was lost. Retry is an explicit operator action.

## Frontend boundaries

`frontend/src/features/*` owns page-level workflows. `frontend/src/components/*`
owns reusable visual behavior. Hooks own lifecycle and interaction state;
`lib/api.ts` is the sole JSON API client. The waveform component may fetch
same-origin media bytes for visualization. Components do not calculate provider
billing or call Alibaba endpoints.

The shell has one canonical route for every tool:

```text
/audio-studio/                 Ventures and Projects
/audio-studio/speak            standalone generation
/audio-studio/voices           voice identities and bindings
/audio-studio/activity         immutable operational ledger
/audio-studio/subtitles        external transcription
/audio-studio/settings         application configuration
```

## Data and identity

Canonical resources keep both a public UUID and a compatibility integer ID during migration. External integrations should use public IDs once each resource router exposes them consistently. Display names are never identifiers.

Historical spend is immutable. Removing a Part, active recording or audio file changes the current Production cost but never erases what was already billed. Jobs record requested/resolved routes, provider usage, price basis, outputs and failure state.

## Compatibility removal rule

The legacy runtime and generic persistence modules are gone. Compatibility
columns that preserve historical data are implementation details owned by
focused repositories, never a destination for new code. A capability slice is
complete only when:

1. FastAPI owns its contract.
2. The application service owns its policy.
3. React and external clients use only the v1 contract.
4. Contract and browser tests pass.
5. The corresponding internal operation can be removed without breaking another slice.

## Paid-operation invariant

The React client never invokes Alibaba-backed routes directly. New speech,
replacement recordings, draft rendering, transcription,
translation and AI text shaping/tagging all create a durable `/api/v1/jobs/*`
resource. Voice creation uses its durable package-capability records and one
Activity attempt per provider call. The worker is the only process allowed to
execute those operations. A provider response that is lost after billing is
recorded as failed or interrupted and is never retried automatically.

## Native media invariant

FastAPI serves generated audio, voice samples, imports and blocks from explicit
roots. Voice previews live in `.voice-samples`, outside
frontend source. Every URL segment must be a basename, so media routes cannot
browse arbitrary local files. Starlette handles byte ranges for seeking and
pause/resume behavior.
