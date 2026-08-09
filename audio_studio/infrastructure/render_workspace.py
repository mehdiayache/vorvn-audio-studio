"""FFmpeg and filesystem implementation for Production finishing."""

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

from audio_studio.domain import speech_text
from audio_studio.domain.rendering import FinishedExport, RenderError
from audio_studio.infrastructure.media_paths import media_root
from audio_studio.infrastructure.postgres.production_document import MUSIC_LEVELS


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
    return (f"{speech_text.slugify(stem)}-{datetime.now():%Y%m%d-%H%M%S-%f}-"
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
                         "filename": source.name,
                         "asset_of": part.get("asset_of")})
    normalized = [
        f"[{index}:a:0]aformat=sample_fmts=fltp:sample_rates=48000:"
        f"channel_layouts=stereo,aresample=48000:async=1:first_pts=0,"
        f"asetpts=N/SR/TB[a{index}]" for index in range(len(parts))]
    labels = "".join(f"[a{index}]" for index in range(len(parts)))
    filters = ";".join(
        normalized + [f"{labels}concat=n={len(parts)}:v=0:a=1[out]"])
    temporary = target.with_name(f".{target.stem}-{uuid4().hex}.tmp.mp3")
    command.extend(["-filter_complex", filters, "-map", "[out]", "-vn",
                    "-c:a", "libmp3lame", "-b:a", "192k", str(temporary)])
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired) as exc:
        temporary.unlink(missing_ok=True)
        raise RenderError(f"Audio finishing failed: {exc}") from exc
    if (result.returncode or not temporary.is_file()
            or temporary.stat().st_size <= 0):
        temporary.unlink(missing_ok=True)
        detail = (result.stderr or "FFmpeg produced no audio").strip().splitlines()[-1]
        raise RenderError(f"Audio finishing failed: {detail[:300]}")
    os.replace(temporary, target)
    return manifest, "ffmpeg-normalized-v1"


def _mix(voice: Path, music: Path, values: dict, target: Path) -> None:
    seconds = (_measure(voice) or 0) / 1000
    if seconds <= 0:
        raise RenderError("The voice timeline has no measurable duration.")
    legacy_level = MUSIC_LEVELS.get(
        values.get("level"), MUSIC_LEVELS["discreet"])
    level = max(0.0, min(1.0, float(
        values.get("volume")
        if values.get("volume") is not None else legacy_level)))
    start = max(0.0, float(values.get("start") or 0))
    fade_in = max(0.0, float(values.get("fade_in") or 0))
    fade_out = max(0.0, float(values.get("fade_out") or 0))
    bed = [f"atrim=start={start:.3f}:duration={seconds:.3f}",
           "asetpts=N/SR/TB", f"volume={level:.3f}"]
    if fade_in:
        bed.append(f"afade=t=in:st=0:d={fade_in:g}")
    if fade_out and seconds > fade_out:
        bed.append(
            f"afade=t=out:st={seconds - fade_out:.3f}:d={fade_out:g}")
    chain = f"[1:a]{','.join(bed)}[bed];"
    if values.get("duck", True):
        chain += ("[bed][0:a]sidechaincompress=threshold=0.015:ratio=20:"
                  "attack=20:release=450:makeup=1[under];")
        mixed = "[under]"
    else:
        mixed = "[bed]"
    chain += (f"{mixed}[0:a]amix=inputs=2:duration=first:"
              "dropout_transition=0:normalize=0[out]")
    result = subprocess.run(
        ["ffmpeg", "-y", "-nostdin", "-loglevel", "error", "-i",
         str(voice), "-stream_loop", "-1", "-i", str(music),
         "-filter_complex", chain, "-map", "[out]", "-c:a", "libmp3lame",
         "-b:a", "192k", str(target)],
        capture_output=True, timeout=300,
    )
    if result.returncode or not target.is_file() or target.stat().st_size <= 0:
        target.unlink(missing_ok=True)
        raise RenderError("The background music could not be mixed.")


