"""Lightweight audio scene serialization and direct rendering."""

from __future__ import annotations

from typing import Protocol

from audio_studio.domain.rendering import RenderError, silence_duration_seconds


class ProjectWorkspace(Protocol):
    def render_project(self, project: dict) -> dict: ...


def production_scene(editor: dict, sound_scene: dict) -> dict:
    """Project -> Tracks -> Clips view of one playable Production."""
    position = 0.0
    clips = []
    for part in editor.get("parts") or []:
        if not part.get("enabled", True) or part.get("kind") in ("draft", "stitch"):
            continue
        if part.get("kind") == "silence":
            duration = silence_duration_seconds(part)
            file_url = f"silence://{part['id']}"
        else:
            duration = max(0, float(part.get("duration_ms") or 0) / 1000)
            filename = str(part.get("filename") or "")
            if not filename or duration <= 0:
                raise RenderError(
                    f"Part {part.get('position', 0) + 1} has no playable audio.")
            file_url = f"/audio/{filename}"
        clips.append({
            "id": str(part.get("public_id") or part["id"]),
            "start_time": round(position, 3),
            "duration": round(duration, 3),
            "file_url": file_url,
        })
        position += duration

    if not clips:
        raise RenderError("That Production has no playable Clips.")

    tracks = [{
        "id": "dialogue",
        "kind": "dialogue",
        "volume": 1,
        "loop": False,
        "source_offset": 0,
        "clips": clips,
    }]
    for track in sound_scene.get("resolved", {}).get("tracks", []):
        project_clips = []
        for clip in track.get("clips", []):
            if (clip.get("orphan") or clip.get("missing")
                    or not clip.get("filename")
                    or float(clip.get("resolved_duration_ms") or 0) <= 0):
                continue
            project_clips.append({
                "id": str(clip["id"]),
                "start_time": round(
                    float(clip.get("resolved_start_ms") or 0) / 1000, 3),
                "duration": round(
                    float(clip["resolved_duration_ms"]) / 1000, 3),
                "file_url": f"/audio/{clip['filename']}",
            })
        if not project_clips:
            continue
        clips_for_track = track.get("clips") or []
        first_clip = clips_for_track[0] if clips_for_track else {}
        tracks.append({
            "id": str(track["id"]),
            "kind": str(track["kind"]),
            "volume": 0 if track.get("muted") else (
                float(track.get("volume", 1))
                * float(first_clip.get("gain", 1))
            ),
            "loop": bool(first_clip.get("loop", False)),
            "source_offset": float(
                first_clip.get("source_offset_ms") or 0) / 1000,
            "clips": project_clips,
        })
    return {
        "id": str(editor.get("public_id") or editor["id"]),
        "name": editor.get("name") or "Untitled Project",
        "sample_rate": 48_000,
        "tracks": tracks,
    }


class AudioProjectService:
    def __init__(self, workspace: ProjectWorkspace):
        self.workspace = workspace

    def render(self, project: dict) -> dict:
        return self.workspace.render_project(project)
