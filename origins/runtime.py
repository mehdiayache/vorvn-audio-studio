"""Local process supervisor for FastAPI and the durable Job worker."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
from uuid import uuid4

import uvicorn

from origins.config import require_local_bind, settings
from origins.migrations import run as run_migrations
from origins.infrastructure.runtime_environment import reload_owned_environment
from origins.infrastructure.postgres.voice_packages import VoicePackageRepository
from origins.composition.provider_catalogue import provider_catalogue_sync


class WorkerSupervisor:
    """Keep the local worker alive while FastAPI owns the foreground process."""

    def __init__(self, runtime_id: str, parent_pid: int):
        self.runtime_id = runtime_id
        self.parent_pid = parent_pid
        self._stopping = threading.Event()
        self._lock = threading.Lock()
        self._process: subprocess.Popen | None = None
        self._thread: threading.Thread | None = None

    def _spawn(self) -> subprocess.Popen:
        environment = os.environ.copy()
        environment["ORIGINS_RUNTIME_ID"] = self.runtime_id
        environment["ORIGINS_PARENT_PID"] = str(self.parent_pid)
        return subprocess.Popen(
            [sys.executable, "-m", "origins.worker"], cwd=settings.root,
            env=environment)

    def start(self) -> None:
        with self._lock:
            self._process = self._spawn()
        self._thread = threading.Thread(
            target=self._watch, name="origins-worker-supervisor", daemon=True)
        self._thread.start()

    def _watch(self) -> None:
        ownership_notice_shown = False
        while not self._stopping.wait(1):
            with self._lock:
                process = self._process
            if process is not None and process.poll() is None:
                continue
            code = process.returncode if process is not None else "missing"
            if code == 75:
                if not ownership_notice_shown:
                    print(
                        "Origins queue is owned by another worker; "
                        "waiting for it to stop.")
                    ownership_notice_shown = True
                if self._stopping.wait(4):
                    return
            else:
                ownership_notice_shown = False
                print(f"Origins worker exited ({code}); restarting.")
            with self._lock:
                if self._stopping.is_set():
                    return
                self._process = self._spawn()

    def stop(self) -> None:
        self._stopping.set()
        with self._lock:
            process = self._process
        if process is not None and process.poll() is None:
            process.send_signal(signal.SIGINT)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
        if self._thread is not None:
            self._thread.join(timeout=2)


def main() -> int:
    runtime_id = uuid4().hex
    parent_pid = os.getpid()
    os.environ["ORIGINS_RUNTIME_ID"] = runtime_id
    os.environ["ORIGINS_PARENT_PID"] = str(parent_pid)
    supervisor = WorkerSupervisor(runtime_id, parent_pid)
    try:
        # The local `.env` is the persisted control-plane configuration. Load
        # it before FastAPI, migrations or the worker inspect provider state.
        reload_owned_environment()
        require_local_bind()
        applied = run_migrations()
        if applied:
            print(f"Applied {len(applied)} Origins migration(s): {', '.join(applied)}")
        provider_catalogue_sync.refresh()
        # A provider request has ambiguous billing semantics after a crash, so
        # it becomes explicitly retryable instead of being silently replayed.
        voice_repository = VoicePackageRepository()
        voice_repository.abandon_running()
        supervisor.start()
        print(f"{settings.name}: http://localhost:{settings.port}{settings.web_prefix}/")
        uvicorn.run("origins.http.app:app", host=settings.host,
                    port=settings.port, log_level="info")
    finally:
        supervisor.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
