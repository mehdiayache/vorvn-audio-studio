"""One FFprobe boundary for audio, image and video Asset metadata."""

from __future__ import annotations

from fractions import Fraction
import json
from pathlib import Path
import shutil
import subprocess

from audio_studio.domain.media import MediaInspection


_AUDIO_MIME_TYPES = {
    "mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg",
    "flac": "audio/flac", "m4a": "audio/mp4", "aac": "audio/aac",
    "aiff": "audio/aiff",
}
_IMAGE_MIME_TYPES = {
    "jpg": "image/jpeg", "png": "image/png", "webp": "image/webp",
}
_VIDEO_MIME_TYPES = {
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
}


def _containers(value: object) -> set[str]:
    return {item.strip().lower() for item in str(value or "").split(",")}


def _audio_format(containers: set[str]) -> str | None:
    for audio_format in ("wav", "mp3", "flac", "ogg", "aac", "aiff"):
        if audio_format in containers:
            return audio_format
    if containers.intersection({"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}):
        return "m4a"
    return None


def _image_format(codec: str) -> str | None:
    return {"mjpeg": "jpg", "png": "png", "webp": "webp"}.get(codec)


def _video_format(
    containers: set[str], *, original_name: str, major_brand: str,
) -> str | None:
    if containers.intersection({"matroska", "webm"}):
        return "webm" if Path(original_name).suffix.lower() == ".webm" else None
    if containers.intersection({"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}):
        return "mov" if major_brand.strip().lower() == "qt" else "mp4"
    return None


def _positive_int(value: object) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _duration_ms(payload: dict, stream: dict | None = None) -> int | None:
    value = payload.get("format", {}).get("duration")
    if value in (None, "N/A") and stream:
        value = stream.get("duration")
    try:
        milliseconds = round(float(value) * 1000)
    except (TypeError, ValueError):
        return None
    return milliseconds if milliseconds > 0 else None


def _frame_rate(stream: dict) -> float | None:
    value = stream.get("avg_frame_rate") or stream.get("r_frame_rate")
    try:
        rate = float(Fraction(str(value)))
    except (ValueError, ZeroDivisionError):
        return None
    return round(rate, 6) if rate > 0 else None


def inspect_media(target: Path, *, original_name: str = "") -> MediaInspection | None:
    """Read canonical media facts from the file itself in one FFprobe call."""
    if not shutil.which("ffprobe"):
        return None
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration,format_name:format_tags=major_brand:"
        "stream=codec_type,codec_name,sample_rate,channels,width,height,"
        "duration,avg_frame_rate,r_frame_rate",
        "-of", "json", str(target),
    ], capture_output=True, text=True)
    if result.returncode:
        return None
    try:
        payload = json.loads(result.stdout)
        streams = payload.get("streams", [])
        containers = _containers(payload["format"]["format_name"])
    except (KeyError, TypeError, json.JSONDecodeError):
        return None

    audio = next((item for item in streams if item.get("codec_type") == "audio"), None)
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    if audio and not video:
        audio_format = _audio_format(containers)
        duration_ms = _duration_ms(payload, audio)
        sample_rate = _positive_int(audio.get("sample_rate"))
        channels = _positive_int(audio.get("channels"))
        if not audio_format or not duration_ms or not sample_rate or not channels:
            return None
        return MediaInspection(
            media_type="audio", media_format=audio_format,
            extension=audio_format, mime_type=_AUDIO_MIME_TYPES[audio_format],
            duration_ms=duration_ms, audio_format=audio_format,
            sample_rate=sample_rate, channels=channels,
            metadata={"codec": audio.get("codec_name") or "",
                      "container": ",".join(sorted(containers))},
        )

    if not video:
        return None
    codec = str(video.get("codec_name") or "").lower()
    width = _positive_int(video.get("width"))
    height = _positive_int(video.get("height"))
    if not width or not height:
        return None
    image_format = _image_format(codec)
    image_container = bool(
        containers.intersection({"image2", "image2pipe", "jpeg_pipe", "png_pipe", "webp_pipe"})
    )
    if image_format and image_container:
        return MediaInspection(
            media_type="image", media_format=image_format,
            extension=image_format, mime_type=_IMAGE_MIME_TYPES[image_format],
            width=width, height=height,
            metadata={"codec": codec, "container": ",".join(sorted(containers))},
        )

    major_brand = str(payload.get("format", {}).get("tags", {}).get("major_brand") or "")
    video_format = _video_format(
        containers, original_name=original_name, major_brand=major_brand)
    duration_ms = _duration_ms(payload, video)
    frame_rate = _frame_rate(video)
    if not video_format or not duration_ms or not frame_rate:
        return None
    return MediaInspection(
        media_type="video", media_format=video_format,
        extension=video_format, mime_type=_VIDEO_MIME_TYPES[video_format],
        duration_ms=duration_ms, width=width, height=height,
        sample_rate=_positive_int(audio.get("sample_rate")) if audio else None,
        channels=_positive_int(audio.get("channels")) if audio else None,
        video_codec=codec, frame_rate=frame_rate,
        metadata={"codec": codec, "container": ",".join(sorted(containers)),
                  "major_brand": major_brand,
                  "audio_codec": str(audio.get("codec_name") or "")
                  if audio else ""},
    )
