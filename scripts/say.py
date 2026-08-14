#!/usr/bin/env python3
"""Direct Qwen Audio CLI built on Audio Studio's native adapters.

Run from the repository root with ``python -m scripts.say``.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

from audio_studio.config import settings
from audio_studio.domain import provider_catalog, speech_text
from audio_studio.providers.alibaba import audio_tts
from audio_studio.infrastructure.postgres.pronunciations import PronunciationRepository
from audio_studio.infrastructure.runtime_environment import reload_owned_environment


def main() -> int:
    reload_owned_environment()
    parser = argparse.ArgumentParser(
        description="Turn text into speech with Qwen Audio TTS.",
    )
    parser.add_argument("text", nargs="?")
    parser.add_argument("-f", "--file")
    parser.add_argument("-o", "--out")
    parser.add_argument("-v", "--voice", default=os.getenv("QWEN_TTS_VOICE"))
    parser.add_argument("-m", "--model", default="plus", choices=("plus", "flash"))
    parser.add_argument("--format", default="mp3", choices=speech_text.OUTPUT_FORMATS)
    parser.add_argument("-i", "--instruction")
    parser.add_argument("--language")
    parser.add_argument("--rate", type=float, default=1.0)
    parser.add_argument("--pitch", type=float, default=1.0)
    parser.add_argument("--volume", type=int, default=50)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--list-voices", action="store_true")
    options = parser.parse_args()

    models = provider_catalog.CAPABILITIES["audio"]["models"]
    if options.list_voices:
        for tier, voices in provider_catalog.AUDIO_SYSTEM_VOICES.items():
            print(f"\n{models[tier]}  (use --model {tier})")
            width = max(len(voice) for voice in voices)
            for voice, description in voices.items():
                print(f"  {voice:<{width}}  {description}")
        return 0
    options.voice = options.voice or provider_catalog.AUDIO_DEFAULT_VOICES[options.model]
    if not os.getenv("DASHSCOPE_API_KEY"):
        print("DASHSCOPE_API_KEY is not set.", file=sys.stderr)
        return 1
    if options.file:
        text = Path(options.file).read_text()
    elif options.text:
        text = options.text
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        parser.error("Give text as an argument, --file, or piped stdin.")

    try:
        rules = PronunciationRepository().list(enabled_only=True)
    except Exception:
        rules = []
    text, applied = speech_text.apply_pronunciations(text, rules)
    for rule in applied:
        print(
            f"  pronunciation: '{rule['pattern']}' -> "
            f"'{rule['replacement']}' x{rule['count']}",
            file=sys.stderr,
        )
    plan = audio_tts.plan(text)
    if not plan.sessions:
        print("Nothing to say — the text was empty.", file=sys.stderr)
        return 1
    extension = "ogg" if options.format == "opus" else options.format.split("-")[0]
    if options.out:
        target = Path(options.out)
    else:
        basename = Path(options.file).stem if options.file else speech_text.slugify(text)
        target = settings.output_dir / f"{basename}.{extension}"
    target.parent.mkdir(parents=True, exist_ok=True)
    print(
        f"{len(text)} chars -> {plan.request_count} continuous task(s), "
        f"{plan.segment_count} submission(s) "
        f"| {models[options.model]} | voice={options.voice}",
        file=sys.stderr,
    )
    audio, failures, *_ = audio_tts.synthesize(plan, options)
    if not audio:
        print("Nothing rendered — every chunk failed.", file=sys.stderr)
        return 1
    target.write_bytes(audio)
    print(f"{target}  ({len(audio) / 1_000_000:.1f} MB)")
    if failures:
        print(
            f"\n{len(failures)} of {plan.request_count} provider tasks failed; "
            "no incomplete audio was saved:",
            file=sys.stderr,
        )
        for failure in failures:
            print(f"  [{failure.index}] {failure.text[:60]}...", file=sys.stderr)
            print(f"       {failure.error}", file=sys.stderr)
    return 2 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
