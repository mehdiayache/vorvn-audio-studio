"""FFmpeg and filesystem implementation for Production finishing."""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import quote, unquote, urlparse
from uuid import uuid4

from audio_studio.domain import speech_text
from audio_studio.domain.sound_scene import effect_tail_ms
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
        if not track.get("muted") and float(track.get("volume", 1)) > 0
        for clip in track.get("clips", [])
        if (not clip.get("orphan") and not clip.get("missing")
            and not clip.get("muted") and float(clip.get("gain", 1)) > 0
            and int(clip.get("resolved_duration_ms") or 0) > 0)
    ]


def _needs_sequence_processing(scene: dict) -> bool:
    for span in scene.get("sequence_projection", {}).get("spans", []):
        mix = span.get("mix") or {}
        if (mix.get("muted") or float(mix.get("gain", 1)) != 1
                or int(mix.get("fade_in_ms") or 0)
                or int(mix.get("fade_out_ms") or 0)
                or any(effect.get("enabled", True)
                       for effect in mix.get("effects", []))):
            return True
    return False


def _append_effects(
    filters: list[str], source: str, effects: list[dict], prefix: str,
) -> str:
    """Build a serial effect chain while keeping echo on stable wet/dry buses."""
    current = source
    for index, effect in enumerate(effects):
        if not effect.get("enabled", True):
            continue
        output = f"{prefix}fx{index}"
        if effect.get("type") == "telephone":
            filters.append(
                f"{current}highpass=f=300:p=2,lowpass=f=3400:p=2[{output}]"
            )
            current = f"[{output}]"
            continue
        if effect.get("type") != "echo":
            continue
        delay_ms = max(50, min(1_000, int(effect.get("delay_ms") or 180)))
        feedback = max(0, min(.85, float(effect.get("feedback") or 0)))
        mix = max(0, min(1, float(effect.get("mix") or 0)))
        tail_ms = effect_tail_ms([effect])
        if mix <= 0 or tail_ms <= 0:
            continue
        repeats = max(1, tail_ms // delay_ms)
        delays = "|".join(str(delay_ms * repeat)
                          for repeat in range(1, repeats + 1))
        # aecho's first delayed tap is the wet signal itself. Feedback starts
        # affecting only the taps after that first hit.
        decays = "|".join(f"{feedback ** repeat:.6f}"
                          for repeat in range(repeats))
        dry_input = f"{prefix}dryin{index}"
        echo_input = f"{prefix}echoin{index}"
        dry = f"{prefix}dry{index}"
        echo = f"{prefix}echo{index}"
        filters.extend([
            f"{current}asplit=2[{dry_input}][{echo_input}]",
            f"[{dry_input}]volume={1 - mix:.6f}[{dry}]",
            # aecho includes ``input * in_gain`` in its output. This branch is
            # wet-only, so keep the delayed taps while removing that duplicate
            # direct contribution. The sibling branch owns the entire dry mix.
            f"[{echo_input}]aecho=0:1:{delays}:{decays},"
            f"volume={mix:.6f}[{echo}]",
            f"[{dry}][{echo}]amix=inputs=2:duration=longest:"
            f"dropout_transition=0:normalize=0[{output}]",
        ])
        current = f"[{output}]"
    return current


def _append_sequence_filters(
    filters: list[str], scene: dict, *, include_detector: bool,
) -> str:
    normalize = (
        "aformat=sample_fmts=fltp:sample_rates=48000:"
        "channel_layouts=stereo,aresample=48000"
    )
    spans = scene.get("sequence_projection", {}).get("spans", [])
    if not spans or not _needs_sequence_processing(scene):
        base = f"[0:a]{normalize},asetpts=PTS-STARTPTS"
        if include_detector:
            filters.append(f"{base},asplit=2[sequencebase][sequencedetector]")
        else:
            filters.append(f"{base}[sequencebase]")
        return "[sequencebase]"

    filters.append(f"[0:a]{normalize}[sequenceraw]")
    if len(spans) == 1:
        span_inputs = ["[sequenceraw]"]
    else:
        labels = [f"sequencein{index}" for index in range(len(spans))]
        filters.append(
            f"[sequenceraw]asplit={len(spans)}"
            + "".join(f"[{label}]" for label in labels)
        )
        span_inputs = [f"[{label}]" for label in labels]

    span_outputs: list[str] = []
    detector_outputs: list[str] = []
    for index, (source, span) in enumerate(zip(span_inputs, spans)):
        start = max(0, int(span.get("start_ms") or 0)) / 1000
        duration = max(0, int(span.get("duration_ms") or 0)) / 1000
        mix = span.get("mix") or {}
        muted = bool(mix.get("muted"))
        gain = 0 if muted else max(0, min(2, float(mix.get("gain", 1))))
        fade_in = min(duration, int(mix.get("fade_in_ms") or 0) / 1000)
        fade_out = min(duration, int(mix.get("fade_out_ms") or 0) / 1000)
        base = f"sequencepart{index}"
        chain = [
            f"atrim=start={start:.3f}:duration={duration:.3f}",
            "asetpts=PTS-STARTPTS", f"volume={gain:.4f}",
        ]
        if fade_in:
            chain.append(f"afade=t=in:st=0:d={fade_in:.3f}")
        if fade_out and duration > fade_out:
            chain.append(
                f"afade=t=out:st={duration - fade_out:.3f}:d={fade_out:.3f}"
            )
        start_ms = max(0, int(span.get("start_ms") or 0))
        chain.append(f"adelay={start_ms}|{start_ms}")
        filters.append(f"{source}{','.join(chain)}[{base}]")
        processed = f"[{base}]"
        if include_detector:
            detector = f"sequencedetectorpart{index}"
            effect_input = f"sequenceeffectpart{index}"
            filters.append(
                f"[{base}]asplit=2[{effect_input}][{detector}]"
            )
            processed = f"[{effect_input}]"
            detector_outputs.append(f"[{detector}]")
        if not muted and gain > 0:
            processed = _append_effects(
                filters, processed, mix.get("effects", []), f"seq{index}"
            )
        output = f"sequencepartout{index}"
        filters.append(f"{processed}anull[{output}]")
        span_outputs.append(f"[{output}]")
    if len(span_outputs) == 1:
        filters.append(f"{span_outputs[0]}anull[sequencebase]")
    else:
        filters.append(
            f"{''.join(span_outputs)}amix=inputs={len(span_outputs)}:"
            "duration=longest:dropout_transition=0:normalize=0[sequencebase]"
        )
    if include_detector:
        if len(detector_outputs) == 1:
            filters.append(f"{detector_outputs[0]}anull[sequencedetector]")
        else:
            filters.append(
                f"{''.join(detector_outputs)}amix=inputs={len(detector_outputs)}:"
                "duration=longest:dropout_transition=0:normalize=0[sequencedetector]"
            )
    return "[sequencebase]"


def _mix_scene(sequence: Path, scene: dict, target: Path) -> bool:
    """Render the same resolved Sound Scene used by browser playout."""
    clips = _sound_clips(scene)
    sequence_processing = _needs_sequence_processing(scene)
    if not clips and not sequence_processing:
        shutil.copyfile(sequence, target)
        return False
    root = _output()
    command = [
        "ffmpeg", "-y", "-nostdin", "-loglevel", "error", "-i",
        str(sequence),
    ]
    scene_duration = max(
        .001,
        float(scene.get("duration_ms") or
              scene.get("sequence_projection", {}).get("duration_ms") or
              _measure(sequence) or 1) / 1000,
    )
    for _, clip in clips:
        source = (root / Path(clip.get("filename") or "").name).resolve()
        if source.parent != root or not source.is_file():
            raise RenderError("A Sound Scene source file is missing.")
        if clip.get("loop"):
            command.extend(["-stream_loop", "-1"])
        command.extend(["-i", str(source)])
    filters: list[str] = []
    include_detector = any(clip.get("ducking") for _, clip in clips)
    _append_sequence_filters(
        filters, scene, include_detector=include_detector,
    )
    ducked_labels: dict[float, list[str]] = {}
    dry_labels: list[str] = []
    for index, (track, clip) in enumerate(clips, 1):
        duration = int(clip["resolved_duration_ms"]) / 1000
        offset = int(clip.get("source_offset_ms") or 0) / 1000
        start_ms = max(0, int(clip.get("resolved_start_ms") or 0))
        track_volume = max(0, min(2, float(track.get("volume", 1))))
        clip_gain = max(0, min(2, float(clip.get("gain", 1))))
        gain = track_volume * clip_gain
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
        base = f"scenebase{index}"
        filters.append(f"[{index}:a]{','.join(chain)}[{base}]")
        processed = _append_effects(
            filters, f"[{base}]", clip.get("effects", []), f"clip{index}"
        )
        label = f"scene{index}"
        filters.append(f"{processed}anull[{label}]")
        if clip.get("ducking"):
            amount_db = max(-30, min(0, float(
                clip.get("duck_amount_db", -12))))
            ducked_labels.setdefault(amount_db, []).append(f"[{label}]")
        else:
            dry_labels.append(f"[{label}]")

    def mix_group(labels: list[str], name: str) -> str | None:
        if not labels:
            return None
        if len(labels) == 1:
            return labels[0]
        filters.append(
            f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:"
            f"dropout_transition=0:normalize=0[{name}]"
        )
        return f"[{name}]"

    dry_label = mix_group(dry_labels, "dry")
    sound_labels: list[str] = []
    if ducked_labels:
        filters.append("[sequencebase]anull[sequence]")
        detector_labels = ["[sequencedetector]"]
        if len(ducked_labels) > 1:
            detector_labels = [f"[duckdetector{index}]" for index in range(len(ducked_labels))]
            filters.append(
                f"[sequencedetector]asplit={len(detector_labels)}"
                f"{''.join(detector_labels)}"
            )
        for index, ((amount_db, labels), detector) in enumerate(
                zip(sorted(ducked_labels.items()), detector_labels)):
            ducked_label = mix_group(labels, f"ducked{index}")
            if not ducked_label:
                continue
            floor = math.pow(10, amount_db / 20)
            variable = 1 - floor
            filters.append(
                f"{ducked_label}asplit=2[duckfloorin{index}]"
                f"[duckcompressin{index}]"
            )
            filters.append(
                f"[duckfloorin{index}]volume={floor:.6f}[duckfloor{index}]"
            )
            filters.append(
                f"[duckcompressin{index}]{detector}"
                "sidechaincompress=threshold=0.015:ratio=20:attack=20:"
                f"release=450:makeup=1,volume={variable:.6f}"
                f"[duckvariable{index}]"
            )
            filters.append(
                f"[duckfloor{index}][duckvariable{index}]"
                "amix=inputs=2:duration=longest:dropout_transition=0:"
                f"normalize=0[under{index}]"
            )
            sound_labels.append(f"[under{index}]")
    else:
        filters.append("[sequencebase]anull[sequence]")
    if dry_label:
        sound_labels.append(dry_label)
    sound_label = mix_group(sound_labels, "sound")
    if sound_label:
        filters.append(
            f"{sound_label}[sequence]amix=inputs=2:duration=longest:"
            "dropout_transition=0:normalize=0[fullscene]"
        )
        final_source = "[fullscene]"
    else:
        final_source = "[sequence]"
    filters.append(
        f"{final_source}apad=whole_dur={scene_duration:.3f},"
        f"atrim=duration={scene_duration:.3f}[out]"
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
    def sequence_stem(
        self, production_id: int, parts: list[dict], signature: str,
    ) -> dict:
        """Cache one normalized serial Sequence file for browser playout."""
        if not parts:
            return {
                "url": "", "filename": "", "duration_ms": 0,
                "signature": signature, "cached": True,
            }
        digest = str(signature)[:20]
        name = f"sequence-stem-{production_id}-{digest}.mp3"
        target = _output() / name
        cached = target.is_file() and target.stat().st_size > 0
        if not cached:
            _sequence(parts, target)
            # A browser may still be decoding the previous stem while a
            # Sequence edit produces this one. Keep a small bounded window so
            # that an in-flight player never receives a transient 404.
            stems = sorted(
                _output().glob(f"sequence-stem-{production_id}-*.mp3"),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
            for old in stems[3:]:
                old.unlink(missing_ok=True)
            for legacy in _output().glob(f"voice-stem-{production_id}-*.mp3"):
                legacy.unlink(missing_ok=True)
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
            sequence_data = self.sequence_stem(
                production_id, parts,
                scene.get("sequence_projection", {}).get("signature", ""),
            )
            sequence = _output() / Path(sequence_data["filename"]).name
            try:
                _mix_scene(sequence, scene, target)
            except Exception:
                target.unlink(missing_ok=True)
                raise
            for old in _output().glob(f"preview-{production_id}-*.mp3"):
                if old != target:
                    old.unlink(missing_ok=True)
        return {
            "url": f"/audio/{quote(name)}", "name": name,
            "duration_ms": _measure(target), "parts": len(parts),
            # `music` remains as a compatibility response field for older
            # clients. It now truthfully means parallel Sound Design audio.
            "music": any(
                track.get("clips") and not track.get("muted")
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
            sequence_data = self.sequence_stem(
                production_id, parts,
                scene.get("sequence_projection", {}).get("signature", ""),
            )
            sequence = _output() / Path(sequence_data["filename"]).name
            manifest_parts = [
                {
                    "position": index,
                    "part_id": span.get("part_id"),
                    "kind": span.get("kind"),
                    "filename": span.get("filename") or None,
                    "seconds": (span.get("duration_ms") or 0) / 1000,
                }
                for index, span in enumerate(
                    scene.get("sequence_projection", {}).get("spans", []))
            ]
            mixed = _mix_scene(sequence, scene, target)
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
