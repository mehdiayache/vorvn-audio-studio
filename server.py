#!/usr/bin/env python3
"""Temporary loopback adapter for provider and file workflows under extraction.

This process is not a public web application. FastAPI owns port 7860 and the
React product; this compatibility boundary listens only on the configured
loopback port until its remaining adapters have native application services.
"""

import base64
import binascii
import hashlib
import mimetypes
import json
import os
import re
import shutil
import subprocess
import uuid
import sys
import threading
import time
import traceback
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

import batch
import db
from domain import repository as domain_repo
import say  # chunking + synthesis live there; single source of truth
import storage
import streaming
import naming
import rewrite
import transcribe
import translate
import vocabulary
from services.alibaba import config as alibaba_config
from services.alibaba import fidelity as alibaba_fidelity
from services.alibaba import omni as alibaba_omni
from services.alibaba import speech as alibaba_speech
from services.alibaba import voice_registry as alibaba_voice_registry
from services import voice_packages
from services import voice_package_worker
from services import voice_routing
from audio_studio.application.preferences import (
    DEFAULT_PREFERENCES,
    PREFERENCES_FILE,
    load_preferences,
)

ROOT = Path(__file__).parent
UI_DIR = ROOT / "ui"
UI_NEXT_DIR = ROOT / "ui-next"
UPLOADS = ROOT / ".uploads"
BLOCKS_DIR = ROOT / ".blocks"   # per-block audio, so re-rendering one is cheap
BATCHES = ROOT / ".batches"     # parsed spreadsheets awaiting a run
ICONS_DIR = Path(__file__).parent / ".icons"
TAGGED_DIR = Path(__file__).parent / ".tagged"   # scratch for tagged copies
INBOX = ROOT / ".inbox"         # files you brought in, kept so they stay playable
PREFS_FILE = PREFERENCES_FILE
PORT = int(os.getenv("PORT", "7860"))

# The API rejects text over 600 characters per request; say.MAX_CHARS stays
# under that with headroom for the tags we splice in.
INSTRUCTION_MAX = 100  # documented hard limit on the instruction parameter

# The tags Alibaba actually documents, split the way the service treats them.
# Kept in say.py so the chunker and the interface can never disagree.
TAGS = {
    "Moods": say.MOOD_TAGS,     # hold until the next mood tag
    "Sounds": say.SOUND_TAGS,   # one effect, then back to normal
}
# Offered nowhere, still understood everywhere — so old text isn't marked wrong.
RETIRED = say.RETIRED_TAGS

LANGUAGES = ["Auto", "English", "Chinese", "Japanese", "Korean", "French", "German",
             "Spanish", "Italian", "Portuguese", "Russian", "Arabic", "Indonesian",
             "Malay", "Thai", "Vietnamese", "Tagalog"]

DEFAULT_PREFS = DEFAULT_PREFERENCES


def delivery_error(text: str, options) -> str | None:
    """Reject a delivery notation the selected provider cannot honour."""
    tagged = [tag for tag in say.TAG_RE.findall(text or "")
              if tag.casefold() in say.KNOWN_TAGS]
    if options.engine == "omni" and tagged:
        return ("Qwen 3.5 Omni does not support inline delivery tags. "
                "Choose the Raw or Spoken script, or switch to a Qwen Audio voice.")
    return None

RATES = alibaba_config.CAPABILITIES["audio"]["rates_per_million_chars"]


# Long renders are the norm — an audiobook is dozens of requests over minutes.
# Progress is kept here and polled by the UI, so "Rendering…" becomes
# "Part 12 of 40" instead of a spinner with no end in sight.
PROGRESS = {"active": False, "done": 0, "total": 0, "label": "", "stage": "",
            "owner": None}
_progress_lock = threading.Lock()


def start_progress(**fields) -> str:
    """Claim the progress slot and return a token identifying this job.

    Two jobs can overlap — a batch running while subtitles are written, or two
    browser tabs. Without an owner the first to finish wipes the other's status
    and the survivor looks stalled. The newest job takes the slot; older ones
    keep working and simply stop reporting.
    """
    token = f"{time.time():.6f}"
    with _progress_lock:
        PROGRESS.update({"active": True, "done": 0, "total": 0, "label": "",
                         "stage": "", "owner": token, **fields})
    return token


def set_progress(token: str = None, **fields) -> None:


    """Report how far a long synthesis has got, for the bar on screen."""
    with _progress_lock:
        if token is not None and PROGRESS["owner"] != token:
            return          # a newer job owns the slot now
        PROGRESS.update(fields)


def clear_progress(token: str = None) -> None:


    """Forget a finished job's progress."""
    with _progress_lock:
        if token is not None and PROGRESS["owner"] != token:
            return          # never clear someone else's progress
        PROGRESS.update({"active": False, "done": 0, "total": 0, "label": "",
                         "stage": "", "owner": None})


def maybe_normalise(text: str):
    """Apply the ambiguity rewrites, if they're switched on."""
    settings = prefs()
    if not settings.get("fix_dates_phones", True):
        return text, []
    return say.normalise_ambiguous(text, day_first=settings.get("day_first", True))


def human_error(exc: Exception) -> str:
    """Turn an exception into something worth showing a person.

    Our own RuntimeErrors are already written for humans, so they pass through
    unchanged. Anything else keeps its type name, which is the only clue to what
    went wrong — but common causes get a plain-English explanation instead.
    """
    message = str(exc).strip()
    # The class name carries the category and often isn't repeated in the text,
    # so match against both.
    lowered = f"{type(exc).__name__} {message}".lower()
    if "apikey" in lowered or "api key" in lowered or "unauthorized" in lowered:
        return ("Your API key was rejected. Check it in Settings, and that the "
                "region matches the one you created it in.")
    if "arrearage" in lowered or "insufficient" in lowered or "quota" in lowered:
        return ("Alibaba refused the request over billing or quota — check your "
                "account balance in the Model Studio console.")
    if isinstance(exc, (ConnectionError, TimeoutError)) or "timed out" in lowered:
        return "Couldn't reach Alibaba. Check your internet and try again."
    if "model not exist" in lowered or "modelnotexist" in lowered:
        return ("That Alibaba speech model is unavailable for this endpoint or "
                "region. Check the model name and workspace region.")
    if (("resourcenotexist" in lowered or "not exist" in lowered)
            and any(word in lowered for word in ("voice", "speaker", "enrollment"))):
        return ("That voice no longer exists on Alibaba's side. Press Reload list "
                "to refresh what you actually have.")
    if "voiceenrollment" in lowered:
        # Strip the request id and status noise; keep the reason.
        reason = message.split("Error Message:")[-1].strip() or message
        return f"Voice cloning failed: {reason}"
    if isinstance(exc, RuntimeError):
        return message
    return f"{type(exc).__name__}: {message}"


# Working files pile up quietly: parsed spreadsheets, reference recordings,
# per-block audio. None of it is worth keeping once the job is done, but your
# finished audio in out/ is never touched by any of this.
SCRATCH = {
    ".batches": (BATCHES, "parsed spreadsheets"),
    ".uploads": (UPLOADS, "reference recordings"),
    ".blocks": (BLOCKS_DIR, "per-block script audio"),
    ".inbox": (INBOX, "files you brought in for subtitles"),
}
SCRATCH_DAYS = 7


def _folder_size(path: Path) -> tuple:


    """Bytes held by everything under a folder."""
    if not path.exists():
        return 0, 0
    files = [f for f in path.rglob("*") if f.is_file()]
    return sum(f.stat().st_size for f in files), len(files)


def disk_usage() -> dict:


    """What the recordings occupy, for the Settings figure."""
    finished, finished_count = _folder_size(out_dir())
    scratch = {}
    for name, (path, description) in SCRATCH.items():
        size, count = _folder_size(path)
        scratch[name] = {"bytes": size, "files": count, "what": description}
    return {
        "finished": {"bytes": finished, "files": finished_count,
                     "where": str(out_dir())},
        "scratch": scratch,
        "scratch_total": sum(s["bytes"] for s in scratch.values()),
        "keep_days": SCRATCH_DAYS,
    }


def tidy_scratch(days: int = SCRATCH_DAYS) -> dict:
    """Delete working files older than `days`. Finished audio is never touched."""
    cutoff = time.time() - days * 86400
    removed, freed = 0, 0
    for path, _ in SCRATCH.values():
        if not path.exists():
            continue
        for item in path.rglob("*"):
            if item.is_file() and item.stat().st_mtime < cutoff:
                freed += item.stat().st_size
                item.unlink(missing_ok=True)
                removed += 1
    return {"removed": removed, "freed": freed}


_SILENCE_CACHE = {}


def _silence_mp3(seconds: float) -> bytes:
    """A block of quiet, for gaps between spoken parts."""
    key = round(seconds, 2)
    if key in _SILENCE_CACHE:
        return _SILENCE_CACHE[key]
    result = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
         "-t", str(key), "-b:a", "128k", "-f", "mp3", "pipe:1"],
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError("Couldn't make the silence — is ffmpeg installed?")
    _SILENCE_CACHE[key] = result.stdout
    return result.stdout


def _unique_output_name(stem: str, suffix: str) -> str:
    """A readable filename that cannot collide with another concurrent job."""
    clean = say.slugify(stem) or "audio"
    extension = suffix if suffix.startswith(".") else f".{suffix}"
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    return f"{clean}-{stamp}-{uuid.uuid4().hex[:8]}{extension.lower()}"


def _render_sequence(parts: list, target: Path) -> tuple[bool, list, str]:
    """Decode, normalize and concatenate a Production's primary audio lane.

    Every source is converted by ffmpeg to the same stereo/48 kHz timebase
    before concatenation, then the complete lane is encoded exactly once.
    Original files remain untouched and the completed file appears atomically.
    """
    if not shutil.which("ffmpeg"):
        return False, [], "FFmpeg is not installed."
    command = ["ffmpeg", "-y", "-nostdin", "-loglevel", "error"]
    manifest = []
    for index, part in enumerate(parts):
        if part.get("kind") == "silence":
            seconds = max(0.1, min(120.0, float(part.get("title") or 1)))
            command.extend([
                "-f", "lavfi", "-i",
                f"anullsrc=r=48000:cl=stereo:d={seconds:.3f}",
            ])
            manifest.append({
                "position": index, "part_id": part.get("id"),
                "kind": "silence", "seconds": seconds,
            })
            continue
        source = (out_dir() / Path(part.get("filename") or "").name).resolve()
        if not source.exists() or out_dir().resolve() not in source.parents:
            return False, manifest, f"Part {index + 1} is missing its audio file."
        command.extend(["-i", str(source)])
        manifest.append({
            "position": index, "part_id": part.get("id"),
            "kind": part.get("kind") or "audio", "filename": source.name,
            "asset_of": part.get("asset_of"),
        })

    normalized = [
        f"[{index}:a:0]aformat=sample_fmts=fltp:sample_rates=48000:"
        f"channel_layouts=stereo,aresample=48000:async=1:first_pts=0,"
        f"asetpts=N/SR/TB[a{index}]"
        for index in range(len(parts))
    ]
    labels = "".join(f"[a{index}]" for index in range(len(parts)))
    filters = ";".join(normalized + [f"{labels}concat=n={len(parts)}:v=0:a=1[out]"])
    temporary = target.with_name(f".{target.stem}-{uuid.uuid4().hex}.tmp.mp3")
    command.extend([
        "-filter_complex", filters, "-map", "[out]", "-vn",
        "-c:a", "libmp3lame", "-b:a", "192k", str(temporary),
    ])
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired) as exc:
        temporary.unlink(missing_ok=True)
        return False, manifest, f"Audio finishing failed: {exc}"
    if done.returncode != 0 or not temporary.exists() or temporary.stat().st_size <= 0:
        temporary.unlink(missing_ok=True)
        detail = (done.stderr or "FFmpeg produced no audio").strip().splitlines()[-1]
        return False, manifest, f"Audio finishing failed: {detail[:300]}"
    target.parent.mkdir(parents=True, exist_ok=True)
    os.replace(temporary, target)
    return True, manifest, ""


def _mix_music(voice: Path, music: Path, settings: dict, target: Path) -> bool:
    """Lay a bed of music under a finished voice track.

    Four decisions, and ffmpeg does the rest:
      * how loud, in the words a person used
      * fade in, fade out
      * the bed loops or is cut to the length of the voice — never calculated
      * ducking: the music drops while someone is speaking and comes back in
        the gaps, which is the difference between amateur and finished

    The voice stream is not re-encoded to make this happen; only the mix is.
    """
    seconds = (measure_ms(voice.name) or 0) / 1000
    if seconds <= 0:
        return False
    legacy_level = db.MUSIC_LEVELS.get(
        settings.get("level"), db.MUSIC_LEVELS["discreet"])
    level = max(0.0, min(1.0, float(settings.get("volume")
                                    if settings.get("volume") is not None
                                    else legacy_level)))
    start = max(0.0, float(settings.get("start") or 0))
    fade_in = max(0.0, float(settings.get("fade_in") or 0))
    fade_out = max(0.0, float(settings.get("fade_out") or 0))

    # The input loops forever, so start is a real slip edit: it chooses which
    # moment of the source begins at 0:00 without changing production length.
    bed = [f"atrim=start={start:.3f}:duration={seconds:.3f}", "asetpts=N/SR/TB",
           f"volume={level:.3f}"]
    if fade_in:
        bed.append(f"afade=t=in:st=0:d={fade_in:g}")
    if fade_out and seconds > fade_out:
        bed.append(f"afade=t=out:st={seconds - fade_out:.3f}:d={fade_out:g}")
    chain = f"[1:a]{','.join(bed)}[bed];"

    if settings.get("duck", True):
        # The bed is the thing being squashed; the voice is what squashes it.
        chain += ("[bed][0:a]sidechaincompress=threshold=0.015:ratio=20:"
                  "attack=20:release=450:makeup=1[under];")
        mixed = "[under]"
    else:
        mixed = "[bed]"
    # normalize=0 keeps the voice at the level it was recorded at. Without it
    # amix halves every input, so adding quiet music made the voice 6 dB quieter
    # than the parts you approved.
    chain += (f"{mixed}[0:a]amix=inputs=2:duration=first:dropout_transition=0"
              f":normalize=0[out]")

    done = subprocess.run(
        ["ffmpeg", "-y", "-nostdin", "-loglevel", "error",
         "-i", str(voice), "-stream_loop", "-1", "-i", str(music),
         "-filter_complex", chain, "-map", "[out]",
         "-c:a", "libmp3lame", "-b:a", "192k", str(target)],
        capture_output=True, timeout=300)
    return done.returncode == 0 and target.exists() and target.stat().st_size > 0


def _production_preview(project_id: int) -> dict:
    """Render (or reuse) the exact audible state of a Production.

    A preview is derived cache, not an Export: it creates no Generation row,
    no manifest and no Activity charge. Its content fingerprint makes Play
    instant until a part or mix setting changes.
    """
    project = db.project_get(project_id)
    if not project:
        return {"error": "That Production is gone."}
    everything = db.project_parts(project_id)
    drafts = [part for part in everything if part["kind"] == "draft"]
    parts = [part for part in everything if part["kind"] not in ("stitch", "draft")]
    if not parts:
        return {"error": "Nothing recorded in this Production yet."}
    broken = [index + 1 for index, part in enumerate(parts) if part.get("missing")]
    if broken:
        return {"error": "Preview unavailable: linked audio is missing from part" +
                ("s " if len(broken) > 1 else " ") + ", ".join(map(str, broken)) + "."}

    music = db.music_get(project_id)
    signature = {
        "renderer": "production-preview-v1",
        "parts": [{
            "id": part.get("id"), "kind": part.get("kind"),
            "title": part.get("title"), "filename": part.get("filename"),
            "duration_ms": part.get("duration_ms"),
            "asset_version_id": part.get("asset_version_id"),
        } for part in parts],
        "music": {key: music.get(key) for key in (
            "music_of", "filename", "duration_ms", "volume", "start",
            "fade_in", "fade_out", "duck")},
    }
    digest = hashlib.sha256(json.dumps(
        signature, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:20]
    name = f"preview-{project_id}-{digest}.mp3"
    target = out_dir() / name
    cached = target.exists() and target.stat().st_size > 0

    if not cached:
        voice = out_dir() / f".preview-{project_id}-{uuid.uuid4().hex}-voice.mp3"
        rendered, _, error = _render_sequence(parts, voice)
        if not rendered:
            voice.unlink(missing_ok=True)
            return {"error": error}
        if music.get("filename"):
            source = (out_dir() / Path(music["filename"]).name).resolve()
            if not source.exists() or out_dir().resolve() not in source.parents:
                voice.unlink(missing_ok=True)
                return {"error": "The selected background music file is missing."}
            if not _mix_music(voice, source, music, target):
                voice.unlink(missing_ok=True)
                target.unlink(missing_ok=True)
                return {"error": "The background music preview could not be mixed."}
            voice.unlink(missing_ok=True)
        else:
            os.replace(voice, target)
        # A Production needs one current cache, not a hidden history of every
        # slider movement. Published snapshots remain untouched.
        for old in out_dir().glob(f"preview-{project_id}-*.mp3"):
            if old != target:
                old.unlink(missing_ok=True)

    return {
        "url": f"/audio/{quote(name)}", "name": name,
        "duration_ms": measure_ms(name), "parts": len(parts),
        "music": bool(music.get("filename")), "cached": cached,
        "skipped_drafts": len(drafts),
    }


def _stitch_subtitles(parts: list) -> dict:
    """Lay every part's subtitles on one timeline.

    Each spoken part's cues shift by everything that came before it, and a
    silence just pushes the clock forward. Parts with no subtitles yet are
    reported by name rather than silently dropped.
    """
    cues, missing, stale, offset = [], [], [], 0
    for number, part in enumerate(parts, 1):
        if part["kind"] == "silence":
            offset += int(float(part["title"] or 1) * 1000)
            continue
        length = part.get("duration_ms") or measure_ms(part["filename"] or "") or 0
        found = db.transcript_for(part["id"])
        if not found or not found.get("sentences"):
            missing.append(number)
        else:
            if found.get("stale"):
                stale.append(number)
            for cue in transcribe.to_cues({"sentences": found["sentences"]}):
                cues.append({**cue,
                             "start": cue["start"] + offset,
                             "end": cue["end"] + offset})
        offset += length
    return {"cues": len(cues), "missing": missing, "stale": stale,
            "srt": transcribe.render_srt(cues) if cues else "",
            "vtt": transcribe.render_vtt(cues) if cues else ""}


def measure_ms(filename: str):
    """Real length of an audio file. Guessing from bytes was wrong by 2x."""
    target = out_dir() / filename
    if not target.exists() or not shutil.which("ffprobe"):
        return None
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(target)],
        capture_output=True, text=True,
    )
    try:
        return int(float(result.stdout.strip()) * 1000)
    except (ValueError, TypeError):
        return None


