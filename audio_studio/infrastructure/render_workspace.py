"""FFmpeg and filesystem implementation for Production finishing."""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import quote, unquote, urlparse
from uuid import uuid4

from audio_studio.domain import speech_text
from audio_studio.domain.rendering import (
    FinishedExport,
    RenderError,
    silence_duration_seconds,
)
from audio_studio.infrastructure.media_paths import media_root


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
            seconds = silence_duration_seconds(part)
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


def _sound_clips(scene: dict) -> list[tuple[dict, dict]]:
    return [
        (track, clip)
        for track in scene.get("tracks", [])
        if not track.get("muted")
        for clip in track.get("clips", [])
        if (not clip.get("orphan") and not clip.get("missing")
            and int(clip.get("resolved_duration_ms") or 0) > 0)
    ]


def _mix_scene(voice: Path, scene: dict, target: Path) -> bool:
    """Render the same resolved Sound Scene used by browser playout."""
    clips = _sound_clips(scene)
    if not clips:
        shutil.copyfile(voice, target)
        return False
    root = _output()
    command = [
        "ffmpeg", "-y", "-nostdin", "-loglevel", "error", "-i",
        str(voice),
    ]
    scene_duration = max(
        .001,
        float(scene.get("voice_projection", {}).get("duration_ms") or
              _measure(voice) or 1) / 1000,
    )
    for _, clip in clips:
        source = (root / Path(clip.get("filename") or "").name).resolve()
        if source.parent != root or not source.is_file():
            raise RenderError("A Sound Scene source file is missing.")
        if clip.get("loop"):
            command.extend(["-stream_loop", "-1"])
        command.extend(["-i", str(source)])
    filters = [
        "[0:a]aformat=sample_fmts=fltp:sample_rates=48000:"
        "channel_layouts=stereo,aresample=48000:async=1:first_pts=0,"
        "asetpts=N/SR/TB,apad[voicebase]",
    ]
    labels: list[str] = []
    ducking = False
    for index, (_, clip) in enumerate(clips, 1):
        duration = int(clip["resolved_duration_ms"]) / 1000
        offset = int(clip.get("source_offset_ms") or 0) / 1000
        start_ms = max(0, int(clip.get("resolved_start_ms") or 0))
        gain = max(0, min(2, float(clip.get("gain", 1))))
        fade_in = min(duration, int(clip.get("fade_in_ms") or 0) / 1000)
        fade_out = min(duration, int(clip.get("fade_out_ms") or 0) / 1000)
        chain = [
            "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo",
            f"atrim=start={offset:.3f}:duration={duration:.3f}",
            "asetpts=PTS-STARTPTS", f"volume={gain:.4f}",
        ]
        if fade_in:
            chain.append(f"afade=t=in:st=0:d={fade_in:.3f}")
        if fade_out and duration > fade_out:
            chain.append(
                f"afade=t=out:st={duration - fade_out:.3f}:d={fade_out:.3f}")
        chain.append(f"adelay={start_ms}|{start_ms}")
        label = f"scene{index}"
        filters.append(f"[{index}:a]{','.join(chain)}[{label}]")
        labels.append(f"[{label}]")
        ducking = ducking or bool(clip.get("ducking"))
    if len(labels) == 1:
        sound_label = labels[0]
    else:
        filters.append(
            f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:"
            "dropout_transition=0:normalize=0[scene]"
        )
        sound_label = "[scene]"
    if ducking:
        filters.append("[voicebase]asplit=2[voice][sidechain]")
        filters.append(
            f"{sound_label}[sidechain]sidechaincompress=threshold=0.015:ratio=20:"
            "attack=20:release=450:makeup=1[under]"
        )
        sound_label = "[under]"
    else:
        filters.append("[voicebase]anull[voice]")
    filters.append(
        f"{sound_label}[voice]amix=inputs=2:duration=first:"
        f"dropout_transition=0:normalize=0,apad,atrim=duration={scene_duration:.3f},"
        "alimiter=limit=0.98[out]"
    )
    command.extend([
        "-filter_complex", ";".join(filters), "-map", "[out]", "-vn",
        "-ar", "48000", "-ac", "2", "-c:a", "libmp3lame", "-b:a",
        "192k", str(target),
    ])
    try:
        result = subprocess.run(command, capture_output=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired) as exc:
        target.unlink(missing_ok=True)
        raise RenderError(f"Sound Scene rendering failed: {exc}") from exc
    if result.returncode or not target.is_file() or target.stat().st_size <= 0:
        target.unlink(missing_ok=True)
        detail = result.stderr.decode(errors="replace").strip().splitlines()
        raise RenderError(
            f"Sound Scene rendering failed: {(detail[-1] if detail else 'no audio')[:300]}")
    return True


