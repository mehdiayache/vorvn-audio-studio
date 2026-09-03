"""Native Speech slice tests; Alibaba execution is always faked."""

from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib
import unittest
from unittest.mock import patch
from uuid import uuid4

from origins.application.speech import (
    SpeechGenerationService,
    SpeechJobHandler,
)
from origins.application.provider_operations import ProviderOperationService
from origins.domain.jobs import Job, JobFailed, JobStatus
from origins.domain.speech import PreparedSpeech, SpeechSynthesisError, StoredAudio, SynthesizedSpeech
from origins.http.routers.jobs import SpeechJobCreate, create_speech_job
from origins.infrastructure.audio_workspace import AudioWorkspace
from origins.infrastructure import audio_codec
from origins.providers.alibaba.speech_generation import AlibabaSpeechProvider
from origins.providers.alibaba.qwen_tts import ChunkFailure


ROOT = Path(__file__).resolve().parents[1]


class FakeRepository:
    def __init__(self, *, spent=0, part=None, replaced_filename=""):
        self.spent = spent
        self.current_part = part
        self.replaced_filename = replaced_filename
        self.created = []
        self.replaced = []
        self.active_file_id = None

    def voice_bindings(self):
        return [{"binding_id": "binding-one", "provider_voice_id": "voice-one", "voice_id": "voice-one",
                 "identity_id": "identity-one", "engine": "audio",
                 "adapter_key": "audio",
                 "tier": "plus", "model_id": "qwen-audio-3.0-tts-plus",
                 "source": "custom", "status": "active", "provider": "alibaba",
                 "region": "intl", "reference_id": "reference-one",
                 "capabilities": [{"id": "expressive_tags", "name": "Expressive + tags"}]}]

    def catalogue_voices(self):
        return []

    def pronunciations(self):
        return []

    def today_spend(self):
        return self.spent

    def part(self, part_id, production_id):
        if not self.current_part:
            return None
        return {**self.current_part, "id": part_id,
                "production_id": production_id}

    def attach_clip(self, part_id, production_id, expected_revision,
                    values):
        self.replaced.append(
            (part_id, production_id, expected_revision, values))
        self.active_file_id = values.get("file_id")
        return {"attached": 1, "clip_id": 901, "subtitles_stale": 0,
                "replaced_filename": self.replaced_filename}


class FakeProvider:
    def __init__(self, *, configured=True, failures=None, diagnostics=None):
        self.configured = configured
        self.failures = failures or []
        self.diagnostics = diagnostics or []
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
            failures=self.failures, provider_region="intl",
            provider_endpoint="wss://provider.test",
            price_version="fixture-price",
            diagnostics=self.diagnostics,
        )


class RoutedFakeProvider(AlibabaSpeechProvider):
    """Use the real Alibaba preparation route without making a provider call."""

    def __init__(self):
        self.prepared = []

    def is_configured(self):
        return True

    def synthesize(self, prepared, on_progress=None):
        self.prepared.append(prepared)
        return SynthesizedSpeech(
            audio=b"generated-audio", cost=.001,
            cost_basis="catalog_characters", usage={}, failures=[],
            provider_region="intl",
            provider_endpoint="provider.test", price_version="fixture",
        )


class FakeWorkspace:
    def __init__(self):
        self.saved = []
        self.discarded = []

    def save(self, audio, extension):
        self.saved.append((audio, extension))
        return StoredAudio("generated.mp3", "/safe/generated.mp3",
                           len(audio), 4_000)

    def discard(self, filename):
        self.discarded.append(filename)


class SequencedWorkspace(FakeWorkspace):
    def save(self, audio, extension):
        self.saved.append((audio, extension))
        number = len(self.saved)
        return StoredAudio(
            f"generated-{number}.mp3", f"/safe/generated-{number}.mp3",
            len(audio), 4_000)


class FakeCreationFiles:
    def __init__(self):
        self.registrations = []

    def register(self, job, **values):
        self.registrations.append((job, values))
        number = len(self.registrations)
        return {"id": 40 + number, "version_id": 140 + number}


class FailingWorkspace:
    def save(self, _audio, _extension):
        raise OSError("disk unavailable")

    def discard(self, _filename):
        pass


