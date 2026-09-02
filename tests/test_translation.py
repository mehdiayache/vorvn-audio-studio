"""Native subtitle Translation slice; provider and persistence are fake."""

from pathlib import Path
from contextlib import contextmanager
import unittest
from uuid import uuid4

import psycopg

from origins.config import settings
from origins.application.translation import (
    MODELS,
    SubtitleTranslationJobHandler,
    SubtitleTranslationService,
    Translator,
    usage_cost,
)
from origins.application.provider_operations import ProviderOperationService
from origins.domain.jobs import Job, JobStatus
from origins.domain.text import ProviderText
from origins.http.routers.jobs import TranslationJobCreate
from origins.providers.alibaba.translation import AlibabaTranslationProvider
from origins.infrastructure.postgres import transcripts as postgres_transcripts
from origins.providers.alibaba import text as alibaba_text
from test_support import FakeProviderOperationsRepository


ROOT = Path(__file__).resolve().parents[1]


class FakeProvider:
    def __init__(self, responses=None):
        self.responses = list(responses or ["1. Bonjour"])
        self.calls = []

    def translate(self, **request):
        self.calls.append(request)
        text = self.responses.pop(0)
        return ProviderText(
            text=text,
            usage={"prompt_tokens": 10, "completion_tokens": 5,
                   "total_tokens": 15},
            request_id=f"request-{len(self.calls)}",
            provider_region="intl",
            provider_endpoint="https://example.test/compatible-mode/v1",
        )


class FakeRepository:
    def __init__(self, transcript=None, spent=0.0):
        self.transcript = transcript or {
            "id": 4,
            "name": "original",
            "source_url": "https://storage.example/source.mp3",
            "audio_url": "/audio/source.mp3",
            "language": "English",
            "duration_ms": 2000,
            "text": "Hello there",
            "srt": "",
            "vtt": "",
            "sentences": [{
                "start": 100, "end": 1900, "text": "Hello there",
                "words": [{"start": 100, "end": 900, "text": "Hello"}],
            }],
            "part_id": 9,
            "clip_id": 10,
            "translated_from": None,
        }
        self.spent = spent
        self.saved = []

    def get(self, transcript_id):
        return self.transcript if transcript_id == self.transcript["id"] else None

    def save(self, values):
        self.saved.append(values)
        return 77

    def today_spend(self):
        return self.spent


class FailingRepository(FakeRepository):
    def save(self, _values):
        raise OSError("translation database unavailable")


class Progress:
    def __init__(self):
        self.events = []

    def progress(self, *event):
        self.events.append(event)


