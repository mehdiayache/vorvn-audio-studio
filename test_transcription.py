"""Native Transcription slice; all provider calls are fake."""

from contextlib import contextmanager
from pathlib import Path
import unittest
from uuid import uuid4

import psycopg

from audio_studio.application.transcription import (
    TranscriptionJobHandler,
    TranscriptionService,
)
from audio_studio.application.provider_operations import ProviderOperationService
from audio_studio.config import settings
from audio_studio.domain.jobs import Job, JobStatus
from audio_studio.domain.transcription import (
    PreparedAudio,
    ProviderTranscript,
    QWEN_MODEL,
)
from audio_studio.http.routers.jobs import TranscriptionJobCreate
from audio_studio.infrastructure.postgres import transcripts as postgres_transcripts
from test_support import FakeProviderOperationsRepository


ROOT = Path(__file__).parent


class FakeProvider:
    region = "intl"

    def __init__(self):
        self.calls = []

    def transcribe(self, **values):
        self.calls.append(values)
        return ProviderTranscript(
            text="Hello world.",
            sentences=[{
                "start": 100, "end": 2100, "text": "Hello world.",
                "words": [
                    {"start": 100, "end": 900, "text": "Hello"},
                    {"start": 950, "end": 2100, "text": "world."},
                ],
            }],
            duration_ms=2100,
            request_id="asr-request-1",
            provider_region="intl",
            provider_endpoint="https://example.test/api/v1",
            billed_duration_ms=2200,
            usage={"seconds": 2.2},
        )


class FakeSourceResolver:
    def __init__(self):
        self.calls = []
        self.published = []

    def prepare(self, **values):
        self.calls.append(values)
        return PreparedAudio(
            "https://storage.test/audio.mp3", "audio.mp3", "/inbox/audio.mp3",
            2000, values.get("part_id"), 45)

    def publish(self, source):
        self.published.append(source)
        return source


class FailingPublishResolver(FakeSourceResolver):
    def publish(self, source):
        raise OSError("source publication failed")


class FakeRepository:
    def __init__(self, spent=0.0):
        self.spent = spent
        self.saved = []
        self.finished = []

    def save(self, values):
        self.saved.append(values)
        return 91

    def finish_part(self, part_id, take_id, duration_ms, transcript_id):
        self.finished.append((part_id, take_id, duration_ms, transcript_id))

    def today_spend(self):
        return self.spent


class FailingRepository(FakeRepository):
    def save(self, _values):
        raise OSError("transcript database unavailable")


class Progress:
    def __init__(self):
        self.events = []

    def progress(self, *event):
        self.events.append(event)


