"""Contained access to persisted voice-clone reference recordings."""

from __future__ import annotations

from pathlib import Path
import os
import shutil
import subprocess
from uuid import uuid4

from audio_studio.config import settings
from audio_studio.infrastructure.media_paths import contained, voice_reference_root
from audio_studio.infrastructure import object_storage


class VoiceReferenceWorkspace:
    def __init__(self, root: Path | None = None, objects=object_storage):
        self.root = (root or voice_reference_root()).resolve()
        self.legacy_root = (settings.root / ".uploads").resolve()
        self.objects = objects

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

    def resolve_reference(self, reference: dict) -> Path:
        """Resolve from local durable cache, restoring a private S3 master."""
        relative = str(reference.get("normalized_path") or "").strip()
        try:
            return self.resolve(relative)
        except RuntimeError:
            if reference.get("storage_backend") != "s3":
                raise
        bucket = str(reference.get("storage_bucket") or "").strip()
        key = str(reference.get("normalized_storage_key")
                  or reference.get("storage_key") or "").strip()
        if not bucket or not key:
            raise RuntimeError("The saved reference recording has no durable locator.")
        target = contained(self.root, relative)
        restored = self.objects.download(bucket=bucket, key=key, target=target)
        expected = str(reference.get("normalized_sha256")
                       or reference.get("sha256") or "").strip().casefold()
        if expected:
            import hashlib
            actual = hashlib.sha256(restored.read_bytes()).hexdigest()
            if actual != expected:
                restored.unlink(missing_ok=True)
                raise RuntimeError("The stored reference recording failed integrity verification.")
        return restored

    def resolve_reference_window(self, reference: dict, job) -> Path:
        """Derive the exact provider input from the immutable saved master."""
        master = self.resolve_reference(reference)
        start_ms = int(job.metadata.get("window_start_ms") or 0)
        duration_ms = int(job.metadata.get("window_duration_ms") or 0)
        if duration_ms <= 0:
            return master
        directory = self.root / str(reference["id"])
        directory.mkdir(parents=True, exist_ok=True)
        model_key = "".join(
            char if char.isalnum() else "-"
            for char in str(job.provider_model_id or job.model_id).lower()
        ).strip("-")[:64] or "model"
        target = directory / (
            f"window-{model_key}-{start_ms}-{duration_ms}-24k.wav")
        if target.is_file() and target.stat().st_size > 0:
            return target
        temporary = directory / f".{target.stem}-{uuid4().hex}.tmp.wav"
        result = subprocess.run([
            "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
            "-ss", f"{start_ms / 1000:.3f}", "-i", str(master),
            "-t", f"{duration_ms / 1000:.3f}", "-ac", "1", "-ar", "24000",
            "-c:a", "pcm_s16le", str(temporary),
        ], capture_output=True)
        if result.returncode or not temporary.is_file() \
                or temporary.stat().st_size <= 0:
            temporary.unlink(missing_ok=True)
            raise RuntimeError("The selected Voice Source window could not be prepared.")
        os.replace(temporary, target)
        return target

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
