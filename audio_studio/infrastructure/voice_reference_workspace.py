"""Contained access to persisted voice-clone reference recordings."""

from __future__ import annotations

from pathlib import Path

from audio_studio.config import settings


class VoiceReferenceWorkspace:
    def __init__(self, root: Path | None = None):
        self.root = (root or settings.root / ".uploads").resolve()

    def resolve(self, stored_name: str) -> Path:
        name = str(stored_name or "").strip()
        if not name or Path(name).name != name:
            raise RuntimeError("The saved reference recording is invalid.")
        target = (self.root / name).resolve()
        if target.parent != self.root or not target.is_file():
            raise RuntimeError("The saved reference recording is missing from disk.")
        return target
