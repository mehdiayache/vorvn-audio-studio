"""Provider-neutral Sound Scene truth and Sequence projection rules."""

from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from audio_studio.domain.rendering import silence_duration_seconds


SAMPLE_RATE = 48_000
TRACK_KINDS = {"music", "sfx", "ambience"}
ANCHOR_KINDS = {"absolute", "part"}
ANCHOR_EDGES = {"start", "end"}


class SoundSceneError(ValueError):
    pass


class SoundSceneRevisionConflict(SoundSceneError):
    def __init__(self, current_revision: int):
        super().__init__("The Sound Scene changed in another editor.")
        self.current_revision = current_revision


def empty_scene() -> dict[str, Any]:
    return {
        "version": 1,
        "tracks": [{
            "id": "music", "kind": "music", "name": "Music",
            "volume": 1, "muted": False, "clips": [],
        }],
    }


def _number(value: Any, default: float = 0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if result == result and abs(result) != float("inf") else default


def _integer(value: Any, default: int = 0) -> int:
    return round(_number(value, default))


def _identifier(value: Any, *, label: str) -> str:
    result = str(value or "").strip()
    if not result or len(result) > 120:
        raise SoundSceneError(f"{label} is invalid.")
    return result


def _uuid(value: Any, *, label: str) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise SoundSceneError(f"{label} is invalid.") from exc


def normalize_scene(document: dict[str, Any]) -> dict[str, Any]:
    """Return the small persisted contract; reject UI/derived state."""
    if not isinstance(document, dict) or document.get("version") != 1:
        raise SoundSceneError("Sound Scene version 1 is required.")
    raw_tracks = document.get("tracks")
    if not isinstance(raw_tracks, list) or len(raw_tracks) > 64:
        raise SoundSceneError("Sound Scene tracks are invalid.")
    tracks: list[dict[str, Any]] = []
    track_ids: set[str] = set()
    clip_ids: set[str] = set()
    for raw_track in raw_tracks:
        if not isinstance(raw_track, dict):
            raise SoundSceneError("A Sound Scene track is invalid.")
        track_id = _identifier(raw_track.get("id"), label="Track ID")
        if track_id in track_ids:
            raise SoundSceneError("Sound Scene track IDs must be unique.")
        track_ids.add(track_id)
        kind = str(raw_track.get("kind") or "").strip().lower()
        if kind not in TRACK_KINDS:
            raise SoundSceneError("That Sound Scene track kind is unsupported.")
        raw_clips = raw_track.get("clips")
        if not isinstance(raw_clips, list) or len(raw_clips) > 1_000:
            raise SoundSceneError("Sound Scene clips are invalid.")
        clips: list[dict[str, Any]] = []
        for raw_clip in raw_clips:
            if not isinstance(raw_clip, dict):
                raise SoundSceneError("A Sound Scene clip is invalid.")
            clip_id = _uuid(raw_clip.get("id"), label="Clip ID")
            if clip_id in clip_ids:
                raise SoundSceneError("Sound Scene clip IDs must be unique.")
            clip_ids.add(clip_id)
            asset_id = _integer(raw_clip.get("asset_id"))
            if asset_id <= 0:
                raise SoundSceneError("Every Sound Scene clip needs an Asset.")
            anchor_raw = raw_clip.get("anchor") or {"kind": "absolute"}
            if not isinstance(anchor_raw, dict):
                raise SoundSceneError("That Sound Scene anchor is invalid.")
            anchor_kind = str(anchor_raw.get("kind") or "absolute").lower()
            if anchor_kind not in ANCHOR_KINDS:
                raise SoundSceneError("That Sound Scene anchor kind is unsupported.")
            if anchor_kind == "part":
                part_public_id = _uuid(
                    anchor_raw.get("part_public_id"), label="Part public ID")
                edge = str(anchor_raw.get("edge") or "start").lower()
                if edge not in ANCHOR_EDGES:
                    raise SoundSceneError("That Part anchor is invalid.")
                anchor = {
                    "kind": "part", "part_public_id": part_public_id,
                    "edge": edge,
                    "offset_ms": _integer(anchor_raw.get("offset_ms")),
                }
            else:
                anchor = {
                    "kind": "absolute",
                    "position_ms": max(0, _integer(
                        anchor_raw.get("position_ms",
                                       raw_clip.get("start_ms", 0)))),
                }
            duration_value = raw_clip.get("duration_ms")
            duration_ms = (None if duration_value is None else
                           max(100, _integer(duration_value, 100)))
            clips.append({
                "id": clip_id,
                "asset_id": asset_id,
                "asset_version_id": (
                    _integer(raw_clip.get("asset_version_id")) or None),
                "start_ms": max(0, _integer(raw_clip.get("start_ms"))),
                "duration_ms": duration_ms,
                "source_offset_ms": max(
                    0, _integer(raw_clip.get("source_offset_ms"))),
                "gain": max(0, min(2, _number(raw_clip.get("gain"), 1))),
                "fade_in_ms": max(
                    0, min(120_000, _integer(raw_clip.get("fade_in_ms")))),
                "fade_out_ms": max(
                    0, min(120_000, _integer(raw_clip.get("fade_out_ms")))),
                "loop": bool(raw_clip.get("loop", False)),
                "ducking": bool(raw_clip.get("ducking", False)),
                "anchor": anchor,
            })
        tracks.append({
            "id": track_id,
            "kind": kind,
            "name": str(raw_track.get("name") or kind.title())[:120],
            "volume": max(0, min(2, _number(
                raw_track.get("volume"), 1))),
            "muted": bool(raw_track.get("muted", False)),
            "clips": clips,
        })
    if not any(track["kind"] == "music" for track in tracks):
        tracks.append(empty_scene()["tracks"][0])
    return {"version": 1, "tracks": tracks}


def _part_duration_ms(part: dict[str, Any]) -> int:
    if part.get("kind") == "silence":
        return round(silence_duration_seconds(part) * 1000)
    return max(0, _integer(part.get("duration_ms")))


def sequence_projection(parts: list[dict[str, Any]]) -> dict[str, Any]:
    """Derive the immutable read model from the canonical Sequence."""
    cursor = 0
    spans: list[dict[str, Any]] = []
    signature_parts: list[dict[str, Any]] = []
    for part in parts:
        if (part.get("kind") in {"stitch", "draft"}
                or part.get("enabled", True) is False):
            continue
        duration_ms = _part_duration_ms(part)
        if duration_ms <= 0:
            continue
        span = {
            "part_id": int(part["id"]),
            "part_public_id": str(part.get("public_id") or ""),
            "position": part.get("position"),
            "kind": str(part.get("kind") or "audio"),
            "title": str(part.get("title") or ""),
            "role": str(part.get("authored_role") or ""),
            "voice_name": str(part.get("voice_name") or ""),
            "filename": str(part.get("filename") or ""),
            "start_ms": cursor,
            "duration_ms": duration_ms,
            "silence": part.get("kind") == "silence",
            "missing": bool(part.get("missing")),
        }
        spans.append(span)
        signature_parts.append({key: span.get(key) for key in (
            "part_id", "part_public_id", "kind", "filename",
            "duration_ms", "silence", "missing",
        )} | {
            "revision": part.get("revision"),
            "clip_id": part.get("clip_id"),
            "asset_version_id": part.get("asset_version_id"),
        })
        cursor += duration_ms
    signature = hashlib.sha256(json.dumps(
        signature_parts, sort_keys=True, default=str,
    ).encode()).hexdigest()
    return {
        "signature": signature,
        "duration_ms": cursor,
        "sample_rate": SAMPLE_RATE,
        "spans": spans,
    }


def resolve_scene(
    document: dict[str, Any], parts: list[dict[str, Any]],
) -> dict[str, Any]:
    """Resolve anchors and follow-Sequence lengths without mutating truth."""
    scene = normalize_scene(document)
    source_fields = {
        str(clip.get("id")): {
            key: clip.get(key) for key in (
                "asset_name", "asset_kind", "filename",
                "source_duration_ms", "missing",
            )
        }
        for track in document.get("tracks", [])
        if isinstance(track, dict)
        for clip in track.get("clips", [])
        if isinstance(clip, dict)
    }
    for track in scene["tracks"]:
        for clip in track["clips"]:
            clip.update(source_fields.get(clip["id"], {}))
    projection = sequence_projection(parts)
    part_spans = {
        span["part_public_id"]: span for span in projection["spans"]}
    resolved_tracks: list[dict[str, Any]] = []
    orphans: list[dict[str, str]] = []
    for track in scene["tracks"]:
        resolved_clips: list[dict[str, Any]] = []
        for clip in track["clips"]:
            anchor = clip["anchor"]
            orphan_reason = ""
            if anchor["kind"] == "part":
                target = part_spans.get(anchor["part_public_id"])
                if target is None:
                    start_ms = None
                    orphan_reason = "anchor_part_missing"
                else:
                    edge = (target["start_ms"] if anchor["edge"] == "start"
                            else target["start_ms"] + target["duration_ms"])
                    start_ms = max(0, edge + anchor["offset_ms"])
            else:
                start_ms = max(0, anchor["position_ms"])
            source_duration_ms = max(
                0, _integer(clip.get("source_duration_ms")))
            if start_ms is None:
                duration_ms = 0
            else:
                available_scene = max(0, projection["duration_ms"] - start_ms)
                requested = (available_scene if clip["duration_ms"] is None
                             else clip["duration_ms"])
                duration_ms = min(requested, available_scene)
                if not clip["loop"] and source_duration_ms:
                    duration_ms = min(
                        duration_ms,
                        max(0, source_duration_ms
                            - clip["source_offset_ms"]),
                    )
            resolved = {
                **clip,
                "resolved_start_ms": start_ms,
                "resolved_duration_ms": max(0, duration_ms),
                "fade_in_ms": min(clip["fade_in_ms"], max(0, duration_ms)),
                "fade_out_ms": min(clip["fade_out_ms"], max(0, duration_ms)),
                "orphan": bool(orphan_reason),
                "orphan_reason": orphan_reason or None,
            }
            resolved_clips.append(resolved)
            if orphan_reason:
                orphans.append({
                    "track_id": track["id"], "clip_id": clip["id"],
                    "reason": orphan_reason,
                })
        resolved_tracks.append({**track, "clips": resolved_clips})
    resolution = {
        "version": 1,
        "sequence_projection": projection,
        "tracks": resolved_tracks,
        "orphans": orphans,
    }
    resolution["signature"] = hashlib.sha256(json.dumps(
        resolution, sort_keys=True, default=str,
    ).encode()).hexdigest()
    return resolution
