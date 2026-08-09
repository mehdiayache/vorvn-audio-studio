# VORVN Audio Studio

Audio Studio turns scripts and reusable media into spoken Productions. The same tools also work independently: Speak creates one recording, Batch creates many, Subtitles transcribes external audio, and Voices manages application-owned voice identities across Alibaba model bindings.

## Run locally

Prepare a new database explicitly with:

```bash
.venv/bin/python -m audio_studio.migrations
```

```bash
docker compose up -d
.venv/bin/pip install -r requirements.txt
pnpm install
pnpm build:web
.venv/bin/python -m audio_studio
```

Open <http://127.0.0.1:7860/audio-studio/>. The application must run through
HTTP because React depends on the FastAPI contract and built assets.

On macOS, `restart.command` performs the database startup, process restart, health check and browser opening.

## Architecture

- `frontend/src/` — React + TypeScript + Vite application, organized by feature and shared component.
- `audio_studio/http/` — FastAPI composition root, middleware and versioned routers.
- `audio_studio/application/` — use cases and application policy.
- `audio_studio/domain/` — transport-independent Job state and future domain entities.
- `audio_studio/infrastructure/` — PostgreSQL repositories, media/storage adapters and Alibaba provider clients.
- `audio_studio/migrations/` — ordered, checksummed PostgreSQL migrations.
- `audio_studio/worker.py` — separate durable Job worker.
- `services/captions.py` — the final transitional caption-formatting module.

FastAPI is the only HTTP process and is exposed on port 7860. The legacy HTTP
server and UI have been removed; there is no compatibility port or hidden
fallback. Text preparation, subtitle Translation,
Transcription, Batch, Speech generation and Voice package execution run through
native application services. Canonical Work hierarchy/lifecycle, the Production
document/Timeline, rendering/Exports, media delivery and Venture Asset
libraries/uploads all use focused PostgreSQL repositories. The ordered
migrations are the only schema bootstrap and evolution mechanism and support a
completely empty database.

See [Architecture](docs/ARCHITECTURE.md), [API v1](docs/API_V1.md), and [Canonical domain](docs/CANONICAL_DOMAIN.md).

## Product model

```text
Venture (brand and reusable media)
└── Project (production initiative)
    ├── Series (optional editorial grouping)
    │   └── Production (editable audio document)
    └── Production
        └── Part (speech, silence or linked media)
            └── Take
```

Voices and tools belong to Audio Studio, not to one Venture. A Venture owns its identity and reusable Intros, Outros, Music and Stingers. A Production may use any compatible application voice and linked Venture media.

## Verification

```bash
pnpm check
.venv/bin/python -m unittest discover
```

`pnpm check` regenerates TypeScript types from FastAPI OpenAPI, builds the production UI, and runs the frontend test suite. The architecture and provider-contract tests are local and mocked; they never synthesize, clone, translate or transcribe.

GitHub Actions runs both commands against a clean PostgreSQL 17 service on
every pull request and push to `main`.

## Media and object storage

Local media uses one deployment-owned root (`AUDIO_STUDIO_OUTPUT_DIR`). Changing
that root is a deployment operation, not a UI preference, so existing media
cannot be orphaned accidentally. Original voice-clone recordings live in the
durable `.media/voice-references` store and are protected from working-file
cleanup.

Alibaba-fetchable inputs use a private S3-compatible bucket. Object keys are
tenant- and ID-scoped:

```text
{prefix}/v1/organizations/{organization_id}/objects/{kind}/{object_id}/source.{ext}
```

Display names never become keys. Uploads include SHA-256 checksums and
`retention=temporary|durable` tags; access is normally a 15-minute presigned
URL. Configure bucket lifecycle rules to expire only `retention=temporary`
objects. Before hosting remotely, enable bucket versioning, encryption and a
tested backup for PostgreSQL, the media root and durable voice references as
one recovery unit. The application deliberately refuses non-loopback binding
until authentication and tenant authorization exist.

## HTTP contracts

- Application: `/audio-studio/`
- API: `/api/v1`
- OpenAPI: `/api/v1/openapi.json`
- Interactive docs: `/api/docs`
- Health: `/api/v1/system/health`
- Compatibility redirects: `/studio/*` → `/audio-studio/*`

Paid operations are submitted as durable Jobs, identified by UUID and stored in PostgreSQL. The browser polls Job state; closing a modal or reloading the page does not define the provider operation’s lifetime. Ambiguous paid failures are not retried automatically.

## Alibaba configuration

Copy `.env.example` to `.env` and set the key, region and optional Workspace ID. International/Singapore and Mainland China/Beijing credentials are separate routing domains. Audio Studio never sends an Alibaba credential to the browser.

The model and voice registry decides compatibility. Display names may change; generated Parts store both the stable application voice identity and the exact provider binding used for that take.
