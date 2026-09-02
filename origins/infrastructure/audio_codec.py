"""One owner for decoding, joining and encoding generated speech audio."""

from __future__ import annotations

import io
import subprocess
import wave


STUDIO_SAMPLE_RATE = 48_000
STUDIO_CHANNELS = 2


def normalize_audio(audio: bytes, *, output_format: str) -> bytes:
    """Decode any provider result and emit one 48 kHz stereo container."""
    if not audio:
        raise ValueError("Cannot normalize empty audio.")
    formats = {
        "wav": ["-f", "wav", "-c:a", "pcm_s16le"],
        "mp3": ["-f", "mp3", "-b:a", "256k"],
        "ogg": ["-f", "ogg", "-c:a", "libopus", "-b:a", "128k"],
    }
    codec = formats.get(output_format)
    if not codec:
        raise ValueError("That normalized output format is not supported.")
    done = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", "pipe:0",
         "-vn", "-ar", str(STUDIO_SAMPLE_RATE), "-ac", str(STUDIO_CHANNELS),
         *codec, "pipe:1"],
        input=audio, capture_output=True,
    )
    if done.returncode or not done.stdout:
        raise RuntimeError(
            done.stderr.decode(errors="replace")
            or "ffmpeg could not normalize provider audio")
    return done.stdout


def decode_pcm(audio: bytes, *, sample_rate: int) -> bytes:
    if not audio:
        raise ValueError("Cannot decode empty audio.")
    done = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", "pipe:0",
         "-f", "s16le", "-ar", str(sample_rate), "-ac", "1", "pipe:1"],
        input=audio, capture_output=True,
    )
    if done.returncode or not done.stdout:
        raise RuntimeError(
            done.stderr.decode(errors="replace")
            or "ffmpeg could not decode provider audio")
    return done.stdout


def pcm_wav(pcm: bytes, *, sample_rate: int) -> bytes:
    target = io.BytesIO()
    with wave.open(target, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm)
    return target.getvalue()


def encode_pcm(pcm: bytes, *, sample_rate: int,
               output_format: str) -> bytes:
    if not pcm:
        raise ValueError("Cannot encode empty PCM audio.")
    wav = pcm_wav(pcm, sample_rate=sample_rate)
    if output_format == "wav":
        return wav
    codec = (
        ["-f", "ogg", "-c:a", "libopus", "-b:a", "64k"]
        if output_format == "opus"
        else ["-f", "mp3", "-b:a", "256k"]
    )
    target_rate = 24_000 if output_format == "mp3-24k" else sample_rate
    done = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "wav",
         "-i", "pipe:0", "-ar", str(target_rate), *codec, "pipe:1"],
        input=wav, capture_output=True,
    )
    if done.returncode or not done.stdout:
        raise RuntimeError(
            done.stderr.decode(errors="replace")
            or "ffmpeg could not encode assembled speech audio")
    return done.stdout
