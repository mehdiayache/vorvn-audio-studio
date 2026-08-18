"""Production preview and export use cases."""

from __future__ import annotations

from typing import Protocol

from audio_studio.domain import captions
from audio_studio.domain.rendering import (
    FinishedExport,
    RenderError,
    silence_duration_seconds,
)
from audio_studio.domain.sound_scene import resolve_scene


class RenderRecords(Protocol):
    def production(self, production_id: int) -> dict | None: ...
    def parts(self, production_id: int) -> list[dict]: ...
    def sound_scene(self, production_id: int) -> dict | None: ...
    def transcript(self, part_id: int) -> dict | None: ...
    def create_export(
        self, production_id: int, *, artifact: FinishedExport,
    ) -> dict | None: ...


class RenderWorkspace(Protocol):
    def duration_for_part(self, part: dict) -> int: ...
    def preview(
        self, production_id: int, parts: list[dict], scene: dict,
        *, skipped_drafts: int,
    ) -> dict: ...
    def finish_export(
        self, production_id: int, production_name: str, parts: list[dict],
        scene: dict, subtitles: dict,
    ) -> FinishedExport: ...
    def discard_export(self, artifact: FinishedExport) -> None: ...


class RenderService:
    def __init__(self, records: RenderRecords, workspace: RenderWorkspace):
        self.records = records
        self.workspace = workspace

    def _parts(self, production_id: int) -> tuple[dict, list[dict], list[dict]]:
        production = self.records.production(production_id)
        if not production:
            raise RenderError("That Production does not exist.")
        everything = [part for part in self.records.parts(production_id)
                      if part.get("enabled", True)]
        drafts = [part for part in everything if part["kind"] == "draft"]
        parts = [part for part in everything
                 if part["kind"] not in ("stitch", "draft")]
        if not parts:
            raise RenderError("Nothing recorded in this Production yet.")
        broken = [index + 1 for index, part in enumerate(parts)
                  if part.get("missing")]
        if broken:
            raise RenderError(
                "Linked audio is missing from part"
                + ("s " if len(broken) > 1 else " ")
                + ", ".join(map(str, broken)) + ".")
        return production, parts, drafts

    def preview(self, production_id: int) -> dict:
        _, parts, drafts = self._parts(production_id)
        sound_scene = self.records.sound_scene(production_id)
        if not sound_scene:
            raise RenderError("This Production has no Sound Scene.")
        resolved = resolve_scene(
            sound_scene.get("hydrated_document", sound_scene["document"]),
            parts,
        )
        return self.workspace.preview(
            production_id, parts, resolved,
            skipped_drafts=len(drafts))

    def _subtitles(self, parts: list[dict]) -> dict:
        cues, missing, stale, offset = [], [], [], 0
        for number, part in enumerate(parts, 1):
            if part["kind"] == "silence":
                offset += round(silence_duration_seconds(part) * 1000)
                continue
            length = (part.get("duration_ms")
                      or self.workspace.duration_for_part(part) or 0)
            found = self.records.transcript(part["id"])
            if not found or not found.get("sentences"):
                missing.append(number)
            else:
                if found.get("stale"):
                    stale.append(number)
                for cue in captions.build_cues(
                        found["sentences"], "standard"):
                    cues.append({**cue, "start": cue["start"] + offset,
                                 "end": cue["end"] + offset})
            offset += length
        return {
            "cues": len(cues), "missing": missing, "stale": stale,
            "srt": captions.render_srt(cues) if cues else "",
            "vtt": captions.render_vtt(cues) if cues else "",
        }

    def export(self, production_id: int) -> dict:
        production, parts, drafts = self._parts(production_id)
        if drafts:
            raise RenderError(
                f"{len(drafts)} Part"
                f"{'s are' if len(drafts) > 1 else ' is'} still a Draft.")
        subtitles = self._subtitles(parts)
        sound_scene = self.records.sound_scene(production_id)
        if not sound_scene:
            raise RenderError("This Production has no Sound Scene.")
        resolved = resolve_scene(
            sound_scene.get("hydrated_document", sound_scene["document"]),
            parts,
        )
        artifact = self.workspace.finish_export(
            production_id, production["name"], parts, resolved, subtitles)
        try:
            recorded = self.records.create_export(
                production_id, artifact=artifact)
            if not recorded:
                raise RenderError("The finished Export could not be recorded.")
        except Exception:
            self.workspace.discard_export(artifact)
            raise
        return {
            "url": f"/audio/{artifact.filename}", "name": artifact.filename,
            "size_mb": round(artifact.size_bytes / 1_000_000, 2),
            "parts": artifact.part_count,
            "subtitles": subtitles["cues"],
            "missing_subtitles": subtitles["missing"],
            "stale_subtitles": subtitles["stale"],
            "music": artifact.mixed,
            "manifest": artifact.manifest_path.name,
            "export_id": recorded["export_id"],
            "srt_url": (f"/audio/{artifact.target.stem}.srt"
                        if subtitles["srt"] else None),
        }

    def handle_job(self, job, _repository) -> dict:
        production_id = int(job.payload["production_id"])
        return (self.preview(production_id)
                if job.payload["operation"] == "preview"
                else self.export(production_id))
