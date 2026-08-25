"""Canonical human voice identities and their provider capabilities."""

from __future__ import annotations

from typing import Any, Callable, Protocol

from audio_studio.domain import voice_packages
from audio_studio.application.provider_operations import enforce_daily_cap


class VoiceProfilesStore(Protocol):
    def profiles(self) -> list[dict]: ...
    def profile_usage(self) -> dict[str, dict]: ...
    def update_profile(self, identity_id: str, changes: dict) -> bool: ...
    def unlinked_history(self) -> list[dict]: ...
    def link_history(self, provider_voice_id: str, identity_id: str) -> int: ...
    def create_preview(self, identity_id: str, binding_id: str, **values) -> str: ...
    def set_preview_approval(self, identity_id: str, preview_id: str,
                             approval_state: str) -> bool: ...


class VoicePackageStore(Protocol):
    def today_spend(self) -> float: ...
    def reference(self, reference_id: str) -> dict | None: ...
    def record_blocked(self, *, estimate: float, detail: str) -> None: ...
    def create_package(self, **values) -> tuple[str, list[str]]: ...
    def retry(self, enrollment_job_id: str) -> str | None: ...
    def save_window(self, reference_id: str, **values) -> dict: ...


class EnrollmentMethodStore(Protocol):
    def enrollment_methods(self) -> list[dict]: ...


