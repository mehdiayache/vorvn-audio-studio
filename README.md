# Auvi Studio

## Run

```bash
docker compose up -d
.venv/bin/pip install -r requirements.txt
pnpm install
.venv/bin/python -m audio_studio.migrations
pnpm build:web
.venv/bin/python -m audio_studio
```

Open <http://127.0.0.1:7860/audio-studio/>.

## Verify

```bash
pnpm check
.venv/bin/python -m unittest discover -s tests
```
