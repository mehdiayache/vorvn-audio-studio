"""Local process supervisor for FastAPI and the durable Job worker."""

from __future__ import annotations

import signal
import subprocess
import sys

import uvicorn

from audio_studio.config import settings
from audio_studio.migrations import run as run_migrations
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository
from audio_studio.infrastructure.voice_reference_workspace import VoiceReferenceWorkspace
from audio_studio.application.reference_storage import migrate_legacy_references


def main() -> int:
    worker = None
    try:
        applied = run_migrations()
        if applied:
            print(f"Applied {len(applied)} Audio Studio migration(s): {', '.join(applied)}")
        # A provider request has ambiguous billing semantics after a crash, so
        # it becomes explicitly retryable instead of being silently replayed.
        voice_repository = VoicePackageRepository()
        migrated_references = migrate_legacy_references(
            voice_repository, VoiceReferenceWorkspace())
        if migrated_references:
            print(f"Protected {migrated_references} legacy voice reference(s).")
        voice_repository.abandon_running()
        worker = subprocess.Popen(
            [sys.executable, "-m", "audio_studio.worker"],
            cwd=settings.root,
        )
        print(f"Audio Studio: http://localhost:{settings.port}{settings.web_prefix}/")
        uvicorn.run("audio_studio.http.app:app", host=settings.host,
                    port=settings.port, log_level="info")
    finally:
        if worker is not None and worker.poll() is None:
            worker.send_signal(signal.SIGINT)
            try:
                worker.wait(timeout=5)
            except subprocess.TimeoutExpired:
                worker.terminate()
    return 0
