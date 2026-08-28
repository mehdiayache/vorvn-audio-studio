"""Real PostgreSQL checks for canonical reusable Venture Assets."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
import unittest
from unittest.mock import patch
from uuid import uuid4

import psycopg

from audio_studio.application.uploads import UploadService
from audio_studio.config import settings
from audio_studio.domain.media import MediaInspection
from audio_studio.infrastructure import upload_workspace
from audio_studio.infrastructure.postgres.uploads import PostgresUploadRecords
from audio_studio.infrastructure.postgres.sound_scenes import SoundSceneRepository
from audio_studio.infrastructure.postgres.visual_scenes import VisualSceneRepository
from audio_studio.domain.visual_scene import VisualSceneRevisionConflict
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)
from audio_studio.infrastructure.upload_workspace import LocalUploadWorkspace


class VentureAssetRepositoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            connection = psycopg.connect(settings.database_url)
        except psycopg.OperationalError as error:
            raise unittest.SkipTest(str(error)) from error
        connection.close()

    def setUp(self):
        self.repository = VentureAssetRepository()
        self.marker = uuid4().hex
        self.fixture_base = 8_000_000_000 + int(self.marker[:8], 16) * 10
        self.venture_id = self.fixture_base
        self.other_venture_id = self.fixture_base + 5
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO projects
                        (id, name, level, container_type)
                    VALUES (%s, %s, 'venture', 'venture'),
                           (%s, %s, 'venture', 'venture')
                """, (self.venture_id, f"Asset fixture {self.marker}",
                      self.other_venture_id, f"Other fixture {self.marker}"))
            database.commit()

    def tearDown(self):
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                if self.venture_id is not None:
                    cursor.execute("DELETE FROM ventures WHERE id IN (%s, %s)",
                                   (self.venture_id, self.other_venture_id))
                    cursor.execute("DELETE FROM projects WHERE id IN (%s, %s)",
                                   (self.venture_id, self.other_venture_id))
            database.commit()

    def _production(self) -> int:
        return self._production_for(self.venture_id, 1)

    def _production_for(self, venture_id: int, offset: int) -> int:
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                project_id = self.fixture_base + offset * 10 + 1
                cursor.execute("""
                    INSERT INTO projects
                        (id, parent_id, name, level, container_type)
                    VALUES (%s, %s, %s, 'project', 'project')
                """, (project_id, venture_id,
                      f"Project {self.marker}"))
                production_id = self.fixture_base + offset * 10 + 2
                cursor.execute("""
                    INSERT INTO projects
                        (id, parent_id, name, level, container_type)
                    VALUES (%s, %s, %s, 'folder', 'production')
                """, (production_id, project_id,
                      f"Production {self.marker}"))
            database.commit()
        return production_id

    def test_collections_are_fixed_typed_and_idempotent(self):
        first = self.repository.ensure_collections(self.venture_id)
        second = self.repository.ensure_collections(self.venture_id)
        self.assertEqual(first, second)
        self.assertEqual({item["kind"] for item in first},
                         {"intros", "outros", "music", "stingers"})
        self.assertEqual(len(first), 4)
        for item in first:
            self.assertEqual(
                self.repository.collection(item["id"])["venture_id"],
                self.venture_id,
            )

    def test_uploaded_asset_keeps_identity_version_and_ownership(self):
        collections = self.repository.ensure_collections(self.venture_id)
        music = next(item for item in collections if item["kind"] == "music")
        with TemporaryDirectory() as output:
            root = Path(output)
            source = root / "incoming.upload"
            source.write_bytes(b"RIFF" + bytes(40))
            service = UploadService(
                LocalUploadWorkspace(root=root, output=root,
                                     references=root / "references"),
                PostgresUploadRecords(assets=self.repository),
            )
            with patch.object(upload_workspace, "inspect_media", return_value=MediaInspection(
                    media_type="audio", media_format="wav", extension="wav",
                    mime_type="audio/wav", audio_format="wav",
                    duration_ms=1200, sample_rate=48000, channels=2,
                    metadata={"codec": "pcm_s16le", "container": "wav"})):
                created = service.save_asset_file(
                    music["id"], source, source.stat().st_size,
                    "Quiet bed.wav", name="Quiet evening bed",
                    scope="venture", encoded_tags="%5B%22calm%22%2C%22bed%22%5D")
            self.assertTrue((Path(output) / created["filename"]).is_file())
        asset = self.repository.get(created["id"])
        self.assertEqual(
            (asset["venture_id"], asset["collection_id"], asset["kind"],
             asset["scope"], asset["audio_format"], asset["version_id"],
             asset["filename"]),
            (self.venture_id, music["id"], "music", "venture", "wav",
             created["version_id"],
             created["filename"]),
        )
        self.assertEqual(asset["name"], "Quiet evening bed")
        self.assertEqual(asset["tags"], ["calm", "bed"])
        self.assertEqual((asset["sample_rate"], asset["channels"]), (48000, 2))
        self.assertEqual(asset["metadata"]["origin"], "upload")
        self.assertEqual(asset["version_metadata"]["codec"], "pcm_s16le")
        listed = self.repository.list_for_venture(self.venture_id)
        self.assertEqual([item["id"] for item in listed], [created["id"]])
        context = self.repository.library_context(created["id"])
        self.assertEqual(
            (context["venture_id"], context["collection"]),
            (self.venture_id, "Music"),
        )
        production_id = self._production()
        self.assertTrue(self.repository.allowed_for_production(
            production_id, created["id"]))
        self.assertFalse(self.repository.allowed_for_production(
            2_147_483_647, created["id"]))

        other_production_id = self._production_for(
            self.other_venture_id, 2)
        self.assertFalse(self.repository.allowed_for_production(
            other_production_id, created["id"]))
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute(
                    "UPDATE assets SET scope='studio' WHERE id=%s",
                    (created["id"],),
                )
            database.commit()
        self.assertTrue(self.repository.allowed_for_production(
            other_production_id, created["id"]))
        self.assertIn(
            created["id"],
            [item["id"] for item in self.repository.list_for_production(
                other_production_id)],
        )
        scenes = SoundSceneRepository()
        current = scenes.get(other_production_id)
        shared = scenes.commit(other_production_id, current["revision"], {
            "version": 1,
            "tracks": [{
                "id": "shared", "kind": "audio", "name": "Shared audio",
                "clips": [{
                    "id": str(uuid4()), "asset_id": created["id"],
                    "asset_version_id": created["version_id"],
                    "anchor": {"kind": "absolute", "position_ms": 0},
                    "duration_ms": 1_200,
                }],
            }],
        })
        shared_clip = shared["hydrated_document"]["tracks"][0]["clips"][0]
        self.assertFalse(shared_clip["missing"])
        self.assertEqual(shared_clip["asset_version_id"], created["version_id"])

    def test_visual_asset_persists_media_truth_without_a_parallel_library(self):
        collections = self.repository.ensure_collections(self.venture_id)
        compatibility_collection = next(
            item for item in collections if item["kind"] == "stingers")

        created = self.repository.create_uploaded_asset(
            compatibility_collection["id"], name="Harbour at dusk",
            filename="harbour.jpg", path="/media/harbour.jpg",
            size_bytes=12_345, duration_ms=None, audio_format=None,
            mime_type="image/jpeg", media_type="image",
            media_format="jpg", width=1600, height=900,
            metadata={"origin": "upload", "original_filename": "harbour.jpg"},
            version_metadata={"codec": "mjpeg", "container": "image2"},
        )

        asset = self.repository.get(created["id"])
        self.assertEqual(asset["media_type"], "image")
        self.assertEqual(asset["kind"], "other")
        self.assertEqual(asset["mime_type"], "image/jpeg")
        self.assertEqual(asset["media_format"], "jpg")
        self.assertEqual((asset["width"], asset["height"]), (1600, 900))
        self.assertIsNone(asset["duration_ms"])
        self.assertTrue(asset["created_at"])
        self.assertTrue(asset["updated_at"])

        listed = next(
            item for item in self.repository.list_for_venture(self.venture_id)
            if item["id"] == created["id"])
        self.assertEqual(listed["media_type"], "image")
        scenes = SoundSceneRepository()
        production_id = self._production()
        self.assertEqual(self.repository.director_asset_ids(production_id), [])
        self.assertTrue(self.repository.attach_to_director(
            production_id, created["id"]))
        self.assertTrue(self.repository.attach_to_director(
            production_id, created["id"]))
        self.assertEqual(
            self.repository.director_asset_ids(production_id), [created["id"]])
        self.assertTrue(self.repository.detach_from_director(
            production_id, created["id"]))
        self.assertEqual(self.repository.director_asset_ids(production_id), [])
        current = scenes.get(production_id)
        with self.assertRaisesRegex(ValueError, "require audio Assets"):
            scenes.commit(production_id, current["revision"], {
                "version": 1,
                "tracks": [{
                    "id": "visual-leak", "kind": "audio", "name": "Audio",
                    "clips": [{
                        "id": str(uuid4()), "asset_id": created["id"],
                        "asset_version_id": created["version_id"],
                        "anchor": {"kind": "absolute", "position_ms": 0},
                        "duration_ms": 5_000,
                    }],
                }],
            })

        visual_scenes = VisualSceneRepository()
        visual = visual_scenes.get(production_id)
        document = {
            "version": 1,
            "canvas": {"width": 1920, "height": 1080},
            "tracks": [{
                "id": "visual-1", "name": "Visual 1",
                "media_type": "image",
                "visible": True, "locked": False, "clips": [{
                    "id": str(uuid4()), "asset_id": created["id"],
                    "start_ms": 2_000, "duration_ms": 5_000,
                    "source_offset_ms": 0, "fit": "cover",
                    "position_x": 0.0, "position_y": 0.0,
                    "scale": 1.0, "opacity": 1.0, "locked": False,
                }],
            }],
        }
        saved = visual_scenes.commit(
            production_id, visual["revision"], document)
        self.assertEqual(saved["revision"], 2)
        self.assertEqual(saved["document"], document)
        with self.assertRaises(VisualSceneRevisionConflict) as conflict:
            visual_scenes.commit(production_id, 1, document)
        self.assertEqual(conflict.exception.current_revision, 2)

    def test_director_rejects_audio_and_visuals_from_another_venture(self):
        collections = self.repository.ensure_collections(self.venture_id)
        music = next(item for item in collections if item["kind"] == "music")
        audio = self.repository.create_uploaded_asset(
            music["id"], name="Audio only", filename="audio.wav",
            path="/audio/audio.wav", size_bytes=10, duration_ms=1000,
            audio_format="wav", mime_type="audio/wav")
        production_id = self._production()
        self.assertIsNone(self.repository.attach_to_director(
            production_id, audio["id"]))

        other_collections = self.repository.ensure_collections(
            self.other_venture_id)
        other = next(
            item for item in other_collections if item["kind"] == "stingers")
        image = self.repository.create_uploaded_asset(
            other["id"], name="Other visual", filename="other.png",
            path="/media/other.png", size_bytes=10, duration_ms=None,
            audio_format=None, mime_type="image/png", media_type="image",
            media_format="png", width=100, height=100)
        self.assertIsNone(self.repository.attach_to_director(
            production_id, image["id"]))

    def test_sound_scene_accepts_only_video_versions_with_embedded_audio(self):
        collections = self.repository.ensure_collections(self.venture_id)
        stingers = next(
            item for item in collections if item["kind"] == "stingers")
        production_id = self._production()
        scenes = SoundSceneRepository()
        audible = self.repository.create_uploaded_asset(
            stingers["id"], name="Camera interview",
            filename="camera.mp4", path="/media/camera.mp4",
            size_bytes=12_000, duration_ms=8_000, audio_format=None,
            mime_type="video/mp4", media_type="video",
            media_format="mp4", width=1280, height=720,
            video_codec="h264", frame_rate=24, sample_rate=48_000,
            channels=2, version_metadata={
                "codec": "h264", "audio_codec": "aac"})
        silent = self.repository.create_uploaded_asset(
            stingers["id"], name="Silent b-roll",
            filename="silent.mp4", path="/media/silent.mp4",
            size_bytes=10_000, duration_ms=8_000, audio_format=None,
            mime_type="video/mp4", media_type="video",
            media_format="mp4", width=1280, height=720,
            video_codec="h264", frame_rate=24,
            version_metadata={"codec": "h264", "audio_codec": ""})

        current = scenes.get(production_id)
        document = {
            "version": 1, "sequence_overrides": {}, "tracks": [{
                "id": "embedded-video-audio", "kind": "audio",
                "name": "Video audio", "volume": 1, "muted": False,
                "clips": [{
                    "id": str(uuid4()),
                    "linked_visual_clip_id": str(uuid4()),
                    "asset_id": audible["id"],
                    "asset_version_id": audible["version_id"],
                    "anchor": {"kind": "absolute", "position_ms": 500},
                    "duration_ms": 4_000, "source_offset_ms": 1_000,
                }],
            }],
        }
        saved = scenes.commit(production_id, current["revision"], document)
        clip = saved["hydrated_document"]["tracks"][0]["clips"][0]
        self.assertEqual(clip["source_media_type"], "video")
        self.assertEqual(clip["filename"], "camera.mp4")
        self.assertFalse(clip["missing"])

        document["tracks"][0]["clips"][0].update({
            "asset_id": silent["id"],
            "asset_version_id": silent["version_id"],
        })
        with self.assertRaisesRegex(ValueError, "videos with embedded audio"):
            scenes.commit(production_id, saved["revision"], document)

    def test_legacy_visual_track_infers_video_from_its_canonical_asset(self):
        collections = self.repository.ensure_collections(self.venture_id)
        stingers = next(
            item for item in collections if item["kind"] == "stingers")
        production_id = self._production()
        video = self.repository.create_uploaded_asset(
            stingers["id"], name="Legacy camera",
            filename="legacy-camera.mp4", path="/media/legacy-camera.mp4",
            size_bytes=12_000, duration_ms=8_000, audio_format=None,
            mime_type="video/mp4", media_type="video",
            media_format="mp4", width=1280, height=720,
            video_codec="h264", frame_rate=24)
        clip_id = str(uuid4())
        legacy = {
            "version": 1,
            "tracks": [{
                "id": "visual-legacy", "name": "Visual 1",
                "visible": True, "locked": False,
                "clips": [{
                    "id": clip_id, "asset_id": video["id"],
                    "start_ms": 0, "duration_ms": 5_000,
                    "source_offset_ms": 0, "fit": "cover",
                    "locked": False,
                }],
            }],
        }
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO visual_scenes (production_id, document)
                    VALUES (%s, %s::jsonb)
                    ON CONFLICT (production_id) DO UPDATE
                    SET document=EXCLUDED.document
                """, (production_id, json.dumps(legacy)))
            database.commit()

        scenes = VisualSceneRepository()
        current = scenes.get(production_id)
        self.assertEqual(
            current["document"]["tracks"][0]["media_type"], "video")
        saved = scenes.commit(
            production_id, current["revision"], current["document"])
        self.assertEqual(
            saved["document"]["tracks"][0]["media_type"], "video")

    def test_uploaded_studio_asset_is_reusable_by_another_venture(self):
        collections = self.repository.ensure_collections(self.venture_id)
        stingers = next(
            item for item in collections if item["kind"] == "stingers")
        other_production_id = self._production_for(self.other_venture_id, 2)
        with TemporaryDirectory() as output:
            root = Path(output)
            source = root / "incoming.upload"
            source.write_bytes(b"RIFF" + bytes(40))
            service = UploadService(
                LocalUploadWorkspace(root=root, output=root,
                                     references=root / "references"),
                PostgresUploadRecords(assets=self.repository),
            )
            with patch.object(upload_workspace, "inspect_media", return_value=MediaInspection(
                    media_type="audio", media_format="wav", extension="wav",
                    mime_type="audio/wav", audio_format="wav",
                    duration_ms=450, sample_rate=48000, channels=1,
                    metadata={"codec": "pcm_s16le", "container": "wav"})):
                created = service.save_asset_file(
                    stingers["id"], source, source.stat().st_size,
                    "knock.wav", name="Wooden door knock", category="sfx",
                    scope="studio", encoded_tags="%5B%22door%22%5D")
        asset = self.repository.get(created["id"])
        self.assertEqual((asset["kind"], asset["scope"], asset["tags"]),
                         ("sfx", "studio", ["door"]))
        self.assertTrue(self.repository.allowed_for_production(
            other_production_id, created["id"]))

    def test_kept_studio_catalog_asset_is_deduplicated_across_ventures(self):
        first = self.repository.ensure_collections(self.venture_id)
        second = self.repository.ensure_collections(self.other_venture_id)
        first_stingers = next(
            item for item in first if item["kind"] == "stingers")
        second_stingers = next(
            item for item in second if item["kind"] == "stingers")
        created = self.repository.create_uploaded_asset(
            first_stingers["id"], name="Shared door", filename="door.wav",
            path="/media/door.wav", size_bytes=900, duration_ms=450,
            audio_format="wav", mime_type="audio/wav", category="sfx",
            scope="studio", tags=("door",), metadata={
                "origin": "freesound", "external_id": "931"},
            version_metadata={"codec": "pcm_s16le", "container": "wav"})

        existing = self.repository.catalog_asset(
            second_stingers["id"], origin="freesound", external_id="931",
            scope="studio")

        self.assertEqual(existing["id"], created["id"])
        self.assertEqual(existing["version_id"], created["version_id"])
        self.assertEqual(existing["scope"], "studio")

    def test_concurrent_studio_catalog_keep_creates_one_asset_and_version(self):
        first = self.repository.ensure_collections(self.venture_id)
        second = self.repository.ensure_collections(self.other_venture_id)
        collection_ids = (
            next(item["id"] for item in first if item["kind"] == "stingers"),
            next(item["id"] for item in second if item["kind"] == "stingers"),
        )
        external_id = f"studio-{self.marker}"
        barrier = Barrier(2)

        def keep(index: int):
            barrier.wait()
            return VentureAssetRepository().create_catalog_asset(
                collection_ids[index], origin="freesound",
                external_id=external_id, name="Concurrent studio sound",
                filename=f"studio-{index}.wav",
                path=f"/media/studio-{index}.wav", size_bytes=900,
                duration_ms=450, audio_format="wav",
                mime_type="audio/wav", category="sfx", scope="studio",
                metadata={"origin": "freesound",
                          "external_id": external_id},
                version_metadata={"codec": "pcm_s16le"})

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(keep, (0, 1)))

        self.assertEqual({item[0]["id"] for item in results},
                         {results[0][0]["id"]})
        self.assertEqual(sorted(item[1] for item in results), [False, True])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    SELECT count(*), count(version.id)
                      FROM assets asset
                      LEFT JOIN asset_versions version
                        ON version.asset_id = asset.id
                     WHERE asset.metadata ->> 'origin' = 'freesound'
                       AND asset.metadata ->> 'external_id' = %s
                """, (external_id,))
                self.assertEqual(cursor.fetchone(), (1, 1))

    def test_concurrent_generated_keep_creates_one_asset_and_version(self):
        first = self.repository.ensure_collections(self.venture_id)
        second = self.repository.ensure_collections(self.other_venture_id)
        collection_ids = (
            next(item["id"] for item in first if item["kind"] == "stingers"),
            next(item["id"] for item in second if item["kind"] == "stingers"),
        )
        candidate_id = str(uuid4())
        barrier = Barrier(2)

        def keep(index: int):
            barrier.wait()
            return VentureAssetRepository().create_generated_asset(
                collection_ids[index], candidate_id=candidate_id,
                name="Generated rain room",
                filename=f"generated-{index}.wav",
                path=f"/media/generated-{index}.wav", size_bytes=900,
                duration_ms=450, audio_format="wav",
                mime_type="audio/wav", category="ambience", scope="studio",
                metadata={"origin": "generated",
                          "external_id": candidate_id},
                version_metadata={"codec": "pcm_s16le"})

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(keep, (0, 1)))

        self.assertEqual({item[0]["id"] for item in results},
                         {results[0][0]["id"]})
        self.assertEqual(sorted(item[1] for item in results), [False, True])
        with psycopg.connect(settings.database_url) as database:
            with database.cursor() as cursor:
                cursor.execute("""
                    SELECT count(*), count(version.id)
                      FROM assets asset
                      LEFT JOIN asset_versions version
                        ON version.asset_id = asset.id
                     WHERE asset.metadata ->> 'origin' = 'generated'
                       AND asset.metadata ->> 'external_id' = %s
                """, (candidate_id,))
                self.assertEqual(cursor.fetchone(), (1, 1))

    def test_venture_catalog_keep_deduplicates_only_within_venture(self):
        first = self.repository.ensure_collections(self.venture_id)
        second = self.repository.ensure_collections(self.other_venture_id)
        first_collections = [item["id"] for item in first]
        second_collection = next(
            item["id"] for item in second if item["kind"] == "stingers")
        external_id = f"venture-{self.marker}"

        def keep(collection_id: int, filename: str):
            return self.repository.create_catalog_asset(
                collection_id, origin="freesound", external_id=external_id,
                name="Venture sound", filename=filename,
                path=f"/media/{filename}", size_bytes=900,
                duration_ms=450, audio_format="wav",
                mime_type="audio/wav", category="sfx", scope="venture",
                metadata={"origin": "freesound",
                          "external_id": external_id})

        first_result = keep(first_collections[0], "venture-first.wav")
        duplicate_result = keep(first_collections[1], "venture-loser.wav")
        other_result = keep(second_collection, "venture-other.wav")

        self.assertFalse(first_result[1])
        self.assertTrue(duplicate_result[1])
        self.assertEqual(first_result[0]["id"], duplicate_result[0]["id"])
        self.assertFalse(other_result[1])
        self.assertNotEqual(first_result[0]["id"], other_result[0]["id"])

    def test_unknown_collection_cannot_create_an_orphan(self):
        self.assertIsNone(self.repository.create_uploaded_asset(
            2_147_483_647, name="Orphan", filename="orphan.wav",
            path="/tmp/orphan.wav", size_bytes=44, duration_ms=100,
            audio_format="wav", mime_type="audio/wav",
        ))

    def test_explicit_category_is_independent_from_legacy_collection(self):
        collections = self.repository.ensure_collections(self.venture_id)
        stingers = next(
            item for item in collections if item["kind"] == "stingers")
        with TemporaryDirectory() as output:
            root = Path(output)
            service = UploadService(
                LocalUploadWorkspace(root=root, output=root,
                                     references=root / "references"),
                PostgresUploadRecords(assets=self.repository),
            )
            with patch.object(upload_workspace, "inspect_media", return_value=MediaInspection(
                    media_type="audio", media_format="wav", extension="wav",
                    mime_type="audio/wav", audio_format="wav",
                    duration_ms=1200, sample_rate=44100, channels=1,
                    metadata={"codec": "pcm_s16le", "container": "wav"})):
                for category in ("ambience", "sfx", "other"):
                    source = root / f"{category}.upload"
                    source.write_bytes(b"RIFF" + bytes(40))
                    created = service.save_asset_file(
                        stingers["id"], source, source.stat().st_size,
                        f"{category}.wav", category=category,
                    )
                    self.assertEqual(
                        self.repository.get(created["id"])["kind"],
                        category,
                    )


if __name__ == "__main__":
    unittest.main()
