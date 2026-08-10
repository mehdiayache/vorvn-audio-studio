"""Native Batch slice; provider execution is fully faked."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

import psycopg

from audio_studio.application.batches import (
    BatchGenerationService,
    BatchIntakeService,
    BatchJobHandler,
)
from audio_studio.domain.speech import PreparedSpeech, SynthesizedSpeech
from audio_studio.domain.jobs import Job, JobStatus
from audio_studio.config import settings
from audio_studio.http.routers.jobs import BatchJobCreate
from audio_studio.infrastructure.alibaba.speech_generation import AlibabaSpeechProvider
from audio_studio.infrastructure.batch_workspace import FilesystemBatchWorkspace
from audio_studio.infrastructure.spreadsheets import read as read_spreadsheet
from audio_studio.infrastructure.postgres.speech import SpeechRepository
from audio_studio.domain import voice_registry
from audio_studio.domain.provider_pricing import qwen_audio_tts_cost


ROOT = Path(__file__).parent


class FakeWorkspace:
    def __init__(self, sheet):
        self.sheet = sheet
        self.created = []
        self.written = {}
        self.zipped = []

    def save_sheet(self, sheet):
        self.sheet = sheet
        return "20260808-120000-deadbeef"

    def parse_sheet(self, filename, data):
        return read_spreadsheet(filename, data)

    def load_sheet(self, token):
        if token != "20260808-120000-deadbeef":
            raise LookupError("Load the spreadsheet again.")
        return self.sheet

    def create_output(self, token, run_id):
        self.created.append((token, run_id))
        safe_run = run_id.replace("-", "")[:12]
        return f"batch-{token}-{safe_run}"

    def write_audio(self, folder, filename, audio):
        self.written[(folder, filename)] = audio

    def write_zip(self, folder, filenames):
        self.zipped.append((folder, filenames))
        return bool(filenames)


class FakeRepository:
    def __init__(self, spent=0):
        self.spent = spent

    def voice_bindings(self):
        return [{
            "provider_voice_id": "voice-one", "voice_id": "voice-one",
            "identity_id": "identity-one", "engine": "audio",
            "tier": "plus", "model_id": "qwen-audio-3.0-tts-plus",
            "source": "custom", "status": "active",
        }]

    def pronunciations(self):
        return []

    def today_spend(self):
        return self.spent


class FakeProvider:
    def __init__(self):
        self.prepared = []
        self.calls = []

    def prepare(self, *, text, values, **_):
        result = PreparedSpeech(
            original_text=text, spoken_text=text, voice=values["voice"],
            voice_identity_id=values.get("voice_identity_id"),
            engine=values["engine"], tier=values["model"],
            model_id=f"model-{values['engine']}-{values['model']}",
            output_format=values["format"], extension="mp3",
            language=None, instruction=None, speech_mode="exact",
            rate=1, pitch=1, volume=50, seed=0, request_count=1,
            voice_route={},
            estimated_cost=.001, context=text,
        )
        self.prepared.append(result)
        return result

    def synthesize(self, prepared, on_progress=None):
        self.calls.append(prepared)
        if prepared.original_text == "FAIL":
            raise RuntimeError("row refused")
        return SynthesizedSpeech(
            audio=b"audio-" + prepared.original_text.encode(), cost=.001,
            cost_basis="catalog_characters", usage={"input_text": 2},
            failures=[], provider_region="intl",
            provider_endpoint="wss://provider.test",
        )


class Progress:
    def __init__(self):
        self.events = []

    def progress(self, *values):
        self.events.append(values)


def sheet(rows=None):
    return {
        "headers": ["name", "text", "voice", "language"],
        "rows": rows or [
            ["same", "hello", "", ""],
            ["same", "FAIL", "", ""],
            ["same", "world", "", ""],
        ],
        "truncated": False,
    }


class BatchTests(unittest.TestCase):
    def service(self, *, rows=None, spent=0, preferences=None):
        workspace = FakeWorkspace(sheet(rows))
        provider = FakeProvider()
        service = BatchGenerationService(
            workspace, provider=provider,
            repository=FakeRepository(spent),
            preferences=lambda: preferences or {
                "warn_above": 0, "daily_cap": 0,
                "fix_dates_phones": True, "day_first": True,
            },
        )
        return service, workspace, provider

    def test_preview_is_free_and_reports_unknown_voice_rows(self):
        workspace = FakeWorkspace({})
        result = BatchIntakeService(
            workspace, FakeRepository()).preview(
                b"name,text,voice\na,Hello,voice-one\nb,World,typo\n",
                "rows.csv")
        self.assertEqual(result["rows"], 2)
        self.assertEqual(result["guess"]["text"], 1)
        self.assertEqual(result["voices"]["unknown"], [
            {"voice": "typo", "first_row": 3}])
        self.assertEqual(workspace.sheet["headers"], ["name", "text", "voice"])

    def test_run_keeps_partial_success_unique_files_usage_and_progress(self):
        service, workspace, provider = self.service()
        progress = []
        result = service.run(
            token="20260808-120000-deadbeef",
            columns={"text": 1, "name": 0, "voice": None,
                     "language": None},
            voice="voice-one", engine="audio", model="plus",
            run_id="run-12345678",
            on_progress=lambda done, total, detail: progress.append(
                (done, total, detail)),
        )
        self.assertEqual(result["made"], 2)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["cost"], .002)
        self.assertEqual(result["usage"]["input_text"], 4)
        self.assertEqual(result["usage"]["characters"], 14)
        self.assertEqual(result["cost_basis"], "catalog_characters")
        names = [item["name"] for item in result["results"] if item.get("name")]
        self.assertEqual(names, ["same.mp3", "same-row-4.mp3"])
        self.assertEqual(result["failures"][0]["row"], 3)
        self.assertEqual(len(workspace.written), 2)
        self.assertEqual(workspace.zipped[0][1], names)
        self.assertEqual(progress[0][:2], (0, 3))
        self.assertEqual(progress[-1][:2], (3, 3))
        self.assertEqual(len(provider.calls), 3)

    def test_incomplete_provider_row_is_not_written_to_the_batch(self):
        service, workspace, provider = self.service(rows=[
            ["one", "hello", "", ""],
        ])
        original = provider.synthesize

        def incomplete(prepared, on_progress=None):
            result = original(prepared, on_progress)
            result.failures.append({
                "index": 1, "text": "hello", "error": "provider stopped",
            })
            return result

        provider.synthesize = incomplete
        result = service.run(
            token="20260808-120000-deadbeef",
            columns={"text": 1, "name": 0, "voice": None,
                     "language": None},
            voice="voice-one", engine="audio", model="plus",
            run_id="run-incomplete",
        )
        self.assertEqual(result["made"], 0)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(workspace.written, {})
        self.assertIn("No incomplete row", result["failures"][0]["error"])

    def test_voice_and_budget_guards_run_before_paid_calls_or_output(self):
        service, workspace, provider = self.service(
            rows=[["one", "Hello", "unknown", ""]])
        with self.assertRaisesRegex(ValueError, "Unknown voice IDs"):
            service.run(
                token="20260808-120000-deadbeef",
                columns={"text": 1, "name": 0, "voice": 2,
                         "language": None},
                voice="voice-one")
        self.assertEqual(provider.calls, [])
        self.assertEqual(workspace.created, [])

        service, workspace, provider = self.service(
            preferences={"warn_above": .0001, "daily_cap": 0})
        warning = service.run(
            token="20260808-120000-deadbeef",
            columns={"text": 1, "name": 0, "voice": None,
                     "language": None}, voice="voice-one")
        self.assertTrue(warning["needs_confirmation"])
        self.assertEqual(provider.calls, [])
        self.assertEqual(workspace.created, [])

        service, workspace, provider = self.service(
            spent=1, preferences={"warn_above": 0, "daily_cap": 1.0001})
        with self.assertRaisesRegex(PermissionError, "Daily cap reached"):
            service.run(
                token="20260808-120000-deadbeef",
                columns={"text": 1, "name": 0, "voice": None,
                         "language": None}, voice="voice-one")
        self.assertEqual(provider.calls, [])
        self.assertEqual(workspace.created, [])

    def test_job_handler_uses_public_id_and_durable_progress(self):
        service, _, _ = self.service(rows=[["one", "Hello", "", ""]])
        handler = BatchJobHandler(service)
        progress = Progress()
        job = Job(17, uuid4(), "batch", JobStatus.RUNNING, {
            "token": "20260808-120000-deadbeef",
            "columns": {"text": 1, "name": 0, "voice": None,
                        "language": None},
            "voice": "voice-one", "engine": "audio", "model": "plus",
        })
        result = handler(job, progress)
        self.assertEqual(result["made"], 1)
        self.assertIn(str(job.public_id).replace("-", "")[:12], result["folder"])
        self.assertEqual(progress.events[-1][1:3], (1, 1))

    def test_http_contract_rejects_traversal_and_invalid_controls(self):
        valid = BatchJobCreate(
            token="20260808-120000-deadbeef",
            columns={"text": 1, "name": 0}, voice="voice-one",
            engine="audio", model="plus")
        self.assertEqual(valid.columns.text, 1)
        for values in (
            {"token": "../secret"},
            {"columns": {"text": -1}},
            {"rate": 4},
            {"engine": "mystery"},
        ):
            payload = {
                "token": "20260808-120000-deadbeef",
                "columns": {"text": 1}, "voice": "voice-one",
                "engine": "audio", "model": "plus", **values,
            }
            with self.assertRaises(ValueError):
                BatchJobCreate(**payload)

    def test_filesystem_workspace_confines_sheet_and_output_paths(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = FilesystemBatchWorkspace(
                root / "sheets", root / "output")
            token = workspace.save_sheet(sheet())
            self.assertEqual(workspace.load_sheet(token)["headers"][1], "text")
            with self.assertRaises(ValueError):
                workspace.load_sheet("../escape")
            folder = workspace.create_output(token, "run-id")
            workspace.write_audio(folder, "one.mp3", b"audio")
            self.assertTrue((root / "output" / folder / "one.mp3").is_file())
            with self.assertRaises(ValueError):
                workspace.write_audio(folder, "../escape.mp3", b"audio")

    def test_provider_preflight_routes_arabic_and_rejects_omni_tags(self):
        provider = AlibabaSpeechProvider()
        bindings = voice_registry.system_bindings()
        prepared = provider.prepare(
            text="مرحبا", values={"text": "مرحبا", "voice": "longanlingxin",
                                  "engine": "audio", "model": "plus",
                                  "format": "mp3"},
            bindings=bindings, pronunciations=[], preferences={})
        self.assertEqual(prepared.engine, "omni")
        self.assertEqual(prepared.voice, "Tina")
        with self.assertRaisesRegex(ValueError, "does not support inline"):
            provider.prepare(
                text="[laughing] Hello",
                values={"text": "[laughing] Hello", "voice": "Tina",
                        "engine": "omni", "model": "plus", "format": "mp3"},
                bindings=bindings, pronunciations=[], preferences={})

    def test_official_qwen_audio_prices_are_regional(self):
        self.assertEqual(qwen_audio_tts_cost(
            10_000, "intl", "plus").catalog_cost, .2)
        self.assertEqual(qwen_audio_tts_cost(
            10_000, "beijing", "flash").catalog_cost, .137521)

    def test_postgres_repository_reads_voice_policy_and_spend(self):
        try:
            with psycopg.connect(settings.database_url):
                pass
        except psycopg.OperationalError as error:
            self.skipTest(str(error))
        repository = SpeechRepository()
        bindings = repository.voice_bindings()
        self.assertTrue(any(item["source"] == "system" for item in bindings))
        self.assertIsInstance(repository.pronunciations(), list)
        self.assertGreaterEqual(repository.today_spend(), 0)

    def test_legacy_batch_execution_and_media_routes_are_removed(self):
        legacy = ROOT / "audio_studio/infrastructure/legacy_jobs.py"
        worker = (ROOT / "audio_studio/worker.py").read_text()
        self.assertFalse((ROOT / "server.py").exists())
        self.assertFalse(legacy.exists())
        self.assertIn('service.register("batch", BatchJobHandler', worker)


if __name__ == "__main__":
    unittest.main()
