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
from audio_studio.application.provider_operations import ProviderOperationService
from audio_studio.domain.speech import PreparedSpeech, SynthesizedSpeech
from audio_studio.domain.jobs import Job, JobStatus
from audio_studio.config import settings
from audio_studio.http.routers.jobs import BatchJobCreate
from audio_studio.infrastructure.alibaba.speech_generation import AlibabaSpeechProvider
from audio_studio.infrastructure.batch_workspace import FilesystemBatchWorkspace
from audio_studio.infrastructure.spreadsheets import read as read_spreadsheet
from audio_studio.infrastructure.postgres.speech import SpeechRepository
from audio_studio.infrastructure.postgres.provider_catalogue import (
    ProviderCatalogueRepository,
)
from audio_studio.domain import voice_registry
from audio_studio.domain.provider_pricing import qwen_audio_tts_cost


ROOT = Path(__file__).parent
BINDING_ID = "11111111-1111-4111-8111-111111111111"


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


class FailingAudioWorkspace(FakeWorkspace):
    def write_audio(self, folder, filename, audio):
        raise OSError("output storage unavailable")


class FailingOutputWorkspace(FakeWorkspace):
    def create_output(self, token, run_id):
        raise OSError("cannot create output folder")


class FakeOperationsRepository:
    def __init__(self):
        self.events = []

    def reserve_budget(self, job_id, operation, amount, daily_cap):
        self.events.append(("reserve", job_id, operation, amount, daily_cap))
        return "batch-reservation"

    def begin_attempt(self, job_id, operation, route, payload, reservation_id):
        self.events.append(("begin", job_id, operation, route, payload,
                            reservation_id))
        return f"attempt-{payload['row']}"

    def mark_sent(self, attempt_id):
        self.events.append(("sent", attempt_id))

    def finish_attempt(self, attempt_id, status, **values):
        self.events.append(("finish", attempt_id, status, values))

    def record_artifact(self, attempt_id, artifact):
        self.events.append(("artifact", attempt_id, artifact))

    def reconcile_budget(self, job_id, actual_cost, status):
        self.events.append(("reconcile", job_id, actual_cost, status))