class TranslationTests(unittest.TestCase):
    def service(self, repository=None, provider=None, preferences=None,
                operations=None):
        return SubtitleTranslationService(
            repository or FakeRepository(), Translator(provider or FakeProvider()),
            lambda: preferences or {"warn_above": 0, "daily_cap": 0},
            operations,
        )

    def test_translator_preserves_tags_alignment_and_aggregates_fallback_usage(self):
        provider = FakeProvider([
            "not numbered",
            "Bonjour",
            "Au revoir",
        ])
        result = Translator(provider).translate_lines(
            ["[sad] Hello", "Goodbye [laughing]"], "French")

        self.assertEqual(result.lines,
                         ["[sad] Bonjour", "[laughing] Au revoir"])
        self.assertEqual(len(provider.calls), 3)
        self.assertEqual(provider.calls[0]["text"], "1. Hello\n2. Goodbye")
        self.assertEqual(result.usage, {
            "prompt_tokens": 30, "completion_tokens": 15,
            "total_tokens": 45, "requests": 3,
        })
        self.assertEqual(result.request_ids,
                         ["request-1", "request-2", "request-3"])

    def test_service_preserves_sentence_spans_and_saves_actual_token_cost(self):
        repository = FakeRepository()
        provider = FakeProvider(["1. مرحبا بك"])
        result = self.service(repository, provider).translate(
            transcript_id=4, target="Arabic", quality="fast", source_job_id=21)

        self.assertEqual(result["id"], 77)
        self.assertEqual(result["model"], "qwen-mt-flash")
        self.assertEqual(result["language"], "Arabic")
        self.assertEqual(result["cost_basis"], "actual_tokens")
        self.assertEqual(result["cost"], usage_cost(
            {"prompt_tokens": 10, "completion_tokens": 5},
            "qwen-mt-flash", "intl"))
        self.assertIn("مرحبا بك", result["srt"])
        saved = repository.saved[0]
        self.assertEqual(saved["source_job_id"], 21)
        self.assertEqual(saved["translated_from"], 4)
        self.assertEqual(saved["part_id"], 9)
        self.assertEqual(saved["clip_id"], 10)
        self.assertEqual(saved["sentences"][0]["start"], 100)
        self.assertEqual(saved["sentences"][0]["end"], 1900)
        self.assertEqual(saved["sentences"][0]["words"], [])
        self.assertEqual(saved["catalog_rate"], None)

    def test_spending_warning_returns_before_provider_and_persistence(self):
        repository = FakeRepository()
        provider = FakeProvider()
        result = self.service(
            repository, provider,
            {"warn_above": 0.000001, "daily_cap": 0},
        ).translate(transcript_id=4, target="French")
        self.assertTrue(result["needs_confirmation"])
        self.assertEqual(provider.calls, [])
        self.assertEqual(repository.saved, [])

    def test_provider_success_is_recorded_before_translation_persistence(self):
        operations = FakeProviderOperationsRepository()
        with self.assertRaisesRegex(OSError, "database unavailable"):
            self.service(
                repository=FailingRepository(),
                operations=ProviderOperationService(operations),
            ).translate(
                transcript_id=4, target="Arabic", source_job_id=21,
                confirmed=True)
        finish = next(event for event in operations.events
                      if event[0] == "finish")
        self.assertEqual(finish[2], "succeeded")
        self.assertEqual(finish[3]["receipt"]["line_count"], 1)
        self.assertEqual(finish[3]["request_ids"], ["request-1"])

    def test_daily_cap_rejects_before_provider(self):
        repository = FakeRepository(spent=1.0)
        provider = FakeProvider()
        with self.assertRaisesRegex(PermissionError, "Daily cap reached"):
            self.service(
                repository, provider,
                {"warn_above": 0, "daily_cap": 1.000001},
            ).translate(transcript_id=4, target="French")
        self.assertEqual(provider.calls, [])
        self.assertEqual(repository.saved, [])

    def test_official_region_and_quality_prices_are_distinct(self):
        usage = {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000}
        self.assertEqual(usage_cost(usage, "qwen-mt-flash", "intl"), 0.65)
        self.assertEqual(usage_cost(usage, "qwen-mt-plus", "intl"), 9.83)
        self.assertEqual(usage_cost(usage, "qwen-mt-flash", "beijing"), 0.381)
        self.assertEqual(usage_cost(usage, "qwen-mt-plus", "beijing"), 1.034)

    def test_job_handler_uses_canonical_payload_and_reports_progress(self):
        handler = SubtitleTranslationJobHandler(self.service(), object())
        progress = Progress()
        job = Job(21, uuid4(), "translate", JobStatus.RUNNING, {
            "transcript_id": 4, "target": "French", "source": "English",
            "quality": "fast", "model": MODELS["fast"],
        })
        result = handler(job, progress)
        self.assertEqual(result["id"], 77)
        self.assertEqual(result["source_job_id"], str(job.public_id))
        self.assertEqual(progress.events[0][1:],
                         (0, 1, "Translating into French"))
        self.assertEqual(progress.events[-1][1:], (1, 1, "Complete"))

    def test_http_contract_uses_only_canonical_transcript_id(self):
        payload = TranslationJobCreate(
            transcript_id=7, target="Arabic", quality="best")
        self.assertEqual(payload.transcript_id, 7)
        self.assertEqual(payload.model_dump()["transcript_id"], 7)
        with self.assertRaises(ValueError):
            TranslationJobCreate(id=7, target="Arabic", quality="best")
        with self.assertRaises(ValueError):
            TranslationJobCreate(transcript_id=7, target="Arabic", quality="turbo")

    def test_alibaba_adapter_sends_official_translation_options(self):
        original = alibaba_text.complete_with_metadata
        captured = {}

        def fake_complete_with_metadata(**request):
            captured.update(request)
            return alibaba_text.TextCompletion(
                "Bonjour", {"prompt_tokens": 2, "completion_tokens": 1}, "req")

        alibaba_text.complete_with_metadata = fake_complete_with_metadata
        try:
            result = AlibabaTranslationProvider().translate(
                model="qwen-mt-flash", text="Hello", source=None,
                target="French")
        finally:
            alibaba_text.complete_with_metadata = original
        self.assertEqual(captured["messages"],
                         [{"role": "user", "content": "Hello"}])
        self.assertEqual(captured["extra_body"], {"translation_options": {
            "source_lang": "auto", "target_lang": "French"}})
        self.assertEqual(result.request_id, "req")

    def test_legacy_translation_execution_route_is_removed(self):
        legacy_jobs = ROOT / "origins/infrastructure/legacy_jobs.py"
        worker = (ROOT / "origins/worker.py").read_text()
        self.assertFalse((ROOT / "server.py").exists())
        self.assertFalse(legacy_jobs.exists())
        self.assertIn('service.register("translate", SubtitleTranslationJobHandler', worker)

    def test_postgres_repository_reads_and_saves_in_one_rolled_back_fixture(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            self.skipTest(str(error))

        @contextmanager
        def cursor_scope():
            with connection.cursor() as cursor:
                yield cursor

        original_read_only = postgres_transcripts.read_only
        original_transaction = postgres_transcripts.transaction
        postgres_transcripts.read_only = cursor_scope
        postgres_transcripts.transaction = cursor_scope
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO transcripts
                        (name, duration_ms, text, sentences)
                    VALUES ('translation fixture', 1000, 'Hello',
                            '[{"start":0,"end":1000,"text":"Hello","words":[]}]'::jsonb)
                    RETURNING id
                """)
                source_id = int(cursor.fetchone()[0])
            repository = postgres_transcripts.TranscriptRepository()
            source = repository.get(source_id)
            self.assertEqual(source["text"], "Hello")
            translated_id = repository.save({
                "name": "translation fixture [French]",
                "language": "French", "duration_ms": 1000,
                "text": "Bonjour", "srt": "", "vtt": "",
                "translated_from": source_id, "model": "qwen-mt-flash",
                "provider_region": "intl", "price_version": "fixture",
                "catalog_cost": 0.00001, "cost_basis": "actual_tokens",
                "sentences": [{"start": 0, "end": 1000,
                               "text": "Bonjour", "words": []}],
            })
            self.assertGreater(translated_id, 0)
            self.assertEqual(repository.get(translated_id)["text"],
                             "Bonjour")
        finally:
            postgres_transcripts.read_only = original_read_only
            postgres_transcripts.transaction = original_transaction
            connection.rollback()
            connection.close()


if __name__ == "__main__":
    unittest.main()
