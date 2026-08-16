"""Voice identity use cases with no database or provider calls."""

from copy import deepcopy
import unittest

from audio_studio.application.voices import VoiceService


PROFILE = {
    "id": "voice_fixture", "name": "Fixture Voice", "metadata": {},
    "references": [{
        "id": "ref_fixture", "source_language": "en",
        "original_name": "fixture.wav", "normalized_path": "fixture.wav",
        "created_at": "2026-08-09T00:00:00+00:00",
        "updated_at": "2026-08-09T00:00:00+00:00",
    }],
    "bindings": [{
        "provider_voice_id": "provider-fixture", "model_id": "model-fixture",
        "engine": "audio", "tier": "flash", "status": "active",
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

    def retry(self, enrollment_job_id):
        self.retried.append(enrollment_job_id)
        return "job-retry" if enrollment_job_id == "job-retry" else None


class FakeMethodStore:
    def enrollment_methods(self):
        return [
            {
                "provider_model_id": "alibaba:intl:audio-flash",
                "provider": "alibaba", "region": "intl",
                "model_id": "audio-flash", "tier": "flash",
                "adapter_key": "audio", "label": "Qwen Audio · Flash",
                "role": "Expressive speech + tags",
                "capability_ids": ["expressive_tags"],
                "enrollment_languages": ["en"],
                "output_languages": ["English"],
                "estimated_creation_cost": 0,
            },
            {
                "provider_model_id": "alibaba:intl:qwen3-tts-vc",
                "provider": "alibaba", "region": "intl",
                "model_id": "qwen3-tts-vc", "tier": "vc",
                "adapter_key": "qwen_tts", "label": "Qwen3 TTS Voice Clone",
                "role": "Exact long reading",
                "capability_ids": ["exact_longform"],
                "enrollment_languages": ["en", "fr"],
                "output_languages": ["English", "French"],
                "estimated_creation_cost": .01,
            },
            {
                "provider_model_id": "cosy:global:cosy-v3",
                "provider": "cosy", "region": "global",
                "model_id": "cosy-v3", "tier": "plus",
                "adapter_key": "cosy", "label": "CosyVoice V3",
                "role": "Character performance",
                "capability_ids": ["character_performance"],
                "enrollment_languages": ["en"],
                "output_languages": ["English", "Arabic"],
                "estimated_creation_cost": .02,
            },
        ]


class VoiceServiceTests(unittest.TestCase):
    def service(self, preferences=None, spent=0):
        profiles = FakeProfilesStore()
        packages = FakePackageStore(spent)
        service = VoiceService(
            profiles, packages, FakeMethodStore(),
            preferences or (lambda: {"warn_above": 0, "daily_cap": 0}),
        )
        return service, profiles, packages

    def test_profiles_derive_language_routes_and_usage(self):
        service, _, _ = self.service()
        profile = service.profile("voice_fixture")
        self.assertEqual(profile["metadata"]["language"], "en")
        self.assertEqual(len(profile["available_routes"]), 3)
        self.assertIn("cosy", {
            route["provider"] for route in profile["available_routes"]})
        self.assertEqual(profile["usage"]["uses"], 4)

    def test_preferred_reference_is_profile_guidance_not_a_route_gate(self):
        service, profiles, _ = self.service()
        profiles.items[0]["references"].append({
            "id": "ref_preferred", "source_language": "Wolof",
            "original_name": "preferred.wav",
            "normalized_path": "preferred.wav",
            "created_at": "2026-08-10T00:00:00+00:00",
            "updated_at": "2026-08-10T00:00:00+00:00",
        })
        profiles.items[0]["preferred_reference_id"] = "ref_preferred"
        profile = service.profile("voice_fixture")
        self.assertEqual(profile["metadata"]["recording_language"], "Wolof")
        self.assertEqual(len(profile["available_routes"]), 3)
        self.assertTrue(all(
            not route["source_language_documented"]
            for route in profile["available_routes"]))

    def test_profile_updates_archive_and_history_use_one_store(self):
        service, profiles, _ = self.service()
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
        result = service.create_package({
            "name": "Fixture", "language": "English",
            "reference_id": "ref_fixture", "package": "complete",
        })
        self.assertTrue(result["needs_confirmation"])
        self.assertEqual(result["estimate"], .03)
        self.assertFalse(packages.created)

    def test_daily_cap_records_block_without_queueing(self):
        service, _, packages = self.service(
            lambda: {"warn_above": 0, "daily_cap": .01}, spent=.01)
        with self.assertRaises(PermissionError):
            service.create_package({
                "name": "Fixture", "language": "English",
                "reference_id": "ref_fixture", "package": "complete",
            })
        self.assertEqual(packages.blocked[0]["estimate"], .03)
        self.assertFalse(packages.created)

    def test_confirmed_package_and_retry_return_application_results(self):
        service, _, packages = self.service()
        result = service.create_package({
            "name": "Fixture", "language": "English",
            "reference_id": "ref_fixture", "package": "complete",
            "confirmed": True,
        })
        self.assertEqual(result["identity"]["id"], "voice_fixture")
        self.assertEqual(result["queued"], 3)
        self.assertEqual(len(packages.created[0]["routes"]), 3)
        cosy = next(route for route in packages.created[0]["routes"]
                    if route["provider"] == "cosy")
        self.assertEqual(cosy["provider_model_id"], "cosy:global:cosy-v3")
        self.assertEqual(
            service.retry_binding(" job-retry "),
            {"ok": True, "job_id": "job-retry"},
        )


if __name__ == "__main__":
    unittest.main()