def estimate_cost(text: str, model: str, engine: str = "audio") -> float:
    """Our own estimate for a piece of speech. Alibaba returns no price per
    call, so every number shown is labelled an estimate."""
    engine = alibaba_config.normalise_engine(engine)
    rates = alibaba_config.CAPABILITIES[engine]["estimate_rates_per_million_chars"]
    return len(text) / 1_000_000 * rates.get(model, rates["plus"])


def speech_cost(text: str, options, usage: dict) -> tuple[float, str]:
    """Actual streamed Omni cost when available, otherwise our estimate."""
    if options.engine == "omni":
        actual = alibaba_config.omni_usage_cost(usage, options.model)
        if actual is not None:
            return actual, "actual tokens"
    return round(estimate_cost(text, options.model, options.engine), 6), "estimate"


def output_extension(output_format: str) -> str:
    return "ogg" if output_format == "opus" else output_format.split("-")[0]


# How fast a voice really reads, measured on finished recordings:
#   English 12.5 · French 11.7–16.1 · Indonesian 10.8 characters per second.
# Above this, the model stopped early and returned a fragment. Arabic measured
# 26.7, 44.8 and 154.3 on three different voices — it starts, then gives up.
# Left generous on purpose: a warning that cries wolf gets ignored.
PLAUSIBLE_CHARS_PER_SECOND = 25


def truncation_warning(text: str, duration_ms, options) -> str | None:
    """Say so when the model returned far less audio than the text needs.

    It does not refuse and it does not retry — the file is kept and the cost is
    real either way. It exists because the alternative is silent: a part that
    looks rendered, plays for one second, and is only noticed much later.
    """
    if not duration_ms or duration_ms <= 0 or len(text) < 25:
        return None
    speed = len(text) / (duration_ms / 1000)
    if speed <= PLAUSIBLE_CHARS_PER_SECOND:
        return None
    said = f"{duration_ms / 1000:.1f}s of audio for {len(text)} characters"
    language = getattr(options, "language", None)
    if language:
        return (f"This voice seems unable to read {language} — {said}. "
                f"The text is fine; try another voice, or keep {language} for "
                f"subtitles only.")
    return (f"The model stopped early — {said}. Worth listening to before you "
            f"use it.")


def _to_wav(source: Path) -> Path:
    """Normalise a reference recording to 24 kHz, 16-bit mono WAV.

    Browsers record WebM/Opus, which the cloning service won't take, and phone
    recordings arrive as m4a. Converting everything up front removes a whole
    class of "why did my clone fail" confusion. Omni enrollment requires at
    least 24 kHz; the older 16 kHz conversion could create a voice record that
    Alibaba subsequently refused to synthesize with. 24 kHz also satisfies the
    Qwen Audio TTS enrollment contract. If ffmpeg isn't installed the original
    file is used unchanged.
    """
    if not shutil.which("ffmpeg"):
        return source
    # Do not overwrite the uploaded original: it is the only recovery path if
    # Alibaba changes its preprocessing contract again.
    target = source.with_name(f"{source.stem}-24k.wav")
    result = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(source),
         "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(target)],
        capture_output=True,
    )
    return target if result.returncode == 0 and target.exists() else source


def prefs() -> dict:


    """The stored preferences, with the defaults underneath."""
    return load_preferences()


def out_dir() -> Path:


    """Where audio is written."""
    path = Path(prefs()["out_dir"]).expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


