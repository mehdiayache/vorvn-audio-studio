"""Deterministic Production preview and export rendering."""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import quote
from uuid import uuid4

import say

from audio_studio.domain import captions
from audio_studio.infrastructure.media_paths import media_root
from audio_studio.infrastructure.postgres import work as work_repository
from audio_studio.infrastructure.postgres.exports import ProductionExportRepository
from audio_studio.infrastructure.postgres.production_document import (
    MUSIC_LEVELS,
    ProductionDocumentRepository,
)
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository


document_repository = ProductionDocumentRepository()
export_repository = ProductionExportRepository()
transcript_repository = TranscriptRepository()


class RenderError(RuntimeError):
    pass


def _output() -> Path:
    target = media_root()
    target.mkdir(parents=True, exist_ok=True)
    return target


def _measure(target: Path) -> int | None:
    if not target.is_file() or not shutil.which("ffprobe"):
        return None
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(target)],
        capture_output=True, text=True,
    )
    try:
        return int(float(result.stdout.strip()) * 1000)
    except (TypeError, ValueError):
        return None


def _name(stem: str, suffix: str = "mp3") -> str:
    extension = suffix if suffix.startswith(".") else f".{suffix}"
    return (f"{say.slugify(stem) or 'audio'}-{datetime.now():%Y%m%d-%H%M%S-%f}-"
            f"{uuid4().hex[:8]}{extension.lower()}")


def _sequence(parts: list[dict], target: Path) -> tuple[list[dict], str]:
    if not shutil.which("ffmpeg"):
        raise RenderError("FFmpeg is not installed.")
    command = ["ffmpeg", "-y", "-nostdin", "-loglevel", "error"]
    manifest: list[dict] = []
    root = _output()
    for index, part in enumerate(parts):
        if part.get("kind") == "silence":
            seconds = max(.1, min(120.0, float(part.get("title") or 1)))
            command.extend(["-f", "lavfi", "-i",
                            f"anullsrc=r=48000:cl=stereo:d={seconds:.3f}"])
            manifest.append({"position": index, "part_id": part.get("id"),
                             "kind": "silence", "seconds": seconds})
            continue
        source = (root / Path(part.get("filename") or "").name).resolve()
        if not source.is_file() or root not in source.parents:
            raise RenderError(f"Part {index + 1} is missing its audio file.")
        command.extend(["-i", str(source)])
        manifest.append({"position": index, "part_id": part.get("id"),
                         "kind": part.get("kind") or "audio",
                         "filename": source.name, "asset_of": part.get("asset_of")})
    normalized = [
        f"[{index}:a:0]aformat=sample_fmts=fltp:sample_rates=48000:"
        f"channel_layouts=stereo,aresample=48000:async=1:first_pts=0,"
        f"asetpts=N/SR/TB[a{index}]" for index in range(len(parts))]
    labels = "".join(f"[a{index}]" for index in range(len(parts)))
    filters = ";".join(normalized + [f"{labels}concat=n={len(parts)}:v=0:a=1[out]"])
    temporary = target.with_name(f".{target.stem}-{uuid4().hex}.tmp.mp3")
    command.extend(["-filter_complex", filters, "-map", "[out]", "-vn",
                    "-c:a", "libmp3lame", "-b:a", "192k", str(temporary)])
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired) as exc:
        temporary.unlink(missing_ok=True)
        raise RenderError(f"Audio finishing failed: {exc}") from exc
    if result.returncode or not temporary.is_file() or temporary.stat().st_size <= 0:
        temporary.unlink(missing_ok=True)
        detail = (result.stderr or "FFmpeg produced no audio").strip().splitlines()[-1]
        raise RenderError(f"Audio finishing failed: {detail[:300]}")
    os.replace(temporary, target)
    return manifest, "ffmpeg-normalized-v1"


