"""Provider-neutral visual placement truth for one Production timeline."""

from __future__ import annotations

from typing import Any
from uuid import UUID


class VisualSceneError(ValueError):
    pass


class VisualSceneRevisionConflict(VisualSceneError):
    def __init__(self, current_revision: int):
        super().__init__("The Visual Scene changed in another editor.")
        self.current_revision = current_revision


def empty_scene() -> dict[str, Any]:
    return {
        "version": 1,
        "canvas": {"width": 1920, "height": 1080},
        "tracks": [],
    }


def _integer(value: Any, default: int = 0) -> int:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    if result != result or abs(result) == float("inf"):
        return default
    return round(result)


def _identifier(value: Any, *, label: str) -> str:
    result = str(value or "").strip()
    if not result or len(result) > 120:
        raise VisualSceneError(f"{label} is invalid.")
    return result


def _choice(value: Any, choices: set[str], *, label: str) -> str:
    result = str(value or "").strip().lower()
    if result not in choices:
        raise VisualSceneError(f"{label} is invalid.")
    return result


def _uuid(value: Any, *, label: str) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise VisualSceneError(f"{label} is invalid.") from exc


def normalize_scene(document: dict[str, Any]) -> dict[str, Any]:
    """Return the deliberately small persisted V1 document."""
    if not isinstance(document, dict) or document.get("version") != 1:
        raise VisualSceneError("Visual Scene version 1 is required.")
    raw_tracks = document.get("tracks")
    if not isinstance(raw_tracks, list) or len(raw_tracks) > 64:
        raise VisualSceneError("Visual Scene tracks are invalid.")

    raw_canvas = document.get("canvas") or {}
    if not isinstance(raw_canvas, dict):
        raise VisualSceneError("Visual Scene canvas is invalid.")
    canvas = {
        "width": _integer(raw_canvas.get("width"), 1920),
        "height": _integer(raw_canvas.get("height"), 1080),
    }
    if not 240 <= canvas["width"] <= 7680 or not 240 <= canvas["height"] <= 7680:
        raise VisualSceneError("Visual Scene canvas dimensions are invalid.")

    tracks: list[dict[str, Any]] = []
    track_ids: set[str] = set()
    clip_ids: set[str] = set()
    for raw_track in raw_tracks:
        if not isinstance(raw_track, dict):
            raise VisualSceneError("A Visual Scene track is invalid.")
        track_id = _identifier(raw_track.get("id"), label="Track ID")
        if track_id in track_ids:
            raise VisualSceneError("Visual Scene track IDs must be unique.")
        track_ids.add(track_id)
        raw_clips = raw_track.get("clips")
        if not isinstance(raw_clips, list) or len(raw_clips) > 1_000:
            raise VisualSceneError("Visual Scene clips are invalid.")
        fallback_type = (
            "video" if str(raw_track.get("name") or "").strip().lower()
            == "video" else "image"
        )
        media_type = _choice(
            raw_track.get("media_type", fallback_type), {"image", "video"},
            label="Track media type")

        clips: list[dict[str, Any]] = []
        for raw_clip in raw_clips:
            if not isinstance(raw_clip, dict):
                raise VisualSceneError("A Visual Scene clip is invalid.")
            clip_id = _uuid(raw_clip.get("id"), label="Clip ID")
            if clip_id in clip_ids:
                raise VisualSceneError("Visual Scene clip IDs must be unique.")
            clip_ids.add(clip_id)
            asset_id = _integer(raw_clip.get("asset_id"))
            if asset_id <= 0:
                raise VisualSceneError("Every Visual Scene clip needs an Asset.")
            duration_ms = _integer(raw_clip.get("duration_ms"))
            if duration_ms < 100:
                raise VisualSceneError(
                    "Every Visual Scene clip needs a positive duration.")
            clips.append({
                "id": clip_id,
                "asset_id": asset_id,
                "start_ms": max(0, _integer(raw_clip.get("start_ms"))),
                "duration_ms": duration_ms,
                "source_offset_ms": max(
                    0, _integer(raw_clip.get("source_offset_ms"))),
                "fit": _choice(
                    raw_clip.get("fit", "cover"), {"cover", "contain"},
                    label="Clip fit"),
                "locked": bool(raw_clip.get("locked", False)),
            })
        tracks.append({
            "id": track_id,
            "name": str(raw_track.get("name") or media_type.title())[:120],
            "media_type": media_type,
            "visible": bool(raw_track.get("visible", True)),
            "locked": bool(raw_track.get("locked", False)),
            "clips": clips,
        })
    return {"version": 1, "canvas": canvas, "tracks": tracks}