class Options:
    """Duck-types the argparse namespace say.synthesize expects."""

    def __init__(self, payload: dict, bindings: list[dict] | None = None):
        language = payload.get("language")
        text = str(payload.get("text") or "")
        # "Auto" used to mean "do not route". That is dangerous for Arabic:
        # the browser could retain Qwen Audio and an English-only voice while
        # visibly containing Arabic text. Detect the script at the server
        # boundary so every client gets the same safe routing.
        if language in (None, "", "Auto") and re.search(r"[\u0600-\u06ff]", text):
            language = "Arabic"
        self.language = None if language in (None, "", "Auto") else language
        self.routing_bindings = bindings if bindings is not None else [
            *alibaba_voice_registry.system_bindings(), *db.voice_custom_bindings()]
        route = voice_routing.resolve({**payload, "language": language}, self.routing_bindings)
        self.voice_identity_id = route.identity_id
        self.voice = route.provider_voice_id or ("Tina" if route.engine == "omni"
                                                  else say.DEFAULT_VOICE[route.tier])
        self.engine = route.engine
        self.model = route.tier
        self.model_id = route.model_id
        self.voice_route = {**route.payload(), "provider_voice_id": self.voice}
        self.format = payload.get("format", "mp3")
        instruction = (payload.get("instruction") or "").strip()
        self.instruction = instruction[:INSTRUCTION_MAX] or None
        self.speech_mode = ("directed" if self.engine == "omni"
                            and payload.get("speech_mode") == "directed"
                            and self.instruction else "exact")
        self.rate = float(payload.get("rate", 1.0))
        self.pitch = float(payload.get("pitch", 1.0))
        self.volume = int(payload.get("volume", 50))
        self.seed = int(payload.get("seed") or 0)

        # Undocumented request flags. Per-call values win; otherwise fall back to
        # the defaults saved in Settings.
        defaults = prefs().get("synth_flags", {})
        for flag in say.SYNTH_FLAGS:
            value = payload.get(flag, defaults.get(flag))
            setattr(self, flag, None if value is None else bool(value))

        self.hot_fix = say.build_hot_fix()
        extra = payload.get("extra_params", prefs().get("extra_params"))
        if isinstance(extra, str) and extra.strip():
            try:
                extra = json.loads(extra)
            except json.JSONDecodeError:
                extra = None
        self.extra_params = extra if isinstance(extra, dict) else None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_DIR), **kwargs)

    def log_message(self, fmt, *args):

        """Quieten the standard request log; runs are recorded in Activity."""
        pass  # the UI reports its own status; keep the console clean

    def _serve_studio_ui(self, path: str, head: bool = False):
        """Serve the built React workspace under /studio without disturbing legacy tools."""
        if path == "/studio":
            self.send_response(302)
            self.send_header("Location", "/studio/")
            self.end_headers()
            return
        relative = unquote(path.removeprefix("/studio/")).lstrip("/")
        target = (UI_NEXT_DIR / relative).resolve() if relative else UI_NEXT_DIR / "index.html"
        root = UI_NEXT_DIR.resolve()
        if root not in target.parents or not target.is_file():
            target = UI_NEXT_DIR / "index.html"
        if not target.is_file():
            return self._json({"error": "The rebuilt Studio UI has not been built yet."}, 503)
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") else content_type)
        self.send_header("Content-Length", str(target.stat().st_size))
        self.end_headers()
        if not head:
            self.wfile.write(target.read_bytes())

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path == "/studio" or path.startswith("/studio/"):
            return self._serve_studio_ui(path, head=True)
        return super().do_HEAD()

    def end_headers(self):

        """Add the headers every response carries."""
        # The UI and provider registry change as the app is worked on. Voice
        # samples never change, so only those are worth caching hard.
        path = urlparse(self.path).path
        if path.startswith(("/samples/", "/studio/assets/")):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        elif not path.startswith(("/audio/", "/block-audio/")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, payload: dict, status: int = 200) -> None:

        """Send a JSON reply."""
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _v1_error(self, status: int, code: str, message: str) -> None:
        """The public API has one durable error shape, unlike legacy routes."""
        return self._json({"error": {"code": code, "message": message,
                                     "details": {},
                                     "request_id": f"req_{uuid.uuid4().hex}"}}, status)

    @staticmethod
    def _v1_container(item: dict) -> dict:
        """Expose hierarchy data without leaking the legacy table vocabulary."""
        return {
            "id": str(item["id"]),
            "type": item.get("container_type") or "production",
            "legacy_level": item.get("level") or "folder",
            "system_role": item.get("system_role"),
            "parent_id": str(item["parent_id"]) if item.get("parent_id") else None,
            "name": item.get("name") or "",
            "description": item.get("description") or "",
            "icon": item.get("icon") or "",
            "locked": bool(item.get("locked")),
            "updated_at": item.get("updated_at"),
            "metrics": {
                "own_parts": int(item.get("parts") or 0),
                "all_parts": int(item.get("all_parts") or 0),
                "own_files": int(item.get("files") or 0),
                "all_files": int(item.get("all_files") or 0),
                "own_cost": float(item.get("cost") or 0),
                "all_cost": float(item.get("all_cost") or 0),
            },
        }

    @staticmethod
    def _v1_part(part: dict) -> dict:
        """Stable Part representation; local filenames stay server-private."""
        filename = part.get("filename") or ""
        duration_ms = int(part.get("duration_ms") or 0)
        if part.get("kind") == "silence":
            try:
                duration_ms = round(float(part.get("title") or 0) * 1000)
            except (TypeError, ValueError):
                duration_ms = 0
        return {
            "id": str(part["id"]),
            "type": part.get("kind") or "audio",
            "position": part.get("position"),
            "title": part.get("title") or "",
            "text": {
                "active": part.get("text") or "",
                "raw": part.get("text_raw") or "",
                "spoken": part.get("text_shaped") or "",
                "tagged": part.get("text_tagged") or "",
                "state": part.get("text_state") or "raw",
            },
            "voice_id": part.get("voice") or None,
            "voice_identity_id": part.get("voice_identity_id") or None,
            "engine": part.get("engine") or None,
            "model": part.get("model") or None,
            "language": part.get("language") or None,
            "instruction": part.get("instruction") or "",
            "duration_ms": duration_ms,
            "audio_url": f"/audio/{quote(filename)}" if filename else None,
            "cost": float(part.get("cost") or 0),
            "cost_basis": part.get("cost_basis") or "unknown",
            "created_at": part.get("created_at"),
        }

    @staticmethod
    def _v1_asset(asset: dict) -> dict:
        filename = asset.get("filename") or ""
        return {
            "id": str(asset["id"]),
            "type": "asset",
            "venture_id": str(asset["venture_id"]),
            "collection_id": str(asset["collection_id"]),
            "kind": asset.get("kind"),
            "name": asset.get("name") or "",
            "current_version": {
                "id": str(asset["version_id"]),
                "filename": filename,
                "duration_ms": asset.get("duration_ms"),
                "size_bytes": int(asset.get("size_bytes") or 0),
                "mime_type": asset.get("mime_type"),
                "audio_url": f"/audio/{quote(filename)}" if filename else None,
            },
        }

    @staticmethod
    def _v1_export(export: dict) -> dict:
        filename = export.get("filename") or ""
        return {
            "id": str(export["id"]),
            "type": "export",
            "production_id": str(export["production_id"]),
            "generation_id": (str(export["generation_id"])
                              if export.get("generation_id") else None),
            "filename": filename,
            "audio_url": f"/audio/{quote(filename)}" if filename else None,
            "duration_ms": export.get("duration_ms"),
            "size_bytes": int(export.get("size_bytes") or 0),
            "renderer": export.get("renderer"),
            "manifest": export.get("manifest") or {},
            "created_at": export.get("created_at"),
        }

    def _api_v1_get(self, path: str, query: dict) -> bool:
        """First read-only slice of the public resource API.

        Returning False means the path is not a v1 route. Writes, auth and Jobs
        deliberately follow later; this server is still localhost-only.
        """
        if not path.startswith("/api/v1/"):
            return False
        segments = [unquote(part) for part in path.split("/") if part][2:]

        if segments == ["voice-history", "unlinked"]:
            history = db.voice_historical_unlinked()
            self._json({"data": history, "meta": {"count": len(history),
                                                     "total": len(history)}})
            return True

        if segments and segments[0] == "voices":
            profiles = self._voice_profile_data()
            if len(segments) == 1:
                self._json({"data": profiles, "meta": {"count": len(profiles),
                                                        "total": len(profiles)}})
            elif len(segments) == 2:
                profile = next((item for item in profiles if item["id"] == segments[1]), None)
                if profile:
                    self._json({"data": profile})
                else:
                    self._v1_error(404, "voice_not_found", "That voice identity does not exist.")
            else:
                self._v1_error(404, "route_not_found", "That voice route does not exist.")
            return True

        # Page-specific read models are intentionally resolved before the
        # compatibility tree. A Venture dashboard, Project workspace and
        # Series catalog do not share one generic visual/data grammar.
        overview_getters = {
            "ventures": ("venture", domain_repo.venture_overview),
            "projects": ("project", domain_repo.project_overview),
            "series": ("series", domain_repo.series_overview),
        }
        if len(segments) == 3 and segments[0] in overview_getters and segments[2] == "overview":
            kind, getter = overview_getters[segments[0]]
            try:
                resource_id = int(segments[1])
            except (TypeError, ValueError):
                self._v1_error(400, "invalid_identifier", "That resource identifier is invalid.")
                return True
            overview = getter(resource_id)
            if overview is None:
                self._v1_error(404, f"{kind}_not_found", f"That {kind} does not exist.")
            else:
                self._json({"data": overview})
            return True

        domain_tree = domain_repo.hierarchy()
        domain_by_key = {(item["type"], int(item["id"])): item
                         for item in domain_tree}
        tree = db.project_tree()  # compatibility resources below
        by_id = {int(item["id"]): item for item in tree}

        def identifier(at: int) -> int | None:
            try:
                return int(segments[at])
            except (IndexError, TypeError, ValueError):
                return None

        def collection(items: list[dict]) -> None:
            try:
                limit = max(1, min(int(query.get("limit", ["50"])[0] or 50), 100))
                token = query.get("after", [""])[0]
                padded = token + "=" * (-len(token) % 4)
                offset = int(base64.urlsafe_b64decode(padded).decode()) if token else 0
                if offset < 0:
                    raise ValueError
            except (ValueError, TypeError, UnicodeDecodeError, binascii.Error):
                return self._v1_error(400, "invalid_cursor",
                                      "The pagination cursor is invalid.")
            page = items[offset:offset + limit]
            next_offset = offset + len(page)
            next_cursor = None
            if next_offset < len(items):
                next_cursor = base64.urlsafe_b64encode(
                    str(next_offset).encode()).decode().rstrip("=")
            self._json({"data": page,
                        "meta": {"next_cursor": next_cursor,
                                 "count": len(page), "total": len(items)}})

        if segments == ["hierarchy"]:
            collection(domain_tree)
            return True

        if segments == ["ventures"]:
            collection([item for item in domain_tree if item["type"] == "venture"])
            return True

        canonical_kinds = {
            "ventures": "venture", "projects": "project",
            "series": "series", "productions": "production",
        }
        resource_id = identifier(1)
        if len(segments) == 2 and segments[0] in canonical_kinds:
            kind = canonical_kinds[segments[0]]
            resource = domain_by_key.get((kind, resource_id or 0))
            if not resource:
                self._v1_error(404, f"{kind}_not_found",
                               f"That {kind} does not exist.")
            elif kind == "production":
                self._json({"data": domain_repo.production_get(resource_id)})
            else:
                self._json({"data": resource})
            return True

        if (len(segments) == 3
                and segments[0] in ("ventures", "projects", "series")
                and segments[2] in ("projects", "series", "productions")):
            parent_kind = canonical_kinds[segments[0]]
            child_kind = {"projects": "project", "series": "series",
                          "productions": "production"}.get(segments[2])
            parent = domain_by_key.get((parent_kind, resource_id or 0))
            if not parent:
                self._v1_error(404, f"{parent_kind}_not_found",
                               f"That {parent_kind} does not exist.")
            else:
                children = [item for item in domain_tree
                            if item["parent_key"] == parent["key"]
                            and item["type"] == child_kind]
                collection(children)
            return True

        if (len(segments) == 3 and segments[0] == "productions"
                and segments[2] == "editor"):
            payload = self._canonical_production_open(resource_id or 0)
            if payload is None:
                self._v1_error(404, "production_not_found",
                               "That Production does not exist.")
            else:
                self._json({"data": payload})
            return True

        # Temporary aliases for clients that still call folders and the old
        # container projection. New clients must use the canonical routes above.
        item = by_id.get(resource_id or 0)
        if len(segments) == 2 and segments[0] == "folders":
            expected = "production"
            if not item or item.get("container_type") != expected:
                self._v1_error(404, f"{expected}_not_found",
                               f"That {expected} does not exist.")
            else:
                self._json({"data": self._v1_container(item)})
            return True

        if (len(segments) == 3 and segments[0] == "ventures"
                and segments[2] == "projects"):
            if not item or item.get("container_type") != "venture":
                self._v1_error(404, "venture_not_found", "That venture does not exist.")
            else:
                collection([self._v1_container(child) for child in tree
                            if child.get("parent_id") == resource_id
                            and child.get("container_type") == "project"])
            return True

        if (len(segments) == 3 and segments[0] == "ventures"
                and segments[2] == "assets"):
            if not item or item.get("container_type") != "venture":
                self._v1_error(404, "venture_not_found", "That Venture does not exist.")
            else:
                collection([self._v1_asset(asset)
                            for asset in db.assets_for_venture(resource_id)])
            return True

        if (len(segments) == 3 and segments[0] == "projects"
                and segments[2] in ("productions", "folders")):
            if not item or item.get("container_type") != "project":
                self._v1_error(404, "project_not_found", "That project does not exist.")
            else:
                collection([self._v1_container(child) for child in tree
                            if child.get("parent_id") == resource_id
                            and child.get("container_type") == "production"])
            return True

        if (len(segments) == 3 and segments[0] in ("productions", "folders")
                and segments[2] == "parts"):
            if not item or item.get("container_type") != "production":
                self._v1_error(404, "production_not_found",
                               "That Production does not exist.")
            else:
                collection([self._v1_part(part) for part in db.project_parts(resource_id)
                            if part.get("kind") != "stitch"])
            return True

        if (len(segments) == 3 and segments[0] in ("productions", "folders")
                and segments[2] == "exports"):
            if not item or item.get("container_type") != "production":
                self._v1_error(404, "production_not_found",
                               "That Production does not exist.")
            else:
                collection([self._v1_export(export)
                            for export in db.exports_for(resource_id)])
            return True

        if len(segments) == 2 and segments[0] == "assets":
            asset = db.asset_get(resource_id or 0)
            if not asset:
                self._v1_error(404, "asset_not_found", "That Asset does not exist.")
            else:
                self._json({"data": self._v1_asset(asset)})
            return True

        if len(segments) == 2 and segments[0] == "exports":
            export = db.export_get(resource_id or 0)
            if not export:
                self._v1_error(404, "export_not_found", "That Export does not exist.")
            else:
                self._json({"data": self._v1_export(export)})
            return True

        if len(segments) == 2 and segments[0] == "parts":
            part = db.get(resource_id or 0)
            if not part:
                self._v1_error(404, "part_not_found", "That part does not exist.")
            else:
                self._json({"data": self._v1_part(part)})
            return True

        self._v1_error(404, "route_not_found", "That API v1 route does not exist.")
        return True

    def _api_v1_patch(self, path: str, payload: dict) -> bool:
        """Edit lifecycle-safe canonical metadata and Production placement."""
        if not path.startswith("/api/v1/"):
            return False
        segments = [unquote(part) for part in path.split("/") if part][2:]
        if len(segments) == 2 and segments[0] == "voices":
            try:
                if not db.voice_identity_update(segments[1], payload):
                    self._v1_error(404, "voice_not_found", "That voice identity does not exist.")
                else:
                    profile = next(item for item in self._voice_profile_data()
                                   if item["id"] == segments[1])
                    self._json({"data": profile})
            except ValueError as exc:
                self._v1_error(400, "invalid_voice", str(exc))
            return True
        kinds = {"ventures": "venture", "projects": "project",
                 "series": "series", "productions": "production"}
        try:
            resource_id = int(segments[1])
        except (IndexError, TypeError, ValueError):
            self._v1_error(400, "invalid_identifier", "That resource identifier is invalid.")
            return True
        try:
            if len(segments) == 2 and segments[0] in kinds:
                kind = kinds[segments[0]]
                updated = domain_repo.update_resource(kind, resource_id, payload)
                if updated is None:
                    self._v1_error(404, f"{kind}_not_found", f"That {kind} does not exist.")
                else:
                    self._json({"data": updated})
                return True
            if segments == ["productions", str(resource_id), "placement"]:
                raw_series_id = payload.get("series_id")
                series_id = None if raw_series_id in (None, "") else int(raw_series_id)
                updated = domain_repo.move_production(resource_id, series_id)
                if updated is None:
                    self._v1_error(404, "production_not_found", "That production does not exist.")
                else:
                    self._json({"data": updated})
                return True
            if (len(segments) == 3 and segments[0] in kinds
                    and segments[2] == "archive"):
                kind = kinds[segments[0]]
                archived = domain_repo.archive_resource(kind, resource_id)
                if archived is None:
                    self._v1_error(404, f"{kind}_not_found", f"That {kind} does not exist.")
                else:
                    self._json({"data": archived})
                return True
        except domain_repo.DomainConflict as exc:
            self._v1_error(409, "domain_conflict", str(exc))
            return True
        except domain_repo.DomainValidation as exc:
            self._v1_error(400, "invalid_resource", str(exc))
            return True
        except (TypeError, ValueError):
            self._v1_error(400, "invalid_identifier", "That resource identifier is invalid.")
            return True
        self._v1_error(404, "route_not_found", "That API v1 route does not exist.")
        return True

    def _api_v1_delete(self, path: str, query: dict) -> bool:
        """Safe deletion: only empty/editorially-unwrapped Series are removed."""
        if not path.startswith("/api/v1/"):
            return False
        segments = [unquote(part) for part in path.split("/") if part][2:]
        if len(segments) == 2 and segments[0] == "voices":
            if db.voice_identity_update(segments[1], {"status": "archived"}):
                profile = next(item for item in self._voice_profile_data()
                               if item["id"] == segments[1])
                self._json({"data": profile})
            else:
                self._v1_error(404, "voice_not_found", "That voice identity does not exist.")
            return True
        kinds = {"ventures": "venture", "projects": "project",
                 "series": "series", "productions": "production"}
        if len(segments) != 2 or segments[0] not in kinds:
            self._v1_error(404, "route_not_found", "That API v1 route does not exist.")
            return True
        kind = kinds[segments[0]]
        try:
            resource_id = int(segments[1])
            if kind == "series":
                strategy = query.get("strategy", [""])[0]
                result = domain_repo.delete_series(
                    resource_id, make_standalone=strategy == "make_standalone")
            else:
                # Audio-bearing and ownership resources are recoverable by
                # default. DELETE therefore means archive for these types.
                result = domain_repo.archive_resource(kind, resource_id)
        except domain_repo.DomainConflict as exc:
            self._v1_error(409, "series_not_empty", str(exc))
            return True
        except (TypeError, ValueError):
            self._v1_error(400, "invalid_identifier", "That resource identifier is invalid.")
            return True
        if result is None:
            self._v1_error(404, f"{kind}_not_found", f"That {kind} does not exist.")
        else:
            self._json({"data": result})
        return True

    def _read_v1_json_body(self) -> dict | None:
        """Bounded JSON reader shared by PATCH; errors keep the v1 shape."""
        try:
            length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            self._v1_error(400, "invalid_content_length", "Content-Length is invalid.")
            return None
        if length < 0 or length > 1_000_000:
            self.close_connection = True
            self._v1_error(413, "request_too_large", "That request is too large.")
            return None
        try:
            parsed = json.loads(self.rfile.read(length) if length else b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._v1_error(400, "invalid_json", "The request body is not valid JSON.")
            return None
        if not isinstance(parsed, dict):
            self._v1_error(400, "invalid_json", "The request body must be a JSON object.")
            return None
        return parsed

    def _canonical_production_open(self, production_id: int) -> dict | None:
        """Editor payload assembled from a canonical Production.

        Parts still carry their paid generation IDs; the new production_parts
        relation is the ownership source and the legacy container ID is only an
        adapter for media functions that have not migrated yet.
        """
        production = domain_repo.production_get(production_id)
        if not production:
            return None
        legacy_id = int(production["legacy_container_id"])
        parts = db.project_parts(legacy_id)
        subtitled = db.transcribed_ids(legacy_id)
        translated = db.translated_ids(legacy_id)
        for part in parts:
            part["takes"] = db.take_count(part["id"])
            part["subtitled"] = part["id"] in subtitled
            part["subtitles_stale"] = bool(subtitled.get(part["id"]))
            part["languages"] = sorted(set(translated.get(part["id"], [])))
        visible_parts = [part for part in parts if part.get("kind") != "stitch"]
        accounting = db.production_accounting(production_id)
        return {
            **production,
            "parts": parts,
            "total_cost": accounting["historical_spend"],
            "current_sequence_cost": accounting["current_sequence_cost"],
            "accounting": accounting,
            "total_bytes": sum(part["size_bytes"] or 0 for part in visible_parts),
        }

    # ---------------------------------------------------------------- GET

    def do_GET(self):

        """Serve the app's files and answer every read request."""
        parsed = urlparse(self.path)
        path, query = parsed.path, parse_qs(parsed.query)
        if path == "/studio" or path.startswith("/studio/"):
            return self._serve_studio_ui(path)
        try:
            if self._api_v1_get(path, query):
                return
        except Exception as exc:
            traceback.print_exc()
            return self._v1_error(500, "internal_error", human_error(exc))

        routes = {
            "/api/config": self._config,
            "/api/voices/cloned": self._list_cloned,
            "/api/voices/registry": self._voice_registry,
            "/api/voice-identities": self._voice_identities,
            "/api/clone/query": lambda: self._clone_query(query),
            "/api/history": lambda: self._json(
                {"history": self._history(search=query.get("q", [""])[0])}),
            "/api/generation": lambda: self._generation(query),
            "/api/progress": lambda: self._json(PROGRESS),
            "/api/disk": lambda: self._json(disk_usage()),
            "/api/projects": lambda: self._json({"projects": db.project_tree()}),
            "/api/project": lambda: self._project_open(query),
            "/api/generation/full": lambda: self._json(
                db.get(int(query.get("id", ["0"])[0])) or {"error": "Gone."}),
            "/api/transcripts": lambda: self._json(
                {"transcripts": db.transcript_list()}),
            "/api/languages": lambda: self._json(
                {"languages": translate.LANGUAGES,
                 "speakable": translate.SPEAKABLE,
                 "unreliable": translate.UNRELIABLE_SPEECH}),
            "/api/vocabularies": lambda: self._json(
                {"vocabularies": vocabulary.listing(),
                 "languages": vocabulary.LANGUAGES,
                 "max_words": vocabulary.MAX_WORDS,
                 "default_weight": vocabulary.DEFAULT_WEIGHT}),
            "/api/vocabulary": lambda: self._json(
                {"words": vocabulary.get(query.get("id", [""])[0])}),
            "/api/scripts/migrate": lambda: self._json(db.migrate_scripts()),
            "/api/activity": lambda: self._json({
                # A run still marked running long after the app restarted died
                # with it; say so rather than showing a permanent spinner.
                "stale_closed": db.jobs_abandon_stale(),
                "running": db.jobs_running(),
                **db.job_totals(),
                "runs_list": db.job_list(
                    limit=int(query.get("limit", ["80"])[0] or 80),
                    kind=query.get("kind", [""])[0],
                    failed_only=query.get("failed", ["0"])[0] == "1"),
                "kinds": db.JOB_KINDS,
            }),
            "/api/activity/children": lambda: self._json(
                {"children": db.job_children(int(query.get("id", ["0"])[0] or 0))}),
            "/api/spend": lambda: self._json({
                **db.job_totals(),
                "runs_list": db.job_list(
                    limit=int(query.get("limit", ["60"])[0] or 60),
                    kind=query.get("kind", [""])[0],
                    failed_only=query.get("failed", ["0"])[0] == "1"),
                "kinds": db.JOB_KINDS,
            }),
            "/api/voices/usage": lambda: self._voice_usage(),
            "/api/text/prompts": lambda: self._text_prompts(query),
            "/api/project/music": lambda: self._json(
                db.music_get(int(query.get("id", ["0"])[0] or 0))),
            "/api/project/style": lambda: self._json(
                {"style": db.style_for(int(query.get("id", ["0"])[0] or 0))}),
            "/api/voices/meta": lambda: self._json({"voices": db.voice_meta()}),
            "/api/assets": lambda: self._venture_assets(query),
            "/api/part/subtitles": lambda: self._part_subtitles(query),
            "/api/project/naming": lambda: self._json(
                {"naming": (db.venture_of(int(query.get("id", ["0"])[0] or 0)) or {})
                           .get("naming", {})}),
            "/api/download/name": lambda: self._json(
                self._readable(int(query.get("id", ["0"])[0] or 0),
                               (query.get("kind", ["mp3"])[0] or "mp3"))),
            "/api/part/languages": lambda: self._part_languages(query),
            "/api/transcript": lambda: self._json(
                self._transcript_payload(query)),
            "/api/pronunciations": lambda: self._json(
                {"rules": db.pronunciations()}),
            "/api/pronunciations/preview": lambda: self._json(dict(zip(
                ("text", "applied"),
                say.apply_pronunciations(query.get("text", [""])[0])))),
        }
        if path in routes:
            try:
                return routes[path]()
            except Exception as exc:
                traceback.print_exc()
                return self._json({"error": human_error(exc)}, 500)

        if path == "/api/stream":
            return self._stream(query)
        if path == "/download":
            return self._download(query)
        if path.startswith("/icon/"):
            return self._serve_audio(Path(path).name, ICONS_DIR)
        if path.startswith("/audio/"):
            return self._serve_audio(Path(path).name)
        if path.startswith("/block-audio/"):
            return self._serve_audio(Path(path).name, BLOCKS_DIR)
        if path.startswith("/inbox/"):
            return self._serve_audio(Path(path).name, INBOX)
        if path.startswith("/batch-audio/"):
            parts = [p for p in path.split("/") if p][1:]
            if len(parts) == 2:
                return self._serve_batch_file(parts[0], parts[1])
            return self._json({"error": "not found"}, 404)
        return super().do_GET()

    def do_PATCH(self):
        path = urlparse(self.path).path
        payload = self._read_v1_json_body()
        if payload is None:
            return
        try:
            if self._api_v1_patch(path, payload):
                return
        except Exception as exc:
            traceback.print_exc()
            return self._v1_error(500, "internal_error", human_error(exc))
        return self._v1_error(404, "route_not_found", "That API route does not exist.")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        try:
            if self._api_v1_delete(parsed.path, parse_qs(parsed.query)):
                return
        except Exception as exc:
            traceback.print_exc()
            return self._v1_error(500, "internal_error", human_error(exc))
        return self._v1_error(404, "route_not_found", "That API route does not exist.")

    # ────────────────────────────────────────────────── scripts and blocks


    def _run(self, kind: str, **fields):
        """Open a run in the ledger and hand back its id.

        Writing the line at the start rather than the end is what lets the
        Activity screen show what is happening right now, survive a reload,
        record how long it took, and — because the row already exists — point
        at whatever it eventually produced.
        """
        return db.job_start(kind, **fields)

    def _done(self, run_id, **fields):

        """Close an open run: how long it took, what it cost, what it produced."""
        return db.job_finish(run_id, **fields)

    def _log(self, kind: str, **fields):
        """Write one run to the ledger. Called on success, on failure and on a
        refusal — an appeal that failed still costs, and a blocked one is the
        most interesting line of all when you're wondering what happened."""
        return db.job(kind, **fields)

    def _check_budget(self, estimate: float, payload: dict):
        """Return a JSON body to send back instead of rendering, or None to proceed.

        The guard lives on the server, not just in the UI, so the command line
        and any future client are covered by the same limits.
        """
        settings = prefs()
        cap = float(settings.get("daily_cap") or 0)
        if cap > 0:
            spent = db.spend_totals().get("today", 0.0)
            if spent + estimate > cap:
                self._log("blocked", status="blocked", estimated=estimate,
                          detail=f"daily cap of ${cap:.2f} reached")
                return {
                    "error": f"Daily cap reached. You've spent ${spent:.4f} today and "
                             f"this would add ${estimate:.4f}, over your ${cap:.2f} cap. "
                             f"Raise it in Settings if you want to continue.",
                    "capped": True,
                }, 402

        warn = float(settings.get("warn_above") or 0)
        if warn > 0 and estimate > warn and not payload.get("confirmed"):
            return {
                "needs_confirmation": True,
                "estimate": round(estimate, 4),
                "warn_above": warn,
            }, 200
        return None

    def _serve_batch_file(self, folder: str, name: str):
        """Serve one row's audio, or the whole batch as a zip."""
        root = (out_dir() / Path(folder).name).resolve()
        target = (root / Path(name).name).resolve()
        if not target.exists() or root not in target.parents:
            return self._json({"error": "not found"}, 404)
        if target.suffix == ".zip":
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition",
                             f'attachment; filename="{folder}.zip"')
            self.end_headers()
            self.wfile.write(data)
            return
        return self._serve_audio(target.name, root)

    # ──────────────────────────────────────────────────────── projects

    def _readable(self, generation_id: int, extension: str = "mp3"):
        """The download name and the tags for one recording."""
        place = db.place_of(generation_id) or {}
        settings = naming.merged(db.setting("naming", prefs().get("naming", {})),
                                 place.get("venture_naming"))
        context = {
            "venture": place.get("venture", ""),
            "project": place.get("project", ""),
            "folder": place.get("folder", ""),
            "part": place.get("part"),
            "take": place.get("take"),
            "date": datetime.now().strftime("%Y-%m-%d"),
        }
        row = db.get(generation_id) or {}
        context["voice"] = row.get("voice", "")
        return {
            "filename": naming.download_name(context, settings, extension),
            "tags": naming.id3(context, settings),
            "cover": (place.get("venture_icon") or "") if settings.get("cover") else "",
            "settings": settings, "context": context,
        }

    def _download(self, query: dict):
        """Serve a recording under the name a person would expect, with its tags
        written in. The stored file is never modified."""
        generation_id = int(query.get("id", ["0"])[0] or 0)
        row = db.get(generation_id)
        if not row or not row.get("filename"):
            return self._json({"error": "That recording is gone."}, 404)
        kind = (query.get("kind", ["mp3"])[0] or "mp3").lower()
        if kind not in ("mp3", "srt", "vtt", "txt"):
            return self._json({"error": "Unknown file type."}, 400)

        readable = self._readable(generation_id, kind)
        if kind != "mp3":
            found = db.transcript_for(generation_id)
            if not found:
                return self._json({"error": "No subtitles for this part yet."}, 404)
            full = db.transcript_get(found["id"])
            body = {"srt": full["srt"], "vtt": full["vtt"],
                    "txt": full["text"]}[kind].encode("utf-8")
            return self._send_download(body, readable["filename"],
                                       "text/plain; charset=utf-8")

        source = (out_dir() / Path(row["filename"]).name).resolve()
        if out_dir().resolve() not in source.parents or not source.exists():
            return self._json({"error": "The audio file is missing."}, 404)

        # Tagging copies the stream rather than re-encoding it, so nothing is
        # lost and it takes milliseconds. If it fails for any reason the plain
        # file is served instead — a download must never be blocked by metadata.
        body = source.read_bytes()
        if readable["tags"] or readable["cover"]:
            tagged = TAGGED_DIR / f"{uuid.uuid4().hex}.mp3"
            TAGGED_DIR.mkdir(exist_ok=True)
            cover = self._cover_file(readable["cover"])
            try:
                if naming.write_tags(source, tagged, readable["tags"], cover):
                    body = tagged.read_bytes()
            finally:
                tagged.unlink(missing_ok=True)
                if cover and cover.parent == TAGGED_DIR:
                    cover.unlink(missing_ok=True)
        return self._send_download(body, readable["filename"], "audio/mpeg")

    def _cover_file(self, icon: str):
        """Artwork for the MP3: an uploaded venture image, or its emoji drawn
        into a square so the file still looks like something in a player."""
        if not icon:
            return None
        if icon.startswith("/icon/"):
            found = (ICONS_DIR / Path(icon).name).resolve()
            return found if found.exists() else None
        return None

    def _send_download(self, body: bytes, filename: str, content_type: str):

        """Send a file under a name built for a human, tags written in."""
        quoted = quote(filename)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition",
                         f"attachment; filename*=UTF-8''{quoted}")
        self.end_headers()
        self.wfile.write(body)

    def _project_open(self, query: dict):
        """A project with its parts and its breadcrumb, ready to render."""
        project_id = int(query.get("id", ["0"])[0] or 0)
        project = db.project_get(project_id)
        if not project:
            return self._json({"error": "That project is gone."}, 404)
        parts = db.project_parts(project_id)
        subtitled = db.transcribed_ids(project_id)
        translated = db.translated_ids(project_id)
        for part in parts:
            part["takes"] = db.take_count(part["id"])
            part["subtitled"] = part["id"] in subtitled
            part["subtitles_stale"] = bool(subtitled.get(part["id"]))
            part["languages"] = sorted(set(translated.get(part["id"], [])))
        return self._json({
            **project,
            "bucket": db.is_bucket(project_id),
            "parts": parts,
            "children": [p for p in db.project_tree() if p["parent_id"] == project_id],
            "total_cost": round(sum(p["cost"] for p in parts), 4),
            "total_bytes": sum(p["size_bytes"] or 0 for p in parts),
        })

    def _project_create(self, payload: dict):
        """A new Venture, Project or Production — type follows from where it
        is created, so there is nothing to choose and nothing to get wrong."""
        parent_id = payload.get("parent_id") or None
        if parent_id and not db.project_get(int(parent_id)):
            return self._json({"error": "That place is gone."}, 404)
        # Unsorted is a landing pile, not somewhere you build a structure.
        if parent_id and db.is_bucket(int(parent_id)):
            return self._json({
                "error": "Unsorted just holds whatever you make without "
                         "choosing a place. Start a venture instead, and file "
                         "these into it."}, 400)
        level = db.level_for_parent(parent_id)
        parent_type = db.container_type_of(int(parent_id)) if parent_id else None
        if parent_id and parent_type not in ("venture", "project"):
            return self._json({
                "error": "Only a Venture can hold Projects, and only a Project "
                         "can hold Productions."}, 400)
        new_id = db.project_create(payload.get("name") or "Untitled",
                                   parent_id, level)
        if level == "venture":
            db.ensure_assets(new_id)
        return self._json({"id": new_id, "level": level})

    def _reject_wrong_level(self, project_id: int):
        """A recording only belongs in a Production — or in the Inbox, where
        anything made without choosing a place lands."""
        if db.can_hold_recordings(project_id):
            return None
        container_type = db.container_type_of(project_id) or "unknown container"
        return self._json({
            "error": f"Recordings live in Productions. This is a {container_type}. "
                     "Open a Production inside its Project, or create one."}, 400)

    def _text_prompts(self, query: dict):
        """Exactly what is sent to the model, so it is never a black box."""
        project_id = int(query.get("id", ["0"])[0] or 0)
        style = db.style_for(project_id) if project_id else ""
        rewrite.use_settings(db.setting("prompts", {}))
        return self._json({
            "templates": rewrite.templates(),
            "defaults": rewrite.DEFAULTS,
            "variables": rewrite.variables(),
            "edited": list((db.setting("prompts", {}) or {})),
            "style": style,
            "shape": rewrite.shape_prompt(style),
            "tag": {level: rewrite.tag_prompt(level, style)
                    for level in rewrite.DENSITIES},
            "model": rewrite.MODEL,
        })

    def _voice_describe(self, payload: dict):
        """Ask Qwen to listen to the reference clip and describe the voice.

        It hears the recording — `qwen3-omni-flash` takes audio directly — and
        proposes the same fields Alibaba publishes for its own voices. You
        correct whatever it gets wrong; nothing is saved until you do.
        """
        url = (payload.get("url") or "").strip()
        if not url.startswith("http"):
            return self._json({"error": "Add the reference recording first."}, 400)

        guard = self._check_budget(0.002, payload)
        if guard:
            return self._json(*guard)

        say.apply_credentials()
        from dashscope import MultiModalConversation
        run = self._run("describe", model="qwen3-omni-flash", estimated=0.002,
                        total=1, detail="listening to a clone reference")
        job = start_progress(done=0, total=1, stage="Listening to the voice")
        try:
            answer = MultiModalConversation.call(
                model="qwen3-omni-flash",
                messages=[{"role": "user", "content": [
                    {"audio": url},
                    {"text":
                     "Describe the SPEAKER of this recording, not what they say. "
                     "Reply with only a JSON object, no other words, with keys: "
                     "gender (male/female), age (a number), trait (two or three "
                     "words for the character of the voice, like 'warm measured' "
                     "or 'bright energetic'), scene (what it suits best, like "
                     "'audiobook', 'meditation', 'news', 'advertising'), "
                     "languages (what they appear to speak)."}]}],
                modalities=["text"],
            )
        finally:
            clear_progress(job)

        try:
            content = answer["output"]["choices"][0]["message"]["content"]
            text = content if isinstance(content, str) else "".join(
                part.get("text", "") for part in content)
            found = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
        except Exception:
            self._done(run, status="failed", error="unreadable answer")
            return self._json({"error": "Qwen replied with something I couldn't "
                                        "read. Fill the fields in yourself."}, 502)
        self._done(run, status="ok", cost=0.002, done=1)
        return self._json({"suggestion": {
            "gender": str(found.get("gender", ""))[:20],
            "age": found.get("age"),
            "trait": str(found.get("trait", ""))[:60],
            "scene": str(found.get("scene", ""))[:60],
            # It sometimes answers with a list; a person wants a sentence.
            "languages": (", ".join(found["languages"])
                          if isinstance(found.get("languages"), list)
                          else str(found.get("languages", "")))[:80],
        }})

    def _voice_try(self, payload: dict):
        """Hear a voice say your own sentence.

        Alibaba's preview clip is their phrase, in Chinese for most voices —
        useless for judging whether a voice suits a sleep guide. This says your
        line instead. It costs real money, so it is recorded like any other
        recording and lands in Unsorted where the spend is visible.
        """
        text = (payload.get("text") or "").strip()
        if not text:
            return self._json({"error": "Type a line for it to say."}, 400)
        text = text[:300]
        options = Options({**payload, "text": text})
        guard = self._check_budget(
            estimate_cost(text, options.model, options.engine), payload)
        if guard:
            return self._json(*guard)

        made = self._make_audio(text, options, label="Trying a voice")
        if "error" in made:
            return self._json(made, 400)
        row = made["row"]
        db.record({**row, "project_id": db.ensure_unsorted(),
                   "position": db.next_position(db.ensure_unsorted()),
                   "kind": "audio",
                   "title": f"Voice trial — {options.voice}", "failures": []})
        return self._json({"url": f"/audio/{row['filename']}",
                           "cost": round(row["cost"], 4)})

    def _voice_save(self, payload: dict):
        """A voice's picture, favourite flag or note."""
        voice = (payload.get("id") or "").strip()
        fields = {k: payload[k] for k in (
            "image", "favourite", "note", "name", "gender", "age", "trait",
            "scene", "languages", "provider_voice_id", "engine", "target_model",
            "provider_status")
                  if k in payload}
        if not voice or not fields:
            return self._json({"error": "Need a voice and at least one field to save."}, 400)
        if not db.voice_save(voice, **fields):
            return self._json({"error": "The voice exists, but its details could not be saved."}, 503)
        return self._json({"ok": True})

    def _voice_usage(self):
        """What you have actually done with each voice.

        A catalogue tells you what a voice sounds like. This tells you whether
        you use it — which is the thing you want to know when picking one.
        """
        return self._json({"usage": db.voice_usage()})

    def _voice_registry(self):
        """One model-aware catalogue for every UI and API client."""
        return self._json(alibaba_voice_registry.assemble(
            db.voice_custom_bindings(), db.voice_meta(), db.voice_binding_references()))

    def _venture_assets(self, query: dict):
        """Reusable audio owned by the Venture containing this resource."""
        project_id = int(query.get("id", ["0"])[0] or 0)
        venture = db.venture_of(project_id)
        if not venture:
            return self._json({"assets": [], "venture": ""})
        db.ensure_assets(venture["id"])
        return self._json({"venture": venture["name"], "venture_id": venture["id"],
                           "collections": db.asset_collections_for_venture(venture["id"]),
                           "assets": db.venture_assets(venture["id"])})

    def _insert_asset(self, payload: dict):
        """Drop a link to an Asset into a Production sequence."""
        project_id = int(payload.get("project_id") or 0)
        if not db.project_get(project_id):
            return self._json({"error": "That Production is gone."}, 404)
        wrong = self._reject_wrong_level(project_id)
        if wrong:
            return wrong
        asset = db.asset_get(int(payload.get("asset_id") or 0))
        if not asset or not asset.get("filename"):
            return self._json({"error": "That asset is gone."}, 404)
        context = db.asset_library_context(asset["id"])
        if context and context.get("collection") == "Music":
            return self._json({
                "error": "Music is a background bed, not a sequential clip. "
                         "Use Add music bed instead."}, 400)
        if not db.asset_allowed(project_id, asset["id"], {"Intros", "Outros", "Stingers"}):
            return self._json({
                "error": "That clip is not in this Venture's Intros, Outros "
                         "or Stingers library."}, 400)
        new_id = db.asset_insert(project_id, asset["id"], payload.get("insert_at"))
        return self._json({"id": new_id})

    def _project_music(self, payload: dict):
        """Set one Venture-owned Music asset as a Production background bed."""
        project_id = int(payload.get("id") or 0)
        if not db.project_get(project_id):
            return self._json({"error": "That production is gone."}, 404)
        wrong = self._reject_wrong_level(project_id)
        if wrong:
            return wrong
        music_of = payload.get("music_of")
        if music_of not in (None, "", 0, "0"):
            try:
                music_id = int(music_of)
            except (TypeError, ValueError):
                return self._json({"error": "Choose a valid music file."}, 400)
            if not db.asset_allowed(project_id, music_id, {"Music"}):
                return self._json({
                    "error": "Background music must come from this Venture's "
                             "Music library."}, 400)
        if not db.music_set(project_id, payload):
            return self._json({"error": "Those music settings could not be saved."}, 400)
        return self._json({"ok": True})

    def _project_move(self, payload: dict):
        """File a project under a different parent, or at the top level."""
        problem = db.project_move(int(payload.get("id") or 0),
                                  payload.get("parent_id"))
        return self._json({"error": problem}, 400) if problem else self._json({"ok": True})

    def _project_stitch(self, payload: dict):
        """Render a normalized, reproducible snapshot of one Production."""
        project_id = int(payload.get("id") or 0)
        project = db.project_get(project_id)
        if not project:
            return self._json({"error": "That Production is gone."}, 404)
        wrong = self._reject_wrong_level(project_id)
        if wrong:
            return wrong
        # Earlier stitches live in the same list; folding one into the next
        # would play the whole project twice.
        everything = db.project_parts(project_id)
        parts = [p for p in everything if p["kind"] not in ("stitch", "draft")]
        broken = [i + 1 for i, p in enumerate(parts) if p.get("missing")]
        if broken:
            return self._json({
                "error": f"Part{'s' if len(broken) > 1 else ''} "
                         f"{', '.join(map(str, broken))} point at an asset that "
                         f"has been deleted. Remove "
                         f"{'them' if len(broken) > 1 else 'it'} or put the "
                         f"asset back, then stitch again."}, 400)
        drafts = [p for p in everything if p["kind"] == "draft"]
        if not parts:
            return self._json({"error": "Nothing recorded in this project yet."}, 400)
        if drafts:
            return self._json({
                "error": f"{len(drafts)} part"
                         f"{'s are' if len(drafts) > 1 else ' is'} still a draft. "
                         f"Record {'them' if len(drafts) > 1 else 'it'} first, or "
                         f"delete {'them' if len(drafts) > 1 else 'it'} — otherwise "
                         f"the stitch would silently miss "
                         f"{'those parts' if len(drafts) > 1 else 'that part'}."}, 400)

        subs = _stitch_subtitles(parts)
        name = _unique_output_name(f"{project['name']}-full", "mp3")
        target = out_dir() / name
        rendered, manifest_parts, render_error = _render_sequence(parts, target)
        if not rendered:
            target.unlink(missing_ok=True)
            return self._json({"error": render_error}, 500)

        # Music goes on last, over the finished voice, so every part's subtitle
        # timing still lines up with what you hear.
        music = db.music_get(project_id)
        mixed_in = False
        if music.get("filename"):
            source = (out_dir() / Path(music["filename"]).name).resolve()
            blended = out_dir() / _unique_output_name(f"{Path(name).stem}-mixed", "mp3")
            if not source.exists() or out_dir().resolve() not in source.parents:
                target.unlink(missing_ok=True)
                return self._json({"error": "The selected background music file is missing."}, 400)
            if not _mix_music(target, source, music, blended):
                target.unlink(missing_ok=True)
                blended.unlink(missing_ok=True)
                return self._json({"error": "The background music could not be mixed."}, 500)
            os.replace(blended, target)
            mixed_in = True
            blended.unlink(missing_ok=True)
        audio_size = target.stat().st_size
        export_manifest = {
            "version": 1,
            "production_id": project_id,
            "production_name": project["name"],
            "parts": manifest_parts,
            "background": ({
                "asset_id": music.get("music_of"),
                "filename": Path(music["filename"]).name,
                "level": music.get("level"),
                "volume": music.get("volume"),
                "start": music.get("start"),
                "fade_in": music.get("fade_in"),
                "fade_out": music.get("fade_out"),
                "duck": music.get("duck"),
            } if mixed_in else None),
            "output": {"filename": name, "codec": "mp3", "bitrate": "192k",
                       "sample_rate": 48000, "channels": 2},
            "renderer": "ffmpeg-normalized-v1",
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        manifest_path = out_dir() / f"{Path(name).stem}.manifest.json"
        manifest_path.write_text(
            json.dumps(export_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        duration_ms = measure_ms(name)
        generation_id = db.record({
            "text": f"Stitched from {len(parts)} parts of {project['name']}",
            "voice": "-", "model": "-", "format": "mp3", "language": None,
            "instruction": None, "rate": 1, "pitch": 1, "volume": 50, "seed": 0,
            "filename": name, "path": str(out_dir() / name),
            "size_bytes": audio_size, "duration_ms": duration_ms, "chars": 0, "requests": len(parts),
            "cost": 0, "project_id": project_id, "position": None,
            "kind": "stitch", "title": f"Full — {len(parts)} parts", "failures": [],
        })
        export_id = (db.export_record(
            project_id, generation_id, name, export_manifest,
            "ffmpeg-normalized-v1", duration_ms, audio_size)
            if generation_id else None)
        if subs["srt"]:
            (out_dir() / f"{Path(name).stem}.srt").write_text(subs["srt"], encoding="utf-8")
            (out_dir() / f"{Path(name).stem}.vtt").write_text(subs["vtt"], encoding="utf-8")
        return self._json({"url": f"/audio/{name}", "name": name,
                           "size_mb": round(audio_size / 1_000_000, 2),
                           "parts": len(parts), "subtitles": subs["cues"],
                           "missing_subtitles": subs["missing"],
                           "stale_subtitles": subs["stale"],
                           "music": mixed_in, "manifest": manifest_path.name,
                           "export_id": export_id,
                           "srt_url": (f"/audio/{Path(name).stem}.srt"
                                       if subs["srt"] else None)})

    def _project_preview(self, payload: dict):
        """Hear the current sequence and mix without publishing an Export."""
        project_id = int(payload.get("id") or 0)
        project = db.project_get(project_id)
        if not project:
            return self._json({"error": "That Production is gone."}, 404)
        wrong = self._reject_wrong_level(project_id)
        if wrong:
            return wrong
        result = _production_preview(project_id)
        return self._json(result, 400 if result.get("error") else 200)

    def _generation_move(self, payload: dict):
        """Move a recording into another Production."""
        target = int(payload.get("project_id") or 0)
        if not db.project_get(target):
            return self._json({"error": "That Production is gone."}, 404)
        wrong = self._reject_wrong_level(target)
        if wrong:
            return wrong
        return self._json({"ok": db.generation_move(int(payload["id"]), target)})

    def _promote_take(self, payload: dict):
        """Swap an older take into use. Neither take is lost."""
        take_id = int(payload.get("id") or 0)
        take = db.get(take_id)
        if not take:
            return self._json({"error": "That take is gone."}, 404)
        part_id = db.take_part_id(take_id)
        if not part_id:
            return self._json({"error": "That take is no longer linked to a Part."}, 404)
        ok = db.promote_take(take_id)
        stale = db.mark_transcripts_stale(part_id) if ok else 0
        return self._json({"ok": ok, "subtitles_stale": stale})

    def _part_duplicate(self, payload: dict):
        """A copy of a part, sitting right after the original.

        The audio is copied too, so editing or deleting one never touches the
        other — and it costs nothing, because nothing is re-synthesised.
        """
        part = db.get(int(payload.get("id") or 0))
        if not part:
            return self._json({"error": "That part is gone."}, 404)

        copied = None
        if part["filename"]:
            source = (out_dir() / Path(part["filename"]).name).resolve()
            if out_dir().resolve() in source.parents and source.exists():
                copied = f"{source.stem}-copy-{datetime.now():%H%M%S%f}{source.suffix}"
                (out_dir() / copied).write_bytes(source.read_bytes())

        new_id = db.part_duplicate(part["id"], copied)
        if not new_id:
            return self._json({"error": "Could not copy that part."}, 500)
        return self._json({"id": new_id, "filename": copied})

    def _parts_delete(self, payload: dict):
        """Delete several parts in one go, files and older takes included."""
        ids = [int(i) for i in payload.get("ids", [])]
        if not ids:
            return self._json({"error": "Nothing selected."}, 400)
        for name in db.parts_delete(ids):
            target = (out_dir() / Path(name).name).resolve()
            if out_dir().resolve() in target.parents and target.exists():
                target.unlink()
        return self._json({"deleted": len(ids)})

    def _parts_move(self, payload: dict):
        """Re-file several Parts into another Production."""
        ids = [int(i) for i in payload.get("ids", [])]
        project_id = int(payload.get("project_id") or 0)
        if not ids or not project_id:
            return self._json({"error": "Pick some Parts and a Production."}, 400)
        if not db.project_get(project_id):
            return self._json({"error": "That Production is gone."}, 404)
        wrong = self._reject_wrong_level(project_id)
        if wrong:
            return wrong
        db.parts_move(ids, project_id)
        return self._json({"moved": len(ids)})

    def _part_languages(self, query: dict):
        """Everything written down for one recording, original and translations."""
        return self._json({"transcripts": db.transcripts_for(
            int(query.get("id", ["0"])[0] or 0))})

    def _make_audio(self, text: str, options, label: str = "Recording",
                    own_progress: bool = True, durable_job: bool = False) -> dict:
        """Text in, saved audio file out.

        The one place synthesis happens for a part, so a new take, a rendered
        draft and a batch render all produce identical rows — same naming, same
        cost maths, same measured length.
        """
        say.apply_credentials()
        incompatible = delivery_error(text, options)
        if incompatible:
            return {"error": incompatible}
        spoken, _ = say.apply_pronunciations(text)
        spoken, _ = maybe_normalise(spoken)
        chunks = say.chunk_text(spoken)

        run = None if durable_job else self._run("speech", model=options.model_id,
                        estimated=estimate_cost(spoken, options.model, options.engine),
                        chars=len(spoken), voice=options.voice,
                        voice_identity_id=options.voice_identity_id,
                        provider_voice_id=options.voice, engine=options.engine,
                        tier=options.model, detail=label,
                        total=len(chunks), parent_id=getattr(self, "_parent_run", None),
                        project_id=getattr(self, "_run_project", None))
        job = start_progress(done=0, total=len(chunks), stage=label) if own_progress else None
        try:
            audio, failures, transcripts, usage = alibaba_speech.synthesize(
                chunks, options,
                on_progress=(lambda i, n, t: set_progress(job, done=i - 1, total=n,
                                                          label=t[:60]))
                if own_progress else None)
        finally:
            if own_progress:
                clear_progress(job)
        if not audio:
            if run is not None:
                self._done(run, status="failed", error="the model returned no audio")
            return {"error": "Nothing rendered — the model returned no audio."}

        # An opaque name that never changes and can never collide. What a
        # person reads is built at download time from where the part lives, so
        # renaming a venture never touches a single file.
        name = f"{uuid.uuid4().hex}.{output_extension(options.format)}"
        (out_dir() / name).write_bytes(audio)
        cost, cost_basis = speech_cost(spoken, options, usage)
        provider_text = " ".join(item.strip() for item in transcripts if item.strip())
        compared_text = say.strip_known_tags(spoken) if options.engine == "omni" else spoken
        fidelity = (alibaba_fidelity.assess(compared_text, provider_text)
                    if options.engine == "omni" else {})
        short = truncation_warning(compared_text, measure_ms(name), options)
        fidelity_warning = fidelity.get("message") if fidelity.get("status") in ("warning", "failed", "unverified") else None
        status = "failed" if failures else "warning" if short or fidelity_warning else "ok"
        run_error = (f"{len(failures)} chunk(s) failed" if failures else
                     fidelity_warning or short)
        if run is not None:
            self._done(run, status=status,
                       cost=cost, seconds=(measure_ms(name) or 0) / 1000,
                       done=len(chunks), usage=usage, cost_basis=cost_basis,
                       error=run_error)
        return {
            "run": run,
            "row": {
                "text": text, "voice": options.voice,
                "voice_identity_id": options.voice_identity_id,
                "engine": options.engine,
                "model": options.model,
                "format": options.format, "language": options.language,
                "instruction": options.instruction, "speech_mode": options.speech_mode,
                "rate": options.rate,
                "pitch": options.pitch, "volume": options.volume,
                "seed": options.seed, "filename": name,
                "path": str(out_dir() / name), "size_bytes": len(audio),
                "duration_ms": measure_ms(name), "chars": len(spoken),
                "requests": len(chunks), "cost": cost,
                "usage": usage, "cost_basis": cost_basis,
                "provider_text": provider_text or None, "fidelity": fidelity,
            },
            "summary": {"name": name, "url": f"/audio/{quote(name)}",
                        "cost": round(cost, 4),
                        "warning": fidelity_warning or short,
                        "returned_text": provider_text or None,
                        "fidelity": fidelity,
                        "usage": usage, "cost_basis": cost_basis,
                        "voice_route": options.voice_route,
                        "failures": [f._asdict() for f in failures]},
            "status": status, "error": run_error,
        }

    def _regenerate(self, payload: dict):
        """Make a fresh take of an existing part, keeping the old one."""
        durable_job = bool(payload.pop("_durable_job", False))
        part = db.get(int(payload.get("id") or 0))
        if not part:
            return self._json({"error": "That part is gone."}, 404)

        # Anything not overridden keeps the part's own settings.
        settings = {**{k: part[k] for k in
                       ("text", "voice", "voice_identity_id", "engine", "model", "format", "language",
                        "instruction", "speech_mode", "rate", "pitch", "volume", "seed",
                        "text_raw", "text_shaped", "text_tagged", "text_state")},
                    **{k: v for k, v in payload.items() if v is not None
                       and k not in ("id", "confirmed")}}
        text = (settings.get("text") or "").strip()
        if not text:
            return self._json({"error": "Nothing to say."}, 400)

        options = Options(settings)
        incompatible = delivery_error(text, options)
        if incompatible:
            return self._json({"error": incompatible}, 400)
        guard = self._check_budget(estimate_cost(text, options.model, options.engine), payload)
        if guard:
            return self._json(*guard)

        made = self._make_audio(text, options, label="Making another take",
                                durable_job=durable_job)
        if "error" in made:
            return self._json(made, 500)

        # Old take is put aside only once the new audio exists, so a failure
        # above never loses anything.
        db.archive_take(part["id"])
        text_states = {key: settings.get(key) for key in
                       ("text_raw", "text_shaped", "text_tagged", "text_state")}
        db.replace_take(part["id"], {**made["row"], **text_states})
        if made.get("run") is not None:
            db.job_finish(made.get("run"), status=made["status"], error=made.get("error"),
                          generation_id=part["id"], project_id=part["project_id"])
        # The words are now spoken differently, so anything written from the old
        # audio describes a recording that no longer exists.
        stale = db.mark_transcripts_stale(part["id"])
        return self._json({"id": part["id"], **made["summary"],
                           "takes": db.take_count(part["id"]),
                           "subtitles_stale": stale})

    def _silence_edit(self, payload: dict):
        """Change how long a gap lasts, without deleting and re-adding it."""
        seconds = max(0.1, min(120.0, float(payload.get("seconds") or 4)))
        ok = db.replace_take(int(payload["id"]), {
            "title": f"{seconds:g}", "text": f"{seconds:g} seconds of silence"})
        return self._json({"ok": ok, "seconds": seconds})

    def _silence_part(self, payload: dict):
        """Add a gap. Costs nothing and needs no model."""
        project_id = int(payload.get("project_id") or 0)
        if not db.project_get(project_id):
            return self._json({"error": "Open a project first."}, 400)
        wrong = self._reject_wrong_level(project_id)
        if wrong:
            return wrong
        seconds = max(0.1, min(120.0, float(payload.get("seconds") or 4)))
        at = payload.get("insert_at")
        position = int(at) if at is not None else db.next_position(project_id)
        new_id = db.record({
            "text": f"{seconds:g} seconds of silence", "voice": "-", "model": "-",
            "format": "mp3", "language": None, "instruction": None,
            "rate": 1, "pitch": 1, "volume": 50, "seed": 0,
            "filename": "", "path": "", "size_bytes": 0, "chars": 0,
            "requests": 0, "cost": 0, "project_id": project_id,
            "position": position, "kind": "silence",
            "title": f"{seconds:g}", "failures": [],
        }, insert_at=position if at is not None else None)
        return self._json({"id": new_id, "seconds": seconds})

    def _draft_part(self, payload: dict):
        """Write a part down without making its audio.

        A draft is a real part in the sequence — it just hasn't been spoken yet,
        so it has words and settings but no voice file, no length and no cost.
        """
        # No project chosen means the same thing here as it does for a
        # recording: it lands in Unsorted and can be filed later.
        project_id = int(payload.get("project_id") or 0) or db.ensure_unsorted()
        if not db.project_get(project_id):
            return self._json({"error": "That folder is gone."}, 404)
        wrong = self._reject_wrong_level(project_id)
        if wrong:
            return wrong
        text = (payload.get("text") or "").strip()
        if not text:
            return self._json({"error": "Write something first."}, 400)

        existing = int(payload.get("id") or 0)
        # Run it through Options so a draft is stored with the same defaults a
        # recorded part gets — otherwise "render later" would change the sound.
        chosen = Options(payload)
        settings = {"voice": chosen.voice,
                    "voice_identity_id": chosen.voice_identity_id,
                    "engine": chosen.engine,
                    "model": chosen.model,
                    "format": chosen.format, "language": chosen.language,
                    "instruction": chosen.instruction, "speech_mode": chosen.speech_mode,
                    "rate": chosen.rate,
                    "pitch": chosen.pitch, "volume": chosen.volume,
                    "seed": chosen.seed,
                    "text_raw": payload.get("text_raw"),
                    "text_shaped": payload.get("text_shaped"),
                    "text_tagged": payload.get("text_tagged"),
                    "text_state": payload.get("text_state") or "raw"}
        if existing:
            db.draft_save(existing, {**settings, "text": text,
                                     "chars": len(text)})
            return self._json({"id": existing, "saved": True})

        at = payload.get("insert_at")
        position = int(at) if at is not None else db.next_position(project_id)
        new_id = db.record({
            **settings, "text": text,
            "filename": "", "path": "", "size_bytes": 0, "duration_ms": 0,
            "chars": len(text), "requests": 0, "cost": 0,
            "project_id": project_id, "position": position, "kind": "draft",
            "title": None, "failures": [],
        }, insert_at=position if at is not None else None)
        return self._json({"id": new_id})

    def _render_draft(self, payload: dict):
        """Speak a draft, turning it into an ordinary recorded part."""
        durable_job = bool(payload.pop("_durable_job", False))
        part = db.get(int(payload.get("id") or 0))
        if not part:
            return self._json({"error": "That part is gone."}, 404)
        if part["kind"] != "draft":
            return self._json({"error": "That part already has audio."}, 400)

        settings = {**{k: part[k] for k in
                       ("text", "voice", "voice_identity_id", "engine", "model", "format", "language",
                        "instruction", "speech_mode", "rate", "pitch", "volume", "seed",
                        "text_raw", "text_shaped", "text_tagged", "text_state")},
                    **{k: v for k, v in payload.items() if v is not None
                       and k not in ("id", "confirmed")}}
        text = (settings.get("text") or "").strip()
        if not text:
            return self._json({"error": "Nothing to say."}, 400)

        options = Options(settings)
        incompatible = delivery_error(text, options)
        if incompatible:
            return self._json({"error": incompatible}, 400)
        guard = self._check_budget(
            estimate_cost(text, options.model, options.engine), payload)
        if guard:
            return self._json(*guard)

        made = self._make_audio(text, options, label=f"Part {(part['position'] or 0) + 1}",
                                durable_job=durable_job)
        if "error" in made:
            return self._json(made, 400)

        text_states = {key: settings.get(key) for key in
                       ("text_raw", "text_shaped", "text_tagged", "text_state")}
        db.replace_take(part["id"], {**made["row"], **text_states, "kind": "audio"})
        if made.get("run") is not None:
            db.job_finish(made.get("run"), status=made["status"], error=made.get("error"),
                          generation_id=part["id"], project_id=part["project_id"])
        return self._json({"id": part["id"], **made["summary"]})

    def _render_drafts(self, payload: dict):
        """Speak every draft in a project, in order, so one press covers a script."""
        project_id = int(payload.get("id") or 0)
        if not db.project_get(project_id):
            return self._json({"error": "That project is gone."}, 404)
        drafts = [p for p in db.project_parts(project_id) if p["kind"] == "draft"]
        if not drafts:
            return self._json({"error": "No drafts to render."}, 400)

        total = sum(estimate_cost(d["text"] or "", d["model"] or "plus",
                                  d.get("engine") or "audio")
                    for d in drafts)
        guard = self._check_budget(total, payload)
        if guard:
            return self._json(*guard)

        parent = self._run("batch", detail=f"recording {len(drafts)} drafts",
                           project_id=project_id, total=len(drafts),
                           estimated=total)
        self._parent_run, self._run_project = parent, project_id
        job = start_progress(done=0, total=len(drafts), stage="Recording drafts")
        done, failed = [], []
        routing_bindings = db.voice_custom_bindings()
        try:
            for index, draft in enumerate(drafts, 1):
                set_progress(job, done=index - 1, total=len(drafts),
                             label=f"Part {(draft['position'] or 0) + 1}")
                db.job_progress(parent, index - 1, len(drafts))
                options = Options({k: draft[k] for k in
                                   ("voice", "voice_identity_id", "engine", "model", "format", "language",
                                    "instruction", "rate", "pitch", "volume", "seed")},
                                  bindings=routing_bindings)
                made = self._make_audio(draft["text"] or "", options,
                                        label=f"Part {(draft['position'] or 0) + 1}",
                                        own_progress=False)
                if "error" in made:
                    failed.append({"position": (draft["position"] or 0) + 1,
                                   "error": made["error"]})
                    continue
                db.replace_take(draft["id"], {**made["row"], "kind": "audio"})
                db.job_finish(made.get("run"), status=made["status"], error=made.get("error"),
                              generation_id=draft["id"], project_id=project_id)
                done.append(draft["id"])
        finally:
            clear_progress(job)
            self._parent_run = self._run_project = None
            db.job_finish(parent, status="ok" if not failed else "failed",
                          done=len(done),
                          error=(f"{len(failed)} part(s) failed" if failed else None))
        return self._json({"recorded": len(done), "failed": failed})

    def _known_voices(self) -> set:
        """Every voice this account can actually speak with, both tiers."""
        known = {item["provider_voice_id"]
                 for item in alibaba_voice_registry.system_bindings()}
        known.update(item.get("voice_id") for item in db.voice_custom_bindings()
                     if item.get("voice_id"))
        try:
            say.apply_credentials()
            known.update(v.get("voice_id") for v in self._enrollment().list_voices()
                         if v.get("voice_id"))
        except Exception:
            pass
        return {v for v in known if v}

    def _batch_check_voices(self, sheet: dict, column) -> dict:
        """Which voices in the sheet don't exist.

        A batch is the one place a typo costs a hundred failed renders, so the
        column is checked against the real catalogue before anything is spent.
        """
        if column is None:
            return {"unknown": [], "checked": 0}
        known = self._known_voices()
        seen, unknown = set(), {}
        for index, row in enumerate(sheet["rows"], 1):
            value = (row[column] if column < len(row) else "").strip()
            if not value or value in seen:
                continue
            seen.add(value)
            if value not in known:
                unknown[value] = index
        return {"unknown": [{"voice": v, "first_row": r} for v, r in unknown.items()],
                "checked": len(seen)}

    def _batch_preview(self, raw: bytes):
        """Read a spreadsheet and report what's in it, before anything is spent."""
        name = unquote(self.headers.get("X-Filename", "sheet.csv"))
        try:
            sheet = batch.read(name, raw)
        except ValueError as exc:
            return self._json({"error": str(exc)}, 400)

        BATCHES.mkdir(exist_ok=True)
        token = f"{datetime.now():%Y%m%d-%H%M%S}"
        (BATCHES / f"{token}.json").write_text(json.dumps(sheet))
        guess = batch.guess_columns(sheet["headers"])
        return self._json({
            "token": token, "name": Path(name).name,
            "headers": sheet["headers"],
            "rows": len(sheet["rows"]),
            "preview": sheet["rows"][:8],
            "guess": guess,
            "voices": self._batch_check_voices(sheet, guess.get("voice")),
            "truncated": sheet["truncated"], "max_rows": batch.MAX_ROWS,
        })

    def _batch_run(self, payload: dict):
        """Speak every row. One bad row never stops the rest."""
        stored = BATCHES / f"{payload.get('token', '')}.json"
        if not stored.exists():
            return self._json({"error": "Load the spreadsheet again."}, 400)
        sheet = json.loads(stored.read_text())
        rows = sheet["rows"]

        columns = payload.get("columns") or {}
        text_column = columns.get("text")
        if text_column is None:
            return self._json({"error": "Say which column holds the words."}, 400)

        jobs = []
        for index, row in enumerate(rows):
            words = batch.cell(row, text_column)
            if words:
                jobs.append((index, row, words))
        if not jobs:
            return self._json({"error": "That column is empty on every row."}, 400)

        options = Options(payload)
        estimate = sum(estimate_cost(w, options.model, options.engine)
                       for _, _, w in jobs)
        guard = self._check_budget(estimate, payload)
        if guard:
            return self._json(*guard)

        say.apply_credentials()
        results, paths, total = [], [], 0.0
        folder = out_dir() / f"batch-{payload.get('token')}"
        folder.mkdir(parents=True, exist_ok=True)

        job = start_progress(done=0, total=len(jobs), stage="Speaking rows")
        try:
            for done, (index, row, words) in enumerate(jobs):
                set_progress(job, done=done, label=words[:60])
                label = batch.cell(row, columns.get("name")) or f"row-{index + 2}"
                try:
                    row_voice = batch.cell(row, columns.get("voice")) or options.voice
                    per_row = Options({
                        **payload,
                        "voice": row_voice,
                        "voice_identity_id": (options.voice_identity_id
                                              if row_voice == options.voice else None),
                        "language": batch.cell(row, columns.get("language"))
                                    or payload.get("language"),
                    }, bindings=options.routing_bindings)
                    prepared, _ = say.apply_pronunciations(words)
                    prepared, _ = maybe_normalise(prepared)
                    audio, failures, _, usage = alibaba_speech.synthesize(
                        say.chunk_text(prepared), per_row)
                    estimated_cost = estimate_cost(prepared, per_row.model, per_row.engine)
                    row_cost, cost_basis = speech_cost(prepared, per_row, usage)
                    self._log("batch", model=per_row.model_id,
                              status="ok" if audio else "failed",
                              estimated=estimated_cost,
                              cost=row_cost if audio else 0,
                              usage=usage, cost_basis=cost_basis,
                              chars=len(prepared), voice=per_row.voice,
                              voice_identity_id=per_row.voice_identity_id,
                              provider_voice_id=per_row.voice,
                              engine=per_row.engine, tier=per_row.model,
                              detail=f"row {index + 2}",
                              error=None if audio else "no audio came back")
                    if not audio:
                        raise RuntimeError("no audio came back")

                    filename = (f"{batch.safe_name(label, f'row-{index + 2}')}"
                                f".{output_extension(per_row.format)}")
                    target = folder / filename
                    target.write_bytes(audio)
                    paths.append(target)
                    cost = round(row_cost, 6)
                    total += cost
                    results.append({
                        "row": index + 2, "name": filename, "text": words[:90],
                        "url": f"/batch-audio/{folder.name}/{filename}",
                        "size_mb": round(len(audio) / 1_000_000, 2),
                        "cost": round(cost, 4), "failed_parts": len(failures),
                    })
                except Exception as exc:
                    results.append({"row": index + 2, "text": words[:90],
                                    "error": human_error(exc)})
        finally:
            clear_progress(job)

        if paths:
            (folder / "all.zip").write_bytes(batch.make_zip(paths))
        return self._json({
            "results": results, "cost": round(total, 4), "folder": folder.name,
            "zip": f"/batch-audio/{folder.name}/all.zip" if paths else None,
            "made": len(paths), "failed": len(results) - len(paths),
        })

    def _speak_many_languages(self, payload: dict):
        """Translate one script into several languages and speak each of them."""
        text = (payload.get("text") or "").strip()
        languages = [l for l in (payload.get("languages") or []) if l]
        if not text:
            return self._json({"error": "Type something to say first."}, 400)
        if not languages:
            return self._json({"error": "Pick at least one language."}, 400)
        unsupported = [l for l in languages if l not in translate.SPEAKABLE]
        if unsupported:
            return self._json({
                "error": f"The voice can't speak {', '.join(unsupported)}. "
                         f"They can still be translated for subtitles."}, 400)
        if not os.getenv("DASHSCOPE_API_KEY"):
            return self._json({"error": "No API key saved yet."}, 400)

        options = Options(payload)
        # Translations run longer than the source, so estimate generously
        # rather than surprising anyone with the bill.
        estimate = (estimate_cost(text, options.model, options.engine)
                    * len(languages) * 1.3)
        guard = self._check_budget(estimate, payload)
        if guard:
            return self._json(*guard)

        say.apply_credentials()
        source = payload.get("source") or None
        quality = payload.get("quality", "fast")
        results = []
        total_cost = 0.0

        job = start_progress(done=0, total=len(languages),
                     stage="Translating and speaking")
        try:
            for index, language in enumerate(languages):
                set_progress(job, done=index, label=language)
                try:
                    spoken = translate.translate_text(
                        text, target=language, source=source, model=quality)
                    prepared, _ = say.apply_pronunciations(spoken)
                    prepared, _ = maybe_normalise(prepared)
                    chunks = say.chunk_text(prepared)

                    # The language hint matters more than the voice here — the
                    # same voice speaks all sixteen, with the hint steering it.
                    per_language = Options({**payload, "language": language},
                                           bindings=options.routing_bindings)
                    audio, failures, _, usage = alibaba_speech.synthesize(chunks, per_language)
                    estimated_cost = estimate_cost(
                        prepared, per_language.model, per_language.engine)
                    language_cost, cost_basis = speech_cost(prepared, per_language, usage)
                    self._log("speech", model=per_language.model_id,
                              status="ok" if audio else "failed",
                              estimated=estimated_cost,
                              cost=language_cost if audio else 0,
                              usage=usage, cost_basis=cost_basis,
                              chars=len(prepared), voice=per_language.voice,
                              voice_identity_id=per_language.voice_identity_id,
                              provider_voice_id=per_language.voice,
                              engine=per_language.engine, tier=per_language.model,
                              detail=f"in {language}",
                              error=None if audio else "no audio came back")
                    if not audio:
                        raise RuntimeError("no audio came back")

                    name = (f"{say.slugify(text)}-{language.lower()}-"
                            f"{datetime.now():%H%M%S}."
                            f"{output_extension(per_language.format)}")
                    (out_dir() / name).write_bytes(audio)
                    cost = round(language_cost, 6)
                    total_cost += cost

                    db.record({
                        "text": spoken, "voice": per_language.voice,
                        "voice_identity_id": per_language.voice_identity_id,
                        "engine": per_language.engine,
                        "model": per_language.model, "format": "mp3",
                        "language": language, "instruction": per_language.instruction,
                        "rate": per_language.rate, "pitch": per_language.pitch,
                        "volume": per_language.volume, "seed": per_language.seed,
                        "filename": name, "path": str(out_dir() / name),
                        "size_bytes": len(audio), "duration_ms": measure_ms(name), "chars": len(prepared),
                        "requests": len(chunks), "cost": cost, "failures": [],
                        "usage": usage, "cost_basis": cost_basis,
                    })
                    results.append({
                        "language": language, "text": spoken, "name": name,
                        "url": f"/audio/{name}", "cost": round(cost, 4),
                        "size_mb": round(len(audio) / 1_000_000, 2),
                        "failed_parts": len(failures),
                    })
                except Exception as exc:
                    # One bad language must not lose the others.
                    results.append({"language": language, "error": human_error(exc)})
        finally:
            clear_progress(job)

        return self._json({"results": results, "cost": round(total_cost, 4)})

    def _vocabulary_save(self, payload: dict):
        """Create or replace a vocabulary, refusing anything the service would."""
        words, rejected = vocabulary.clean(payload.get("words", []))
        if not words:
            return self._json({
                "error": "Nothing usable in that list.", "rejected": rejected}, 400)

        say.apply_credentials()
        existing = (payload.get("id") or "").strip()
        if existing:
            vocabulary.update(existing, words)
            return self._json({"id": existing, "saved": len(words),
                               "rejected": rejected})

        prefix = (payload.get("prefix") or "").strip().lower()
        if not vocabulary.valid_prefix(prefix):
            return self._json({
                "error": "Name must be lowercase letters and numbers, "
                         "10 characters or fewer."}, 400)
        new_id = vocabulary.create(prefix, words)
        return self._json({"id": new_id, "saved": len(words), "rejected": rejected})

    def _transcript_payload(self, query: dict):

        """One transcript with its cues, shaped for the screen."""
        row = db.transcript_get(int(query.get("id", ["0"])[0]))
        if not row:
            return {"error": "That transcript is gone."}
        return {"id": row["id"], "file": row["name"], "url": row["audio_url"],
                "text": row["text"], "srt": row["srt"], "vtt": row["vtt"],
                "sentences": row["sentences"], "duration_ms": row["duration_ms"]}

    def _icon_upload(self, raw: bytes):
        """A picture for a project, kept beside the app rather than in the row."""
        name = Path(self.headers.get("X-Filename", "icon.png")).name
        suffix = Path(name).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
            return self._json({"error": "Use a PNG, JPG, WEBP, GIF or SVG."}, 400)
        if len(raw) > 4_000_000:
            return self._json({"error": "That image is over 4 MB. Try a smaller one."}, 400)
        ICONS_DIR.mkdir(exist_ok=True)
        stored = _unique_output_name(Path(name).stem or "icon", suffix)
        (ICONS_DIR / stored).write_bytes(raw)
        return self._json({"url": f"/icon/{stored}"})

    def _asset_upload(self, raw: bytes):
        """Add an existing audio file to a venture's fixed asset library.

        This is deliberately not synthesis: a library folder accepts files and
        never calls Alibaba or creates a paid Job.
        """
        try:
            project_id = int(self.headers.get("X-Project-Id", "0") or 0)
        except ValueError:
            project_id = 0
        if not db.is_asset_folder(project_id):
            return self._json({"error": "Choose an Intros, Outros, Music or Stingers library first."}, 400)
        original = Path(unquote(self.headers.get("X-Filename", "audio.mp3"))).name
        suffix = Path(original).suffix.lower()
        allowed = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
        if suffix not in allowed:
            return self._json({"error": "Use MP3, WAV, M4A, AAC, OGG or FLAC audio."}, 400)
        if not raw:
            return self._json({"error": "That audio file is empty."}, 400)
        if len(raw) > 250_000_000:
            return self._json({"error": "That file is over 250 MB."}, 400)
        stored = _unique_output_name(Path(original).stem or "asset", suffix)
        target = out_dir() / stored
        target.write_bytes(raw)
        duration_ms = measure_ms(stored)
        if duration_ms is None:
            target.unlink(missing_ok=True)
            return self._json({"error": "That file could not be decoded as audio."}, 400)
        new_id = db.record({
            "text": Path(original).stem, "title": Path(original).stem,
            "voice": "Uploaded", "engine": "upload", "model": "-",
            "format": suffix.lstrip("."), "language": None, "instruction": "",
            "rate": 1, "pitch": 1, "volume": 50, "seed": 0,
            "filename": stored, "path": str(target), "size_bytes": len(raw),
            "chars": 0, "requests": 0, "cost": 0, "project_id": project_id,
            "position": db.next_position(project_id), "kind": "asset",
            "duration_ms": duration_ms, "speech_mode": "uploaded",
            "usage": {}, "cost_basis": "not billed", "failures": [],
        })
        if not new_id:
            target.unlink(missing_ok=True)
            return self._json({"error": "The database could not save that asset."}, 500)
        asset_id = db.asset_register_generation(new_id)
        if not asset_id:
            db.delete(new_id)
            target.unlink(missing_ok=True)
            return self._json({"error": "The database could not register that Asset."}, 500)
        return self._json({"id": asset_id, "generation_id": new_id, "name": original,
                           "filename": stored, "duration_ms": duration_ms,
                           "url": f"/audio/{quote(stored)}"}, 201)

    def _part_subtitles(self, query: dict):
        """The subtitles of one recording, if it has any."""
        row = db.transcript_for(int(query.get("id", ["0"])[0] or 0))
        if not row:
            return self._json({"error": "No subtitles for this part yet."}, 404)
        return self._json({**self._transcript_payload({"id": [str(row["id"])]}),
                           "stale": bool(row.get("stale"))})

    def _stream(self, query: dict):
        """Play audio as it's produced, rather than after the whole render."""
        text = (query.get("text", [""])[0] or "").strip()
        if not text:
            return self._json({"error": "Nothing to say."}, 400)
        if not os.getenv("DASHSCOPE_API_KEY"):
            return self._json({"error": "No API key saved yet."}, 400)
        if query.get("engine", ["audio"])[0] == "omni":
            return self._json({
                "error": "Omni uses the complete-render flow. Press Generate; "
                         "live preview is available only for Qwen Audio TTS."
            }, 400)
        blocked = streaming.available()
        if blocked:
            return self._json({"error": blocked}, 400)

        guard = self._check_budget(
            estimate_cost(text, "flash"),
            {"confirmed": query.get("confirmed", ["0"])[0] == "1"})
        if guard:
            return self._json(*guard)

        say.apply_credentials()
        spoken, _ = say.apply_pronunciations(text)
        spoken, _ = maybe_normalise(spoken)
        # A preview is heard once and never saved, but it is billed like any
        # other synthesis — so it goes in the ledger like any other run.
        self._log("preview", model="flash", status="ok",
                  estimated=estimate_cost(spoken, "flash"),
                  cost=estimate_cost(spoken, "flash"), chars=len(spoken),
                  voice=(query.get("voice", [""])[0] or None),
                  detail="live preview, not saved")

        # The length isn't known in advance. Chunked encoding would need
        # HTTP/1.1, which this server doesn't speak — browsers reject a chunked
        # HTTP/1.0 body outright ("no supported source was found"). Streaming
        # until the connection closes works on both.
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Connection", "close")
        self.end_headers()

        chunks = streaming.pcm_chunks(
            spoken,
            voice=query.get("voice", ["loongeva_v3.6"])[0],
            instruction=(query.get("instruction", [""])[0] or None),
            language=(query.get("language", [""])[0] or None),
            rate=float(query.get("rate", ["1"])[0]),
            pitch=float(query.get("pitch", ["1"])[0]),
            volume=int(query.get("volume", ["50"])[0]),
        )
        try:
            for block in streaming.mp3_stream(chunks):
                self.wfile.write(block)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass          # the listener navigated away mid-stream
        except Exception:
            traceback.print_exc()   # too late for a JSON error; the body is open

    def _generation(self, query: dict):
        """Everything needed to reload a past job back into the editor."""
        row = db.get(int(query.get("id", ["0"])[0]))
        if not row:
            return self._json({"error": "Not found — is the database running?"}, 404)
        return self._json(row)

    def _config(self):

        """What the app knows about itself: key present, models, limits."""
        self._json({
            "voices": say.VOICES,
            "default_voice": say.DEFAULT_VOICE,
            "chosen_default_voice": prefs().get("default_voice", ""),
            "models": say.MODELS,
            "formats": list(say.FORMATS),
            "tags": TAGS,
            "retired_tags": RETIRED,
            "tag_variables": rewrite.variables(),
            "naming": naming.merged(db.setting("naming", prefs().get("naming", {})), None),
            "voice_images": {v: m["image"] for v, m in db.voice_meta().items()
                             if m["image"]},
            "voice_favourites": [v for v, m in db.voice_meta().items()
                                 if m["favourite"]],
            "naming_tokens": list(naming.TOKENS),
            "languages": LANGUAGES,
            "capabilities": alibaba_config.CAPABILITIES,
            "performance_presets": alibaba_voice_registry.presets(),
            # Kept for older UI builds; new clients read the per-engine map.
            "clone_languages": alibaba_config.AUDIO_CLONE_LANGUAGES,
            "workspace": {
                "configured": bool(alibaba_config.workspace_id()),
                "id": alibaba_config.workspace_id(),
                "region": alibaba_config.region(),
                "region_label": ("Beijing" if alibaba_config.region() == "cn"
                                 else "Singapore"),
                "http_base": alibaba_config.http_base(),
            },
            "instruction_max": INSTRUCTION_MAX,
            "rates": RATES,
            "batch_max_rows": batch.MAX_ROWS,
            "synth_flags": say.SYNTH_FLAGS,
            "chunk_size": say.MAX_CHARS,
            "has_key": bool(os.getenv("DASHSCOPE_API_KEY")),
            "out_dir": str(out_dir()),
            "prefs": prefs(),
            "spend": db.spend_totals(),
            "database": db.status(),
            "storage": storage.status(),
            "storage_settings": {k: v for k, v in storage.settings().items()
                                 if "key" not in k},   # never echo secrets back
            "history": self._history(),
        })

    def _serve_audio(self, name: str, directory: Path = None):
        """Serve an audio file, honouring range requests.

        Without ranges a browser can't seek: dragging the player's scrubber does
        nothing, because the audio element has no way to ask for "the bytes from
        halfway". Answering 206 with Content-Range is what makes it draggable.
        """
        directory = (directory or out_dir()).resolve()
        target = (directory / name).resolve()
        if not target.exists() or directory not in target.parents:
            return self._json({"error": "not found"}, 404)

        kind = {
            "mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg",
            "opus": "audio/ogg", "m4a": "audio/mp4", "aac": "audio/aac",
            "flac": "audio/flac", "png": "image/png", "jpg": "image/jpeg",
            "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif",
            "svg": "image/svg+xml",
        }
        content_type = kind.get(
            target.suffix[1:].lower(),
            mimetypes.guess_type(target.name)[0] or "application/octet-stream",
        )
        size = target.stat().st_size
        start, end = 0, size - 1
        partial = False

        header = self.headers.get("Range", "")
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", header.strip()) if header else None
        if match:
            first, last = match.group(1), match.group(2)
            if first:
                start = int(first)
                end = int(last) if last else size - 1
            elif last:
                start = max(0, size - int(last))   # suffix range: last N bytes
            if start >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            end = min(end, size - 1)
            partial = True

        length = end - start + 1
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()

        with open(target, "rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                block = handle.read(min(65536, remaining))
                if not block:
                    break
                try:
                    self.wfile.write(block)
                except (BrokenPipeError, ConnectionResetError):
                    # Browsers routinely cancel an audio range when a person
                    # pauses, seeks, or switches takes. That is normal player
                    # control flow, not a server or generation failure.
                    break
                remaining -= len(block)

    def _history(self, search: str = "") -> list:
        """Past generations from the database, with their text and settings.

        Falls back to listing the audio folder when the database is down — you
        still see and can replay your files, you just lose the text and re-run.
        """
        rows = db.history(search=search)
        if rows:
            return [{
                "id": r["id"],
                "name": r["filename"],
                "url": f"/audio/{r['filename']}",
                "when": r["created_at"][:16].replace("T", " "),
                "size_mb": round((r["size_bytes"] or 0) / 1_000_000, 2),
                "preview": (r["text"] or "")[:90],
                "voice": r["voice"],
                "model": r["model"],
                "cost": r["cost"],
                "failed": len(r["failures"] or []),
            } for r in rows]

        if search:
            return []  # searching only works with the database
        files = sorted(
            (f for f in out_dir().glob("*.*")
             if f.suffix in {".mp3", ".wav", ".ogg"}
             and not f.name.startswith("preview-")),
            key=lambda p: p.stat().st_mtime, reverse=True,
        )
        return [{
            "name": f.name,
            "url": f"/audio/{f.name}",
            "when": datetime.fromtimestamp(f.stat().st_mtime).strftime("%b %d, %H:%M"),
            "size_mb": round(f.stat().st_size / 1_000_000, 2),
        } for f in files[:40]]

    # --------------------------------------------------------------- POST

    def _api_v1_post(self, path: str, payload: dict) -> bool:
        """Create canonical hierarchy resources without touching paid media."""
        if not path.startswith("/api/v1/"):
            return False
        segments = [unquote(part) for part in path.split("/") if part][2:]
        if segments == ["voice-routes", "resolve"]:
            bindings = [*alibaba_voice_registry.system_bindings(),
                        *db.voice_custom_bindings()]
            route = voice_routing.resolve(payload, bindings)
            self._json({"data": route.payload()})
            return True
        if len(segments) == 3 and segments[0] == "voices" and segments[2] == "link-history":
            provider_voice_id = str(payload.get("provider_voice_id") or "").strip()
            try:
                linked = db.voice_link_history(provider_voice_id, segments[1])
            except ValueError as exc:
                self._v1_error(400, "invalid_voice_history", str(exc))
                return True
            if not linked:
                self._v1_error(404, "voice_history_not_found",
                               "No unlinked history exists for that provider voice.")
                return True
            db.job("voice_history_link", status="ok", voice=segments[1],
                   detail=f"Linked {linked} historical recordings from {provider_voice_id}")
            profile = next((item for item in self._voice_profile_data()
                            if item["id"] == segments[1]), None)
            self._json({"data": {"linked": linked, "profile": profile}})
            return True
        name = str(payload.get("name") or "").strip()
        description = str(payload.get("description") or "").strip()
        if not name:
            self._v1_error(400, "name_required", "Give this resource a name.")
            return True
        try:
            if segments == ["ventures"]:
                created = domain_repo.create_venture(name, description)
            elif len(segments) == 3 and segments[0] == "ventures" and segments[2] == "projects":
                created = domain_repo.create_project(int(segments[1]), name, description)
            elif len(segments) == 3 and segments[0] == "projects" and segments[2] == "series":
                created = domain_repo.create_series(int(segments[1]), name, description)
            elif len(segments) == 3 and segments[0] == "projects" and segments[2] == "productions":
                created = domain_repo.create_production(int(segments[1]), name, description)
            elif len(segments) == 3 and segments[0] == "series" and segments[2] == "productions":
                series_resource = domain_repo.resource_get("series", int(segments[1]))
                project_id = int(series_resource["parent_key"].split(":", 1)[1]) if series_resource else 0
                created = domain_repo.create_production(
                    project_id, name, description, int(segments[1])) if project_id else None
            else:
                self._v1_error(404, "route_not_found", "That API v1 route does not exist.")
                return True
        except (TypeError, ValueError):
            self._v1_error(400, "invalid_identifier", "That resource identifier is invalid.")
            return True
        if not created:
            self._v1_error(404, "parent_not_found", "The parent resource does not exist.")
        else:
            self._json({"data": created}, 201)
        return True

    def do_POST(self):

        """Answer everything that changes something or spends money."""
        path = urlparse(self.path).path
        try:
            length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            self.close_connection = True
            return self._json({"error": "Invalid Content-Length."}, 400)
        upload_limits = {
            "/api/clone/upload": 10_000_000,
            "/api/voice-references/upload": 10_000_000,
            "/api/import": 50_000_000,
            "/api/project/icon/upload": 4_000_000,
            "/api/v1/project-covers/upload": 8_000_000,
            "/api/v1/venture-logos/upload": 8_000_000,
            "/api/v1/voice-images/upload": 8_000_000,
            "/api/asset/upload": 250_000_000,
            "/api/batch/preview": 25_000_000,
        }
        limit = upload_limits.get(path, 5_000_000)
        if length < 0 or length > limit:
            self.close_connection = True
            return self._json({
                "error": f"That request is too large. The limit is {limit // 1_000_000} MB."
            }, 413)
        raw = self.rfile.read(length) if length else b""

        try:
            if path == "/api/clone/upload":
                return self._clone_upload(raw)
            if path == "/api/voice-references/upload":
                return self._voice_reference_upload(raw)
            if path == "/api/import":
                return self._import(raw)
            if path == "/api/project/icon/upload":
                return self._icon_upload(raw)
            if path == "/api/v1/project-covers/upload":
                return self._icon_upload(raw)
            if path == "/api/v1/venture-logos/upload":
                return self._icon_upload(raw)
            if path == "/api/v1/voice-images/upload":
                return self._icon_upload(raw)
            if path == "/api/asset/upload":
                return self._asset_upload(raw)
            if path == "/api/batch/preview":
                return self._batch_preview(raw)
            payload = json.loads(raw or b"{}")
            if self._api_v1_post(path, payload):
                return
            routes = {
                "/api/key": self._save_key,
                "/api/alibaba": self._save_alibaba,
                "/api/speak": self._speak,
                "/api/prefs": self._save_prefs,
                "/api/reveal": self._reveal,
                "/api/clone/create": self._clone_create,
                "/api/clone/delete": self._clone_delete,
                "/api/clone/update": self._clone_update,
                "/api/voice-packages/preflight": self._voice_package_preflight,
                "/api/voice-packages/create": self._voice_package_create,
                "/api/voice-packages/retry": self._voice_package_retry,
                "/api/storage": self._save_storage,
                "/api/storage/test": lambda p: self._json(storage.status()),
                "/api/transcript/delete": lambda p: self._json(
                    {"ok": db.transcript_delete(int(p["id"]))}),
                "/api/speak/languages": self._speak_many_languages,
                "/api/batch/run": self._batch_run,
                "/api/project/create": self._project_create,
                "/api/project/rename": lambda p: self._json(
                    {"ok": db.project_rename(int(p["id"]), p["name"])}),
                "/api/project/describe": lambda p: self._json(
                    {"ok": db.project_describe(int(p["id"]), p.get("description", ""))}),
                "/api/project/delete": lambda p: self._json(
                    {"ok": db.project_delete(int(p["id"]), p.get("keep_audio", True))}),
                "/api/project/reorder": lambda p: self._json(
                    {"ok": db.parts_reorder(int(p["id"]), p.get("order", []))}),
                "/api/project/move": self._project_move,
                "/api/project/stitch": self._project_stitch,
                "/api/project/preview": self._project_preview,
                "/api/asset/insert": self._insert_asset,
                "/api/voice/save": self._voice_save,
                "/api/voice/try": self._voice_try,
                "/api/text/states": lambda p: self._json(
                    {"ok": db.text_states(int(p.get("id") or 0), p)}),
                "/api/prompts/save": lambda p: self._json(
                    {"ok": db.setting_save("prompts", {
                        k: v for k, v in (p.get("prompts") or {}).items()
                        if k in rewrite.DEFAULTS} or None)}),
                "/api/text/estimate": lambda p: self._json(
                    {"cost": rewrite.estimate(p.get("text") or "")}),
                "/api/project/music": self._project_music,
                "/api/project/style": lambda p: self._json(
                    {"ok": db.project_style(int(p.get("id") or 0),
                                            (p.get("style") or "")[:2000])}),
                "/api/voice/describe": self._voice_describe,
                "/api/project/naming": lambda p: self._json(
                    {"ok": db.project_naming(int(p.get("id") or 0),
                                             {k: v for k, v in (p.get("naming") or {}).items()
                                              if k in naming.DEFAULTS})}),
                "/api/project/icon": lambda p: self._json(
                    {"ok": db.project_icon(int(p.get("id") or 0),
                                           (p.get("icon") or "")[:400])}),
                "/api/project/silence": self._silence_part,
                "/api/project/silence/edit": self._silence_edit,
                "/api/part/regenerate": self._regenerate,
                "/api/part/duplicate": self._part_duplicate,
                "/api/part/draft": self._draft_part,
                "/api/part/render": self._render_draft,
                "/api/project/render-drafts": self._render_drafts,
                "/api/parts/delete": self._parts_delete,
                "/api/parts/move": self._parts_move,
                "/api/part/takes": lambda p: self._json(
                    {"takes": db.takes(int(p["id"]))}),
                "/api/part/promote": self._promote_take,
                "/api/generation/move": self._generation_move,
                "/api/disk/tidy": lambda p: self._json(
                    {**tidy_scratch(int(p.get("days", SCRATCH_DAYS))),
                     "usage": disk_usage()}),
                "/api/vocabulary/save": self._vocabulary_save,
                "/api/vocabulary/delete": lambda p: (
                    vocabulary.delete(p["id"]), self._json({"ok": True}))[1],
                "/api/vocabulary/check": lambda p: self._json(
                    dict(zip(("words", "rejected"),
                             vocabulary.clean(p.get("words", []))))),
                "/api/generation/delete": self._generation_delete,
                "/api/pronunciations/save": lambda p: self._json(
                    {"id": db.pronunciation_save(p)}),
                "/api/pronunciations/delete": lambda p: self._json(
                    {"ok": db.pronunciation_delete(int(p["id"]))}),
            }
            if path not in routes:
                return self._json({"error": "unknown endpoint"}, 404)
            return routes[path](payload)
        except Exception as exc:
            traceback.print_exc()
            return self._json({"error": human_error(exc)}, 500)

    def _import(self, raw: bytes):
        """Extract text from a dropped document. Nothing here calls the model."""
        import importer
        filename = unquote(self.headers.get("X-Filename", "document.txt"))
        try:
            text = importer.clean(importer.extract(filename, raw))
        except ValueError as exc:
            return self._json({"error": str(exc)}, 400)
        except Exception as exc:
            return self._json({"error": f"Couldn't read that file: {exc}"}, 400)

        if not text.strip():
            return self._json({"error": "That file has no text in it."}, 400)
        blocks = importer.to_blocks(text)
        return self._json({
            "name": filename, "text": text, "blocks": blocks,
            "chars": len(text), "block_count": len(blocks),
        })

    def _save_storage(self, payload: dict):
        """Write storage credentials to .env. They never leave this machine."""
        keys = {
            "RUSTFS_ENDPOINT": (payload.get("endpoint") or "").strip().rstrip("/"),
            "RUSTFS_ACCESS_KEY": (payload.get("access_key") or "").strip(),
            "RUSTFS_SECRET_KEY": (payload.get("secret_key") or "").strip(),
            "RUSTFS_BUCKET": (payload.get("bucket") or "").strip(),
            "RUSTFS_PREFIX": (payload.get("prefix") or "text-to-voice").strip("/ "),
            "RUSTFS_REGION": (payload.get("region") or "us-east-1").strip(),
            "RUSTFS_PUBLIC_URL": (payload.get("public_url") or "").strip().rstrip("/"),
        }
        # Clearing the server address means "forget this storage entirely",
        # otherwise there'd be no way to remove saved keys.
        wipe = not keys["RUSTFS_ENDPOINT"]

        env_file = ROOT / ".env"
        lines = env_file.read_text().splitlines() if env_file.exists() else []
        lines = [ln for ln in lines
                 if not any(ln.startswith(k + "=") for k in keys)]
        for name, value in keys.items():
            # A blank secret means "keep what's already saved" — the UI sends
            # empty when the field wasn't retyped.
            is_secret = name in ("RUSTFS_SECRET_KEY", "RUSTFS_ACCESS_KEY")
            if wipe:
                value = ""
            elif is_secret and not value:
                value = os.getenv(name, "")
            lines.append(f"{name}={value}")
            os.environ[name] = value
        env_file.write_text("\n".join(lines) + "\n")
        env_file.chmod(0o600)
        return self._json({"ok": True, "status": storage.status()})

    def _save_key(self, payload: dict):

        """Store the API key."""
        key = (payload.get("key") or "").strip()
        if not key:
            return self._json({"error": "Paste a key first."}, 400)

        region = payload.get("region", "intl")
        env_file = ROOT / ".env"
        lines = env_file.read_text().splitlines() if env_file.exists() else []
        lines = [ln for ln in lines
                 if not ln.startswith(("DASHSCOPE_API_KEY=", "DASHSCOPE_REGION="))]
        lines[:0] = [f"DASHSCOPE_API_KEY={key}", f"DASHSCOPE_REGION={region}"]
        env_file.write_text("\n".join(lines) + "\n")
        env_file.chmod(0o600)  # it's a secret — owner-only

        os.environ["DASHSCOPE_API_KEY"] = key
        os.environ["DASHSCOPE_REGION"] = region
        say.apply_credentials()
        return self._json({"ok": True})

    def _save_alibaba(self, payload: dict):
        """Store non-secret Alibaba routing independently of the API key."""
        workspace = (payload.get("workspace_id") or "").strip()
        region = payload.get("region", alibaba_config.region())
        if region not in ("intl", "beijing"):
            return self._json({"error": "Region must be intl or beijing."}, 400)
        if workspace and not re.fullmatch(r"[A-Za-z0-9_-]{3,128}", workspace):
            return self._json({"error": "That Workspace ID has an invalid format."}, 400)
        env_file = ROOT / ".env"
        lines = env_file.read_text().splitlines() if env_file.exists() else []
        lines = [line for line in lines if not line.startswith(
            ("DASHSCOPE_WORKSPACE_ID=", "DASHSCOPE_REGION="))]
        lines[:0] = [f"DASHSCOPE_WORKSPACE_ID={workspace}",
                     f"DASHSCOPE_REGION={region}"]
        env_file.write_text("\n".join(lines) + "\n")
        env_file.chmod(0o600)
        os.environ["DASHSCOPE_WORKSPACE_ID"] = workspace
        os.environ["DASHSCOPE_REGION"] = region
        say.apply_credentials()
        return self._json({"ok": True, "workspace": {
            "configured": bool(workspace), "id": workspace, "region": region,
            "http_base": alibaba_config.http_base(),
        }})

    def _save_prefs(self, payload: dict):

        """Store the preferences."""
        settings = prefs()

        if "default_voice" in payload:
            settings["default_voice"] = str(payload["default_voice"] or "")[:200]

        if "voice_favourites" in payload:
            settings["voice_favourites"] = [str(v)[:200] for v in
                                            (payload["voice_favourites"] or [])][:200]

        if "voice_images" in payload:
            # A picture per voice, so a character in a story is recognisable at
            # a glance instead of being read as an identifier.
            images = dict(settings.get("voice_images") or {})
            for voice, url in (payload["voice_images"] or {}).items():
                if url:
                    images[str(voice)[:200]] = str(url)[:400]
                else:
                    images.pop(str(voice), None)
            settings["voice_images"] = images

        if "naming" in payload:
            # null means "back to the defaults", so the key is removed rather
            # than stored as an empty object that would shadow them.
            if payload["naming"] is None:
                db.setting_save("naming", None)
                settings.pop("naming", None)
            else:
                db.setting_save("naming", {k: v for k, v in payload["naming"].items()
                                           if k in naming.DEFAULTS})

        if "out_dir" in payload:
            directory = Path(payload["out_dir"]).expanduser()
            if not directory.is_absolute():
                return self._json({"error": "Use a full path, e.g. /Users/you/Voices"}, 400)
            try:
                directory.mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                return self._json({"error": f"Can't use that folder: {exc}"}, 400)
            settings["out_dir"] = str(directory)

        for key in ("warn_above", "daily_cap"):
            if key in payload:
                try:
                    value = float(payload[key] or 0)
                except (TypeError, ValueError):
                    return self._json({"error": f"{key} must be a number."}, 400)
                if value < 0:
                    return self._json({"error": f"{key} can't be negative."}, 400)
                settings[key] = value

        if "synth_flags" in payload:
            flags = payload["synth_flags"] or {}
            settings["synth_flags"] = {k: bool(v) for k, v in flags.items()
                                       if k in say.SYNTH_FLAGS}

        for key in ("fix_dates_phones", "day_first"):
            if key in payload:
                settings[key] = bool(payload[key])

        if "extra_params" in payload:
            raw = (payload["extra_params"] or "").strip()
            if raw:
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError as exc:
                    return self._json({"error": f"Not valid JSON: {exc}"}, 400)
                if not isinstance(parsed, dict):
                    return self._json({"error": "Extra parameters must be a JSON object."}, 400)
            settings["extra_params"] = raw

        PREFS_FILE.write_text(json.dumps(settings, indent=2))
        return self._json({"ok": True, **settings})

    def _generation_delete(self, payload: dict):
        """Delete a Part, or an owned Asset plus all its immutable versions."""
        files = db.parts_delete([int(payload["id"])])
        if payload.get("delete_file"):
            for filename in files:
                target = (out_dir() / Path(filename).name).resolve()
                if target.exists() and out_dir().resolve() in target.parents:
                    target.unlink()
        return self._json({"ok": True})

    def _reveal(self, payload: dict):

        """Show a file in Finder."""
        subprocess.run(["open", str(out_dir())], check=False)
        return self._json({"ok": True})

    def _speak(self, payload: dict):

        """Turn text into audio — the request behind the Speak button."""
        durable_job = bool(payload.pop("_durable_job", False))
        text = (payload.get("text") or "").strip()
        if not text:
            return self._json({"error": "Type something to say first."}, 400)
        if not os.getenv("DASHSCOPE_API_KEY"):
            return self._json({"error": "No API key saved yet."}, 400)

        requested_destination = payload.get("project_id")
        if requested_destination not in (None, "", 0, "0"):
            try:
                project_id = int(requested_destination)
            except (TypeError, ValueError):
                return self._json({"error": "Choose a valid destination."}, 400)
            if not db.project_get(project_id):
                return self._json({"error": "That destination no longer exists."}, 404)
            wrong = self._reject_wrong_level(project_id)
            if wrong:
                return wrong
            payload = {**payload, "project_id": project_id}

        options = Options(payload)
        incompatible = delivery_error(text, options)
        if incompatible:
            return self._json({"error": incompatible}, 400)
        guard = self._check_budget(
            estimate_cost(text, options.model, options.engine), payload)
        if guard:
            return self._json(*guard)

        # The dictionary rewrites the text that gets spoken; the original is what
        # we store, so history still shows what you actually typed.
        spoken, applied = say.apply_pronunciations(text)
        spoken, rewrites = maybe_normalise(spoken)
        chunks = say.chunk_text(spoken)
        estimated = estimate_cost(spoken, options.model, options.engine)
        run = None if durable_job else self._run("speech", model=options.model_id, estimated=estimated,
                        chars=len(spoken), voice=options.voice,
                        voice_identity_id=options.voice_identity_id,
                        provider_voice_id=options.voice, engine=options.engine,
                        tier=options.model, detail="Speak tab",
                        total=len(chunks))

        job = start_progress(done=0, total=len(chunks), stage="Generating")
        try:
            try:
                audio, failures, transcripts, usage = alibaba_speech.synthesize(
                    chunks, options,
                    on_progress=lambda i, n, t: set_progress(
                        job, done=i - 1, total=n, label=t[:60]),
                )
            except Exception as exc:
                self._done(run, status="failed", error=str(exc)[:400])
                raise
        finally:
            clear_progress(job)
        if not audio:
            self._done(run, status="failed", cost=0, error="no audio returned")
            return self._json({"error": "Nothing rendered — every chunk failed."}, 500)

        extension = output_extension(options.format)
        name = _unique_output_name(text, extension)
        (out_dir() / name).write_bytes(audio)

        # Audio TTS is character billed; Omni uses the exact streamed token usage.
        rendered_chars = len(text) - sum(len(f.text) for f in failures)
        cost, cost_basis = speech_cost(spoken[:rendered_chars], options, usage)
        failure_list = [
            {"index": f.index, "text": f.text[:80], "error": f.error}
            for f in failures
        ]
        provider_text = " ".join(item.strip() for item in transcripts if item.strip())
        compared_text = say.strip_known_tags(spoken) if options.engine == "omni" else spoken
        fidelity = (alibaba_fidelity.assess(compared_text, provider_text)
                    if options.engine == "omni" else {})
        warning = truncation_warning(compared_text, measure_ms(name), options)
        fidelity_warning = fidelity.get("message") if fidelity.get("status") in ("warning", "failed", "unverified") else None
        # Recording is best-effort: the render already succeeded and was paid
        # for, so a database outage must not turn it into an error.
        project_id = payload.get("project_id") or db.ensure_unsorted()
        if payload.get("project_id"):
            at = payload.get("insert_at")
            position = int(at) if at is not None else db.next_position(project_id)
        else:
            position = None
        generation_id = db.record({
            "project_id": project_id,
            "position": position,
            "kind": "audio",
            "title": payload.get("title"),
            "text": text,
            "text_raw": payload.get("text_raw"),
            "text_shaped": payload.get("text_shaped"),
            "text_tagged": payload.get("text_tagged"),
            "text_state": payload.get("text_state") or "raw",
            "voice": options.voice, "voice_identity_id": options.voice_identity_id,
            "engine": options.engine,
            "model": options.model,
            "format": options.format, "language": options.language,
            "instruction": options.instruction, "speech_mode": options.speech_mode,
            "rate": options.rate,
            "pitch": options.pitch, "volume": options.volume, "seed": options.seed,
            "filename": name, "path": str(out_dir() / name),
            "size_bytes": len(audio), "duration_ms": measure_ms(name), "chars": len(text),
            "requests": len(chunks), "cost": cost, "failures": failure_list,
            "usage": usage, "cost_basis": cost_basis,
            "provider_text": provider_text or None, "fidelity": fidelity,
        }, insert_at=position if payload.get("project_id") and at is not None else None)
        self._done(run,
                   status="failed" if failures else "warning" if warning or fidelity_warning else "ok",
                   cost=cost, chars=len(spoken), usage=usage, cost_basis=cost_basis,
                   generation_id=generation_id, project_id=project_id,
                   seconds=(measure_ms(name) or 0) / 1000, done=len(chunks),
                   error=(f"{len(failures)} chunk(s) failed" if failures else fidelity_warning or warning))

        return self._json({
            "id": generation_id,
            "url": f"/audio/{name}",
            "name": name,
            "path": str(out_dir() / name),
            "chars": len(text),
            "requests": len(chunks),
            "size_mb": round(len(audio) / 1_000_000, 2),
            "cost": round(cost, 4),
            "cost_basis": cost_basis,
            "usage": usage,
            "failures": failure_list,
            "warning": fidelity_warning or warning,
            "returned_text": provider_text or None,
            "fidelity": fidelity,
            "voice_route": options.voice_route,
            "pronunciations": applied,
            "rewrites": [{"from": a, "to": b} for a, b in rewrites],
        })

    # ------------------------------------------------------- voice cloning

    def _enrollment(self):

        """Prepare a recording so a voice can be cloned from it."""
        from dashscope.audio.tts_v2 import VoiceEnrollmentService
        say.apply_credentials()
        return VoiceEnrollmentService()

    def _clone_upload(self, raw: bytes):
        """Store a recording and hand back a URL the cloning service can fetch.

        Alibaba's own upload returns an oss:// address on a private bucket, which
        the enrollment service refuses — it insists on http(s). So the audio goes
        to our own S3-compatible storage and we return a short-lived signed link.
        """
        name = unquote(self.headers.get("X-Filename", "reference.wav"))
        UPLOADS.mkdir(exist_ok=True)
        original = UPLOADS / Path(name).name
        original.write_bytes(raw)
        local = _to_wav(original)

        if not storage.configured():
            return self._json({
                "error": "Nowhere to put the recording yet. Add your storage "
                         "details in Settings → Reference audio storage, or paste "
                         "a public link to the audio instead.",
                "needs_storage": True,
            }, 400)

        url = storage.upload(str(local))
        reference_id = db.voice_reference_create(
            original_name=Path(name).name,
            original_path=original.name,
            normalized_path=local.name,
        )
        return self._json({"url": url, "name": local.name,
                           "reference_id": reference_id})

    def _voice_reference_upload(self, raw: bytes):
        """Preserve a normalized source without contacting Alibaba or S3.

        The asynchronous package worker owns provider upload. This endpoint is
        deliberately local, cheap and safe to retry from the creation wizard.
        """
        if not raw:
            return self._json({"error": "Choose a recording first."}, 400)
        name = unquote(self.headers.get("X-Filename", "reference.wav"))
        UPLOADS.mkdir(exist_ok=True)
        original = UPLOADS / f"{uuid.uuid4().hex[:12]}-{Path(name).name}"
        original.write_bytes(raw)
        try:
            local = _to_wav(original)
        except Exception as exc:
            original.unlink(missing_ok=True)
            return self._json({"error": f"That recording could not be prepared: {exc}"}, 400)
        reference_id = db.voice_reference_create(
            original_name=Path(name).name,
            original_path=original.name,
            normalized_path=local.name,
        )
        if not reference_id:
            return self._json({"error": "The reference recording could not be saved."}, 503)
        return self._json({"name": local.name, "reference_id": reference_id})

    def _clone_create(self, payload: dict):

        """Make a new cloned voice from an enrolled recording."""
        url = (payload.get("url") or "").strip()
        prefix = (payload.get("prefix") or "").strip().lower()
        engine = alibaba_config.normalise_engine(payload.get("engine"))
        tier = payload.get("model", "flash")
        capability = alibaba_config.CAPABILITIES[engine]
        if not url:
            return self._json({"error": "Add a reference recording first."}, 400)
        if (engine == "omni" and alibaba_config.region() == "intl" and
                not alibaba_config.workspace_id()):
            return self._json({
                "error": "Omni voice cloning in Singapore requires your Alibaba "
                         "Model Studio Workspace ID. Add it in Settings → API key."
            }, 400)
        name_pattern = r"[a-z0-9]{1,9}" if engine == "audio" else r"[a-z0-9_]{1,16}"
        if not re.fullmatch(name_pattern, prefix):
            rule = ("lowercase letters and numbers only, 9 characters or fewer"
                    if engine == "audio" else
                    "lowercase letters, numbers and underscores, 16 characters or fewer")
            return self._json(
                {"error": f"Name must use {rule}."}, 400)
        if tier not in capability["clone_tiers"]:
            return self._json({
                "error": f"{capability['label']} cloning is not available on {tier}."
            }, 400)

        clone_cost = capability["clone_cost"]
        guard = self._check_budget(clone_cost, payload)
        if guard:
            return self._json(*guard)

        language = payload.get("language")
        if language and language not in capability["clone_languages"]:
            return self._json({
                "error": f"{capability['label']} does not support that cloning language."
            }, 400)
        kwargs = {}
        if payload.get("clean_up"):
            # Noise reduction on the reference; worth it for phone/room recordings.
            kwargs["enable_preprocess"] = True

        try:
            target_model = alibaba_config.model_id(engine, tier)
            if engine == "omni":
                voice_id = alibaba_omni.create_voice(
                    target_model=target_model, preferred_name=prefix,
                    audio_url=url, language=language,
                    transcript=(payload.get("transcript") or "").strip() or None)
            else:
                voice_id = self._enrollment().create_voice(
                    target_model=target_model, prefix=prefix, url=url,
                    language_hints=[language] if language else None,
                    max_prompt_audio_length=float(payload.get("max_length", 10.0)),
                    **kwargs,
                )
        except Exception as exc:
            # A refused clone is still an attempt, and often still billed.
            self._log("clone", model=alibaba_config.model_id(engine, tier),
                      status="failed", estimated=clone_cost,
                      error=str(exc)[:300], detail=prefix)
            return self._json({"error": f"The service refused it: {exc}"}, 502)
        self._log("clone", model=alibaba_config.model_id(engine, tier), status="ok",
                  estimated=clone_cost, cost=clone_cost, voice=voice_id,
                  detail=prefix)
        target_model = alibaba_config.model_id(engine, tier)
        details = {
            "name": (payload.get("display_name") or prefix).strip(),
            "gender": payload.get("gender") or None,
            "age": payload.get("age") or None,
            "trait": payload.get("trait") or None,
            "scene": payload.get("scene") or None,
            "languages": language or "",
            "provider_voice_id": voice_id,
            "engine": engine,
            "target_model": target_model,
            "provider_status": "OK",
        }
        persisted = db.voice_save(voice_id, **details)
        identity_id = db.voice_identity_bind(
            provider_voice_id=voice_id, model_id=target_model,
            name=details["name"], engine=engine, tier=tier,
            languages=[language] if language else [], status="active",
            reference_id=(payload.get("reference_id") or None),
            identity_id=(payload.get("identity_id") or None),
        )
        return self._json({"voice_id": voice_id, "engine": engine,
                           "target_model": target_model, "persisted": persisted,
                           "identity_id": identity_id,
                           "warning": None if persisted and identity_id else
                           "The voice was created at Alibaba, but its local details were not saved."})

    def _clone_delete(self, payload: dict):

        """Delete a cloned voice and everything decided about it."""
        voice = payload.get("voice_id") or payload.get("id")
        if payload.get("engine") == "omni" or alibaba_omni.is_voice(voice):
            alibaba_omni.delete_voice(voice)
        else:
            self._enrollment().delete_voice(voice)
        # Its picture and favourite flag go too; leaving them would resurrect a
        # deleted voice the next time an id happened to be reused.
        db.voice_forget(voice)
        db.voice_binding_forget(voice)
        return self._json({"ok": True})

    def _start_voice_package_jobs(self, job_ids: list[str]) -> None:
        for job_id in job_ids:
            threading.Thread(target=voice_package_worker.run, args=(job_id,),
                             daemon=True, name=f"voice-package-{job_id[-8:]}").start()

    def _voice_profile_data(self):
        identities = db.voice_identities()
        usage = db.voice_identity_usage()
        for identity in identities:
            metadata = identity.get("metadata") or {}
            language = metadata.get("language") or next((
                language for binding in identity["bindings"]
                for language in binding.get("languages", []) if language), "")
            identity["metadata"] = {**metadata, "language": language}
            identity["available_routes"] = voice_packages.plan(language)["available_routes"] if language else []
            identity["usage"] = usage.get(identity["id"], {
                "uses": 0, "productions": 0, "spend": 0.0,
                "last_used": None, "preview_filename": "",
            })
        return identities

    def _voice_identities(self):
        return self._json({"identities": self._voice_profile_data()})

    def _voice_package_preflight(self, payload: dict):
        language = (payload.get("language") or "").strip()
        if not language:
            return self._json({"error": "Choose the recording language first."}, 400)
        return self._json(voice_packages.plan(language, payload.get("package", "complete")))

    def _voice_package_create(self, payload: dict):
        name = (payload.get("name") or "").strip()
        language = (payload.get("language") or "").strip().lower()
        reference_id = (payload.get("reference_id") or "").strip()
        package = payload.get("package") or "complete"
        if not name or len(name) > 80:
            return self._json({"error": "Give this voice a name of 80 characters or fewer."}, 400)
        reference = db.voice_reference_get(reference_id)
        if not reference:
            return self._json({"error": "Upload a reference recording first."}, 400)
        plan = voice_packages.plan(language, package)
        if not plan["routes"]:
            return self._json({"error": "No installed voice model supports that language."}, 400)
        guard = self._check_budget(plan["total_estimated_creation_cost"], payload)
        if guard:
            return self._json(*guard)
        identity_id = (payload.get("identity_id") or "").strip()
        if identity_id:
            identity = next((item for item in db.voice_identities()
                             if item["id"] == identity_id), None)
            if not identity:
                return self._json({"error": "That voice identity no longer exists."}, 404)
            if not db.voice_reference_attach(reference_id, identity_id):
                return self._json({"error": "That source belongs to another voice."}, 409)
        else:
            identity_id = db.voice_identity_create(name, {
                "language": plan["language"], "package": plan["package"],
                "gender": payload.get("gender") or None,
                "trait": (payload.get("trait") or "").strip() or None,
            }, reference_id)
        if not identity_id:
            return self._json({"error": "The voice identity could not be saved."}, 503)
        job_ids = db.voice_package_enqueue(identity_id, reference_id, plan["routes"])
        # The request itself belongs in Activity even before its provider jobs
        # start. Each actual Alibaba creation is logged separately by the
        # worker with its final cost and provider voice id.
        self._log("clone_package", status="queued" if job_ids else "ok",
                  estimated=plan["total_estimated_creation_cost"],
                  voice=identity_id, voice_identity_id=identity_id,
                  detail=f"{name} · {len(job_ids)} capabilities queued")
        self._start_voice_package_jobs(job_ids)
        identity = next((item for item in db.voice_identities()
                         if item["id"] == identity_id), None)
        return self._json({"identity": identity, "queued": len(job_ids),
                           "plan": plan}, 202)

    def _voice_package_retry(self, payload: dict):
        identity_id = (payload.get("identity_id") or "").strip()
        model_id = (payload.get("model_id") or "").strip()
        job_id = db.voice_package_retry(identity_id, model_id)
        if not job_id:
            return self._json({"error": "That failed variant is no longer retryable."}, 409)
        self._start_voice_package_jobs([job_id])
        return self._json({"ok": True, "job_id": job_id}, 202)

    def _clone_update(self, payload: dict):
        """Swap a clone's reference audio without spending a new voice slot.

        Cloned voices are quota-limited, so re-recording a bad clone must not
        mean burning another slot — and anything already using the voice id
        keeps working.
        """
        voice_id = (payload.get("voice_id") or "").strip()
        url = (payload.get("url") or "").strip()
        if not voice_id or not url:
            return self._json({"error": "Need both the voice and a new recording."}, 400)
        if payload.get("engine") == "omni" or alibaba_omni.is_voice(voice_id):
            return self._json({
                "error": "Omni voice enrollment does not provide in-place updates. "
                         "Create a replacement clone, then delete the old one."
            }, 400)
        self._enrollment().update_voice(voice_id=voice_id, url=url)
        reference_id = (payload.get("reference_id") or "").strip()
        reference_linked = (db.voice_reference_link(reference_id, voice_id)
                            if reference_id else False)
        return self._json({"ok": True, "voice_id": voice_id,
                           "reference_linked": reference_linked})

    def _clone_query(self, query: dict):

        """Ask the model to describe a recorded voice, so the clone's

        fields can be proposed rather than typed blind."""
        voice_id = query.get("id", [""])[0]
        if not voice_id:
            return self._json({"error": "Which voice?"}, 400)
        if alibaba_omni.is_voice(voice_id):
            return self._json({
                "error": "Omni enrollment does not expose a voice-description query."
            }, 400)
        return self._json({"voice": self._enrollment().query_voice(voice_id)})

    def _list_cloned(self):

        """Your cloned voices."""
        return self._json({"voices": self._cloned_voices()})

    def _cloned_voices(self):
        """Our durable voice bindings, enriched with live provider state.

        The provider list is verification, not the application's identity
        store. Composer and Projects must see the same names and portraits as
        the Voices screen even when Alibaba temporarily cannot be reached.
        """
        if not os.getenv("DASHSCOPE_API_KEY"):
            return []
        voices = []
        try:
            audio_voices = self._enrollment().list_voices(page_size=100) or []
            voices.extend([{**voice, "engine": "audio"} for voice in audio_voices])
        except Exception:
            traceback.print_exc()
        try:
            voices.extend(alibaba_omni.list_voices())
        except Exception:
            traceback.print_exc()
        metadata = db.voice_meta()
        durable = db.voice_custom_bindings()
        identity_usage = db.voice_identity_usage()
        live_by_id = {
            (voice.get("voice_id") or voice.get("voice") or ""): voice
            for voice in voices
        }
        enriched = []
        known_ids = set()
        for binding in durable:
            voice_id = binding.get("voice_id") or ""
            known_ids.add(voice_id)
            saved = metadata.get(db.voice_key(voice_id), {})
            identity_id = binding.get("identity_id") or ""
            enriched.append({
                **live_by_id.get(voice_id, {}),
                **{key: value for key, value in saved.items()
                   if value not in (None, "")},
                **binding,
                "identity_usage": identity_usage.get(identity_id, {}),
            })
        # A provider-side voice created outside this app remains discoverable
        # until the operator adopts or removes it.
        for voice_id, voice in live_by_id.items():
            if voice_id in known_ids:
                continue
            saved = metadata.get(db.voice_key(voice_id), {})
            enriched.append({**voice, **{
                key: value for key, value in saved.items()
                if value not in (None, "")
            }})
        return enriched


def main() -> int:


    """Start the local server and open the app."""
    say.apply_credentials()
    out_dir()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Compatibility adapter: http://localhost:{PORT} (loopback only)")
    print(f"Saving audio to: {out_dir()}")
    swept = tidy_scratch()
    if swept["removed"]:
        print(f"Tidied {swept['removed']} old working files "
              f"({swept['freed'] / 1_000_000:.1f} MB)")
    if db.init():
        interrupted = db.voice_package_abandon_running()
        if interrupted:
            print(f"Marked {interrupted} interrupted voice variant(s) for retry")
        filled = db.backfill_durations(measure_ms)
        if filled:
            print(f"Measured {filled} older recordings")
        print(f"History database: connected ({db.status().get('count', 0)} records)")
    else:
        print("History database: OFFLINE — run 'docker compose up -d'. "
              "Rendering still works; you just lose saved text and re-run.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
