"""Native Text preparation slice; all provider and persistence I/O is fake."""

from pathlib import Path
import unittest
from uuid import uuid4

from audio_studio.application.text_preparation import (
    MODEL,
    TextPreparationJobHandler,
    TextPreparationService,
)
from audio_studio.application.provider_operations import ProviderOperationService
from audio_studio.domain.jobs import Job, JobStatus
from audio_studio.domain.text import ProviderText
from audio_studio.http.routers.jobs import TextJobCreate
from test_support import FakeProviderOperationsRepository


ROOT = Path(__file__).parent


class FakeRepository:
    def __init__(self, *, prompts=None, style="", spent=0.0):
        self.prompts = prompts or {}
        self.style = style
        self.spent = spent
        self.style_requests: list[int] = []

    def prompt_settings(self):
        return self.prompts

    def style_for(self, production_id):
        self.style_requests.append(production_id)
        return self.style

    def today_spend(self):
        return self.spent


class FakeProvider:
    def __init__(self, text="Ready."):
        self.text = text
        self.calls = []

    def complete(self, **request):
        self.calls.append(request)
        return ProviderText(
            self.text, {"prompt_tokens": 12, "completion_tokens": 3},
            "provider-request", "intl", "https://example.test/compatible-mode/v1",
        )


class Progress:
    def __init__(self):
        self.events = []

    def progress(self, *event):
        self.events.append(event)


class TextPreparationTests(unittest.TestCase):
    def service(self, repository=None, provider=None, preferences=None,
                operations=None):
        return TextPreparationService(
            repository or FakeRepository(), provider or FakeProvider(),
            lambda: preferences or {"warn_above": 0, "daily_cap": 0},
            operations,
        )

    def test_shape_uses_canonical_production_style_and_edited_prompt(self):
        repository = FakeRepository(
            prompts={"shape": "Speak clearly. {moods}"},
            style="Warm and patient",
        )
        provider = FakeProvider("Hello there.")
        result = self.service(repository, provider).prepare(
            operation="shape", text="Hello there", production_id=41, part_id=9,
        )

        self.assertEqual(repository.style_requests, [41])
        prompt = provider.calls[0]["messages"][0]["content"]
        self.assertIn("Speak clearly.", prompt)
        self.assertIn("Warm and patient", prompt)
        self.assertEqual(result["after"], "Hello there.")
        self.assertEqual(result["part"], 9)
        self.assertTrue(result["style_used"])
        self.assertEqual(result["model"], MODEL)
        self.assertEqual(result["provider_request_id"], "provider-request")
        self.assertEqual(result["usage"]["prompt_tokens"], 12)
        self.assertFalse(provider.calls[0]["reasoning"])
        self.assertEqual(result["cost_basis"], "actual_tokens")
        self.assertEqual(result["cost"], .000008)
        self.assertIn("estimated_cost", result)

    def test_tag_rejects_omni_before_any_provider_call(self):
        provider = FakeProvider()
        with self.assertRaisesRegex(ValueError, "Qwen 3.5 Omni"):
            self.service(provider=provider).prepare(
                operation="tag", text="Hello", engine="omni")
        self.assertEqual(provider.calls, [])

    def test_tag_strips_only_invented_tags(self):
        provider = FakeProvider("[sad] Hello [invented] there [laughing]")
        result = self.service(provider=provider).prepare(
            operation="tag", text="Hello there", density="heavy")
        self.assertEqual(result["after"], "[sad] Hello there [laughing]")
        self.assertIn("add tags generously", provider.calls[0]["messages"][0]["content"].lower())

    def test_tag_rejects_any_provider_rewrite_and_preserves_source_truth(self):
        provider = FakeProvider("[sad] Hello changed")
        with self.assertRaisesRegex(ValueError, "rejected that version"):
            self.service(provider=provider).prepare(
                operation="tag", text="Hello there")

    def test_rejected_text_still_preserves_definite_provider_success(self):
        operations = FakeProviderOperationsRepository()
        provider = FakeProvider("[sad] Hello changed")
        with self.assertRaisesRegex(ValueError, "rejected that version"):
            self.service(
                provider=provider,
                operations=ProviderOperationService(operations),
            ).prepare(
                operation="tag", text="Hello there", source_job_id=8,
                confirmed=True)
        finish = next(event for event in operations.events
                      if event[0] == "finish")
        self.assertEqual(finish[2], "succeeded")
        self.assertGreater(finish[3]["cost"], 0)
        self.assertEqual(finish[3]["receipt"]["character_count"], 19)

    def test_warning_blocks_before_provider_until_confirmed(self):
        provider = FakeProvider()
        result = self.service(
            provider=provider,
            preferences={"warn_above": 0.000001, "daily_cap": 0},
        ).prepare(operation="shape", text="A sufficiently long sentence.")
        self.assertTrue(result["needs_confirmation"])
        self.assertEqual(provider.calls, [])

    def test_daily_cap_rejects_before_provider(self):
        provider = FakeProvider()
        service = self.service(
            repository=FakeRepository(spent=0.99), provider=provider,
            preferences={"warn_above": 0, "daily_cap": 0.990001},
        )
        with self.assertRaisesRegex(PermissionError, "Daily cap reached"):
            service.prepare(operation="shape", text="This exceeds the cap.")
        self.assertEqual(provider.calls, [])

    def test_job_handler_reports_progress_and_uses_canonical_payload(self):
        provider = FakeProvider("Done")
        handler = TextPreparationJobHandler(self.service(provider=provider))
        progress = Progress()
        job = Job(8, uuid4(), "rewrite", JobStatus.RUNNING, {
            "operation": "shape", "text": "Do this", "production_id": 3,
            "part_id": 5, "density": "normal", "engine": "audio",
        })
        result = handler(job, progress)
        self.assertEqual(result["after"], "Done")
        self.assertEqual(progress.events[0][1:], (0, 1, "Rewriting for the ear"))
        self.assertEqual(progress.events[-1][1:], (1, 1, "Complete"))

    def test_http_contract_accepts_old_aliases_but_serializes_canonical_names(self):
        payload = TextJobCreate(operation="shape", text="Hello", project_id=7, id=8)
        self.assertEqual(payload.production_id, 7)
        self.assertEqual(payload.part_id, 8)
        self.assertEqual(payload.model_dump()["production_id"], 7)
        with self.assertRaises(ValueError):
            TextJobCreate(operation="tag", text="Hello", density="extreme")

    def test_http_contract_accepts_standalone_text_preparation_without_work_ids(self):
        payload = TextJobCreate(
            operation="tag", text="مرحبا", density="normal", engine="audio")
        values = payload.model_dump(exclude_none=True)
        self.assertNotIn("production_id", values)
        self.assertNotIn("part_id", values)
        self.assertEqual(values["operation"], "tag")

    def test_legacy_text_execution_routes_are_removed(self):
        legacy_jobs = ROOT / "audio_studio/infrastructure/legacy_jobs.py"
        worker = (ROOT / "audio_studio/worker.py").read_text()
        self.assertFalse((ROOT / "server.py").exists())
        self.assertFalse(legacy_jobs.exists())
        self.assertIn('service.register("rewrite", TextPreparationJobHandler', worker)


if __name__ == "__main__":
    unittest.main()
