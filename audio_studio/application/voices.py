"""Canonical human voice identities and their provider capabilities."""

from __future__ import annotations

from typing import Any

import db
from services import voice_packages
from audio_studio.application.preferences import load_preferences
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository


package_repository = VoicePackageRepository()


def profiles() -> list[dict[str, Any]]:
    identities = db.voice_identities()
    usage = db.voice_identity_usage()
    for identity in identities:
        metadata = identity.get("metadata") or {}
        language = metadata.get("language") or next((
            language for binding in identity["bindings"]
            for language in binding.get("languages", []) if language), "")
        identity["metadata"] = {**metadata, "language": language}
        identity["available_routes"] = (voice_packages.plan(language)["available_routes"]
                                                 if language else [])
        identity["usage"] = usage.get(identity["id"], {
            "uses": 0, "productions": 0, "spend": 0.0,
            "last_used": None, "preview_filename": "",
        })
    return identities


def profile(identity_id: str) -> dict[str, Any] | None:
    return next((item for item in profiles() if item["id"] == identity_id), None)


def update(identity_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
    if not db.voice_identity_update(identity_id, changes):
        return None
    return profile(identity_id)


def archive(identity_id: str) -> dict[str, Any] | None:
    return update(identity_id, {"status": "archived"})


def unlinked_history() -> list[dict[str, Any]]:
    return db.voice_historical_unlinked()


def link_history(identity_id: str, provider_voice_id: str) -> dict[str, Any] | None:
    linked = db.voice_link_history(provider_voice_id, identity_id)
    if not linked:
        return None
    db.job("voice_history_link", status="ok", voice=identity_id,
           detail=f"Linked {linked} historical recordings from {provider_voice_id}")
    return {"linked": linked, "profile": profile(identity_id)}


def package_plan(language: str, package: str = "complete") -> dict:
    if not language.strip():
        raise ValueError("Choose the recording language first.")
    return voice_packages.plan(language, package)


def _check_creation_budget(estimate: float, confirmed: bool) -> dict | None:
    preferences = load_preferences()
    cap = float(preferences.get("daily_cap") or 0)
    spent = package_repository.today_spend()
    if cap > 0 and spent + estimate > cap:
        package_repository.record_blocked(
            estimate=estimate, detail=f"daily cap of ${cap:.2f} reached")
        raise PermissionError(
            f"Daily cap reached. You've spent ${spent:.4f} today and this would "
            f"add ${estimate:.4f}, over your ${cap:.2f} cap.")
    warn = float(preferences.get("warn_above") or 0)
    if warn > 0 and estimate > warn and not confirmed:
        return {"needs_confirmation": True, "estimate": round(estimate, 4),
                "warn_above": warn}
    return None


def create_package(payload: dict) -> dict:
    name = str(payload.get("name") or "").strip()
    language = str(payload.get("language") or "").strip().lower()
    reference_id = str(payload.get("reference_id") or "").strip()
    if not name or len(name) > 80:
        raise ValueError("Give this voice a name of 80 characters or fewer.")
    if not package_repository.reference(reference_id):
        raise ValueError("Upload a reference recording first.")
    plan = package_plan(language, str(payload.get("package") or "complete"))
    if not plan["routes"]:
        raise ValueError("No installed voice model supports that language.")
    confirmation = _check_creation_budget(
        float(plan["total_estimated_creation_cost"]), bool(payload.get("confirmed")))
    if confirmation:
        return confirmation

    metadata = {
        "language": plan["language"], "package": plan["package"],
        "gender": payload.get("gender") or None,
        "trait": str(payload.get("trait") or "").strip() or None,
    }
    identity_id, job_ids = package_repository.create_package(
        name=name, metadata=metadata, reference_id=reference_id,
        identity_id=str(payload.get("identity_id") or "").strip() or None,
        routes=plan["routes"],
        estimate=float(plan["total_estimated_creation_cost"]),
    )
    return {"identity": profile(identity_id), "queued": len(job_ids), "plan": plan}


def retry_binding(identity_id: str, model_id: str) -> dict | None:
    job_id = package_repository.retry(identity_id.strip(), model_id.strip())
    return {"ok": True, "job_id": job_id} if job_id else None