class FFmpegRenderWorkspace:
    def duration_for_part(self, part: dict) -> int:
        filename = Path(str(part.get("filename") or "")).name
        return _measure(_output() / filename) or 0

    def preview(
        self, production_id: int, parts: list[dict], music: dict,
        *, skipped_drafts: int,
    ) -> dict:
        signature = {
            "renderer": "production-preview-v1",
            "parts": [{key: part.get(key) for key in
                       ("id", "kind", "title", "filename", "duration_ms",
                        "asset_version_id")} for part in parts],
            "music": {key: music.get(key) for key in
                      ("music_of", "filename", "duration_ms", "volume",
                       "start", "fade_in", "fade_out", "duck")},
        }
        digest = hashlib.sha256(json.dumps(
            signature, sort_keys=True, default=str).encode()).hexdigest()[:20]
        name = f"preview-{production_id}-{digest}.mp3"
        target = _output() / name
        cached = target.is_file() and target.stat().st_size > 0
        if not cached:
            voice = _output() / (
                f".preview-{production_id}-{uuid4().hex}-voice.mp3")
            try:
                _sequence(parts, voice)
                if music.get("filename"):
                    source = (_output() / Path(music["filename"]).name).resolve()
                    if not source.is_file() or _output() not in source.parents:
                        raise RenderError(
                            "The selected background music file is missing.")
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
        return {
            "url": f"/audio/{quote(name)}", "name": name,
            "duration_ms": _measure(target), "parts": len(parts),
            "music": bool(music.get("filename")), "cached": cached,
            "skipped_drafts": skipped_drafts,
        }

    def finish_export(
        self, production_id: int, production_name: str, parts: list[dict],
        music: dict, subtitles: dict,
    ) -> FinishedExport:
        name = _name(f"{production_name}-full")
        target = _output() / name
        manifest_path = _output() / f"{target.stem}.manifest.json"
        caption_paths: tuple[Path, ...] = ()
        blended: Path | None = None
        try:
            manifest_parts, renderer = _sequence(parts, target)
            mixed = False
            if music.get("filename"):
                source = (_output() / Path(music["filename"]).name).resolve()
                if not source.is_file() or _output() not in source.parents:
                    raise RenderError(
                        "The selected background music file is missing.")
                blended = _output() / _name(f"{target.stem}-mixed")
                _mix(target, source, music, blended)
                os.replace(blended, target)
                blended = None
                mixed = True
            size = target.stat().st_size
            duration = _measure(target)
            manifest = {
                "version": 1, "production_id": production_id,
                "production_name": production_name, "parts": manifest_parts,
                "background": ({key: music.get(key) for key in
                                ("music_of", "filename", "level", "volume",
                                 "start", "fade_in", "fade_out", "duck")}
                               if mixed else None),
                "output": {"filename": name, "codec": "mp3",
                           "bitrate": "192k", "sample_rate": 48000,
                           "channels": 2},
                "renderer": renderer,
                "created_at": datetime.now().isoformat(timespec="seconds"),
            }
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2),
                encoding="utf-8")
            if subtitles["srt"]:
                caption_paths = (
                    _output() / f"{target.stem}.srt",
                    _output() / f"{target.stem}.vtt",
                )
                caption_paths[0].write_text(subtitles["srt"], encoding="utf-8")
                caption_paths[1].write_text(subtitles["vtt"], encoding="utf-8")
            return FinishedExport(
                target=target, manifest_path=manifest_path,
                caption_paths=caption_paths, filename=name, manifest=manifest,
                renderer=renderer, duration_ms=duration, size_bytes=size,
                part_count=len(parts), subtitles=subtitles, mixed=mixed,
            )
        except Exception:
            target.unlink(missing_ok=True)
            manifest_path.unlink(missing_ok=True)
            if blended:
                blended.unlink(missing_ok=True)
            for path in caption_paths:
                path.unlink(missing_ok=True)
            raise

    @staticmethod
    def discard_export(artifact: FinishedExport) -> None:
        artifact.target.unlink(missing_ok=True)
        artifact.manifest_path.unlink(missing_ok=True)
        for path in artifact.caption_paths:
            path.unlink(missing_ok=True)
