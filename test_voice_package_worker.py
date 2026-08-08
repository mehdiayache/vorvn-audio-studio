#!/usr/bin/env python3
"""No-provider contract tests for asynchronous voice-package creation."""

import tempfile
from pathlib import Path

from services import voice_package_worker as worker


originals = {}


def replace(owner, name, value):
    originals[(owner, name)] = getattr(owner, name)
    setattr(owner, name, value)


def restore():
    for (owner, name), value in originals.items():
        setattr(owner, name, value)


updates = []
finishes = []
uploads = []
job = {
    "id": "vjob_test", "identity_id": "voice_test", "reference_id": "ref_test",
    "model_id": "qwen3.5-omni-flash", "engine": "omni", "tier": "flash",
    "status": "queued", "name": "Test Voice", "metadata": {"language": "en"},
}

try:
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        (root / ".uploads").mkdir()
        (root / ".uploads" / "source.wav").write_bytes(b"RIFF-test")
        replace(worker, "ROOT", root)
        replace(worker.db, "voice_package_job", lambda _job_id: dict(job))
        replace(worker.db, "voice_reference_get", lambda _reference_id: {
            "id": "ref_test", "normalized_path": "source.wav"})
        replace(worker.db, "voice_package_job_update",
                lambda job_id, status, **fields: updates.append((job_id, status, fields)) or True)
        replace(worker.db, "job_start", lambda *args, **kwargs: "ledger_test")
        replace(worker.db, "job_finish",
                lambda ledger, **fields: finishes.append((ledger, fields)) or True)
        replace(worker.db, "voice_save", lambda *args, **kwargs: True)
        replace(worker.db, "voice_identity_bind", lambda **kwargs: "voice_test")
        replace(worker.storage, "upload",
                lambda path, **kwargs: uploads.append((str(path), kwargs)) or "https://signed.test/source")
        replace(worker, "_create_provider_voice",
                lambda provider_job, url: "provider_voice_test")
        worker._REFERENCE_URLS.clear()

        worker.run("vjob_test")
        job["id"] = "vjob_test_2"
        worker.run("vjob_test_2")

    assert [status for _, status, _ in updates] == ["creating", "ready", "creating", "ready"]
    assert len(uploads) == 1, "one source upload must serve the whole model package"
    assert all(fields["status"] == "ok" for _, fields in finishes)
    print("voice package worker contracts passed")
finally:
    restore()

