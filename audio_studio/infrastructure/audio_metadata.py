"""Lossless audio metadata writing through FFmpeg."""

from __future__ import annotations

from pathlib import Path
import subprocess


def write_tags(source: Path, target: Path, tags: dict,
               cover: Path | None = None) -> bool:
    """Copy audio to ``target`` with tags, without re-encoding its stream."""
    command = ["ffmpeg", "-y", "-nostdin", "-loglevel", "error", "-i", str(source)]
    if cover and cover.exists():
        command += ["-i", str(cover), "-map", "0:a", "-map", "1:v",
                    "-c:v", "mjpeg", "-disposition:v", "attached_pic"]
    else:
        command += ["-map", "0:a"]
    command += ["-c:a", "copy"]
    for key, value in tags.items():
        command += ["-metadata", f"{key}={value}"]
    command.append(str(target))
    try:
        done = subprocess.run(command, capture_output=True, timeout=60)
        return done.returncode == 0 and target.is_file() and target.stat().st_size > 0
    except Exception:
        return False
