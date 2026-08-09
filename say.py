#!/usr/bin/env python3
"""
Text -> voice, using Alibaba's Qwen-Audio-3.0-TTS (the current best-in-class
hosted TTS model).

Usage:
    ./say.py "Hello world"                        # -> out/hello-world.mp3
    ./say.py --file script.txt --out episode1.mp3
    cat script.txt | ./say.py
    ./say.py "Welcome back" --instruction "warm, slow, late-night radio host"
    ./say.py --list-voices

Set DASHSCOPE_API_KEY in .env first (see README).
"""

import argparse
import os
import re
import sys
import time
from pathlib import Path
from typing import NamedTuple

from audio_studio.domain.delivery_tags import (
    KNOWN_TAGS,
    MOOD_TAGS,
    RETIRED_TAGS,
    SOUND_TAGS,
    TAG_RE,
)
ROOT = Path(__file__).parent


def load_dotenv() -> None:
    """Minimal .env loader so there's no extra dependency."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_dotenv()

import dashscope  # noqa: E402
from dashscope.audio.tts_v2 import AudioFormat, SpeechSynthesizer  # noqa: E402
from audio_studio.infrastructure.alibaba import config as alibaba_config  # noqa: E402
from audio_studio.infrastructure.postgres.pronunciations import (  # noqa: E402
    PronunciationRepository,
)

pronunciation_repository = PronunciationRepository()

# Two tiers of the same model family.
#   plus  = highest quality, currently #1 on Artificial Analysis for voice similarity
#   flash = ~300ms to first audio, cheaper, use for anything realtime
MODELS = {
    "plus": "qwen-audio-3.0-tts-plus",
    "flash": "qwen-audio-3.0-tts-flash",
}

# Voices are tier-specific: a plus voice is rejected by flash and vice versa.
# Every ID below was verified against the live API — the Cherry/Ethan/Dylan set
# often quoted online belongs to the older Qwen3-TTS model and fails here.
VOICES = alibaba_config.AUDIO_SYSTEM_VOICES

# Each tier also offers 500+ cloned "base voices" named
# qwen-audio-3.0-tts-{plus|flash}-{suffix}; Alibaba publishes those only as a
# spreadsheet, so the UI accepts any voice ID typed in directly.
DEFAULT_VOICE = {"plus": "longanlingxin", "flash": "loongeva_v3.6"}

FORMATS = {
    "mp3": AudioFormat.MP3_48000HZ_MONO_256KBPS,
    "mp3-24k": AudioFormat.MP3_24000HZ_MONO_256KBPS,
    "wav": AudioFormat.WAV_48000HZ_MONO_16BIT,
    "opus": AudioFormat.OGG_OPUS_48KHZ_MONO_64KBPS,
}

# The API takes a bounded amount of text per request, and shorter requests fail
# less often on flaky networks. Split on sentence ends, never mid-word.
MAX_CHARS = 500


def active_mood(text: str) -> str | None:
    """The mood tag still in force at the end of this text, if any."""
    found = [m for m in TAG_RE.findall(text)
             if m.lower() in MOOD_TAGS or m.lower() in RETIRED_TAGS]
    return found[-1] if found else None


def strip_tags(text: str) -> str:
    """The words with every inline tag removed."""
    return re.sub(r"\s{2,}", " ", TAG_RE.sub("", text)).strip()


def strip_known_tags(text: str) -> str:
    """Remove only Alibaba's Audio TTS tags, preserving literal brackets.

    Omni has no inline-tag contract.  A tagged Audio script may still be sent
    through Omni, so its documented performance markers must not be pronounced.
    Unknown bracketed text is content, however, and must not be silently lost.
    """
    cleaned = TAG_RE.sub(
        lambda match: "" if match.group(1).lower() in KNOWN_TAGS
        else match.group(0), text)
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


def chunk_text(text: str, limit: int = MAX_CHARS) -> list[str]:
    """Split text into synthesis-sized pieces at sentence boundaries.

    A mood tag holds "until the next tag", but each chunk is a separate request
    and starts the model fresh. So whichever mood was in force at the end of one
    chunk is repeated at the start of the next — otherwise [asmr] at the top of
    a long script would quietly die 500 characters in.
    """
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return [text] if text else []

    sentences = re.split(r"(?<=[.!?。！？\n])\s+", text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        # A single sentence longer than the limit gets hard-split on commas.
        while len(sentence) > limit:
            cut = sentence.rfind(",", 0, limit)
            cut = cut + 1 if cut > limit // 2 else limit
            chunks.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if len(current) + len(sentence) + 1 > limit:
            if current:
                chunks.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        chunks.append(current.strip())

    carried = []
    mood = None
    for index, chunk in enumerate(chunks):
        opening = TAG_RE.match(chunk.lstrip())
        starts_with_mood = opening and opening.group(1).lower() in MOOD_TAGS
        carried.append(chunk if index == 0 or not mood or starts_with_mood
                       else f"[{mood}] {chunk}")
        mood = active_mood(chunk) or mood
    return carried


MONTHS = ("January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December")

# A slashed date and a fraction look identical, and a phone number looks like a
# hyphenated figure. The model reads 3/4/2026 as "three quarters 2026" and
# 555-0142 as "five fifty-five...". Rewriting them into words up front removes
# the ambiguity instead of hoping the model guesses right.
DATE_RE = re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b")
# Lookaround rather than \b: a leading "(" isn't a word character, so \b would
# start the match after it and strand the bracket in the output.
PHONE_RE = re.compile(
    r"(?<![\d\-/])(\+\s*)?(?:\d{1,3}[ -])?(?:\(\d{3}\)\s*|\d{3}[ -])?\d{3}[ -]\d{4}(?![\d\-/])"
)


def _spell_digits(match: re.Match) -> str:


    """Say a number digit by digit, which is how a person reads a code."""
    # Spaced digits make the model read each one separately. A leading + has to
    # become a word or it gets read as "plus" inconsistently — or skipped.
    digits = " ".join(c for c in match.group(0) if c.isdigit())
    return f"plus {digits}" if match.group(1) else digits


def normalise_ambiguous(text: str, day_first: bool = True) -> tuple[str, list]:
    """Rewrite slashed dates and phone numbers into unambiguous words."""
    changes = []

    def date_sub(match):

        """Rewrite a date the way it is said out loud."""
        first, second, year = (int(match.group(i)) for i in (1, 2, 3))
        day, month = (first, second) if day_first else (second, first)
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return match.group(0)   # not a plausible date; leave it alone
        result = f"{day} {MONTHS[month - 1]} {year}"
        changes.append((match.group(0), result))
        return result

    text = DATE_RE.sub(date_sub, text)

    def phone_sub(match):

        """Rewrite a phone number the way it is said out loud."""
        result = _spell_digits(match)
        changes.append((match.group(0), result))
        return result

    text = PHONE_RE.sub(phone_sub, text)
    return text, changes


def build_hot_fix(rules=None) -> dict | None:
    """Phoneme rules, in the shape the service expects for hot_fix."""
    if rules is None:
        try:
            rules = pronunciation_repository.list(enabled_only=True)
        except Exception:
            return None
    entries = [{r["pattern"]: r["replacement"]}
               for r in rules if r.get("phoneme")]
    return {"pronunciation": entries} if entries else None


def apply_pronunciations(text: str, rules=None) -> tuple[str, list]:
    """Rewrite text using the saved pronunciation rules.

    Returns (text, applied) so the UI can show what was changed — a silent
    substitution is confusing when the audio says something you didn't type.
    Rules come from the database; with it offline nothing is rewritten.
    """
    if rules is None:
        try:
            rules = pronunciation_repository.list(enabled_only=True)
        except Exception:
            return text, []

    applied = []
    for rule in rules:
        # Rules with a phoneme spelling are sent to the model as hot_fix instead
        # of being substituted here; the written word must survive untouched.
        if rule.get("phoneme"):
            continue
        pattern = re.escape(rule["pattern"])
        if rule.get("whole_word"):
            # \b fails next to punctuation-adjacent terms like "C++", so only
            # apply word boundaries where the edge characters are word-ish.
            if re.match(r"\w", rule["pattern"]):
                pattern = r"\b" + pattern
            if re.search(r"\w$", rule["pattern"]):
                pattern = pattern + r"\b"
        flags = 0 if rule.get("match_case") else re.IGNORECASE
        text, count = re.subn(pattern, rule["replacement"].replace("\\", r"\\"),
                              text, flags=flags)
        if count:
            applied.append({"pattern": rule["pattern"],
                            "replacement": rule["replacement"], "count": count})
    return text, applied


def slugify(text: str) -> str:


    """A safe file name from a title."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (slug[:40].rstrip("-") or "speech")


