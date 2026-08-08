# VORVN Audio Studio

Audio Studio turns scripts and reusable media into spoken Productions. The same tools also work independently: Speak creates one recording, Batch creates many, Subtitles transcribes external audio, and Voices manages application-owned voice identities across Alibaba model bindings.

## Run locally

```bash
docker compose up -d
.venv/bin/pip install -r requirements.txt
pnpm install
pnpm build:web
.venv/bin/python -m audio_studio
```

Open <http://127.0.0.1:7860/audio-studio/>. Do not open `ui/index.html` with a `file://` URL: the application requires its HTTP API and built assets.

On macOS, `restart.command` performs the database startup, process restart, health check and browser opening.

## Architecture

- `frontend/src/` — React + TypeScript + Vite application, organized by feature and shared component.
- `audio_studio/http/` — FastAPI composition root, middleware and versioned routers.
- `audio_studio/application/` — use cases and application policy.
- `audio_studio/domain/` — transport-independent Job state and future domain entities.
- `audio_studio/infrastructure/` — PostgreSQL repositories and provider adapters.
- `audio_studio/migrations/` — ordered, checksummed PostgreSQL migrations.
- `audio_studio/worker.py` — separate durable Job worker.
- `services/alibaba/` — Alibaba provider implementations and documented model routing.

`server.py`, `db.py` and `ui/` are quarantined migration code, not the public
application entry point. FastAPI is the only HTTP process and is exposed on
port 7860. The old UI is unreachable, `server.py` is no longer started, and
there is no compatibility port. Text preparation, subtitle Translation,
Transcription, Batch and Speech generation run through native application
services. Remaining migration work is limited to active legacy persistence and
orchestration responsibilities such as Voice packages and Production editing.

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
.venv/bin/python -m unittest -v test_audio_studio_architecture
.venv/bin/python test_say.py
.venv/bin/python test_alibaba_services.py
.venv/bin/python check_domain.py
```

`pnpm check` regenerates TypeScript types from FastAPI OpenAPI, builds the production UI, and runs the frontend test suite. The architecture and provider-contract tests are local and mocked; they never synthesize, clone, translate or transcribe.

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
