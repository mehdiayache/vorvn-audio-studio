"""Canonical Creation output File contracts."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

from origins.application.creation_files import CreationFileService
from origins.domain.files import StoredFileVersion
from origins.domain.jobs import Job, JobStatus
from origins.infrastructure.creation_file_storage import (
    LocalCreationFileStorage,
)


class FakeRecords:
    def __init__(self):
        self.calls = []

    def create_generated_workspace_file(self, workspace_id, **values):
        self.calls.append((workspace_id, values))
        return ({"id": 40 + len(self.calls), "name": values["name"]}, False)


class FakeJobs:
    def __init__(self):
        self.links = []

    def attach_output_file(self, public_id, file_id):
        self.links.append((public_id, file_id))
        return True


class CreationFileTests(unittest.TestCase):
    def job(self, workspace_id=12):
        return Job(
            7, uuid4(), "transcribe", JobStatus.RUNNING,
            workspace_id=workspace_id, creation_action_id="create-subtitles",
        )

    def test_register_uses_job_and_action_as_canonical_provenance(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "speech.wav"
            path.write_bytes(b"audio")
            records, jobs = FakeRecords(), FakeJobs()
            service = CreationFileService(
                records, jobs, LocalCreationFileStorage(Path(directory)))
            job = self.job()
            file = service.register(
                job, output_key="speech", name="  My   speech  ",
                stored=StoredFileVersion(
                    filename=path.name, path=str(path), mime_type="audio/wav",
                    family="audio", audio_format="wav", media_format="wav"),
                metadata={"provider": "test"}, tags=("speech",),
            )

        self.assertEqual(file["id"], 41)
        workspace_id, values = records.calls[0]
        self.assertEqual(workspace_id, 12)
        self.assertEqual(values["name"], "My speech")
        self.assertEqual(values["candidate_id"], f"{job.public_id}:speech")
        self.assertEqual(values["metadata"]["origin"], "generated")
        self.assertEqual(values["metadata"]["creation_action_id"],
                         "create-subtitles")
        self.assertEqual(values["metadata"]["provider"], "test")
        self.assertEqual(jobs.links, [(job.public_id, 41)])

    def test_subtitle_outputs_are_real_utf8_file_versions(self):
        with TemporaryDirectory() as directory:
            records, jobs = FakeRecords(), FakeJobs()
            service = CreationFileService(
                records, jobs, LocalCreationFileStorage(Path(directory)))
            outputs = service.write_subtitles(
                self.job(), base_name="Interview", language="French",
                srt="1\n00:00:00,000 --> 00:00:01,000\nBonjour\n",
                vtt="WEBVTT\n\n00:00.000 --> 00:01.000\nBonjour\n",
            )
            saved = [Path(values["stored"].path)
                     for _workspace_id, values in records.calls]
            self.assertEqual([path.suffix for path in saved], [".srt", ".vtt"])
            self.assertEqual([values["stored"].family
                              for _workspace_id, values in records.calls],
                             ["subtitle", "subtitle"])
            self.assertTrue(all(path.exists() for path in saved))

        self.assertEqual([output["id"] for output in outputs], [41, 42])
        self.assertEqual([file_id for _public_id, file_id in jobs.links],
                         [41, 42])

    def test_output_without_space_is_rejected(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "speech.wav"
            path.write_bytes(b"audio")
            service = CreationFileService(
                FakeRecords(), FakeJobs(),
                LocalCreationFileStorage(Path(directory)))
            with self.assertRaisesRegex(ValueError, "Workspace-owned Job"):
                service.register(
                    self.job(workspace_id=None), output_key="speech", name="Speech",
                    stored=StoredFileVersion(
                        filename=path.name, path=str(path),
                        mime_type="audio/wav", family="audio"),
                )


if __name__ == "__main__":
    unittest.main()
