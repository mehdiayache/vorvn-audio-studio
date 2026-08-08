# Audio Studio API v1

This is the contract used by the React product and the foundation for a future
admin or external project system. FastAPI owns the complete public product
surface under `/api/v1`. Work resources, Production
timelines, voice identities, durable Jobs, Activity, Settings, media delivery
and Subtitles have native routes. Authentication remains loopback-only, so the
server must not be exposed beyond localhost yet.

## Domain model

```text
Venture (brand, defaults, library, billing scope)
└── Project (a production initiative)
    ├── Series (optional editorial collection)
    │   └── Production (one editable audio document)
    └── Production
        └── Part (draft, generated audio, silence or linked asset)

Job (generation, clone, transcription, translation, stitch or import)
Asset (venture-owned reusable media)
└── AssetVersion (immutable stored file)
Export (immutable Production snapshot + manifest)
Voice (provider voice, cloned voice or application alias)
```

A Venture is not a generic container. It is the brand and policy boundary. A
Project cannot be moved between ventures without an explicit transfer
operation because voices, assets, naming rules and accounting belong to the
venture.

## Transport rules

- Base path: `/api/v1`.
- JSON requests and responses, except binary upload/download URLs.
- Every canonical resource has a UUID `public_id`. The local Studio routes and
  local Studio routes still expose stable integer `id` values; external
  clients should store `public_id` once UUID routing is enabled.
- Mutating requests accept `Idempotency-Key`.
- Lists use cursor pagination: `?limit=50&after=...`.
- Errors have one shape:

```json
{
  "error": {
    "code": "voice_not_supported",
    "message": "This voice cannot be used by the selected model.",
    "details": {},
    "request_id": "req_..."
  }
}
```

- Paid or long operations return `202 Accepted` with a Job. The API never
  keeps an HTTP request open just because Alibaba streams internally.
- Completed Jobs retain the provider result, usage and final cost when the
  provider exposes them. Region/model/request-id normalization remains part of
  the provider-adapter extraction.

## Resources

### Ventures

```text
GET    /ventures
POST   /ventures
GET    /ventures/{venture_id}
PATCH  /ventures/{venture_id}
DELETE /ventures/{venture_id}
GET    /ventures/{venture_id}/usage
GET    /ventures/{venture_id}/assets
POST   /ventures/{venture_id}/assets
GET    /ventures/{venture_id}/voices
```

Venture writes cover brand identity, default routing, naming rules, rewrite
style, budget policy and provider region. They must not be hidden inside
Project settings.

### Projects, Series and Productions

```text
GET    /ventures/{venture_id}/projects
POST   /ventures/{venture_id}/projects
GET    /projects/{project_id}
PATCH  /projects/{project_id}
DELETE /projects/{project_id}
GET    /projects/{project_id}/productions
POST   /projects/{project_id}/productions
GET    /projects/{project_id}/series
POST   /projects/{project_id}/series
GET    /series/{series_id}
PATCH  /series/{series_id}
DELETE /series/{series_id}
GET    /series/{series_id}/productions
POST   /series/{series_id}/productions
GET    /productions/{production_id}
PATCH  /productions/{production_id}
DELETE /productions/{production_id}
GET    /productions/{production_id}/editor
GET    /productions/{production_id}/assets
GET    /productions/{production_id}/music
PATCH  /productions/{production_id}/music
```

Projects group the work. Series group related Productions editorially but own
no Parts. Productions own ordered Parts, music choices and exports. A
Production may live directly in a Project or inside one Series from that same
Project. Tools such as Composer receive a destination; they do not become
children of a Production or inherit one permanent voice configuration.

Old `folder` URLs redirect into the canonical Production route. Folder is not
a domain resource and is never a synonym for Series.

### Parts

```text
POST   /productions/{production_id}/parts/silence
POST   /productions/{production_id}/parts/assets
POST   /productions/{production_id}/parts/reorder
DELETE /productions/{production_id}/parts
POST   /productions/{production_id}/parts/move
PATCH  /productions/{production_id}/parts/{part_id}/silence
PATCH  /productions/{production_id}/parts/{part_id}/text
POST   /productions/{production_id}/parts/{part_id}/duplicate
GET    /productions/{production_id}/parts/{part_id}/takes
POST   /productions/{production_id}/parts/{part_id}/takes/{take_id}/promote
GET    /productions/{production_id}/parts/{part_id}/captions
```

Creating a generated take returns a Job. A Part keeps raw, spoken and tagged
text versions; `text_state` says which version the requested take used.

### Jobs

```text
GET    /jobs/{job_id}
GET    /jobs/{job_id}/events
POST   /jobs/{job_id}/cancel
POST   /jobs/speech
POST   /jobs/batch
POST   /jobs/transcription
POST   /jobs/translation
POST   /jobs/text
POST   /jobs/render
GET    /ventures/{venture_id}/jobs
```

Example accepted response:

```json
{
  "job": {
    "id": "6b03189a-bb3a-4575-ac0b-7a3b34bf5af9",
    "type": "speech",
    "status": "queued",
    "progress": 0,
    "created_at": "2026-08-05T12:00:00Z"
  }
}
```

`events` may use Server-Sent Events for progress, but the durable Job is the
source of truth. Disconnecting a browser does not lose the operation.

Batch uses a two-step contract: `/batches/preview` parses and stores the sheet
without contacting a provider, then `/jobs/batch` validates the selected
columns and every mapped voice before synthesis. One failed row does not erase
successful rows. The parent Job records aggregate spend and usage while its
result keeps the resolved model, voice, cost basis and error for each row.

## Migration boundary

```text
UI feature
  -> domain service (VentureApi, ProjectApi, PartApi...)
    -> transport client
      -> durable Job worker for provider-backed execution
        -> internal loopback adapter only for provider implementations not yet extracted
```

No UI component may call `fetch`, know an Alibaba endpoint or calculate billed
cost. This allows the current UI, the redesign and the external admin to use
the same resource contract without sharing DOM code.

## Implementation sequence

1. Finish moving all browser networking behind domain services.
2. Add `/api/v1` read endpoints for Ventures, Projects, Productions, Parts,
   Assets and Exports. — done
3. Add auth/tenant scope before exposing the server beyond localhost.
4. Move paid work behind durable Jobs and actual provider usage accounting.
5. Add idempotent writes and cursor pagination.
6. Extract Alibaba execution implementations from the internal loopback
   adapter into `audio_studio/infrastructure/providers`.
7. Remove that internal runtime after the provider contract suite covers every
   paid operation.