class FakeRepository:
    def __init__(self, spent=0):
        self.spent = spent

    def voice_bindings(self):
        return [{
            "binding_id": BINDING_ID,
            "provider_voice_id": "voice-one", "voice_id": "voice-one",
            "identity_id": "identity-one", "engine": "audio",
            "tier": "plus", "model_id": "qwen-audio-3.0-tts-plus",
            "provider": "alibaba", "region": "intl",
            "reference_id": "22222222-2222-4222-8222-222222222222",
            "capabilities": [{"id": "expressive_tags", "name": "Expressive"}],
            "source": "custom", "status": "active",
        }]

    def catalogue_voices(self):
        return []

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
            engine="audio", tier="plus",
            model_id="qwen-audio-3.0-tts-plus",
            output_format=values["format"], extension="mp3",
            language=None, instruction=None, speech_mode="exact",
            rate=1, pitch=1, volume=50, seed=0, request_count=1,
            voice_route={}, binding_id=values.get("binding_id"),
            provider="alibaba", provider_region="intl",
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
                f"name,text,voice\na,Hello,{BINDING_ID}\nb,World,typo\n".encode(),
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
            binding_id=BINDING_ID,
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
            binding_id=BINDING_ID,
            run_id="run-incomplete",
        )
        self.assertEqual(result["made"], 0)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(workspace.written, {})
        self.assertIn("No incomplete row", result["failures"][0]["error"])

    def test_batch_provider_success_is_recorded_before_file_write(self):
        workspace = FailingAudioWorkspace(sheet([["one", "hello", "", ""]]))
        provider = FakeProvider()
        operations = FakeOperationsRepository()
        service = BatchGenerationService(
            workspace, FakeRepository(), provider,
            lambda: {"warn_above": 0, "daily_cap": 0},
            ProviderOperationService(operations))
        result = service.run(
            token="20260808-120000-deadbeef",
            columns={"text": 1, "name": 0, "voice": None,
                     "language": None},
            binding_id=BINDING_ID, run_id="storage-failure", job_id=84)
        self.assertEqual((result["made"], result["failed"]), (0, 1))
        self.assertIn("provider completed", result["failures"][0]["error"])
        finishes = [event for event in operations.events if event[0] == "finish"]
        self.assertEqual([event[2] for event in finishes], ["succeeded"])
        self.assertEqual(finishes[0][3]["receipt"]["row"], 2)

    def test_output_folder_failure_precedes_budget_and_provider_calls(self):
        workspace = FailingOutputWorkspace(sheet([["one", "hello", "", ""]]))
        provider = FakeProvider()
        operations = FakeOperationsRepository()
        service = BatchGenerationService(
            workspace, FakeRepository(), provider,
            lambda: {"warn_above": 0, "daily_cap": 0},
            ProviderOperationService(operations))
        with self.assertRaisesRegex(OSError, "cannot create output folder"):
            service.run(
                token="20260808-120000-deadbeef",
                columns={"text": 1, "name": 0, "voice": None,
                         "language": None},
                binding_id=BINDING_ID, run_id="folder-failure", job_id=85)
        self.assertEqual(provider.calls, [])
        self.assertEqual(operations.events, [])

    def test_voice_and_budget_guards_run_before_paid_calls_or_output(self):
        service, workspace, provider = self.service(
            rows=[["one", "Hello", "unknown", ""]])
        with self.assertRaisesRegex(ValueError, "Unknown voice IDs"):
            service.run(
                token="20260808-120000-deadbeef",
                columns={"text": 1, "name": 0, "voice": 2,
                         "language": None},
                binding_id=BINDING_ID)
        self.assertEqual(provider.calls, [])
        self.assertEqual(workspace.created, [])

        service, workspace, provider = self.service(
            preferences={"warn_above": .0001, "daily_cap": 0})
        warning = service.run(
            token="20260808-120000-deadbeef",
            columns={"text": 1, "name": 0, "voice": None,
                     "language": None},
            binding_id=BINDING_ID)
        self.assertTrue(warning["needs_confirmation"])
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
            "binding_id": BINDING_ID,
        })
        result = handler(job, progress)
        self.assertEqual(result["made"], 1)
        self.assertIn(str(job.public_id).replace("-", "")[:12], result["folder"])
        self.assertEqual(progress.events[-1][1:3], (1, 1))

    def test_http_contract_rejects_traversal_and_invalid_controls(self):
        valid = BatchJobCreate(
            token="20260808-120000-deadbeef",
            columns={"text": 1, "name": 0},
            binding_id=BINDING_ID)
        self.assertEqual(valid.columns.text, 1)
        for values in (
            {"token": "../secret"},
            {"columns": {"text": -1}},
            {"rate": 4},
            {"engine": "mystery"},
        ):
            payload = {
                "token": "20260808-120000-deadbeef",
                "columns": {"text": 1},
                "binding_id": BINDING_ID, **values,
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

    def test_auto_language_preserves_route_and_omni_rejects_tags(self):
        provider = AlibabaSpeechProvider()
        bindings = []
        catalogue = voice_registry.system_bindings()
        audio_route = next(item for item in catalogue
                           if item["provider_voice_id"] == "longanlingxin"
                           and item["tier"] == "plus")
        prepared = provider.prepare(
            text="مرحبا", values={"text": "مرحبا", "voice": "longanlingxin",
                                  "catalogue_voice_id": audio_route[
                                      "catalogue_voice_id"],
                                  "format": "mp3"},
            bindings=bindings, catalogue=catalogue,
            pronunciations=[], preferences={})
        self.assertEqual(prepared.engine, "audio")
        self.assertEqual(prepared.voice, "longanlingxin")
        self.assertIsNone(prepared.language)
        omni_route = next(item for item in catalogue
                          if item["provider_voice_id"] == "Tina"
                          and item["tier"] == "plus")
        with self.assertRaisesRegex(ValueError, "does not support inline"):
            provider.prepare(
                text="[laughing] Hello",
                values={"text": "[laughing] Hello", "voice": "Tina",
                        "catalogue_voice_id": omni_route[
                            "catalogue_voice_id"], "format": "mp3"},
                bindings=bindings, catalogue=catalogue,
                pronunciations=[], preferences={})

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
        # Runtime bootstrap owns this versioned snapshot. Arrange that same
        # explicit boundary so a clean CI database and a populated developer
        # database exercise the identical repository state.
        ProviderCatalogueRepository().refresh_documented_snapshot()
        repository = SpeechRepository()
        bindings = repository.voice_bindings()
        self.assertTrue(all(item["source"] == "custom" for item in bindings))
        self.assertTrue(any(item["source"] == "system"
                            for item in repository.catalogue_voices()))
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
