"""Local process supervisor for FastAPI, Jobs, and the loopback adapter."""

from __future__ import annotations

import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time

import uvicorn

from audio_studio.config import settings
from audio_studio.migrations import run as run_migrations


def _wait_for_legacy(process: subprocess.Popen, timeout: float = 10) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("The compatibility runtime stopped during startup.")
        try:
            with socket.create_connection((settings.legacy_host, settings.legacy_port), .2):
                return
        except OSError:
            time.sleep(.1)
    raise RuntimeError("The compatibility runtime did not become ready.")


def main() -> int:
    environment = {**os.environ, "PORT": str(settings.legacy_port)}
    legacy = subprocess.Popen(
        [sys.executable, str(Path(settings.root) / "server.py")],
        cwd=settings.root, env=environment,
    )
    worker = None
    try:
        _wait_for_legacy(legacy)
        applied = run_migrations()
        if applied:
            print(f"Applied {len(applied)} Audio Studio migration(s): {', '.join(applied)}")
        # A provider request has ambiguous billing semantics after a crash, so
        # it becomes explicitly retryable instead of being silently replayed.
        import db
        db.voice_package_abandon_running()
        worker = subprocess.Popen(
            [sys.executable, "-m", "audio_studio.worker"],
            cwd=settings.root, env=os.environ.copy(),
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
        if legacy.poll() is None:
            legacy.send_signal(signal.SIGINT)
            try:
                legacy.wait(timeout=5)
            except subprocess.TimeoutExpired:
                legacy.terminate()
    return 0