def apply_credentials() -> None:
    """Push the current key and region into the SDK.

    dashscope reads DASHSCOPE_API_KEY once at import time, so a key saved after
    the process started is invisible to it. Re-applying before each call keeps a
    long-running server correct when the key is added or swapped mid-session.
    """
    dashscope.api_key = os.getenv("DASHSCOPE_API_KEY")
    dashscope.base_http_api_url = alibaba_config.http_base()
    dashscope.base_websocket_api_url = alibaba_config.websocket_base()


class ChunkFailure(NamedTuple):
    """One chunk that never rendered, after every retry was used up."""
    index: int   # 1-based, matches the position in the chunk list
    text: str
    error: str


# Retrying these is pointless — the request is wrong, not unlucky, and every
# attempt just delays the error the user actually needs to read.
FATAL_SIGNS = (
    "apikey", "api key", "unauthorized", "invalid api", "accessdenied",
    "forbidden", "arrearage", "invalidparameter", "model not exist",
    "voice not exist", "no permission",
)

RETRIES = 3
BACKOFF = 1.5  # seconds, doubled each attempt


def _is_fatal(message: str) -> bool:


    """Whether an error is worth retrying or not."""
    lowered = message.lower()
    return any(sign in lowered for sign in FATAL_SIGNS)


# Flags the service accepts inside payload.parameters. None of these appear in
# the public docs — they were found in the SDK — so each is opt-in and the UI
# says what it does.
SYNTH_FLAGS = {
    "enable_tn": "Read numbers, dates, currency and units the way a person would",
    "optimize_instructions": "Let the model refine your performance direction first",
    "enable_markdown_filter": "Strip markdown syntax instead of reading it aloud",
    "enable_ssml": "Treat the text as SSML markup",
}