class TranscriptionTests(unittest.TestCase):
    def service(self, repository=None, provider=None, preferences=None,
                operations=None, source_resolver=None):
        return TranscriptionService(
            repository or FakeRepository(), provider or FakeProvider(),
            source_resolver or FakeSourceResolver(),
            lambda: preferences or {"warn_above": 0, "daily_cap": 0},
            operations,
        )

    def test_service_saves_word_timings_cost_route_and_generation_state(self):
        repository = FakeRepository()
        provider = FakeProvider()
        result = self.service(repository, provider).transcribe(
            file="audio.mp3", part_id=44, language="Arabic",
            enable_itn=True, source_job_id=12)

        self.assertEqual(result["id"], 91)
        self.assertEqual(result["model"], QWEN_MODEL)
        self.assertEqual(result["provider_request_id"], "asr-request-1")
        self.assertEqual(result["cost_basis"], "catalog_duration")
        self.assertEqual(result["duration_ms"], 2100)
        self.assertEqual(result["usage"], {"seconds": 2.2})
        self.assertIn("Hello world.", result["srt"])
        self.assertEqual(provider.calls[0]["language"], "Arabic")
        self.assertTrue(provider.calls[0]["enable_itn"])
        saved = repository.saved[0]
        self.assertEqual(saved["source_job_id"], 12)
        self.assertEqual(saved["part_id"], 44)
        self.assertEqual(saved["take_id"], 45)
        self.assertEqual(saved["sentences"][0]["words"][1]["text"], "world.")
        self.assertEqual(repository.finished, [(44, 45, 2100, 91)])

    def test_warning_and_cap_stop_before_provider(self):
        provider = FakeProvider()
        result = self.service(
            provider=provider,
            preferences={"warn_above": 0.000001, "daily_cap": 0},
        ).transcribe(url="https://storage.test/audio.mp3", name="audio.mp3",
                     duration_ms=2000)
        self.assertTrue(result["needs_confirmation"])
        self.assertEqual(provider.calls, [])

        provider = FakeProvider()
        with self.assertRaisesRegex(PermissionError, "Daily cap reached"):
            self.service(
                repository=FakeRepository(spent=1), provider=provider,
                preferences={"warn_above": 0, "daily_cap": 1.000001},
            ).transcribe(url="https://storage.test/audio.mp3", name="audio.mp3",
                         duration_ms=2000)
        self.assertEqual(provider.calls, [])

    def test_provider_success_is_recorded_before_transcript_persistence(self):
        operations = FakeProviderOperationsRepository()
        with self.assertRaisesRegex(OSError, "database unavailable"):
            self.service(
                repository=FailingRepository(),
                operations=ProviderOperationService(operations),
            ).transcribe(
                url="https://storage.test/audio.mp3", name="audio.mp3",
                duration_ms=2000, source_job_id=12, confirmed=True)
        finish = next(event for event in operations.events
                      if event[0] == "finish")
        self.assertEqual(finish[2], "succeeded")
        self.assertEqual(finish[3]["receipt"]["sentence_count"], 1)
        self.assertEqual(finish[3]["request_ids"], ["asr-request-1"])

    def test_source_publish_failure_precedes_budget_and_provider_attempt(self):
        operations = FakeProviderOperationsRepository()
        provider = FakeProvider()
        with self.assertRaisesRegex(OSError, "source publication failed"):
            self.service(
                provider=provider,
                operations=ProviderOperationService(operations),
                source_resolver=FailingPublishResolver(),
            ).transcribe(
                url="https://storage.test/audio.mp3", name="audio.mp3",
                duration_ms=2000, source_job_id=12, confirmed=True)
        self.assertEqual(provider.calls, [])
        self.assertEqual(operations.events, [])

    def test_job_handler_uses_public_job_id_and_reports_progress(self):
        handler = TranscriptionJobHandler(self.service())
        progress = Progress()
        job = Job(12, uuid4(), "transcribe", JobStatus.RUNNING, {
            "url": "https://storage.test/audio.mp3", "name": "audio.mp3",
            "duration_ms": 2000, "language": "English", "model": QWEN_MODEL,
        })
        result = handler(job, progress)
        self.assertEqual(result["source_job_id"], str(job.public_id))
        self.assertEqual(progress.events[0][1:],
                         (0, 1, "Listening to the audio"))
        self.assertEqual(progress.events[-1][1:3], (1, 1))

    def test_http_contract_requires_measured_upload_or_part_identity(self):
        uploaded = TranscriptionJobCreate(
            url="https://storage.test/audio.mp3", name="audio.mp3",
            duration_ms=2000)
        self.assertEqual(uploaded.duration_ms, 2000)
        local = TranscriptionJobCreate(file="audio.mp3", part_id=44)
        self.assertEqual(local.part_id, 44)
        unknown_duration = TranscriptionJobCreate(
            url="https://storage.test/audio.mp3", name="audio.mp3")
        self.assertEqual(unknown_duration.duration_ms, 0)
        with self.assertRaises(ValueError):
            TranscriptionJobCreate(file="audio.mp3")
        with self.assertRaises(ValueError):
            TranscriptionJobCreate(
                url="https://storage.test/audio.mp3", duration_ms=2000,
                part_id=44)

    def test_legacy_execution_and_upload_routes_are_removed(self):
        legacy = ROOT / "audio_studio/infrastructure/legacy_jobs.py"
        worker = (ROOT / "audio_studio/worker.py").read_text()
        self.assertFalse((ROOT / "server.py").exists())
        self.assertFalse(legacy.exists())
        self.assertIn('service.register("transcribe", TranscriptionJobHandler',
                      worker)

    def test_shared_postgres_repository_owns_catalogue_and_translation(self):
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
            repository = postgres_transcripts.TranscriptRepository()
            transcript_id = repository.save({
                "name": "native transcription fixture", "language": "English",
                "duration_ms": 1000, "text": "Hello", "srt": "", "vtt": "",
                "model": QWEN_MODEL, "provider_region": "intl",
                "price_version": "fixture", "catalog_rate": "0.000035",
                "catalog_cost": 0.000035, "cost_basis": "catalog_duration",
                "sentences": [{"start": 0, "end": 1000,
                               "text": "Hello", "words": []}],
            })
            self.assertEqual(repository.get(transcript_id)["text"], "Hello")
            self.assertIn(transcript_id,
                          [item["id"] for item in repository.list(200)])
            self.assertTrue(repository.delete(transcript_id))
            self.assertIsNone(repository.get(transcript_id))
        finally:
            postgres_transcripts.read_only = original_read_only
            postgres_transcripts.transaction = original_transaction
            connection.rollback()
            connection.close()


if __name__ == "__main__":
    unittest.main()
