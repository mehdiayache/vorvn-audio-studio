"""Background creation of provider bindings for a persisted voice identity."""

import re
import threading
import time
from pathlib import Path

import db
import say
import storage
from services.alibaba import config, omni


ROOT = Path(__file__).resolve().parents[1]
_REFERENCE_URLS: dict[str, tuple[float, str]] = {}
_REFERENCE_URL_LOCK = threading.Lock()


def _reference_url(reference: dict, local: Path) -> str:
    """Upload one reference once for a whole package of parallel jobs."""
    reference_id = reference["id"]
    with _REFERENCE_URL_LOCK:
        cached = _REFERENCE_URLS.get(reference_id)
        if cached and time.monotonic() - cached[0] < 600:
            return cached[1]
        url = storage.upload(local, kind="voice-clone")
        _REFERENCE_URLS[reference_id] = (time.monotonic(), url)
        return url


def _prefix(name: str, engine: str) -> str:
    limit = 16 if engine == "omni" else 10
    clean = re.sub(r"[^a-z0-9_]" if engine == "omni" else r"[^a-z0-9]",
                   "", name.lower())
    return (clean or "voice")[:limit]


def _create_provider_voice(job: dict, url: str) -> str:
    language = str((job.get("metadata") or {}).get("language") or "").strip() or None
    prefix = _prefix(job["name"], job["engine"])
    if job["engine"] == "omni":
        return omni.create_voice(job["model_id"], prefix, url, language=language)
    from dashscope.audio.tts_v2 import VoiceEnrollmentService
    say.apply_credentials()
    return VoiceEnrollmentService().create_voice(
        target_model=job["model_id"], prefix=prefix, url=url,
        language_hints=[language] if language else None,
        max_prompt_audio_length=30.0,
    )


def run(job_id: str) -> None:
    job = db.voice_package_job(job_id)
    if not job or job["status"] not in ("queued", "interrupted", "creating"):
        return
    if job["status"] != "creating":
        db.voice_package_job_update(job_id, "creating")
    ledger = db.job_start("clone", model=job["model_id"],
                          estimated=config.CAPABILITIES[job["engine"]].get("clone_cost", 0),
                          detail=f"{job['name']} · {job['engine']} {job['tier']}")
    try:
        reference = db.voice_reference_get(job["reference_id"])
        if not reference or not reference.get("normalized_path"):
            raise RuntimeError("The saved reference recording is unavailable.")
        local = ROOT / ".uploads" / reference["normalized_path"]
        if not local.is_file():
            raise RuntimeError("The saved reference recording is missing from disk.")
        url = _reference_url(reference, local)
        provider_voice_id = _create_provider_voice(job, url)
        language = str((job.get("metadata") or {}).get("language") or "").strip()
        db.voice_save(provider_voice_id, name=job["name"], languages=language,
                      provider_voice_id=provider_voice_id, engine=job["engine"],
                      target_model=job["model_id"], provider_status="OK")
        identity_id = db.voice_identity_bind(
            provider_voice_id=provider_voice_id, model_id=job["model_id"],
            name=job["name"], engine=job["engine"], tier=job["tier"],
            languages=[language] if language else [], reference_id=job["reference_id"],
            identity_id=job["identity_id"])
        if identity_id != job["identity_id"]:
            raise RuntimeError("The provider voice was not linked to its identity.")
        db.voice_package_job_update(job_id, "ready", provider_voice_id=provider_voice_id)
        db.job_finish(ledger, status="ok", voice=provider_voice_id,
                      cost=config.CAPABILITIES[job["engine"]].get("clone_cost", 0),
                      detail=f"{job['name']} · {job['model_id']}")
    except Exception as exc:
        message = str(exc).strip()[:600] or type(exc).__name__
        db.voice_package_job_update(job_id, "failed", error=message)
        db.job_finish(ledger, status="failed", error=message,
                      detail=f"{job['name']} · {job['model_id']}")