class FFmpegRenderWorkspace:
    def voice_stem(
        self, production_id: int, parts: list[dict], signature: str,
    ) -> dict:
        """Cache one normalized serial Sequence file for browser playout."""
        if not parts:
            return {
                "url": "", "filename": "", "duration_ms": 0,
                "signature": signature, "cached": True,
            }
        digest = str(signature)[:20]
        name = f"voice-stem-{production_id}-{digest}.mp3"
        target = _output() / name
        cached = target.is_file() and target.stat().st_size > 0
        if not cached:
            _sequence(parts, target)
            for old in _output().glob(f"voice-stem-{production_id}-*.mp3"):
                if old != target:
                    old.unlink(missing_ok=True)
        return {
            "url": f"/audio/{quote(name)}", "filename": name,
            "duration_ms": _measure(target) or 0,
            "signature": signature, "cached": cached,
        }

    def render_project(self, project: dict) -> dict:
        """Render a lightweight Tracks/Clips scene without a database Job."""
        tracks = project.get("tracks") or []
        entries = [
            (track, clip)
            for track in tracks
            for clip in (track.get("clips") or [])
        ]
        if not entries:
            raise RenderError("The Project has no Clips to render.")
        signature = json.dumps(project, sort_keys=True, default=str)
        digest = hashlib.sha256(signature.encode()).hexdigest()[:20]
        filename = f"project-{digest}.mp3"
        target = _output() / filename
        if target.is_file() and target.stat().st_size > 0:
            return self._project_result(project, target, cached=True)

        command = ["ffmpeg", "-y", "-nostdin", "-loglevel", "error"]
        sources: list[tuple[dict, dict, float]] = []
        for track, clip in entries:
            duration = max(.01, float(clip.get("duration") or 0))
            file_url = str(clip.get("file_url") or "")
            if file_url.startswith("silence://"):
                command.extend([
                    "-f", "lavfi", "-i",
                    f"anullsrc=r=48000:cl=stereo:d={duration:.3f}",
                ])
            else:
                parsed = urlparse(file_url)
                if parsed.scheme or not parsed.path.startswith("/audio/"):
                    raise RenderError(
                        "Project Clips must use a local /audio/ file URL.")
                source = (_output() / Path(unquote(parsed.path)).name).resolve()
                if source.parent != _output() or not source.is_file():
                    raise RenderError("A Project Clip audio file is unavailable.")
                if track.get("loop"):
                    command.extend(["-stream_loop", "-1"])
                command.extend(["-i", str(source)])
            sources.append((track, clip, duration))

        filters = []
        labels = []
        for index, (track, clip, duration) in enumerate(sources):
            start_ms = max(0, round(float(clip.get("start_time") or 0) * 1000))
            offset = max(0, float(track.get("source_offset") or 0))
            volume_value = track.get("volume")
            volume = max(0, min(2, float(
                1 if volume_value is None else volume_value)))
            label = f"clip{index}"
            filters.append(
                f"[{index}:a]aformat=sample_fmts=fltp:sample_rates=48000:"
                f"channel_layouts=stereo,atrim=start={offset:.3f}:"
                f"duration={duration:.3f},asetpts=PTS-STARTPTS,"
                f"volume={volume:.4f},adelay={start_ms}|{start_ms}[{label}]"
            )
            labels.append(f"[{label}]")
        filters.append(
            f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:"
            "dropout_transition=0:normalize=0,alimiter=limit=0.98[out]"
        )
        temporary = target.with_name(f".{target.stem}-{uuid4().hex}.tmp.mp3")
        command.extend([
            "-filter_complex", ";".join(filters), "-map", "[out]", "-vn",
            "-ar", "48000", "-ac", "2", "-c:a", "libmp3lame", "-b:a",
            "192k", str(temporary),
        ])
        try:
            done = subprocess.run(command, capture_output=True, timeout=600)
        except (OSError, subprocess.TimeoutExpired) as exc:
            temporary.unlink(missing_ok=True)
            raise RenderError(f"Project rendering failed: {exc}") from exc
        if done.returncode or not temporary.is_file() or temporary.stat().st_size <= 0:
            temporary.unlink(missing_ok=True)
            detail = done.stderr.decode(errors="replace").strip().splitlines()
            raise RenderError(
                f"Project rendering failed: {(detail[-1] if detail else 'no audio')[:300]}")
        os.replace(temporary, target)
        return self._project_result(project, target, cached=False)

    @staticmethod
    def _project_result(project: dict, target: Path, *, cached: bool) -> dict:
        return {
            "url": f"/audio/{quote(target.name)}",
            "name": target.name,
            "duration_ms": _measure(target),
            "tracks": len(project.get("tracks") or []),
            "clips": sum(len(track.get("clips") or [])
                         for track in (project.get("tracks") or [])),
            "sample_rate": 48_000,
            "channels": 2,
            "cached": cached,
        }

    def duration_for_part(self, part: dict) -> int:
        filename = Path(str(part.get("filename") or "")).name
        return _measure(_output() / filename) or 0

    def preview(
        self, production_id: int, parts: list[dict], scene: dict,
        *, skipped_drafts: int,
    ) -> dict:
        signature = {
            "renderer": "sound-scene-preview-v1",
            "resolution": scene.get("signature"),
        }
        digest = hashlib.sha256(json.dumps(
            signature, sort_keys=True, default=str).encode()).hexdigest()[:20]
        name = f"preview-{production_id}-{digest}.mp3"
        target = _output() / name
        cached = target.is_file() and target.stat().st_size > 0
        if not cached:
            voice_data = self.voice_stem(
                production_id, parts,
                scene.get("voice_projection", {}).get("signature", ""),
            )
            voice = _output() / Path(voice_data["filename"]).name
            try:
                _mix_scene(voice, scene, target)
            except Exception:
                target.unlink(missing_ok=True)
                raise
            for old in _output().glob(f"preview-{production_id}-*.mp3"):
                if old != target:
                    old.unlink(missing_ok=True)
        return {
            "url": f"/audio/{quote(name)}", "name": name,
            "duration_ms": _measure(target), "parts": len(parts),
            "music": any(
                track.get("kind") == "music" and track.get("clips")
                and not track.get("muted")
                for track in scene.get("tracks", [])
            ), "cached": cached,
            "skipped_drafts": skipped_drafts,
            "sound_scene_signature": scene.get("signature"),
        }

    def finish_export(
        self, production_id: int, production_name: str, parts: list[dict],
        scene: dict, subtitles: dict,
    ) -> FinishedExport:
        name = _name(f"{production_name}-full")
        target = _output() / name
        manifest_path = _output() / f"{target.stem}.manifest.json"
        caption_paths: tuple[Path, ...] = ()
        blended: Path | None = None
        try:
            voice_data = self.voice_stem(
                production_id, parts,
                scene.get("voice_projection", {}).get("signature", ""),
            )
            voice = _output() / Path(voice_data["filename"]).name
            manifest_parts = [
                {
                    "position": index,
                    "part_id": span.get("part_id"),
                    "kind": span.get("kind"),
                    "filename": span.get("filename") or None,
                    "seconds": (span.get("duration_ms") or 0) / 1000,
                }
                for index, span in enumerate(
                    scene.get("voice_projection", {}).get("spans", []))
            ]
            mixed = _mix_scene(voice, scene, target)
            renderer = "ffmpeg-sound-scene-v1"
            size = target.stat().st_size
            duration = _measure(target)
            manifest = {
                "version": 1, "production_id": production_id,
                "production_name": production_name, "parts": manifest_parts,
                "sound_scene": {
                    "signature": scene.get("signature"),
                    "tracks": scene.get("tracks", []),
                    "orphans": scene.get("orphans", []),
                },
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
