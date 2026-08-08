"""What a file is called when you download it, and what's written inside it.

Stored files have opaque names that never change. Everything a person reads —
the download name, the MP3's title and artist — is built here, at the moment
it's needed, from the venture / project / folder the recording sits in.

That separation is the whole point: rename a venture and every later download
is correct without a single file being touched on disk.
"""

import re
import subprocess
from pathlib import Path

# Windows and macOS both refuse these outright; everything else, including
# accents and non-Latin scripts, is fine in a download name.
FORBIDDEN = re.compile(r'[/\\:*?"<>|\x00-\x1f]')

DEFAULTS = {
    "prefix": "vrn-studio",
    "digits": 2,             # part-01
    "include_project": False,
    "separator": "-",
    "artist": "{venture}",
    "album": "{project}",
    "title": "{folder} — Part {part}",
    "genre": "",
    "year": "",
    "copyright": "",
    "comment": "",
    "cover": True,           # use the venture's picture as the artwork
}

TOKENS = ("venture", "project", "folder", "part", "take", "voice", "date")


def merged(globals_: dict, venture: dict | None) -> dict:
    """Global settings, with a venture's own values on top.

    A blank field means "inherit" rather than "empty", so a venture only has to
    state what it does differently.
    """
    out = {**DEFAULTS, **(globals_ or {})}
    for key, value in (venture or {}).items():
        if value not in (None, ""):
            out[key] = value
    return out


def fill(template: str, context: dict) -> str:
    """Replace {venture}, {part} and friends. Unknown tokens are left alone so a
    typo shows up as itself instead of vanishing."""
    text = template or ""
    for token in TOKENS:
        text = text.replace("{" + token + "}", str(context.get(token, "") or ""))
    return re.sub(r"\s{2,}", " ", text).strip(" —-·")


def tidy(text: str) -> str:
    """Safe for a filename, without mangling anything readable."""
    return FORBIDDEN.sub("", text or "").strip().strip(".")


def download_name(context: dict, settings: dict, extension: str = "mp3") -> str:
    """`vrn-studio-christian-prayer-part-03.mp3`

    Audio, subtitles and text all share one base name — editors match a .srt to
    a .mp3 by exactly that, so splitting them would break auto-loading.
    """
    sep = settings.get("separator") or "-"
    digits = max(1, int(settings.get("digits") or 2))
    part = context.get("part")

    pieces = [settings.get("prefix") or ""]
    if settings.get("include_project") and context.get("project"):
        pieces.append(context["project"])
    if context.get("folder"):
        pieces.append(context["folder"])
    if part is not None:
        # A folder that grew past the chosen width keeps sorting correctly.
        width = max(digits, len(str(part)))
        pieces.append(f"part{sep}{str(part).zfill(width)}")
    if context.get("take"):
        pieces.append(f"take{sep}{context['take']}")

    joined = sep.join(p for p in (tidy(str(p)) for p in pieces) if p)
    # A folder called "Christian prayer — falling asleep" should read as
    # christian-prayer-falling-asleep, not prayer-—-falling with the dash
    # marooned between two separators.
    joined = re.sub(r"[\s_—–~•·,;]+", sep, joined)
    joined = re.sub(r"[.']+", "", joined)
    joined = re.sub(re.escape(sep) + r"{2,}", sep, joined).strip(sep)
    return f"{joined or 'recording'}.{extension}"


def id3(context: dict, settings: dict) -> dict:
    """The fields written into the MP3 itself."""
    fields = {
        "artist": fill(settings.get("artist"), context),
        "album": fill(settings.get("album"), context),
        "title": fill(settings.get("title"), context),
        "genre": fill(settings.get("genre"), context),
        "date": fill(settings.get("year"), context),
        "copyright": fill(settings.get("copyright"), context),
        "comment": fill(settings.get("comment"), context),
    }
    return {k: v for k, v in fields.items() if v}


def write_tags(source: Path, target: Path, tags: dict, cover: Path | None = None) -> bool:
    """Copy the audio into `target` with its tags, without re-encoding.

    `-c copy` moves the existing stream across untouched, so this costs
    milliseconds and loses nothing. If ffmpeg isn't there, or the file isn't
    MP3, the caller falls back to serving the original.
    """
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
        return done.returncode == 0 and target.exists() and target.stat().st_size > 0
    except Exception:
        return False
