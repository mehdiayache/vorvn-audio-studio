"""Voice identity use cases with no database or provider calls."""

from copy import deepcopy
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from audio_studio.application.voices import VoiceService


PROFILE = {
    "id": "voice_fixture", "name": "Fixture Voice", "metadata": {},
    "references": [],
    "bindings": [{
        "provider_voice_id": "provider-fixture", "model_id": "model-fixture",
        "engine": "omni", "tier": "plus", "status": "active",
        "languages": ["en"], "created_at": "2026-08-09T00:00:00+00:00",
    }],
    "jobs": [], "created_at": "2026-08-09T00:00:00+00:00",
    "updated_at": "2026-08-09T00:00:00+00:00",
}


class FakeProfilesStore:
    def __init__(self):
        self.items = [deepcopy(PROFILE)]
        self.updates = []
        self.links = []

    def profiles(self):
        return deepcopy(self.items)

    def profile_usage(self):
        return {"voice_fixture": {
            "uses": 4, "productions": 2, "spend": .2,
            "last_used": "2026-08-09T01:00:00+00:00",
            "preview_filename": "preview.mp3",
        }}

    def update_profile(self, identity_id, changes):
        self.updates.append((identity_id, changes))
        if identity_id != "voice_fixture":
            return False
        self.items[0]["name"] = changes.get("name", self.items[0]["name"])
        self.items[0]["metadata"].update(changes)
        return True

    def unlinked_history(self):
        return [{"provider_voice_id": "old-provider", "uses": 2}]

    def link_history(self, provider_voice_id, identity_id):
        self.links.append((provider_voice_id, identity_id))
        return 2 if identity_id == "voice_fixture" else 0


class FakePackageStore:
    def __init__(self, spent=0):
        self.spent = spent
        self.blocked = []
        self.created = []
        self.retried = []

    def today_spend(self):
        return self.spent

    def reference(self, reference_id):
        return {"id": reference_id} if reference_id == "ref_fixture" else None

    def record_blocked(self, **values):
        self.blocked.append(values)

    def create_package(self, **values):
        self.created.append(values)
        return "voice_fixture", ["job-1", "job-2", "job-3"]

    def retry(self, identity_id, model_id):
        self.retried.append((identity_id, model_id))
        return "job-retry" if identity_id == "voice_fixture" else None


class VoiceServiceTests(unittest.TestCase):
    def service(self, preferences=None, spent=0):
        profiles = FakeProfilesStore()
        packages = FakePackageStore(spent)
        service = VoiceService(
            profiles, packages,
            preferences or (lambda: {"warn_above": 0, "daily_cap": 0}),
        )
        return service, profiles, packages

    def runtime(self):
        return patch(
            "audio_studio.application.voices.alibaba_environment",
            return_value=SimpleNamespace(region="intl"),
        )

    def test_profiles_derive_language_routes_and_usage(self):
        service, _, _ = self.service()
        with self.runtime():
            profile = service.profile("voice_fixture")
        self.assertEqual(profile["metadata"]["language"], "en")
        self.assertEqual(len(profile["available_routes"]), 3)
        self.assertEqual(profile["usage"]["uses"], 4)

    def test_profile_updates_archive_and_history_use_one_store(self):
        service, profiles, _ = self.service()
        with self.runtime():
            updated = service.update("voice_fixture", {"name": "Updated"})
            archived = service.archive("voice_fixture")
            linked = service.link_history("voice_fixture", "old-provider")
        self.assertEqual(updated["name"], "Updated")
        self.assertEqual(archived["metadata"]["status"], "archived")
        self.assertEqual(linked["linked"], 2)
        self.assertEqual(profiles.links, [("old-provider", "voice_fixture")])
        self.assertEqual(service.unlinked_history()[0]["uses"], 2)

    def test_package_warning_does_not_queue_work(self):
        service, _, packages = self.service(
            lambda: {"warn_above": .005, "daily_cap": 0})
        with self.runtime():
            result = service.create_package({
                "name": "Fixture", "language": "English",
                "reference_id": "ref_fixture", "package": "complete",
            })
        self.assertTrue(result["needs_confirmation"])
        self.assertEqual(result["estimate"], .02)
        self.assertFalse(packages.created)

    def test_daily_cap_records_block_without_queueing(self):
        service, _, packages = self.service(
            lambda: {"warn_above": 0, "daily_cap": .01}, spent=.01)
        with self.runtime(), self.assertRaises(PermissionError):
            service.create_package({
                "name": "Fixture", "language": "English",
                "reference_id": "ref_fixture", "package": "complete",
            })
        self.assertEqual(packages.blocked[0]["estimate"], .02)
        self.assertFalse(packages.created)

    def test_confirmed_package_and_retry_return_application_results(self):
        service, _, packages = self.service()
        with self.runtime():
            result = service.create_package({
                "name": "Fixture", "language": "English",
                "reference_id": "ref_fixture", "package": "complete",
                "confirmed": True,
            })
        self.assertEqual(result["identity"]["id"], "voice_fixture")
        self.assertEqual(result["queued"], 3)
        self.assertEqual(len(packages.created[0]["routes"]), 3)
        self.assertEqual(
            service.retry_binding(" voice_fixture ", " model "),
            {"ok": True, "job_id": "job-retry"},
        )


if __name__ == "__main__":
    unittest.main()
