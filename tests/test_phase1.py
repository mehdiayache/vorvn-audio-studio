#!/usr/bin/env python3
"""Non-paid regression tests for Phase 1 reliability and audio finishing."""

import json
import subprocess
import tempfile
from pathlib import Path

from audio_studio.infrastructure import render_workspace as renders
from audio_studio.application.speech import SpeechGenerationService


results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(f"  {'PASS' if condition else 'FAIL'}  {name}" +
          (f" — {detail}" if detail and not condition else ""))


def make_audio(path: Path, frequency: int, rate: int, codec: str):
    done = subprocess.run([
        "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
        "-f", "lavfi", "-i", f"sine=frequency={frequency}:duration=0.25:sample_rate={rate}",
        "-ac", "1", "-c:a", codec, str(path),
    ], capture_output=True, text=True)
    if done.returncode:
        raise RuntimeError(done.stderr)


print("unique output identity")
names = {renders._name("Same title", "mp3") for _ in range(100)}
check("concurrent-looking names never collide", len(names) == 100)
check("names remain readable", all(name.startswith("same-title-") for name in names))


print("\nnormalized finishing")
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory).resolve()
    wav = root / "first.wav"
    second = root / "second.flac"
    make_audio(wav, 440, 44100, "pcm_s16le")
    make_audio(second, 660, 24000, "flac")
    original_output = renders._output
    renders._output = lambda: root
    try:
        target = root / "finished.mp3"
        parts = [
            {"id": 1, "kind": "audio", "filename": wav.name},
            {"id": 2, "kind": "silence", "title": "9",
             "duration_ms": 200, "filename": ""},
            {"id": 3, "kind": "asset", "filename": second.name, "asset_of": 42},
        ]
        try:
            manifest, _ = renders._sequence(parts, target)
            rendered = True
            render_error = ""
        except renders.RenderError as exc:
            rendered = False
            manifest, render_error = [], str(exc)
        check("mixed formats render successfully", rendered, render_error)
        check("render creates one non-empty MP3", target.exists() and target.stat().st_size > 0)
        probe = subprocess.run([
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
            "-of", "json", str(target),
        ], capture_output=True, text=True, check=True)
        metadata = json.loads(probe.stdout)
        stream = metadata["streams"][0]
        duration = float(metadata["format"]["duration"])
        check("output is actually MP3", stream["codec_name"] == "mp3", stream)
        check("output is normalized to 48 kHz", stream["sample_rate"] == "48000", stream)
        check("output is normalized to stereo", stream["channels"] == 2, stream)
        check("silence contributes to duration", 0.62 <= duration <= 0.90, duration)
        check("manifest preserves order and asset identity",
              [item["kind"] for item in manifest] == ["audio", "silence", "asset"]
              and manifest[-1]["asset_of"] == 42, manifest)

        music = root / "music.wav"
        make_audio(music, 220, 32000, "pcm_s16le")
        mixed = root / "mixed.mp3"
        renders._mix_scene(target, {
            "sequence_projection": {"duration_ms": round(duration * 1000)},
            "tracks": [{"id": "music", "kind": "music", "volume": 1,
                        "muted": False,
                        "clips": [{
                            "filename": music.name, "resolved_start_ms": 0,
                            "resolved_duration_ms": round(duration * 1000),
                            "source_offset_ms": 0, "gain": .1,
                            "fade_in_ms": 50, "fade_out_ms": 50,
                            "loop": True, "ducking": True,
                            "orphan": False, "missing": False,
                        }]}],
        }, mixed)
        check("background bed mixes with ducking and fades", mixed.exists(),
              "ffmpeg music mix failed")
        mixed_probe = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=nw=1:nk=1", str(mixed),
        ], capture_output=True, text=True, check=True)
        mixed_duration = float(mixed_probe.stdout.strip())
        check("music mix keeps the Production duration",
              abs(mixed_duration - duration) <= 0.08, (mixed_duration, duration))

        missing_target = root / "must-not-exist.mp3"
        missing = [{"id": 4, "kind": "audio", "filename": "gone.wav"}]
        try:
            renders._sequence(missing, missing_target)
            missing_error = ""
        except renders.RenderError as exc:
            missing_error = str(exc)
        check("missing input fails explicitly", "missing" in missing_error.lower(),
              missing_error)
        check("failed render leaves no output", not missing_target.exists())
    finally:
        renders._output = original_output


print("\npaid-call destination gate")


class MissingDestinationRepository:
    def part(self, _part_id, _production_id):
        return None


class NeverProvider:
    def __init__(self):
        self.called = False

    def is_configured(self):
        return True

    def prepare(self, **_values):
        self.called = True
        raise AssertionError("provider preparation must not run")


provider = NeverProvider()
service = SpeechGenerationService(
    MissingDestinationRepository(), provider, object(),
    lambda: {"warn_above": 0, "daily_cap": 0},
)
try:
    service.run({"operation": "record", "production_id": 999999,
                 "part_id": 888888,
                 "text": "Never send this", "voice": "Tina",
                 "engine": "audio", "model": "flash"})
    rejected = False
except LookupError:
    rejected = True
check("missing destination is rejected", rejected)
check("provider is not called before destination validation", not provider.called)


failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
if __name__ == "__main__":
    raise SystemExit(1 if failed else 0)
