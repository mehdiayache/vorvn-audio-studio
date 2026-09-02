# Origins

## Run

```bash
docker compose up -d
.venv/bin/pip install -r requirements.txt
pnpm install
.venv/bin/python -m origins.migrations
pnpm build:web
.venv/bin/python -m origins
```

Open <http://127.0.0.1:7860/origins/>.

## Verify

```bash
pnpm check
.venv/bin/python -m unittest discover -s tests
```
