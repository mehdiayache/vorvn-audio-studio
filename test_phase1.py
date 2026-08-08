#!/usr/bin/env python3
"""Non-paid regression tests for Phase 1 reliability and audio finishing."""

import json
import os
import subprocess
import tempfile
from pathlib import Path

import server


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
names = {server._unique_output_name("Same title", "mp3") for _ in range(100)}
check("concurrent-looking names never collide", len(names) == 100)
check("names remain readable", all(name.startswith("same-title-") for name in names))


print("\nnormalized finishing")
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    wav = root / "first.wav"
    second = root / "second.flac"
    make_audio(wav, 440, 44100, "pcm_s16le")
    make_audio(second, 660, 24000, "flac")
    original_out_dir = server.out_dir
    server.out_dir = lambda: root
    try:
        target = root / "finished.mp3"
        parts = [
            {"id": 1, "kind": "audio", "filename": wav.name},
            {"id": 2, "kind": "silence", "title": "0.2", "filename": ""},
            {"id": 3, "kind": "asset", "filename": second.name, "asset_of": 42},
        ]
        ok, manifest, error = server._render_sequence(parts, target)
        check("mixed formats render successfully", ok, error)
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
        mixed_ok = server._mix_music(target, music, {
            "level": "discreet", "fade_in": 0.05, "fade_out": 0.05,
            "duck": True,
        }, mixed)
        check("background bed mixes with ducking and fades", mixed_ok,
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
        ok, _, error = server._render_sequence(missing, missing_target)
        check("missing input fails explicitly", not ok and "missing" in error.lower(), error)
        check("failed render leaves no output", not missing_target.exists())
    finally:
        server.out_dir = original_out_dir


print("\npaid-call destination gate")


class FakeHandler:
    def _json(self, body, status=200):
        return body, status


original_key = os.environ.get("DASHSCOPE_API_KEY")
original_project_get = server.db.project_get
original_synthesize = server.alibaba_speech.synthesize
os.environ["DASHSCOPE_API_KEY"] = "test-key-never-sent"
server.db.project_get = lambda _project_id: None
provider_called = []
server.alibaba_speech.synthesize = lambda *_args, **_kwargs: provider_called.append(True)
try:
    body, status = server.Handler._speak(
        FakeHandler(), {"text": "Never send this", "project_id": 999999})
    check("missing destination is rejected", status == 404, (body, status))
    check("provider is not called before destination validation", provider_called == [])
finally:
    server.db.project_get = original_project_get
    server.alibaba_speech.synthesize = original_synthesize
    if original_key is None:
        os.environ.pop("DASHSCOPE_API_KEY", None)
    else:
        os.environ["DASHSCOPE_API_KEY"] = original_key


failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
