#!/usr/bin/env python3
"""Export the native FastAPI contract for deterministic client generation."""

from __future__ import annotations

import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

from audio_studio.http.app import app  # noqa: E402


target = root / "openapi" / "audio-studio-v1.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n",
                  encoding="utf-8")
print(target)
