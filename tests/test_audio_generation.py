"""Focused contracts for private audio generation and candidate Keep."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from audio_studio.application.audio_generation import AudioGenerationService
from audio_studio.domain.jobs import Job, JobFailed, JobStatus
from audio_studio.http.audio_generation_contracts import (
    AudioGenerationHistoryEnvelope,
)
from audio_studio.providers.vorvn_audio import OurStableAudioGenerator


class Response:
    def __init__(self, payload, headers=None):
        self.payload = payload if isinstance(payload, bytes) else json.dumps(
            payload).encode()
        self.headers = headers or {}
        self.offset = 0

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, size=-1):
        if size < 0:
            return self.payload
        chunk = self.payload[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk


class AudioGeneratorProviderTests(unittest.TestCase):
    def test_submit_uses_only_the_documented_contract(self):
        opener = Mock(return_value=Response({
            "job_id": "provider-job", "status": "queued", "seed": 42,
        }))
        with patch.dict("os.environ", {"VORVN_AI_API_KEY": "secret"},
                        clear=True):
            result = OurStableAudioGenerator(opener=opener).submit(
                "sfx", prompt="A ceramic cup placed on wood",
                seconds=3, seed=42, idempotency_key="logical-request-1")

        request = opener.call_args.args[0]
        self.assertEqual(request.full_url, "https://ai.vrn.one/v1/audio/sfx")
        self.assertEqual(request.method, "POST")
        self.assertEqual(request.headers["Authorization"], "Bearer secret")
        self.assertEqual(request.headers["Idempotency-key"],
                         "logical-request-1")
        self.assertEqual(json.loads(request.data), {
            "prompt": "A ceramic cup placed on wood",
            "seconds": 3, "seed": 42,
        })
        self.assertEqual((result.job_id, result.seed), ("provider-job", 42))

    def test_status_maps_the_two_available_models(self):
        opener = Mock(return_value=Response([
            {"id": "stable-audio-3-small-sfx", "purpose": "sound-effects",
             "available": True, "max_seconds": 30, "output": "audio/wav"},
            {"id": "stable-audio-3-small-music", "purpose": "music",
             "available": True, "max_seconds": 120, "output": "audio/wav"},
        ]))
        with patch.dict("os.environ", {"VORVN_AI_API_KEY": "secret"},
                        clear=True):
            status = OurStableAudioGenerator(opener=opener).status()
        self.assertTrue(status["sfx_ready"])
        self.assertTrue(status["music_ready"])
        self.assertEqual(status["models"]["music"]["max_seconds"], 120)


class FakeGenerator:
    def __init__(self, states=None):
        self.states = list(states or [{
            "status": "completed", "seed": 71,
            "completed_at": "2026-08-23T00:00:00Z",
            "expires_at": "2026-08-23T06:00:00Z",
            "output_bytes": 400, "output_sha256": "abc",
        }])
        self.cancelled = []

    def status(self):
        return {
            "configured": True, "sfx_ready": True, "music_ready": True,
            "reason": "", "models": {
                "sfx": {"id": "stable-audio-3-small-sfx"},
                "music": {"id": "stable-audio-3-small-music"},
            },
        }

    def submit(self, *_args, **_kwargs):
        return type("Submission", (), {"job_id": "remote-1", "seed": 71})()

    def job(self, _provider_job_id):
        return self.states.pop(0)

    def cancel(self, provider_job_id):
        self.cancelled.append(provider_job_id)

    def download(self, _provider_job_id, target):
        target.write_bytes(b"generated-wave")
        return target.stat().st_size


class FakeJobs:
    def __init__(self):
        self.jobs = {}
        self.enqueued = []

    def enqueue(self, kind, payload, **values):
        job = Job(1, uuid4(), kind, JobStatus.QUEUED, payload=payload)
        self.jobs[job.public_id] = job
        self.enqueued.append((kind, payload, values))
        return job, True

    def get(self, public_id):
        return self.jobs.get(public_id)

    def recent_for_production(self, _production_id, *, kind, limit=8):
        return [job for job in reversed(list(self.jobs.values()))
                if job.kind == kind][:limit]


class FakeUploads:
    def __init__(self):
        self.existing = None
        self.saved = []

    def generated_asset(self, *, candidate_id):
        return self.existing

    def generated_space_file(self, *, space_id, candidate_id):
        return self.existing

    def prepare_asset_upload(self, *args, **kwargs):
        return {"args": args, "values": kwargs}

    def save_generated_asset_file(self, collection_id, source, size_bytes,
                                  *, candidate_id, details):
        self.saved.append({
            "collection_id": collection_id, "source": Path(source),
            "size_bytes": size_bytes, "candidate_id": candidate_id,
            "details": details,
        })
        return {"asset": {"id": 91}, "duplicate": False}


class WinningUploads(FakeUploads):
    def __init__(self):
        super().__init__()
        self.lookups = 0

    def generated_asset(self, *, candidate_id):
        self.lookups += 1
        return None if self.lookups == 1 else {
            "id": 45, "name": "Concurrent winner"}


class Progress:
    def __init__(self):
        self.calls = []

    def progress(self, *values):
        self.calls.append(values)


class AudioGenerationApplicationTests(unittest.TestCase):
    inspection = {
        "audio_format": "wav", "duration_ms": 3000,
        "sample_rate": 44100, "channels": 2,
        "metadata": {"codec": "pcm_s16le", "container": "wav"},
    }

    def service(self, root, *, generator=None):
        jobs, uploads = FakeJobs(), FakeUploads()
        service = AudioGenerationService(
            generator=generator or FakeGenerator(), jobs=jobs,
            uploads=uploads, scratch_root=root, poll_interval=0,
            inspect_audio=lambda _: self.inspection,
            sleeper=lambda _: None)
        return service, jobs, uploads

    def test_candidate_is_temporary_until_explicit_keep(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            service, jobs, uploads = self.service(root)
            progress = Progress()
            job = Job(
                1, uuid4(), "audio_generate", JobStatus.RUNNING,
                payload={"capability": "sfx", "prompt": "Soft cloth movement",
                         "seconds": 3, "seed": None})
            result = service.handle_job(job, progress)

            self.assertEqual(uploads.saved, [])
            self.assertTrue((root / "generated" /
                             f"{job.public_id}.wav").is_file())
            self.assertEqual(result["model"], "stable-audio-3-small-sfx")
            self.assertEqual(result["seed"], 71)
            self.assertEqual(
                progress.calls[-1][1:], (3, 3, "Generated audio is ready"))

            jobs.jobs[job.public_id] = Job(
                job.id, job.public_id, job.kind, JobStatus.SUCCEEDED,
                payload=job.payload, result=result)
            kept = service.keep(
                candidate_id=job.public_id, collection_id=41,
                name="Soft cloth movement", category="sfx", scope="studio",
                tags=("cloth",))
            self.assertEqual(kept["asset"]["id"], 91)
            self.assertEqual(len(uploads.saved), 1)
            self.assertEqual(uploads.saved[0]["candidate_id"],
                             str(job.public_id))
            provenance = uploads.saved[0]["details"]["values"]["metadata"]
            self.assertEqual(provenance["prompt_mode"], "expert")
            self.assertEqual(provenance["resolved_prompt"],
                             "Soft cloth movement")
            self.assertEqual(provenance["output_duration_ms"], 3000)
            self.assertNotIn("generation_duration_ms", provenance)
            self.assertFalse((root / "generated" /
                              f"{job.public_id}.wav").exists())

    def test_same_candidate_keep_resolves_existing_without_new_media(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            service, _, uploads = self.service(root)
            uploads.existing = {"id": 44, "name": "Existing candidate"}
            candidate_id = uuid4()
            target = root / "generated" / f"{candidate_id}.wav"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"stale candidate")
            result = service.keep(
                candidate_id=candidate_id, collection_id=41, name="Ignored",
                category="music", scope="space", tags=())
            self.assertEqual(result, {
                "asset": uploads.existing, "duplicate": True})
            self.assertEqual(uploads.saved, [])
            self.assertFalse(target.exists())

    def test_keep_resolves_concurrent_winner_if_candidate_was_removed(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            jobs, uploads = FakeJobs(), WinningUploads()
            service = AudioGenerationService(
                generator=FakeGenerator(), jobs=jobs, uploads=uploads,
                scratch_root=root, inspect_audio=lambda _: self.inspection)
            candidate_id = uuid4()
            jobs.jobs[candidate_id] = Job(
                1, candidate_id, "audio_generate", JobStatus.SUCCEEDED,
                result={"candidate_id": str(candidate_id)})

            result = service.keep(
                candidate_id=candidate_id, collection_id=41, name="Ignored",
                category="sfx", scope="studio", tags=())

            self.assertEqual(result, {
                "asset": {"id": 45, "name": "Concurrent winner"},
                "duplicate": True,
            })
            self.assertEqual(uploads.saved, [])

    def test_discard_removes_only_the_temporary_candidate(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            service, jobs, _ = self.service(root)
            candidate_id = uuid4()
            jobs.jobs[candidate_id] = Job(
                1, candidate_id, "audio_generate", JobStatus.SUCCEEDED,
                result={"candidate_id": str(candidate_id)})
            target = root / "generated" / f"{candidate_id}.wav"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"candidate")
            self.assertTrue(service.discard(candidate_id))
            self.assertFalse(target.exists())

    def test_provider_failure_keeps_evidence_and_creates_no_candidate(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            service, _, uploads = self.service(
                root, generator=FakeGenerator(states=[{
                    "status": "failed", "failure_code": "generation_failed",
                }]))
            job = Job(
                1, uuid4(), "audio_generate", JobStatus.RUNNING,
                payload={"capability": "music", "prompt": "Calm night bed",
                         "seconds": 10, "seed": 2})
            with self.assertRaises(JobFailed) as failure:
                service.handle_job(job, Progress())
            self.assertEqual(
                failure.exception.result["failure_code"], "generation_failed")
            self.assertEqual(uploads.saved, [])
            self.assertFalse((root / "generated" /
                              f"{job.public_id}.wav").exists())

    def test_duration_limits_follow_each_exact_capability(self):
        service, _, _ = self.service(Path("/tmp"))
        with self.assertRaisesRegex(ValueError, "between 1 and 30"):
            service.enqueue(
                capability="sfx", prompt="Rain", seconds=31, seed=None,
                idempotency_key="sfx")
        with self.assertRaisesRegex(ValueError, "between 5 and 120"):
            service.enqueue(
                capability="music", prompt="Rain", seconds=4, seed=None,
                idempotency_key="music")

    def test_simple_intent_is_durable_and_projected_in_recent_history(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            service, jobs, _ = self.service(root)
            job, _ = service.enqueue(
                capability="music", prompt="Purpose: quiet underscore.",
                seconds=20, seed=9, prompt_mode="simple",
                generation_brief={"purpose": "quiet underscore"},
                idempotency_key="intent", production_id=81)
            self.assertEqual(job.payload["resolved_prompt"],
                             "Purpose: quiet underscore.")
            self.assertEqual(job.payload["generation_brief"], {
                "purpose": "quiet underscore"})
            jobs.jobs[job.public_id] = Job(
                job.id, job.public_id, job.kind, JobStatus.RUNNING,
                payload=job.payload, progress=.4, detail="Generating")

            recent = service.recent(81)

            self.assertEqual(recent[0]["job_id"], str(job.public_id))
            self.assertEqual(recent[0]["request"]["prompt_mode"], "simple")
            self.assertEqual(recent[0]["request"]["generation_brief"], {
                "purpose": "quiet underscore"})
            self.assertFalse(recent[0]["candidate_available"])

    def test_kept_history_serializes_canonical_asset_datetimes(self):
        with TemporaryDirectory() as directory:
            service, jobs, uploads = self.service(Path(directory))
            now = datetime(2026, 8, 28, 4, 30, tzinfo=timezone.utc)
            uploads.existing = {
                "id": 91, "version_id": 92, "name": "Kept sound",
                "filename": "kept.wav", "media_type": "audio",
                "duration_ms": 3000, "url": "/audio/kept.wav",
                "category": "sfx", "scope": "studio", "tags": [],
                "metadata": {}, "media_format": "wav",
                "audio_format": "wav", "sample_rate": 44100,
                "channels": 2, "width": None, "height": None,
                "video_codec": None, "frame_rate": None,
                "size_bytes": 400, "mime_type": "audio/wav",
                "version_metadata": {}, "created_at": now,
                "updated_at": now,
            }
            job = Job(
                1, uuid4(), "audio_generate", JobStatus.SUCCEEDED,
                payload={"capability": "sfx", "prompt": "Soft bell",
                         "prompt_mode": "expert", "seconds": 3,
                         "seed": 7})
            jobs.jobs[job.public_id] = job

            envelope = AudioGenerationHistoryEnvelope.model_validate({
                "data": service.recent(81),
            })
            serialized = json.loads(envelope.model_dump_json())

            self.assertEqual(
                serialized["data"][0]["kept_asset"]["created_at"],
                "2026-08-28T04:30:00Z")

    def test_sound_recipe_is_compiled_server_side_and_stored_as_snapshot(self):
        with TemporaryDirectory() as directory:
            service, jobs, _ = self.service(Path(directory))
            recipe = {
                "creative_brief": "A gentle prayer bed",
                "context": ["context.faith"],
                "moment": ["moment.prayer"],
                "genres": ["genre.ambient"],
                "duration": 24,
                "seed": 31,
                "variation_count": 2,
            }
            job, _ = service.enqueue(
                capability="music", prompt="this client prompt is ignored",
                seconds=5, seed=None, prompt_mode="expert",
                semantic_state=recipe,
                source_free_text=recipe["creative_brief"],
                idempotency_key="recipe", production_id=81)

            self.assertIn("TrackType: Music", job.payload["prompt"])
            self.assertNotIn("client prompt", job.payload["prompt"])
            self.assertEqual(job.payload["seconds"], 24)
            self.assertEqual(job.payload["seed"], 31)
            self.assertEqual(job.payload["semantic_state"]["variation_count"], 2)
            self.assertEqual(job.payload["semantic_schema_version"],
                             "music-semantic-v2")
            self.assertEqual(job.payload["compiler_version"],
                             "music-compiler-v2")
            self.assertEqual(job.payload["taxonomy_version"],
                             "audio-taxonomy-v1")
            jobs.jobs[job.public_id] = Job(
                job.id, job.public_id, job.kind, JobStatus.RUNNING,
                payload=job.payload)
            request = service.recent(81)[0]["request"]
            self.assertEqual(request["semantic_state"]["context"],
                             ["context.faith"])
            self.assertEqual(request["source_free_text"],
                             "A gentle prayer bed")

    def test_unresolved_sound_recipe_conflict_cannot_generate(self):
        service, _, _ = self.service(Path("/tmp"))
        with self.assertRaisesRegex(ValueError, "Resolve the conflicting"):
            service.enqueue(
                capability="music", prompt=None, seconds=30, seed=None,
                semantic_state={
                    "creative_brief": "a huge explosive climax",
                    "arrangement": {
                        "dynamics": "arrangement.dynamics_restrained"},
                },
                idempotency_key="conflict")


if __name__ == "__main__":
    unittest.main()