class FakeOperationsRepository:
    def __init__(self):
        self.events = []

    def reserve_budget(self, job_id, operation, amount, daily_cap):
        self.events.append(("reserve", job_id, operation, amount, daily_cap))
        return "reservation-one"

    def begin_attempt(self, job_id, operation, route, payload, reservation_id,
                      estimated_cost=None):
        self.events.append(("begin", job_id, operation, route, payload,
                            reservation_id))
        return "attempt-one"

    def mark_sent(self, attempt_id):
        self.events.append(("sent", attempt_id))

    def finish_attempt(self, attempt_id, status, **values):
        self.events.append(("finish", attempt_id, status, values))

    def record_artifact(self, attempt_id, artifact):
        self.events.append(("artifact", attempt_id, artifact))

    def reconcile_budget(self, job_id, actual_cost, status):
        self.events.append(("reconcile", job_id, actual_cost, status))


class Progress:
    def __init__(self):
        self.events = []

    def progress(self, *values):
        self.events.append(values)


def payload(**changes):
    return {
        "operation": "create", "text": "Hello world", "voice": "voice-one",
        "binding_id": "binding-one", "catalogue_voice_id": None,
        "voice_identity_id": "identity-one", "engine": "audio",
        "model": "plus", "format": "mp3", "language": "English",
        "instruction": "", "speech_mode": "exact", "rate": 1,
        "pitch": 1, "volume": 50, "seed": 0, "confirmed": False,
        **changes,
    }


def existing(kind="audio"):
    return {
        "created_at": "revision-one", "revision": 1, "kind": kind, "text": "Old words",
        "text_raw": "Old words", "text_shaped": None, "text_tagged": None,
        "text_state": "raw", "voice": "voice-one",
        "voice_identity_id": "identity-one", "engine": "audio",
        "model": "plus", "format": "mp3", "language": "English",
        "instruction": "", "speech_mode": "exact", "rate": 1,
        "pitch": 1, "volume": 50, "seed": 0,
    }