class VoiceService:
    def __init__(
        self,
        profiles_store: VoiceProfilesStore,
        package_store: VoicePackageStore,
        method_store: EnrollmentMethodStore,
        preferences: Callable[[], dict],
    ):
        self.profiles_store = profiles_store
        self.package_store = package_store
        self.method_store = method_store
        self.preferences = preferences

    def profiles(self) -> list[dict[str, Any]]:
        identities = self.profiles_store.profiles()
        usage = self.profiles_store.profile_usage()
        installed_methods = self.method_store.enrollment_methods()
        for identity in identities:
            metadata = identity.get("metadata") or {}
            # Recording provenance belongs to the preserved master, while a
            # binding's languages describe what it can synthesize. Never infer
            # one from the other.
            preferred_reference = next((
                reference for reference in identity["references"]
                if reference.get("id") == identity.get(
                    "preferred_reference_id")
            ), None)
            recording_language = str(
                (preferred_reference or {}).get("source_language") or ""
            ) or next((
                reference.get("source_language", "")
                for reference in identity["references"]
                if reference.get("source_language")
            ), "") or metadata.get("recording_language") or metadata.get("language") or ""
            identity["metadata"] = {
                **metadata,
                "recording_language": recording_language,
                # Temporary read alias for older API clients. New UI code uses
                # the explicit recording/editorial fields.
                "language": recording_language,
            }
            identity["available_routes"] = voice_packages.plan(
                recording_language, installed_methods,
            )["available_routes"]
            identity["usage"] = usage.get(identity["id"], {
                "uses": 0, "productions": 0, "spend": 0.0,
                "last_used": None, "preview_filename": "",
            })
        return identities

    def profile(self, identity_id: str) -> dict[str, Any] | None:
        return next((
            item for item in self.profiles()
            if item["id"] == identity_id), None)

    def update(self, identity_id: str,
               changes: dict[str, Any]) -> dict[str, Any] | None:
        if not self.profiles_store.update_profile(identity_id, changes):
            return None
        return self.profile(identity_id)

    def save_reference_window(self, identity_id: str, reference_id: str,
                              values: dict[str, Any]) -> dict[str, Any]:
        profile = self.profile(identity_id)
        if not profile or reference_id not in {
                item["id"] for item in profile["references"]}:
            raise LookupError("That Voice Source does not belong to this Voice.")
        self.package_store.save_window(
            reference_id,
            provider_model_id=(str(values.get("provider_model_id") or "").strip()
                               or None),
            start_ms=int(values["start_ms"]),
            duration_ms=int(values["duration_ms"]),
            source_language=str(values.get("source_language") or "").strip().lower(),
            transcript=str(values.get("transcript") or "").strip(),
            enable_preprocess=values.get("enable_preprocess"),
        )
        refreshed = self.profile(identity_id)
        if not refreshed:
            raise LookupError("That Voice no longer exists.")
        return refreshed

    def save_uploaded_reference_window(self, reference_id: str,
                                       values: dict[str, Any]) -> dict:
        reference = self.package_store.reference(reference_id)
        if not reference:
            raise LookupError("That Voice Source does not exist.")
        if reference.get("identity_id"):
            raise ValueError("Edit an attached Voice Source from its Voice profile.")
        return self.package_store.save_window(
            reference_id,
            provider_model_id=(str(values.get("provider_model_id") or "").strip()
                               or None),
            start_ms=int(values["start_ms"]),
            duration_ms=int(values["duration_ms"]),
            source_language=str(values.get("source_language") or "").strip().lower(),
            transcript=str(values.get("transcript") or "").strip(),
            enable_preprocess=values.get("enable_preprocess"),
        )

    def archive(self, identity_id: str) -> dict[str, Any] | None:
        return self.update(identity_id, {"status": "archived"})

    def record_preview(self, identity_id: str, binding_id: str, *, job_id: int,
                       tag: str | None, text: str, instruction: str,
                       seed: int) -> str:
        return self.profiles_store.create_preview(
            identity_id, binding_id, job_id=job_id, tag=tag, text=text,
            instruction=instruction, seed=seed)

    def approve_preview(self, identity_id: str, preview_id: str,
                        approval_state: str) -> dict[str, Any]:
        if not self.profiles_store.set_preview_approval(
                identity_id, preview_id, approval_state):
            raise LookupError("That Voice test does not exist.")
        profile = self.profile(identity_id)
        if not profile:
            raise LookupError("That Voice does not exist.")
        return profile

    def unlinked_history(self) -> list[dict[str, Any]]:
        return self.profiles_store.unlinked_history()

    def link_history(self, identity_id: str,
                     provider_voice_id: str) -> dict[str, Any] | None:
        linked = self.profiles_store.link_history(
            provider_voice_id, identity_id)
        if not linked:
            return None
        return {"linked": linked, "profile": self.profile(identity_id)}

    def package_plan(self, language: str,
                     package: str = "complete") -> dict:
        if not language.strip():
            raise ValueError("Choose the recording language first.")
        return voice_packages.plan(
            language, self.method_store.enrollment_methods(), package)

    def _check_creation_budget(self, estimate: float,
                               confirmed: bool) -> dict | None:
        preferences = self.preferences()
        warn = float(preferences.get("warn_above") or 0)
        if warn > 0 and estimate > warn and not confirmed:
            return {
                "needs_confirmation": True,
                "estimate": round(estimate, 4), "warn_above": warn,
            }
        return None

    def create_package(self, payload: dict) -> dict:
        name = str(payload.get("name") or "").strip()
        language = str(payload.get("language") or "").strip().lower()
        reference_id = str(payload.get("reference_id") or "").strip()
        if not name or len(name) > 80:
            raise ValueError("Give this voice a name of 80 characters or fewer.")
        if not self.package_store.reference(reference_id):
            raise ValueError("Upload a reference recording first.")
        plan = self.package_plan(
            language, str(payload.get("package") or "complete"))
        requested_model_ids = {
            str(item).strip() for item in payload.get("provider_model_ids") or []
            if str(item).strip()
        }
        if requested_model_ids:
            available_ids = {
                str(route.get("provider_model_id") or "")
                for route in plan["routes"]
            }
            unknown = requested_model_ids - available_ids
            if unknown:
                raise ValueError(
                    "One requested voice model is not installed for this recording language.")
            plan = {
                **plan,
                "routes": [
                    route for route in plan["routes"]
                    if route.get("provider_model_id") in requested_model_ids
                ],
            }
            plan["total_estimated_creation_cost"] = round(sum(
                float(route.get("estimated_creation_cost") or 0)
                for route in plan["routes"]
            ), 4)
        if not plan["routes"]:
            raise ValueError("No cloned-voice capability is installed.")
        estimate = float(plan["total_estimated_creation_cost"])
        try:
            enforce_daily_cap(
                estimate, self.preferences(), self.package_store.today_spend())
        except PermissionError:
            self.package_store.record_blocked(
                estimate=estimate, detail="Daily cap reached before enrollment")
            raise
        confirmation = self._check_creation_budget(
            estimate,
            bool(payload.get("confirmed")),
        )
        if confirmation:
            return confirmation

        metadata = {
            "package": plan["package"],
            "editorial_language": str(
                payload.get("editorial_language") or "").strip().lower(),
            "gender": payload.get("gender") or None,
            "trait": str(payload.get("trait") or "").strip() or None,
        }
        identity_id, job_ids = self.package_store.create_package(
            name=name, metadata=metadata, reference_id=reference_id,
            identity_id=str(payload.get("identity_id") or "").strip() or None,
            routes=plan["routes"],
            estimate=estimate,
            reference_window_id=(str(payload.get("reference_window_id") or "").strip()
                                 or None),
            reference_window_ids={
                str(key): str(value)
                for key, value in (payload.get("reference_window_ids") or {}).items()
                if str(key).strip() and str(value).strip()
            },
        )
        return {
            "identity": self.profile(identity_id),
            "queued": len(job_ids), "plan": plan,
        }

    def retry_binding(self, enrollment_job_id: str) -> dict | None:
        job_id = self.package_store.retry(enrollment_job_id.strip())
        return {"ok": True, "job_id": job_id} if job_id else None
