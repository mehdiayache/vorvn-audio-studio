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

A Venture is not a generic folder. It owns brand identity and reusable media.
Voices and standalone tools belong to Audio Studio globally; a Production may
use any compatible application voice. Projects cannot currently be moved
between Ventures.

## Transport rules

- Base path: `/api/v1`.
- JSON requests and responses, except binary upload/download URLs.
- Every canonical Work resource has a UUID `public_id`. Browser URLs use it;
  the current local API still uses integer path IDs and returns both identities.
- Paid Job enqueue routes accept `Idempotency-Key`. Ordinary synchronous Work,
  Timeline and Settings writes do not advertise idempotency.
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
GET    /ventures/{venture_id}/overview
GET    /ventures/{venture_id}/assets
```

Venture writes cover its identity. Reusable Intros, Outros, Music and Stingers
are uploaded into its Asset collections through the dedicated upload route.
Provider region, budgets, naming and global voices remain Studio concerns.

### Projects, Series and Productions

```text
POST   /ventures/{venture_id}/projects
GET    /projects/{project_id}
PATCH  /projects/{project_id}
DELETE /projects/{project_id}
POST   /projects/{project_id}/productions
POST   /projects/{project_id}/series
GET    /projects/{project_id}/overview
GET    /series/{series_id}
PATCH  /series/{series_id}
DELETE /series/{series_id}
POST   /series/{series_id}/productions
GET    /series/{series_id}/overview
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
GET    /productions/{production_id}/parts/{part_id}/captions
```

Creating or replacing a recording returns a Job. A Part keeps raw, spoken and
tagged text versions; `text_state` says which version the active recording
used. There is no alternatives list or promotion endpoint.

Speech uses one `POST /jobs/speech` contract for standalone recording, new
Production Parts, replacement recordings and recording a Draft. Canonical clients send
`production_id`; the API temporarily accepts `project_id` as an input alias but
never emits it as the canonical field. Replacement operations require both
`production_id` and `part_id`. The worker validates ownership and Part kind
before contacting Alibaba, saves immutable audio, then replaces the Part's
active recording transactionally. Completed Jobs link directly to the Part and
retain provider usage, cost basis, route and fidelity state.

### Jobs

```text
GET    /jobs/{job_id}
GET    /jobs/{job_id}/events
POST   /jobs/{job_id}/cancel
POST   /jobs/speech
POST   /jobs/transcription
POST   /jobs/translation
POST   /jobs/text
POST   /jobs/render
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

## Migration boundary

```text
UI feature
  -> domain service (VentureApi, ProjectApi, PartApi...)
    -> transport client
      -> durable Job worker for provider-backed execution
        -> provider adapter / PostgreSQL repository
```

No UI component may call `fetch`, know an Alibaba endpoint or calculate billed
cost. This allows the current UI, the redesign and the external admin to use
the same resource contract without sharing DOM code.

## Implementation sequence

1. All browser networking is owned by the typed API client. — done
2. Add `/api/v1` read endpoints for Ventures, Projects, Productions, Parts,
   Assets and Exports. — done
3. Add auth/tenant scope before exposing the server beyond localhost. — future
4. Paid work runs behind durable Jobs with actual provider usage when supplied.
   — done
5. Job enqueue is idempotent and hierarchy lists are cursor-paginated. Broader
   external-write idempotency belongs to the future authenticated API.
6. Public Export/Generation media lookup, Canonical Work lifecycle, Production
   document/Timeline, rendering/Exports, Voice identities, control-plane
   persistence, Venture Assets and voice package execution are native. — done
7. Legacy `server.py`, `db.py`, `domain/schema.py` and `ui/` are deleted after
   caller and parity verification. Ordered migrations now bootstrap empty and
   existing databases. — done

Every successful JSON operation now names an explicit Pydantic response
envelope in OpenAPI. `pnpm check` regenerates the TypeScript contract consumed
directly by Settings, Work overviews, Timeline commands, Voice and
Subtitle paths; CI rejects a new successful JSON route that falls back to an
unknown object. UI-only normalized view models remain separate where needed.