def _mix(voice: Path, music: Path, values: dict, target: Path) -> None:
    seconds = (_measure(voice) or 0) / 1000
    if seconds <= 0:
        raise RenderError("The voice timeline has no measurable duration.")
    legacy_level = MUSIC_LEVELS.get(values.get("level"), MUSIC_LEVELS["discreet"])
    level = max(0.0, min(1.0, float(values.get("volume")
                                    if values.get("volume") is not None else legacy_level)))
    start = max(0.0, float(values.get("start") or 0))
    fade_in = max(0.0, float(values.get("fade_in") or 0))
    fade_out = max(0.0, float(values.get("fade_out") or 0))
    bed = [f"atrim=start={start:.3f}:duration={seconds:.3f}", "asetpts=N/SR/TB",
           f"volume={level:.3f}"]
    if fade_in:
        bed.append(f"afade=t=in:st=0:d={fade_in:g}")
    if fade_out and seconds > fade_out:
        bed.append(f"afade=t=out:st={seconds - fade_out:.3f}:d={fade_out:g}")
    chain = f"[1:a]{','.join(bed)}[bed];"
    if values.get("duck", True):
        chain += ("[bed][0:a]sidechaincompress=threshold=0.015:ratio=20:"
                  "attack=20:release=450:makeup=1[under];")
        mixed = "[under]"
    else:
        mixed = "[bed]"
    chain += (f"{mixed}[0:a]amix=inputs=2:duration=first:dropout_transition=0:"
              "normalize=0[out]")
    result = subprocess.run(
        ["ffmpeg", "-y", "-nostdin", "-loglevel", "error", "-i", str(voice),
         "-stream_loop", "-1", "-i", str(music), "-filter_complex", chain,
         "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", str(target)],
        capture_output=True, timeout=300,
    )
    if result.returncode or not target.is_file() or target.stat().st_size <= 0:
        target.unlink(missing_ok=True)
        raise RenderError("The background music could not be mixed.")


def _parts(production_id: int) -> tuple[dict, list[dict], list[dict]]:
    production = work_repository.production_get(production_id)
    if not production:
        raise RenderError("That Production does not exist.")
    everything = document_repository.parts(production_id)
    drafts = [part for part in everything if part["kind"] == "draft"]
    parts = [part for part in everything if part["kind"] not in ("stitch", "draft")]
    if not parts:
        raise RenderError("Nothing recorded in this Production yet.")
    broken = [index + 1 for index, part in enumerate(parts) if part.get("missing")]
    if broken:
        raise RenderError("Linked audio is missing from part" +
                          ("s " if len(broken) > 1 else " ") + ", ".join(map(str, broken)) + ".")
    return production, parts, drafts


def preview(production_id: int) -> dict:
    _, parts, drafts = _parts(production_id)
    music = document_repository.music(production_id)
    signature = {
        "renderer": "production-preview-v1",
        "parts": [{key: part.get(key) for key in
                   ("id", "kind", "title", "filename", "duration_ms", "asset_version_id")}
                  for part in parts],
        "music": {key: music.get(key) for key in
                  ("music_of", "filename", "duration_ms", "volume", "start",
                   "fade_in", "fade_out", "duck")},
    }
    digest = hashlib.sha256(json.dumps(signature, sort_keys=True, default=str).encode()).hexdigest()[:20]
    name = f"preview-{production_id}-{digest}.mp3"
    target = _output() / name
    cached = target.is_file() and target.stat().st_size > 0
    if not cached:
        voice = _output() / f".preview-{production_id}-{uuid4().hex}-voice.mp3"
        try:
            _sequence(parts, voice)
            if music.get("filename"):
                source = (_output() / Path(music["filename"]).name).resolve()
                if not source.is_file() or _output() not in source.parents:
                    raise RenderError("The selected background music file is missing.")
                _mix(voice, source, music, target)
                voice.unlink(missing_ok=True)
            else:
                os.replace(voice, target)
        except Exception:
            voice.unlink(missing_ok=True)
            target.unlink(missing_ok=True)
            raise
        for old in _output().glob(f"preview-{production_id}-*.mp3"):
            if old != target:
                old.unlink(missing_ok=True)
    return {"url": f"/audio/{quote(name)}", "name": name,
            "duration_ms": _measure(target), "parts": len(parts),
            "music": bool(music.get("filename")), "cached": cached,
            "skipped_drafts": len(drafts)}


