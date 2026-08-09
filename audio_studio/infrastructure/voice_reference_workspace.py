"""Contained access to persisted voice-clone reference recordings."""

from __future__ import annotations

from pathlib import Path
import shutil

from audio_studio.config import settings
from audio_studio.infrastructure.media_paths import contained, voice_reference_root


class VoiceReferenceWorkspace:
    def __init__(self, root: Path | None = None):
        self.root = (root or voice_reference_root()).resolve()
        self.legacy_root = (settings.root / ".uploads").resolve()

    def resolve(self, stored_name: str) -> Path:
        name = str(stored_name or "").strip()
        target = contained(self.root, name)
        if target.is_file():
            return target

        # Compatibility bridge for references uploaded before durable reference
        # storage existed. Copy, do not move: an interrupted migration must not
        # destroy the only clone master.
        if Path(name).name == name:
            legacy = contained(self.legacy_root, name)
            if legacy.is_file():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(legacy, target)
                return target
        raise RuntimeError("The saved reference recording is missing from disk.")

    def migrate_legacy(self, reference_id: str, stored_name: str,
                       role: str) -> str:
        """Copy one old flat reference into its ID-owned durable directory."""
        name = str(stored_name or "").strip()
        if not name:
            return ""
        if "/" in name:
            return name
        source = contained(self.legacy_root, name)
        if not source.is_file():
            raise RuntimeError(
                f"Voice reference {reference_id} is missing its {role} recording.")
        suffix = source.suffix.casefold() or ".bin"
        relative = f"{reference_id}/{role}{suffix}"
        target = contained(self.root, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copy2(source, target)
        return relative