def build_additional_params(args) -> dict | None:
    """Assemble the extra request parameters, or None when there are none."""
    params = {}
    for flag in SYNTH_FLAGS:
        value = getattr(args, flag, None)
        if value is not None:
            params[flag] = bool(value)

    # Phoneme-level pronunciation, handled by the model rather than by our own
    # text substitution — the only way to fix a word without respelling it.
    hot_fix = getattr(args, "hot_fix", None)
    if hot_fix:
        params["hot_fix"] = hot_fix

    # Raw escape hatch for anything Alibaba ships that we haven't wrapped.
    extra = getattr(args, "extra_params", None)
    if isinstance(extra, dict):
        params.update(extra)
    return params or None


def _render_chunk(text: str, args) -> bytes:


    """Synthesise one chunk of text."""
    # A fresh synthesizer per chunk: the SDK object holds one connection, and
    # reusing it across calls makes the tail chunks flaky.
    synthesizer = SpeechSynthesizer(
        model=MODELS[args.model],
        voice=args.voice,
        format=FORMATS[args.format],
        speech_rate=args.rate,
        pitch_rate=args.pitch,
        volume=args.volume,
        instruction=args.instruction,
        language_hints=[args.language] if args.language else None,
        # A fixed non-zero seed makes a take reproducible; 0 means "surprise me".
        seed=getattr(args, "seed", 0),
        additional_params=build_additional_params(args),
    )
    result = synthesizer.call(text)
    if not result:
        raise RuntimeError("the model returned no audio")
    return result


def synthesize(chunks, args, on_progress=None, retries: int = RETRIES):
    """Render every chunk, retrying transient failures.

    Returns (audio, failures). A chunk that fails every attempt is skipped
    rather than discarding the whole job — on an 80-request audiobook, losing
    everything because request 61 hit a network blip means paying twice.

    Raises only when nothing is salvageable: a bad key, an unknown voice, or a
    first chunk that fails fatally.
    """
    apply_credentials()
    audio = bytearray()
    failures: list[ChunkFailure] = []

    for index, chunk in enumerate(chunks, 1):
        if on_progress:
            on_progress(index, len(chunks), chunk)
        elif len(chunks) > 1:
            print(f"  [{index}/{len(chunks)}] {chunk[:60]}...", file=sys.stderr)

        rendered = False
        last_error = ""
        for attempt in range(1, retries + 1):
            try:
                audio.extend(_render_chunk(chunk, args))
                rendered = True
                break
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {exc}"
                if _is_fatal(last_error):
                    # Nothing rendered yet means the whole job is doomed; say so
                    # plainly instead of handing back an empty file.
                    if not audio:
                        raise RuntimeError(
                            f"{last_error}\nCheck your API key, and that voice "
                            f"'{args.voice}' exists on the {args.model} tier."
                        ) from exc
                    break  # salvage what already rendered
                if attempt < retries:
                    time.sleep(BACKOFF * 2 ** (attempt - 1))

        if not rendered:
            failures.append(ChunkFailure(index, chunk, last_error))

    return bytes(audio), failures