def _subtitles(parts: list[dict]) -> dict:
    cues, missing, stale, offset = [], [], [], 0
    for number, part in enumerate(parts, 1):
        if part["kind"] == "silence":
            offset += int(float(part["title"] or 1) * 1000)
            continue
        length = part.get("duration_ms") or _measure(_output() / (part.get("filename") or "")) or 0
        found = transcript_repository.source_for_generation(part["id"])
        if not found or not found.get("sentences"):
            missing.append(number)
        else:
            if found.get("stale"):
                stale.append(number)
            for cue in captions.build_cues(found["sentences"], "standard"):
                cues.append({**cue, "start": cue["start"] + offset,
                             "end": cue["end"] + offset})
        offset += length
    return {"cues": len(cues), "missing": missing, "stale": stale,
            "srt": captions.render_srt(cues) if cues else "",
            "vtt": captions.render_vtt(cues) if cues else ""}


def export(production_id: int) -> dict:
    production, parts, drafts = _parts(production_id)
    if drafts:
        raise RenderError(f"{len(drafts)} Part{'s are' if len(drafts) > 1 else ' is'} still a Draft.")
    subtitles = _subtitles(parts)
    name = _name(f"{production['name']}-full")
    target = _output() / name
    manifest_parts, renderer = _sequence(parts, target)
    music = document_repository.music(production_id)
    mixed = False
    manifest_path = None
    caption_paths: list[Path] = []
    try:
        if music.get("filename"):
            source = (_output() / Path(music["filename"]).name).resolve()
            if not source.is_file() or _output() not in source.parents:
                raise RenderError("The selected background music file is missing.")
            blended = _output() / _name(f"{target.stem}-mixed")
            _mix(target, source, music, blended)
            os.replace(blended, target)
            mixed = True
        size = target.stat().st_size
        duration = _measure(target)
        manifest = {
            "version": 1, "production_id": production_id,
            "production_name": production["name"], "parts": manifest_parts,
            "background": ({key: music.get(key) for key in
                            ("music_of", "filename", "level", "volume", "start",
                             "fade_in", "fade_out", "duck")} if mixed else None),
            "output": {"filename": name, "codec": "mp3", "bitrate": "192k",
                       "sample_rate": 48000, "channels": 2},
            "renderer": renderer, "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        manifest_path = _output() / f"{target.stem}.manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        if subtitles["srt"]:
            caption_paths = [_output() / f"{target.stem}.srt",
                             _output() / f"{target.stem}.vtt"]
            caption_paths[0].write_text(subtitles["srt"], encoding="utf-8")
            caption_paths[1].write_text(subtitles["vtt"], encoding="utf-8")
        recorded = export_repository.create(
            production_id, filename=name, path=str(target), manifest=manifest,
            renderer=renderer, duration_ms=duration, size_bytes=size,
            part_count=len(parts),
        )
        if not recorded:
            raise RenderError("The finished Export could not be recorded.")
        return {"url": f"/audio/{name}", "name": name,
                "size_mb": round(size / 1_000_000, 2), "parts": len(parts),
                "subtitles": subtitles["cues"], "missing_subtitles": subtitles["missing"],
                "stale_subtitles": subtitles["stale"], "music": mixed,
                "manifest": manifest_path.name,
                "export_id": recorded["export_id"],
                "srt_url": f"/audio/{target.stem}.srt" if subtitles["srt"] else None}
    except Exception:
        target.unlink(missing_ok=True)
        if manifest_path:
            manifest_path.unlink(missing_ok=True)
        for caption_path in caption_paths:
            caption_path.unlink(missing_ok=True)
        raise


def handle_job(job, _repository) -> dict:
    production_id = int(job.payload["production_id"])
    return preview(production_id) if job.payload["operation"] == "preview" else export(production_id)
