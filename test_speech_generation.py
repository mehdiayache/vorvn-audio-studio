"""Native Speech slice tests; Alibaba execution is always faked."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

import psycopg

from audio_studio.application.speech import (
    SpeechGenerationService,
    SpeechJobHandler,
)
from audio_studio.config import settings
from audio_studio.domain.jobs import Job, JobStatus
from audio_studio.domain.speech import PreparedSpeech, StoredAudio, SynthesizedSpeech
from audio_studio.http.routers.jobs import SpeechJobCreate
from audio_studio.infrastructure.audio_workspace import AudioWorkspace
from audio_studio.infrastructure.postgres.speech import SpeechRepository


ROOT = Path(__file__).parent


class FakeRepository:
    def __init__(self, *, spent=0, part=None, production=True,
                 production_settings=None):
        self.spent = spent
        self.current_part = part
        self.has_production = production
        self.production_settings = production_settings or {}
        self.created = []
        self.replaced = []

    def voice_bindings(self):
        return [{"provider_voice_id": "voice-one", "voice_id": "voice-one",
                 "identity_id": "identity-one", "engine": "audio",
                 "tier": "plus", "model_id": "qwen-audio-3.0-tts-plus",
                 "source": "custom", "status": "active"}]

    def pronunciations(self):
        return []

    def today_spend(self):
        return self.spent

    def production(self, production_id):
        return ({"id": production_id, "legacy_container_id": 88,
                 "name": "Fixture", "settings": self.production_settings}
                if self.has_production else None)

    def part(self, part_id, production_id):
        if not self.current_part:
            return None
        return {**self.current_part, "id": part_id,
                "production_id": production_id}

    def create_part(self, production_id, insert_at, values):
        self.created.append((production_id, insert_at, values))
        return 701

    def replace_part(self, part_id, production_id, expected_created_at,
                     values, *, operation):
        self.replaced.append((part_id, production_id, expected_created_at,
                              values, operation))
        return {"takes": 3 if operation == "regenerate" else 0,
                "subtitles_stale": 2 if operation == "regenerate" else 0}


class FakeProvider:
    def __init__(self, *, configured=True, failures=None, fidelity=None):
        self.configured = configured
        self.failures = failures or []
        self.fidelity = fidelity or {}
        self.prepared = []
        self.calls = []

    def is_configured(self):
        return self.configured

    def prepare(self, *, text, values, **_):
        prepared = PreparedSpeech(
            original_text=text, spoken_text=text, voice=values["voice"],
            voice_identity_id=values.get("voice_identity_id"),
            engine=values["engine"], tier=values["model"],
            model_id=f"model-{values['engine']}-{values['model']}",
            output_format=values["format"], extension="mp3",
            language=values.get("language"),
            instruction=values.get("instruction") or None,
            speech_mode=values["speech_mode"], rate=values["rate"],
            pitch=values["pitch"], volume=values["volume"],
            seed=values["seed"], request_count=2, estimated_cost=.002,
            voice_route={"provider_voice_id": values["voice"]}, context=None,
        )
        self.prepared.append(prepared)
        return prepared

    def synthesize(self, prepared, on_progress=None):
        self.calls.append(prepared)
        if on_progress:
            on_progress(1, 2, "First chunk")
            on_progress(2, 2, "Second chunk")
        return SynthesizedSpeech(
            audio=b"generated-audio", cost=.0015,
            cost_basis="catalog_characters",
            usage={"generated_characters": len(prepared.spoken_text)},
            failures=self.failures, returned_text="fixture transcript",
            fidelity=self.fidelity, provider_region="intl",
            provider_endpoint="wss://provider.test",
            price_version="fixture-price",
        )


class FakeWorkspace:
    def __init__(self):
        self.saved = []

    def save(self, audio, extension):
        self.saved.append((audio, extension))
        return StoredAudio("generated.mp3", "/safe/generated.mp3",
                           len(audio), 4_000)


class Progress:
    def __init__(self):
        self.events = []

    def progress(self, *values):
        self.events.append(values)


def payload(**changes):
    return {
        "operation": "create", "text": "Hello world", "voice": "voice-one",
        "voice_identity_id": "identity-one", "engine": "audio",
        "model": "plus", "format": "mp3", "language": "English",
        "instruction": "", "speech_mode": "exact", "rate": 1,
        "pitch": 1, "volume": 50, "seed": 0, "confirmed": False,
        **changes,
    }


def existing(kind="audio"):
    return {
        "created_at": "revision-one", "kind": kind, "text": "Old words",
        "text_raw": "Old words", "text_shaped": None, "text_tagged": None,
        "text_state": "raw", "voice": "voice-one",
        "voice_identity_id": "identity-one", "engine": "audio",
        "model": "plus", "format": "mp3", "language": "English",
        "instruction": "", "speech_mode": "exact", "rate": 1,
        "pitch": 1, "volume": 50, "seed": 0,
    }


class SpeechGenerationTests(unittest.TestCase):
    def test_new_speech_inherits_missing_series_defaults_from_production(self):
        repository = FakeRepository(production_settings={
            "language": "Arabic", "engine": "omni",
            "model": "flash", "speech_mode": "directed",
        })
        service, _, provider, _ = self.service(repository=repository)
        values = payload(production_id=12)
        for key in ("language", "engine", "model", "speech_mode"):
            values.pop(key)
        service.run(values)
        prepared = provider.prepared[0]
        self.assertEqual(
            (prepared.language, prepared.engine, prepared.tier,
             prepared.speech_mode),
            ("Arabic", "omni", "flash", "directed"),
        )

    def service(self, repository=None, provider=None, preferences=None):
        repository = repository or FakeRepository()
        provider = provider or FakeProvider()
        workspace = FakeWorkspace()
        service = SpeechGenerationService(
            repository, provider, workspace,
            lambda: preferences or {"warn_above": 0, "daily_cap": 0,
                                     "fix_dates_phones": True,
                                     "day_first": True},
        )
        return service, repository, provider, workspace

    def test_create_validates_destination_then_persists_the_paid_audio(self):
        service, repository, provider, workspace = self.service()
        result = service.run(payload(production_id=12, insert_at=2))
        self.assertEqual(result["id"], 701)
        self.assertEqual(result["url"], "/audio/generated.mp3")
        self.assertEqual(result["model"], "model-audio-plus")
        self.assertEqual(result["cost_basis"], "catalog_characters")
        self.assertEqual(repository.created[0][:2], (12, 2))
        saved = repository.created[0][2]
        self.assertEqual((saved["text"], saved["filename"], saved["kind"]),
                         ("Hello world", "generated.mp3", "audio"))
        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(workspace.saved, [(b"generated-audio", "mp3")])

    def test_standalone_speech_has_no_fake_production(self):
        service, repository, _, _ = self.service()
        result = service.run(payload())
        self.assertEqual(result["id"], 701)
        self.assertEqual(repository.created[0][:2], (None, None))

    def test_regenerate_and_render_draft_have_distinct_persistence_rules(self):
        repository = FakeRepository(part=existing("audio"))
        service, _, _, _ = self.service(repository=repository)
        result = service.run(payload(
            operation="regenerate", production_id=12, part_id=44,
            text="A new performance"))
        self.assertEqual(result["id"], 44)
        self.assertEqual((result["takes"], result["subtitles_stale"]), (3, 2))
        self.assertEqual(repository.replaced[0][4], "regenerate")

        repository = FakeRepository(part=existing("draft"))
        service, _, _, _ = self.service(repository=repository)
        result = service.run(payload(
            operation="render_draft", production_id=12, part_id=45,
            text="First recording"))
        self.assertEqual(result["id"], 45)
        self.assertEqual(repository.replaced[0][4], "render_draft")

    def test_explicit_system_voice_clears_an_inherited_custom_identity(self):
        repository = FakeRepository(part=existing("audio"))
        service, _, provider, _ = self.service(repository=repository)
        service.run(payload(
            operation="regenerate", production_id=12, part_id=44,
            voice="Tina", voice_identity_id=None))
        self.assertIsNone(provider.prepared[0].voice_identity_id)
        self.assertIsNone(repository.replaced[0][3]["voice_identity_id"])

    def test_preflight_and_budget_guards_never_call_or_write_provider_audio(self):
        repository = FakeRepository(production=False)
        service, _, provider, workspace = self.service(repository=repository)
        with self.assertRaisesRegex(LookupError, "Production"):
            service.run(payload(production_id=99))
        self.assertEqual((provider.calls, workspace.saved), ([], []))

        repository = FakeRepository(spent=1)
        service, _, provider, workspace = self.service(
            repository=repository,
            preferences={"warn_above": 0, "daily_cap": 1.001})
        with self.assertRaisesRegex(PermissionError, "Daily cap"):
            service.run(payload())
        self.assertEqual((provider.calls, workspace.saved), ([], []))

        service, _, provider, workspace = self.service(
            preferences={"warn_above": .001, "daily_cap": 0})
        result = service.run(payload())
        self.assertTrue(result["needs_confirmation"])
        self.assertEqual((provider.calls, workspace.saved), ([], []))

    def test_missing_key_and_wrong_part_kind_fail_before_synthesis(self):
        service, _, provider, workspace = self.service(
            provider=FakeProvider(configured=False))
        with self.assertRaisesRegex(RuntimeError, "API key"):
            service.run(payload())
        self.assertEqual((provider.calls, workspace.saved), ([], []))

        repository = FakeRepository(part=existing("silence"))
        service, _, provider, workspace = self.service(repository=repository)
        with self.assertRaisesRegex(ValueError, "recorded speech"):
            service.run(payload(operation="regenerate", production_id=12,
                                part_id=4))
        self.assertEqual((provider.calls, workspace.saved), ([], []))

    def test_failures_and_fidelity_survive_the_single_result_contract(self):
        provider = FakeProvider(
            failures=[{"index": 1, "text": "world", "error": "timeout"}],
            fidelity={"status": "warning", "message": "Review this Take."})
        service, _, _, _ = self.service(provider=provider)
        result = service.run(payload())
        self.assertEqual(result["failures"][0]["index"], 1)
        self.assertEqual(result["warning"], "Review this Take.")
        self.assertEqual(result["fidelity"]["status"], "warning")

    def test_job_handler_reports_durable_chunk_progress(self):
        service, _, _, _ = self.service()
        handler = SpeechJobHandler(service)
        progress = Progress()
        job = Job(9, uuid4(), "speech", JobStatus.RUNNING, payload())
        result = handler(job, progress)
        self.assertEqual(result["id"], 701)
        self.assertEqual(progress.events[0][1:3], (0, 2))
        self.assertEqual(progress.events[-1][1:3], (2, 2))

    def test_http_contract_is_canonical_strict_and_backwards_readable(self):
        model = SpeechJobCreate(
            text="Hello", voice="Tina", engine="omni", model="plus",
            project_id=7)
        self.assertEqual(model.production_id, 7)
        self.assertEqual(model.model_dump()["production_id"], 7)
        cleared = SpeechJobCreate(
            text="Hello", voice="Tina", voice_identity_id=None,
            engine="omni", model="plus")
        self.assertIn("voice_identity_id", cleared.model_dump(exclude_unset=True))
        SpeechJobCreate(
            text="Hello", voice="Tina", engine="omni", model="plus",
            production_id=7, operation="regenerate", part_id=8)
        for changes in (
            {"engine": "mystery"}, {"rate": 3}, {"volume": 101},
            {"operation": "regenerate", "part_id": 8},
            {"insert_at": 2},
        ):
            values = {"text": "Hello", "voice": "Tina", "engine": "omni",
                      "model": "plus", **changes}
            with self.assertRaises(ValueError):
                SpeechJobCreate(**values)

    def test_audio_workspace_uses_opaque_contained_names(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            saved = AudioWorkspace(root).save(b"not-real-audio", "mp3")
            target = Path(saved.path)
            self.assertEqual(target.parent, root.resolve())
            self.assertEqual(target.read_bytes(), b"not-real-audio")
            self.assertEqual(target.suffix, ".mp3")
            with self.assertRaises(ValueError):
                AudioWorkspace(root).save(b"audio", "../escape")

    def test_postgres_repository_create_and_replace_are_atomic(self):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            self.skipTest(str(error))
        repository = SpeechRepository()
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id FROM productions WHERE archived_at IS NULL
                 ORDER BY id LIMIT 1
            """)
            owner = cursor.fetchone()
        connection.close()
        if not owner:
            self.skipTest("No Production fixture is available")
        production_id = int(owner[0])
        marker = f"speech-test-{uuid4()}"
        row = {
            "text": marker, "text_raw": marker, "text_shaped": None,
            "text_tagged": None, "text_state": "raw",
            "voice": "Tina", "voice_identity_id": None, "engine": "omni",
            "model": "plus", "format": "mp3", "language": "English",
            "instruction": None, "speech_mode": "exact", "rate": 1,
            "pitch": 1, "volume": 50, "seed": 0,
            "filename": "fixture.mp3", "path": "/fixture.mp3",
            "size_bytes": 10, "duration_ms": 1000, "chars": len(marker),
            "requests": 1, "cost": .001, "kind": "audio", "title": None,
            "usage": {"output_audio": 1}, "cost_basis": "actual_tokens",
            "provider_text": marker, "fidelity": {"status": "pass"},
            "failures": [],
        }
        part_id = None
        try:
            part_id = repository.create_part(production_id, None, row)
            current = repository.part(part_id, production_id)
            self.assertEqual(current["text"], marker)
            changed = {**row, "text": marker + " changed",
                       "text_raw": marker + " changed"}
            result = repository.replace_part(
                part_id, production_id, current["created_at"], changed,
                operation="regenerate")
            self.assertEqual(result["takes"], 1)
            with psycopg.connect(settings.database_url) as verify:
                with verify.cursor() as cursor:
                    cursor.execute(
                        "SELECT text FROM generations WHERE version_of = %s",
                        (part_id,))
                    self.assertEqual(cursor.fetchone()[0], marker)
        finally:
            if part_id is not None:
                with psycopg.connect(settings.database_url) as cleanup:
                    with cleanup.cursor() as cursor:
                        cursor.execute("DELETE FROM generations WHERE id = %s",
                                       (part_id,))
                    cleanup.commit()

    def test_worker_has_no_loopback_speech_adapter(self):
        worker = (ROOT / "audio_studio/worker.py").read_text()
        self.assertFalse((ROOT / "server.py").exists())
        self.assertIn('service.register("speech", SpeechJobHandler', worker)
        self.assertNotIn("LegacyProviderJobHandlers", worker)
        self.assertFalse(
            (ROOT / "audio_studio/infrastructure/legacy_jobs.py").exists())


if __name__ == "__main__":
    unittest.main()
