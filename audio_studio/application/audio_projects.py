"""Lightweight audio scene serialization and direct rendering."""

from __future__ import annotations

from typing import Protocol

from audio_studio.domain.rendering import RenderError, silence_duration_seconds


class ProjectWorkspace(Protocol):
    def render_project(self, project: dict) -> dict: ...


def production_scene(editor: dict, music: dict) -> dict:
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
    if music.get("filename"):
        tracks.append({
            "id": "music",
            "kind": "music",
            "volume": float(music.get("volume") or 0),
            "loop": True,
            "source_offset": float(music.get("start") or 0),
            "clips": [{
                "id": str(music.get("music_of") or "music"),
                "start_time": 0,
                "duration": round(position, 3),
                "file_url": f"/audio/{music['filename']}",
            }],
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
