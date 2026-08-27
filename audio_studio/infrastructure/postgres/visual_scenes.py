"""PostgreSQL persistence for revisioned Visual Scene documents."""

from __future__ import annotations

from copy import deepcopy
import json
from typing import Any

from audio_studio.domain.visual_scene import (
    VisualSceneRevisionConflict,
    empty_scene,
    normalize_scene,
)
from audio_studio.infrastructure.postgres.session import read_only, transaction


class VisualSceneRepository:
    @staticmethod
    def _ensure(cursor, production_id: int) -> None:
        cursor.execute("""
            INSERT INTO visual_scenes (production_id, document)
            SELECT id, %s::jsonb FROM productions
             WHERE id=%s AND archived_at IS NULL
            ON CONFLICT (production_id) DO NOTHING
        """, (json.dumps(empty_scene()), production_id))

    def get(self, production_id: int) -> dict[str, Any] | None:
        with transaction() as cursor:
            self._ensure(cursor, production_id)
            cursor.execute("""
                SELECT revision, document, updated_at
                  FROM visual_scenes WHERE production_id=%s
            """, (production_id,))
            row = cursor.fetchone()
        if not row:
            return None
        document = self._upgrade_legacy_track_types(
            production_id, row[1])
        return {
            "production_id": production_id,
            "revision": int(row[0]),
            "document": normalize_scene(document),
            "updated_at": row[2].isoformat(),
        }

    def for_render(self, production_id: int) -> dict[str, Any] | None:
        """Return canonical placements with their current local media sources."""
        scene = self.get(production_id)
        if not scene:
            return None
        asset_ids = sorted({
            clip["asset_id"]
            for track in scene["document"]["tracks"]
            for clip in track["clips"]
        })
        sources = self._asset_sources(production_id, asset_ids)
        return {
            **scene,
            "sources": {
                str(asset_id): {"asset_id": asset_id, **source}
                for asset_id, source in sources.items()
            },
        }

    def _upgrade_legacy_track_types(
        self, production_id: int, document: dict[str, Any],
    ) -> dict[str, Any]:
        """Infer the real Asset type for pre-typed Visual Scene tracks.

        Early Visual Scene documents used generic tracks and therefore did not
        persist ``media_type``. The public document now requires explicit Image
        or Video tracks, so the compatibility repair belongs at this database
        read boundary. New typed documents still pass through strict validation.
        """
        raw_tracks = document.get("tracks") if isinstance(document, dict) else None
        if not isinstance(raw_tracks, list) or all(
                isinstance(track, dict) and "media_type" in track
                for track in raw_tracks):
            return document

        asset_ids = sorted({
            int(clip["asset_id"])
            for track in raw_tracks if isinstance(track, dict)
            for clip in track.get("clips", []) if isinstance(clip, dict)
            and str(clip.get("asset_id", "")).isdigit()
        })
        sources = self._asset_sources(production_id, asset_ids)
        upgraded = deepcopy(document)
        upgraded_tracks: list[dict[str, Any]] = []
        used_ids = {
            str(track.get("id")) for track in raw_tracks
            if isinstance(track, dict) and track.get("id")
        }

        def unique_track_id(base_id: str, label: str) -> str:
            candidate = f"{base_id}-{label}"[:120]
            suffix = 2
            while candidate in used_ids:
                ending = f"-{label}-{suffix}"
                candidate = f"{base_id[:120 - len(ending)]}{ending}"
                suffix += 1
            used_ids.add(candidate)
            return candidate

        for track in upgraded.get("tracks", []):
            if not isinstance(track, dict) or "media_type" in track:
                upgraded_tracks.append(track)
                continue
            clips_by_type = {"image": [], "video": []}
            unknown_clips = []
            for clip in track.get("clips", []):
                source = sources.get(int(clip.get("asset_id") or 0))
                media_type = source and source.get("media_type")
                if media_type in clips_by_type:
                    clips_by_type[media_type].append(clip)
                else:
                    unknown_clips.append(clip)
            present_types = [
                media_type for media_type, clips in clips_by_type.items()
                if clips
            ]
            if len(present_types) <= 1:
                track["media_type"] = present_types[0] if present_types else (
                    "video" if str(track.get("name") or "").strip().lower()
                    == "video" else "image")
                upgraded_tracks.append(track)
                continue

            base_id = str(track.get("id") or "visual")
            for media_type in present_types:
                upgraded_tracks.append({
                    **track,
                    "id": unique_track_id(base_id, media_type),
                    "name": media_type.title(),
                    "media_type": media_type,
                    "clips": clips_by_type[media_type],
                })
            if unknown_clips:
                upgraded_tracks.append({
                    **track,
                    "id": unique_track_id(base_id, "unavailable"),
                    "media_type": "image", "clips": unknown_clips,
                })
        upgraded["tracks"] = upgraded_tracks
        return upgraded

    @staticmethod
    def _asset_sources(
        production_id: int, asset_ids: list[int],
    ) -> dict[int, dict[str, Any]]:
        if not asset_ids:
            return {}
        with read_only() as cursor:
            cursor.execute("""
                SELECT asset.id, asset.media_type, version.filename,
                       version.duration_ms
                  FROM assets asset
                  JOIN productions production ON production.id=%s
                  JOIN work_projects project ON project.id=production.project_id
                  LEFT JOIN LATERAL (
                      SELECT item.filename, item.duration_ms
                        FROM asset_versions item
                       WHERE item.asset_id=asset.id
                       ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE (asset.venture_id=project.venture_id
                        OR asset.scope='studio')
                   AND asset.id = ANY(%s::bigint[])
            """, (production_id, asset_ids))
            return {
                int(row[0]): {
                    "media_type": row[1], "filename": row[2] or "",
                    "duration_ms": int(row[3] or 0),
                }
                for row in cursor.fetchall()
            }

    def validate_assets(
        self, production_id: int, document: dict[str, Any],
    ) -> dict[str, Any]:
        scene = normalize_scene(document)
        clips = [
            clip for track in scene["tracks"] for clip in track["clips"]
        ]
        sources = self._asset_sources(
            production_id, sorted({clip["asset_id"] for clip in clips}))
        for track in scene["tracks"]:
            for clip in track["clips"]:
                source = sources.get(clip["asset_id"])
                if not source or not source["filename"]:
                    raise ValueError("A Visual Scene Asset is unavailable.")
                media_type = source["media_type"]
                if media_type not in {"image", "video"}:
                    raise ValueError(
                        "Visual Scene clips require image or video Assets.")
                if track["media_type"] != media_type:
                    raise ValueError(
                        f"A {media_type} Asset requires a "
                        f"{media_type.title()} track.")
                if media_type == "image" and clip["source_offset_ms"]:
                    raise ValueError("Image clips cannot have a source offset.")
                if media_type == "video":
                    source_duration = source["duration_ms"]
                    if source_duration <= 0:
                        raise ValueError(
                            "That video Asset has no usable duration.")
                    if (clip["source_offset_ms"] + clip["duration_ms"]
                            > source_duration):
                        raise ValueError(
                            "That video clip exceeds its source duration.")
        return scene

    def commit(
        self, production_id: int, expected_revision: int,
        document: dict[str, Any],
    ) -> dict[str, Any] | None:
        canonical = normalize_scene(document)
        with transaction() as cursor:
            self._ensure(cursor, production_id)
            cursor.execute("""
                SELECT revision FROM visual_scenes
                 WHERE production_id=%s FOR UPDATE
            """, (production_id,))
            row = cursor.fetchone()
            if not row:
                return None
            current = int(row[0])
            if current != int(expected_revision):
                raise VisualSceneRevisionConflict(current)
            canonical = self.validate_assets(production_id, canonical)
            cursor.execute("""
                UPDATE visual_scenes
                   SET revision=%s, document=%s::jsonb, updated_at=now()
                 WHERE production_id=%s
            """, (
                current + 1, json.dumps(canonical), production_id,
            ))
        return self.get(production_id)