def main() -> int:


    """The command-line entry point."""
    parser = argparse.ArgumentParser(
        description="Turn text into speech with Qwen-Audio-3.0-TTS.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("text", nargs="?", help="Text to speak.")
    parser.add_argument("-f", "--file", help="Read the text from a file instead.")
    parser.add_argument("-o", "--out", help="Output path. Default: out/<slug>.<ext>")
    parser.add_argument("-v", "--voice", default=os.getenv("QWEN_TTS_VOICE"),
                        help="Voice ID. Defaults to the chosen tier's stock voice.")
    parser.add_argument("-m", "--model", default="plus", choices=list(MODELS))
    parser.add_argument("--format", default="mp3", choices=list(FORMATS))
    parser.add_argument(
        "-i", "--instruction",
        help="Plain-English direction for delivery, e.g. "
             "'excited sports announcer, fast, building energy'.",
    )
    parser.add_argument("--language", help="Language hint, e.g. English, Chinese, French.")
    parser.add_argument("--rate", type=float, default=1.0, help="Speed, 0.5-2.0.")
    parser.add_argument("--pitch", type=float, default=1.0, help="Pitch, 0.5-2.0.")
    parser.add_argument("--volume", type=int, default=50, help="Volume, 0-100.")
    parser.add_argument("--seed", type=int, default=0,
                        help="Fix the seed to reproduce an identical take.")
    parser.add_argument("--list-voices", action="store_true")
    args = parser.parse_args()

    if args.list_voices:
        for tier, voices in VOICES.items():
            print(f"\n{MODELS[tier]}  (use --model {tier})")
            width = max(len(v) for v in voices)
            for voice, description in voices.items():
                print(f"  {voice:<{width}}  {description}")
        return 0

    # A plus voice is rejected by flash and vice versa, so a voice left at the
    # default must follow the chosen tier.
    if args.voice is None:
        args.voice = DEFAULT_VOICE[args.model]

    if not os.getenv("DASHSCOPE_API_KEY"):
        print(
            "DASHSCOPE_API_KEY is not set.\n"
            "Copy .env.example to .env and put your key in it — see README.md.",
            file=sys.stderr,
        )
        return 1

    # The international endpoint is a separate account namespace from Beijing;
    # a key issued in one region will not authenticate against the other.
    apply_credentials()

    if args.file:
        text = Path(args.file).read_text()
    elif args.text:
        text = args.text
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        parser.error("Give me text: an argument, --file, or piped stdin.")

    text, applied = apply_pronunciations(text)
    for rule in applied:
        print(f"  pronunciation: '{rule['pattern']}' -> '{rule['replacement']}' "
              f"x{rule['count']}", file=sys.stderr)

    chunks = chunk_text(text)
    if not chunks:
        print("Nothing to say — the text was empty.", file=sys.stderr)
        return 1

    extension = "ogg" if args.format == "opus" else args.format.split("-")[0]
    if args.out:
        out_path = Path(args.out)
    else:
        base = Path(args.file).stem if args.file else slugify(text)
        out_path = ROOT / "out" / f"{base}.{extension}"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(
        f"{len(text)} chars -> {len(chunks)} request(s) "
        f"| {MODELS[args.model]} | voice={args.voice}",
        file=sys.stderr,
    )
    audio, failures = synthesize(chunks, args)
    if not audio:
        print("Nothing rendered — every chunk failed.", file=sys.stderr)
        return 1

    out_path.write_bytes(audio)
    print(f"{out_path}  ({len(audio) / 1_000_000:.1f} MB)")

    if failures:
        # The audio is still worth keeping; be loud about the gaps so nobody
        # ships a file with sentences silently missing.
        print(f"\n{len(failures)} of {len(chunks)} chunks failed and are MISSING "
              f"from the audio:", file=sys.stderr)
        for failure in failures:
            print(f"  [{failure.index}] {failure.text[:60]}...", file=sys.stderr)
            print(f"       {failure.error}", file=sys.stderr)
        return 2  # distinct from 1 so scripts can tell partial from total failure
    return 0


if __name__ == "__main__":
    sys.exit(main())