class SpeechGenerationTests(unittest.TestCase):
    def test_supported_instruction_is_never_silently_truncated(self):
        provider = AlibabaSpeechProvider()
        direction = "Deliver this as an intimate story with deliberate breath and emotional restraint. " * 3
        prepared = provider.prepare(
            text="The room became quiet.",
            values=payload(instruction=direction),
            bindings=FakeRepository().voice_bindings(), catalogue=[],
            pronunciations=[], preferences={},
        )
        self.assertEqual(prepared.instruction, direction.strip())

    def test_empty_qwen_tts_result_keeps_the_provider_failure_evidence(self):
        prepared = PreparedSpeech(
            original_text="مرحبا", spoken_text="مرحبا",
            voice="qwen-tts-vc-fixture", voice_identity_id="identity-one",
            engine="qwen_tts", tier="vc",
            model_id="qwen3-tts-vc-2026-01-22", output_format="mp3",
            extension="mp3", language="Arabic", instruction=None,
            speech_mode="exact", rate=1, pitch=1, volume=50, seed=0,
            request_count=1, estimated_cost=.0001,
            voice_route={"provider_voice_id": "qwen-tts-vc-fixture"},
            context=object(),
        )
        failure = ChunkFailure(
            1, "مرحبا",
            "RuntimeError: invalid_parameter: unsupported language_type Arabic")
        with patch(
                "origins.providers.alibaba.speech_generation.synthesize",
                return_value=(b"", [failure], [], {}, [], [])):
            with self.assertRaises(SpeechSynthesisError) as raised:
                AlibabaSpeechProvider().synthesize(prepared)
        self.assertIn("unsupported language_type Arabic", str(raised.exception))
        self.assertEqual(raised.exception.result["failures"][0]["index"], 1)
        self.assertEqual(raised.exception.result["usage"]["generated_characters"], 0)

    def test_complete_service_path_never_language_gates_a_cloned_binding(self):
        repository = FakeRepository()
        repository.voice_bindings = lambda: [{
            "binding_id": "binding-one",
            "provider_voice_id": "custom-audio", "voice_id": "custom-audio",
            "identity_id": "identity-one", "engine": "audio",
            "adapter_key": "audio",
            "tier": "flash", "model_id": "qwen-audio-3.0-tts-flash",
            "source": "custom", "status": "active",
            "languages": ["English"], "provider": "alibaba", "region": "intl",
            "reference_id": "reference-one",
            "capabilities": [{"id": "expressive_tags", "name": "Expressive + tags"}],
        }]
        provider = RoutedFakeProvider()
        service, _, _, _ = self.service(
            repository=repository, provider=provider)
        result = service.run(payload(
            text="[whispers] مرحبا بالعالم", voice="custom-audio",
            engine="audio", model="flash", language="Arabic"))
        self.assertIsNone(result["id"])
        self.assertEqual(provider.prepared[0].voice, "custom-audio")
        self.assertEqual(provider.prepared[0].language, "Arabic")
        self.assertEqual(provider.prepared[0].engine, "audio")

    def test_auto_language_does_not_infer_or_change_a_cloned_route(self):
        repository = FakeRepository()
        provider = RoutedFakeProvider()
        service, _, _, _ = self.service(
            repository=repository, provider=provider)
        result = service.run(payload(
            text="مرحبا بالعالم", language="Auto"))
        self.assertIsNone(result["id"])
        self.assertEqual(provider.prepared[0].voice, "voice-one")
        self.assertIsNone(provider.prepared[0].language)
        self.assertEqual(provider.prepared[0].engine, "audio")

    def test_production_speech_requires_the_atomic_part_command(self):
        service, _, provider, workspace = self.service()
        with self.assertRaisesRegex(ValueError, "target the Part"):
            service.run(payload(production_id=12))
        self.assertEqual((provider.calls, workspace.saved), ([], []))

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

    def test_standalone_create_persists_paid_audio_without_a_fake_part(self):
        service, repository, provider, workspace = self.service()
        result = service.run(payload())
        self.assertIsNone(result["id"])
        self.assertIsNone(result["part_id"])
        self.assertEqual(result["url"], "/audio/generated.mp3")
        self.assertEqual(result["model"], "model-audio-plus")
        self.assertEqual(result["cost_basis"], "catalog_characters")
        self.assertEqual(repository.created, [])
        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(workspace.saved, [(b"generated-audio", "mp3")])

    def test_record_attaches_the_first_clip_to_a_draft(self):
        repository = FakeRepository(part=existing("draft"))
        service, _, _, _ = self.service(repository=repository)
        result = service.run(payload(
            operation="record", production_id=12, part_id=45,
            text="First recording"))
        self.assertEqual(result["id"], 45)
        self.assertEqual(repository.replaced[0][0], 45)

    def test_record_replacement_preserves_the_previous_workspace_audio(self):
        repository = FakeRepository(
            part={**existing("speech"), "clip_id": 73},
            replaced_filename="previous.mp3",
        )
        service, _, _, workspace = self.service(repository=repository)

        result = service.run(payload(
            operation="record", production_id=12, part_id=45,
            text="Updated recording"))

        self.assertEqual(result["clip_id"], 901)
        self.assertEqual(workspace.discarded, [])

    def test_cosyvoice_word_timing_becomes_one_standard_transcript_payload(self):
        repository = FakeRepository(part=existing("draft"))
        provider = FakeProvider(diagnostics=[{
            "session": 1,
            "status": "accepted",
            "audio_duration_ms": 4000,
            "word_timestamps": [
                {"sentence_index": 0, "text": "Quiet", "begin_time": 100,
                 "end_time": 700},
                {"sentence_index": 0, "text": "now.", "begin_time": 760,
                 "end_time": 1300},
            ],
        }])
        service, _, _, _ = self.service(
            repository=repository, provider=provider)

        service.run(payload(
            operation="record", production_id=12, part_id=45,
            engine="cosyvoice", text="Quiet now.", _job_id=77))

        transcript = repository.replaced[0][3]["_provider_transcript"]
        self.assertEqual(transcript["timing_source"], "provider_word_timestamps")
        self.assertEqual(transcript["cost_basis"], "included_with_speech")
        self.assertEqual(transcript["source_job_id"], 77)
        self.assertEqual(transcript["sentences"][0]["text"], "Quiet now.")
        self.assertIn("00:00:00,100", transcript["srt"])

    def test_record_uses_the_enqueue_revision_and_script_snapshot(self):
        repository = FakeRepository(part={
            **existing("speech"),
            "revision": 4,
            "clip_id": None,
        })
        service, _, _, _ = self.service(repository=repository)
        source_hash = hashlib.sha256(b"Canonical queued script").hexdigest()

        result = service.run(payload(
            operation="record", production_id=12, part_id=44,
            text="Prepared words sent to the provider",
            _source_part_revision=3,
            _source_script_hash=source_hash,
        ))

        self.assertEqual(result["id"], 44)
        self.assertEqual(repository.created, [])
        self.assertEqual(repository.replaced[0][2], 3)
        self.assertEqual(
            repository.replaced[0][3]["_source_script_hash"], source_hash)

    def test_explicit_system_voice_clears_an_inherited_custom_identity(self):
        repository = FakeRepository(part=existing("draft"))
        service, _, provider, _ = self.service(repository=repository)
        service.run(payload(
            operation="record", production_id=12, part_id=44,
            voice="Tina", voice_identity_id=None))
        self.assertIsNone(provider.prepared[0].voice_identity_id)
        self.assertIsNone(repository.replaced[0][3]["voice_identity_id"])

    def test_preflight_and_budget_guards_never_call_or_write_provider_audio(self):
        service, _, provider, workspace = self.service()
        with self.assertRaisesRegex(ValueError, "target the Part"):
            service.run(payload(production_id=99))
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

        repository = FakeRepository(part=existing("audio"))
        service, _, provider, workspace = self.service(repository=repository)
        with self.assertRaisesRegex(ValueError, "cannot contain speech"):
            service.run(payload(operation="record", production_id=12,
                                part_id=4))
        self.assertEqual((provider.calls, workspace.saved), ([], []))

    def test_partial_provider_result_is_never_saved_as_a_clip(self):
        provider = FakeProvider(
            failures=[{"index": 1, "text": "world", "error": "timeout"}])
        service, repository, _, workspace = self.service(provider=provider)
        with self.assertRaisesRegex(JobFailed, "No incomplete recording") as caught:
            service.run(payload())
        self.assertEqual(caught.exception.result["failures"][0]["index"], 1)
        self.assertEqual(workspace.saved, [])
        self.assertEqual(repository.created, [])

    def test_provider_success_is_durable_before_local_audio_persistence(self):
        operations = FakeOperationsRepository()
        repository = FakeRepository()
        service = SpeechGenerationService(
            repository, FakeProvider(), FailingWorkspace(),
            lambda: {"warn_above": 0, "daily_cap": 0},
            ProviderOperationService(operations))
        with self.assertRaises(JobFailed) as caught:
            service.run(payload(_job_id=77))
        self.assertTrue(caught.exception.result["provider_succeeded"])
        self.assertAlmostEqual(caught.exception.result["cost"], .0015)
        statuses = [event[2] for event in operations.events
                    if event[0] == "finish"]
        self.assertEqual(statuses, ["succeeded"])
        receipt = next(event[3]["receipt"] for event in operations.events
                       if event[0] == "finish")
        self.assertEqual(receipt["size_bytes"], len(b"generated-audio"))
        self.assertEqual(repository.created, [])

    def test_job_handler_reports_durable_chunk_progress(self):
        service, _, _, _ = self.service()
        handler = SpeechJobHandler(service, FakeCreationFiles())
        progress = Progress()
        job = Job(
            9, uuid4(), "speech", JobStatus.RUNNING, payload(),
            workspace_id=12, creation_context={"workspace_id": 12},
        )
        result = handler(job, progress)
        self.assertIsNone(result["id"])
        self.assertEqual(result["output_file_ids"], [41])
        self.assertEqual(progress.events[0][1:3], (0, 2))
        self.assertEqual(progress.events[-1][1:3], (2, 2))

    def test_script_speech_commits_one_file_before_attaching_the_same_result(self):
        repository = FakeRepository(part=existing("speech"))
        provider = FakeProvider()
        workspace = SequencedWorkspace()
        service = SpeechGenerationService(
            repository, provider, workspace,
            lambda: {"warn_above": 0, "daily_cap": 0},
        )
        files = FakeCreationFiles()
        handler = SpeechJobHandler(service, files)
        job = Job(
            9, uuid4(), "speech", JobStatus.RUNNING,
            payload(operation="record", production_id=12, part_id=45),
            part_id=45, workspace_id=7, production_id=12,
            creation_context={
                "workspace_id": 7, "production_id": 12,
                "production_type": "audiovisual",
                "selection": {"target": "script_part"},
            },
        )

        result = handler(job, Progress())

        self.assertEqual(result["output_file_ids"], [41])
        self.assertEqual(result["file_id"], 41)
        attached = repository.replaced[0][3]
        self.assertEqual(attached["file_id"], 41)
        self.assertEqual(attached["file_version_id"], 141)
        self.assertEqual(attached["path"], "/safe/generated-1.mp3")
        self.assertEqual(files.registrations[0][1]["stored"].path,
                         attached["path"])
        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(len(workspace.saved), 1)

    def test_regenerating_script_speech_keeps_both_files_and_switches_the_part(self):
        repository = FakeRepository(
            part=existing("speech"), replaced_filename="generated-1.mp3")
        provider = FakeProvider()
        workspace = SequencedWorkspace()
        service = SpeechGenerationService(
            repository, provider, workspace,
            lambda: {"warn_above": 0, "daily_cap": 0},
        )
        files = FakeCreationFiles()
        handler = SpeechJobHandler(service, files)

        def job(job_id):
            return Job(
                job_id, uuid4(), "speech", JobStatus.RUNNING,
                payload(operation="record", production_id=12, part_id=45),
                part_id=45, workspace_id=7, production_id=12,
                creation_context={
                    "workspace_id": 7, "production_id": 12,
                    "production_type": "audiovisual",
                    "selection": {"target": "script_part"},
                },
            )

        first = handler(job(9), Progress())
        second = handler(job(10), Progress())

        self.assertEqual(first["output_file_ids"], [41])
        self.assertEqual(second["output_file_ids"], [42])
        self.assertEqual(repository.active_file_id, 42)
        self.assertEqual([item[1]["stored"].path for item in files.registrations],
                         ["/safe/generated-1.mp3", "/safe/generated-2.mp3"])
        self.assertEqual(len(provider.calls), 2)
        self.assertEqual(len(workspace.saved), 2)
        self.assertEqual(workspace.discarded, [])

    def test_http_contract_is_canonical_and_strict(self):
        cleared = SpeechJobCreate(
            text="Hello", voice_identity_id=None,
            catalogue_voice_id="alibaba:intl:qwen-audio-3.0-tts-plus:Cherry",
            context={"workspace_id": 12, "folder_id": 27})
        self.assertIn("voice_identity_id", cleared.model_dump(exclude_unset=True))
        self.assertEqual(cleared.volume, 100)
        SpeechJobCreate(
            text="Hello",
            catalogue_voice_id="alibaba:intl:qwen-audio-3.0-tts-plus:Cherry",
            context={"workspace_id": 12, "production_id": 7,
                     "production_type": "audiovisual",
                     "selection": {"target": "script_part"}},
            part_id=8)
        anchor = uuid4()
        anchored = SpeechJobCreate(
            text="Hello",
            catalogue_voice_id="alibaba:intl:qwen-audio-3.0-tts-plus:Cherry",
            context={"workspace_id": 12, "production_id": 7,
                     "production_type": "audiovisual",
                     "selection": {"target": "script_part"}},
            insert_before_part_id=anchor)
        self.assertEqual(anchored.insert_before_part_id, anchor)
        for changes in (
            {"voice": "Cherry"}, {"engine": "audio"}, {"model": "plus"},
            {"rate": 3}, {"volume": 101},
            {"operation": "render_draft", "part_id": 8},
            {"insert_at": 2},
            {"part_id": 8},
            {"part_id": 8,
             "insert_before_part_id": anchor},
        ):
            values = {"text": "Hello",
                      "catalogue_voice_id": "alibaba:intl:qwen-audio-3.0-tts-plus:Cherry",
                      "context": {"workspace_id": 12},
                      **changes}
            with self.assertRaises(ValueError):
                SpeechJobCreate(**values)

    def test_creator_speech_enqueues_the_complete_destination_context(self):
        context = {
            "workspace_id": 12,
            "folder_id": 27,
            "production_id": 7,
            "production_type": "audiovisual",
            "object_id": None,
            "selection": {"capability": "speech"},
        }
        contract = SpeechJobCreate(
            text="Hello",
            catalogue_voice_id="alibaba:intl:qwen-audio-3.0-tts-plus:Cherry",
            context=context,
        )
        queued = Job(
            9, uuid4(), "speech", JobStatus.QUEUED,
            workspace_id=12, creation_context=context,
        )
        resolved = {
            "provider_voice_id": "Cherry", "identity_id": None,
            "engine": "audio", "tier": "plus",
            "capability_id": None,
        }
        with (
            patch("origins.http.routers.jobs.catalog_service.resolve_voice",
                  return_value=resolved),
            patch("origins.http.routers.jobs.workspace_service.overview",
                  return_value={"workspace": {"id": 12}}),
            patch("origins.http.routers.jobs.job_service.enqueue",
                  return_value=(queued, True)) as enqueue,
            patch("origins.http.routers.jobs.production_speech_service.enqueue")
                    as production_enqueue,
        ):
            create_speech_job(contract, "speech-folder-context")

        production_enqueue.assert_not_called()
        self.assertEqual(enqueue.call_args.kwargs["workspace_id"], 12)
        self.assertEqual(enqueue.call_args.kwargs["creation_context"], context)

    def test_script_speech_uses_the_same_context_with_an_explicit_part_target(self):
        context = {
            "workspace_id": 12,
            "folder_id": 27,
            "production_id": 7,
            "production_type": "audiovisual",
            "object_id": None,
            "selection": {"capability": "speech", "target": "script_part"},
        }
        contract = SpeechJobCreate(
            text="Part words",
            catalogue_voice_id="alibaba:intl:qwen-audio-3.0-tts-plus:Cherry",
            context=context,
            part_id=8,
        )
        queued = Job(
            10, uuid4(), "speech", JobStatus.QUEUED,
            workspace_id=12, production_id=7, part_id=8,
            creation_context=context,
        )
        resolved = {
            "provider_voice_id": "Cherry", "identity_id": None,
            "engine": "audio", "tier": "plus",
            "capability_id": None,
        }
        with (
            patch("origins.http.routers.jobs.catalog_service.resolve_voice",
                  return_value=resolved),
            patch("origins.http.routers.jobs.production_speech_service.enqueue",
                  return_value=(queued, True)) as enqueue,
            patch("origins.http.routers.jobs.job_service.enqueue") as generic_enqueue,
        ):
            create_speech_job(contract, "speech-script-context")

        generic_enqueue.assert_not_called()
        self.assertEqual(enqueue.call_args.kwargs["production_id"], 7)
        self.assertEqual(enqueue.call_args.kwargs["creation_context"], context)
        self.assertEqual(enqueue.call_args.args[0]["production_id"], 7)

    def test_audio_workspace_uses_opaque_contained_names(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = audio_codec.pcm_wav(b"\0\0" * 2_400, sample_rate=24_000)
            saved = AudioWorkspace(root).save(source, "mp3")
            target = Path(saved.path)
            self.assertEqual(target.parent, root.resolve())
            self.assertGreater(target.stat().st_size, 0)
            self.assertEqual(target.suffix, ".mp3")
            with self.assertRaises(ValueError):
                AudioWorkspace(root).save(b"audio", "../escape")

    def test_worker_has_no_loopback_speech_adapter(self):
        worker = (ROOT / "origins/worker.py").read_text()
        self.assertFalse((ROOT / "server.py").exists())
        self.assertIn('service.register("speech", SpeechJobHandler', worker)
        self.assertNotIn("LegacyProviderJobHandlers", worker)
        self.assertFalse(
            (ROOT / "origins/infrastructure/legacy_jobs.py").exists())


if __name__ == "__main__":
    unittest.main()
