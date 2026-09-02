"""Provider-neutral Sound Scene truth and Sequence projection rules."""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
import math
from typing import Any
from uuid import UUID

from origins.domain.rendering import silence_duration_seconds


SAMPLE_RATE = 48_000
TRACK_KIND = "audio"
TRACK_ROLES = {"audio", "music", "sfx", "ambience"}
ANCHOR_KINDS = {"absolute", "part"}
ANCHOR_EDGES = {"start", "end"}
EFFECT_TYPES = {
    "telephone", "echo", "filter", "compressor", "reverb", "distortion", "pan",
}
ECHO_AUDIBLE_THRESHOLD = .01


class SoundSceneError(ValueError):
    pass


class SoundSceneRevisionConflict(SoundSceneError):
    def __init__(self, current_revision: int):
        super().__init__("The Sound Scene changed in another editor.")
        self.current_revision = current_revision


def empty_scene() -> dict[str, Any]:
    return {"version": 1, "sequence_overrides": {}, "tracks": []}


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


def _effects(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 16:
        raise SoundSceneError("That Sound Scene effect chain is invalid.")
    effects: list[dict[str, Any]] = []
    effect_ids: set[str] = set()
    effect_types: set[str] = set()
    for raw in value:
        if not isinstance(raw, dict):
            raise SoundSceneError("A Sound Scene effect is invalid.")
        effect_id = _uuid(raw.get("id"), label="Effect ID")
        if effect_id in effect_ids:
            raise SoundSceneError("Sound Scene effect IDs must be unique per chain.")
        effect_ids.add(effect_id)
        effect_type = str(raw.get("type") or "").strip().lower()
        if effect_type not in EFFECT_TYPES:
            raise SoundSceneError("That Sound Scene effect is unsupported.")
        if effect_type in effect_types:
            raise SoundSceneError(
                f"A Sound Scene effect chain can contain only one {effect_type} effect."
            )
        effect_types.add(effect_type)
        effect = {
            "id": effect_id,
            "type": effect_type,
            "enabled": bool(raw.get("enabled", True)),
        }
        if effect_type == "echo":
            effect.update({
                "delay_ms": max(50, min(
                    1_000, _integer(raw.get("delay_ms"), 180))),
                "feedback": max(0, min(
                    .85, _number(raw.get("feedback"), .28))),
                "mix": max(0, min(1, _number(raw.get("mix"), .22))),
            })
        elif effect_type == "filter":
            mode = str(raw.get("mode") or "lowpass").strip().lower()
            if mode not in {"lowpass", "highpass"}:
                raise SoundSceneError("That filter mode is unsupported.")
            effect.update({
                "mode": mode,
                "frequency_hz": max(40, min(
                    20_000, _integer(raw.get("frequency_hz"), 3_400))),
                "q": max(.1, min(18, _number(raw.get("q"), .707))),
            })
        elif effect_type == "compressor":
            effect.update({
                "threshold_db": max(-60, min(
                    0, _number(raw.get("threshold_db"), -18))),
                "ratio": max(1, min(20, _number(raw.get("ratio"), 4))),
                "attack_ms": max(.1, min(
                    1_000, _number(raw.get("attack_ms"), 12))),
                "release_ms": max(10, min(
                    3_000, _number(raw.get("release_ms"), 180))),
                "makeup_db": max(0, min(
                    24, _number(raw.get("makeup_db"), 0))),
            })
        elif effect_type == "reverb":
            effect.update({
                "room_size": max(.1, min(
                    1, _number(raw.get("room_size"), .45))),
                "mix": max(0, min(1, _number(raw.get("mix"), .2))),
            })
        elif effect_type == "distortion":
            effect.update({
                "amount": max(0, min(1, _number(raw.get("amount"), .2))),
                "mix": max(0, min(1, _number(raw.get("mix"), .25))),
            })
        elif effect_type == "pan":
            effect["pan"] = max(-1, min(1, _number(raw.get("pan"), 0)))
        effects.append(effect)
    return effects


def _mix_override(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SoundSceneError("That Sequence mix override is invalid.")
    return {
        "muted": bool(value.get("muted", False)),
        "gain": max(0, min(2, _number(value.get("gain"), 1))),
        "fade_in_ms": max(
            0, min(120_000, _integer(value.get("fade_in_ms")))),
        "fade_out_ms": max(
            0, min(120_000, _integer(value.get("fade_out_ms")))),
        "effects": _effects(value.get("effects")),
    }


def default_mix_override() -> dict[str, Any]:
    return _mix_override({})


def _linked_visual_audio_settings(value: Any) -> dict[str, Any] | None:
    """Normalize authored audio facts retained across visual deletion.

    Visual Scene owns whether a linked placement exists and where it lives.
    Sound Scene owns how that audio sounds. Keeping only these authored facts
    lets visual Undo restore the mix without making an absent clip audible.
    """
    if value is None:
        return None
    if not isinstance(value, dict):
        raise SoundSceneError("Linked visual audio settings are invalid.")
    raw_track = value.get("track", {})
    raw_clips = value.get("clips", {})
    if not isinstance(raw_track, dict) or not isinstance(raw_clips, dict):
        raise SoundSceneError("Linked visual audio settings are invalid.")
    if len(raw_clips) > 1_000:
        raise SoundSceneError("Too many linked visual audio settings.")
    clips: dict[str, dict[str, Any]] = {}
    for raw_linked_id, raw_clip in raw_clips.items():
        linked_id = _uuid(raw_linked_id, label="Linked visual clip ID")
        if not isinstance(raw_clip, dict):
            raise SoundSceneError("Linked visual audio clip settings are invalid.")
        mix = _mix_override(raw_clip)
        clips[linked_id] = {
            "clip_id": _uuid(
                raw_clip.get("clip_id"), label="Linked audio clip ID"),
            **mix,
            "ducking": bool(raw_clip.get("ducking", False)),
            "duck_amount_db": max(-30, min(0, _number(
                raw_clip.get("duck_amount_db"), -12))),
            "locked": bool(raw_clip.get("locked", False)),
        }
    if not clips:
        return None
    return {
        "track": {
            "name": str(raw_track.get("name") or "Video audio")[:120],
            "volume": max(0, min(2, _number(raw_track.get("volume"), 1))),
            "muted": bool(raw_track.get("muted", False)),
        },
        "clips": clips,
    }


def effect_tail_ms(effects: list[dict[str, Any]]) -> int:
    """Return the finite render window for an otherwise recursive effect.

    Browser echo feedback is theoretically infinite. Rendering stops once the
    repeated signal falls below one percent of the original, which keeps the
    browser and FFmpeg duration contract deterministic.
    """
    tail_ms = 0
    for effect in effects:
        if (effect.get("enabled") and effect.get("type") == "reverb"
                and _number(effect.get("mix")) > 0):
            room_size = max(.1, min(1, _number(effect.get("room_size"), .45)))
            tail_ms = max(tail_ms, round(173 * (.6 + 1.8 * room_size)))
            continue
        if (not effect.get("enabled") or effect.get("type") != "echo"
                or _number(effect.get("mix")) <= 0):
            continue
        feedback = max(0, min(.85, _number(effect.get("feedback"))))
        # The first delayed hit exists independently of feedback. Feedback
        # controls only the subsequent recursively decaying repeats.
        repeats = 1 if feedback <= 0 else max(1, math.ceil(
            math.log(ECHO_AUDIBLE_THRESHOLD) / math.log(feedback)))
        tail_ms += max(50, min(1_000, _integer(
            effect.get("delay_ms"), 180))) * repeats
    return tail_ms


def normalize_scene(document: dict[str, Any]) -> dict[str, Any]:
    """Return the small persisted contract; reject UI/derived state."""
    if not isinstance(document, dict) or document.get("version") != 1:
        raise SoundSceneError("Sound Scene version 1 is required.")
    raw_tracks = document.get("tracks")
    if not isinstance(raw_tracks, list) or len(raw_tracks) > 64:
        raise SoundSceneError("Sound Scene tracks are invalid.")
    raw_overrides = document.get("sequence_overrides", {})
    if not isinstance(raw_overrides, dict) or len(raw_overrides) > 10_000:
        raise SoundSceneError("Sound Scene Sequence overrides are invalid.")
    sequence_overrides = {
        _uuid(part_public_id, label="Sequence override Part public ID"):
        _mix_override(value)
        for part_public_id, value in raw_overrides.items()
    }
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
        if kind != TRACK_KIND:
            raise SoundSceneError("That Sound Scene track kind is unsupported.")
        # Every sound track remains technically audio. Role is an explicit,
        # stable operator choice used for organization and presentation; it
        # never restricts which audio Files the track can contain.
        role = str(raw_track.get("role") or "").strip().lower()
        if role not in TRACK_ROLES:
            raise SoundSceneError("That Sound Scene track role is unsupported.")
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
            file_id = _integer(raw_clip.get("file_id"))
            if file_id <= 0:
                raise SoundSceneError("Every Sound Scene clip needs a File.")
            anchor_raw = raw_clip.get("anchor")
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
                    "position_ms": max(
                        0, _integer(anchor_raw.get("position_ms"))),
                }
            duration_value = raw_clip.get("duration_ms")
            duration_ms = (None if duration_value is None else
                           max(100, _integer(duration_value, 100)))
            clips.append({
                "id": clip_id,
                "linked_visual_clip_id": (
                    _uuid(raw_clip.get("linked_visual_clip_id"),
                          label="Linked visual clip ID")
                    if raw_clip.get("linked_visual_clip_id") else None),
                "file_id": file_id,
                "file_version_id": (
                    _integer(raw_clip.get("file_version_id")) or None),
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
                "duck_amount_db": max(
                    -30, min(0, _number(
                        raw_clip.get("duck_amount_db"), -12))),
                "muted": bool(raw_clip.get("muted", False)),
                "locked": bool(raw_clip.get("locked", False)),
                "effects": _effects(raw_clip.get("effects")),
                "anchor": anchor,
            })
        tracks.append({
            "id": track_id,
            "kind": kind,
            "role": role,
            "name": str(raw_track.get("name") or "Audio")[:120],
            "volume": max(0, min(2, _number(
                raw_track.get("volume"), 1))),
            "muted": bool(raw_track.get("muted", False)),
            "clips": clips,
        })
    result = {
        "version": 1,
        "sequence_overrides": sequence_overrides,
        "tracks": tracks,
    }
    linked_settings = _linked_visual_audio_settings(
        document.get("linked_visual_audio_settings"))
    if linked_settings:
        result["linked_visual_audio_settings"] = linked_settings
    return result


_LINKED_VISUAL_FIELDS = {
    "file_id", "file_version_id", "duration_ms", "source_offset_ms",
    "loop", "anchor",
}


def _remember_linked_visual_audio(
    scene: dict[str, Any], track: dict[str, Any], clip: dict[str, Any],
) -> None:
    linked_id = clip.get("linked_visual_clip_id")
    if not linked_id:
        return
    settings = scene.setdefault("linked_visual_audio_settings", {
        "track": {}, "clips": {},
    })
    settings["track"] = {
        "name": track["name"],
        "volume": track["volume"],
        "muted": track["muted"],
    }
    settings["clips"][linked_id] = {
        "clip_id": clip["id"],
        "gain": clip["gain"],
        "fade_in_ms": clip["fade_in_ms"],
        "fade_out_ms": clip["fade_out_ms"],
        "ducking": clip["ducking"],
        "duck_amount_db": clip["duck_amount_db"],
        "muted": clip["muted"],
        "locked": clip["locked"],
        "effects": deepcopy(clip["effects"]),
    }


def _restore_linked_visual_audio(
    scene: dict[str, Any], source_clip: dict[str, Any], linked_id: str,
) -> dict[str, Any]:
    remembered = scene.get("linked_visual_audio_settings", {}).get(
        "clips", {}).get(linked_id)
    if not remembered:
        return deepcopy(source_clip)
    return {
        **deepcopy(source_clip),
        "id": remembered["clip_id"],
        **{key: deepcopy(remembered[key]) for key in (
            "gain", "fade_in_ms", "fade_out_ms", "ducking",
            "duck_amount_db", "muted", "locked", "effects",
        )},
    }


def merge_linked_visual_audio(
    document: dict[str, Any], projection: dict[str, Any],
) -> dict[str, Any]:
    """Refresh video-owned timing without changing authored audio history.

    Embedded video audio has two owners: Visual Scene owns its placement and
    source window, while Sound Scene owns gain, mute, fades and effects.  A
    visual edit must therefore update the derived fields in every audio
    history snapshot without becoming an audio edit itself.
    """
    target = normalize_scene(projection)
    result = normalize_scene(document)
    desired: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
    for track in target["tracks"]:
        for clip in track["clips"]:
            linked_id = clip.get("linked_visual_clip_id")
            if linked_id:
                desired[linked_id] = (track, clip)

    present: set[str] = set()
    for track in result["tracks"]:
        clips = []
        for clip in track["clips"]:
            linked_id = clip.get("linked_visual_clip_id")
            if not linked_id:
                clips.append(clip)
                continue
            _remember_linked_visual_audio(result, track, clip)
            incoming = desired.get(linked_id)
            if not incoming:
                continue
            present.add(linked_id)
            source = incoming[1]
            clips.append({
                **clip,
                **{field: deepcopy(source[field]) for field in _LINKED_VISUAL_FIELDS},
            })
        track["clips"] = clips

    for linked_id, (source_track, source_clip) in desired.items():
        if linked_id in present:
            continue
        track = next((item for item in result["tracks"]
                      if item["id"] == source_track["id"]), None)
        if track is None:
            remembered_track = result.get(
                "linked_visual_audio_settings", {}).get("track", {})
            track = {
                "id": source_track["id"],
                "kind": source_track["kind"],
                "role": source_track["role"],
                "name": remembered_track.get("name", source_track["name"]),
                "volume": remembered_track.get(
                    "volume", source_track["volume"]),
                "muted": remembered_track.get(
                    "muted", source_track["muted"]),
                "clips": [],
            }
            result["tracks"].insert(0, track)
        restored = _restore_linked_visual_audio(
            result, source_clip, linked_id)
        track["clips"].append(restored)
        _remember_linked_visual_audio(result, track, restored)

    result["tracks"] = [
        track for track in result["tracks"]
        if track["clips"] or track["id"] != "embedded-video-audio"
    ]
    return normalize_scene(result)


def _part_duration_ms(part: dict[str, Any]) -> int:
    if part.get("kind") == "silence":
        return round(silence_duration_seconds(part) * 1000)
    return max(0, _integer(part.get("duration_ms")))


def audible_sequence(parts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return the Parts that occupy time in the current audible Sequence.

    Draft Speech has no media and therefore no timeline presence. Silence is
    canonical timed media and always remains in the projection.
    """
    audible: list[dict[str, Any]] = []
    for part in parts:
        if part.get("enabled", True) is False:
            continue
        kind = str(part.get("kind") or "")
        if kind == "stitch":
            continue
        if kind == "draft":
            continue
        audible.append(part)
    return audible


def sequence_projection(parts: list[dict[str, Any]]) -> dict[str, Any]:
    """Derive the immutable read model from the canonical Sequence."""
    cursor = 0
    spans: list[dict[str, Any]] = []
    signature_parts: list[dict[str, Any]] = []
    for part in audible_sequence(parts):
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
            "file_version_id": part.get("file_version_id"),
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
                "file_name", "file_kind", "filename",
                "source_duration_ms", "source_media_type", "missing",
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
    for span in projection["spans"]:
        override = scene["sequence_overrides"].get(span["part_public_id"])
        span["mix"] = {
            **default_mix_override(),
            **(override or {}),
            "fade_in_ms": min(
                int((override or {}).get("fade_in_ms", 0)),
                span["duration_ms"],
            ),
            "fade_out_ms": min(
                int((override or {}).get("fade_out_ms", 0)),
                span["duration_ms"],
            ),
        }
        span["effect_tail_ms"] = effect_tail_ms(span["mix"]["effects"])
    resolved_tracks: list[dict[str, Any]] = []
    orphans: list[dict[str, str]] = []
    for part_public_id in scene["sequence_overrides"]:
        if part_public_id not in part_spans:
            orphans.append({
                "kind": "sequence_override",
                "part_public_id": part_public_id,
                "reason": "override_part_missing",
            })
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
                # A null duration deliberately follows the Sequence length.
                # Explicitly dimensioned clips are placements of
                # their own and may form an intro/outro beyond the voice stem.
                duration_ms = (
                    max(0, projection["duration_ms"] - start_ms)
                    if clip["duration_ms"] is None
                    else clip["duration_ms"]
                )
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
                "effect_tail_ms": effect_tail_ms(clip["effects"]),
            }
            resolved_clips.append(resolved)
            if orphan_reason:
                orphans.append({
                    "track_id": track["id"], "clip_id": clip["id"],
                    "reason": orphan_reason,
                })
        resolved_tracks.append({**track, "clips": resolved_clips})
    sequence_ends = [
        int(span["start_ms"]) + int(span["duration_ms"])
        + int(span["effect_tail_ms"])
        for span in projection["spans"]
        if not span["mix"]["muted"] and span["mix"]["gain"] > 0
    ]
    sound_ends = [
        int(clip.get("resolved_start_ms") or 0)
        + int(clip.get("resolved_duration_ms") or 0)
        + int(clip.get("effect_tail_ms") or 0)
        for track in resolved_tracks
        if not track.get("muted") and track.get("volume", 1) > 0
        for clip in track["clips"]
        if (not clip.get("orphan") and not clip.get("missing")
            and not clip.get("muted") and clip.get("gain", 1) > 0)
    ]
    scene_duration_ms = max([
        projection["duration_ms"], *sequence_ends, *sound_ends,
    ])
    resolution = {
        "version": 1,
        "duration_ms": scene_duration_ms,
        "sequence_projection": projection,
        "tracks": resolved_tracks,
        "orphans": orphans,
    }
    resolution["signature"] = hashlib.sha256(json.dumps(
        resolution, sort_keys=True, default=str,
    ).encode()).hexdigest()
    return resolution
