"""What a file is called when you download it, and what's written inside it.

Stored files have opaque names that never change. Everything a person reads —
the download name, the MP3's title and artist — is built here, at the moment
it's needed, from the Workspace / Project / Folder the recording sits in.

That separation is the whole point: rename a Workspace and every later download
is correct without a single file being touched on disk.
"""

import re

# Windows and macOS both refuse these outright; everything else, including
# accents and non-Latin scripts, is fine in a download name.
FORBIDDEN = re.compile(r'[/\\:*?"<>|\x00-\x1f]')

DEFAULTS = {
    "prefix": "origins",
    "digits": 2,             # part-01
    "include_project": False,
    "separator": "-",
    "artist": "{workspace}",
    "album": "{project}",
    "title": "{folder} — Part {part}",
    "genre": "",
    "year": "",
    "copyright": "",
    "comment": "",
    "cover": True,           # use the Workspace picture as the artwork
}

TOKENS = ("workspace", "project", "folder", "part", "clip", "voice", "date")


def merged(globals_: dict, workspace_overrides: dict | None) -> dict:
    """Global settings, with Workspace-specific values on top.

    A blank field means "inherit" rather than "empty", so a Workspace only has
    to state what it does differently.
    """
    out = {**DEFAULTS, **(globals_ or {})}
    for key, value in (workspace_overrides or {}).items():
        if value not in (None, ""):
            out[key] = value
    return out


def fill(template: str, context: dict) -> str:
    """Replace {workspace}, {part} and friends. Unknown tokens stay visible so a
    typo shows up as itself instead of vanishing."""
    text = template or ""
    for token in TOKENS:
        text = text.replace("{" + token + "}", str(context.get(token, "") or ""))
    return re.sub(r"\s{2,}", " ", text).strip(" —-·")


def tidy(text: str) -> str:
    """Safe for a filename, without mangling anything readable."""
    return FORBIDDEN.sub("", text or "").strip().strip(".")


def download_name(context: dict, settings: dict, extension: str = "mp3") -> str:
    """`origins-christian-prayer-part-03.mp3`

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
    if context.get("clip"):
        pieces.append(f"clip{sep}{context['clip']}")

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
