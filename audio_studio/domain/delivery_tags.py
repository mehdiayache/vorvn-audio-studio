"""Documented Qwen Audio TTS inline-delivery vocabulary."""

from __future__ import annotations

import re


MOOD_TAGS = {
    "sad": "sad", "amazed": "amazed", "trembling": "trembling",
    "angry": "angry", "excited": "excited", "sarcastic": "sarcastic",
    "curious": "curious", "bored": "bored", "tired": "tired",
    "singing": "singing", "scornful": "scornful", "shouting": "shouting",
    "deep and loud shouting": "deep, loud shouting",
    "asmr": "ASMR — soft and close", "panicked": "panicked",
    "mischievously": "mischievous", "empathetic": "empathetic",
    "whispers": "whispering", "reluctantly": "reluctant", "crying": "crying",
    "serious": "serious", "like dracula": "deep and eerie",
    "very fast": "much faster",
}

# Documented, but no longer offered because it produces extreme distortion.
# It remains known so existing scripts are not treated as invented content.
RETIRED_TAGS = {
    "very slowly": "slows the voice far more than it should — use the Speed "
                   "control in Settings instead",
}

SOUND_TAGS = {
    "gasp": "a sharp intake of breath", "sighing": "a sigh",
    "clears throat": "clearing the throat", "giggles": "a giggle",
    "laughing": "laughter", "cough": "a cough", "snorts": "a snort",
}

TAG_RE = re.compile(r"\[([^\[\]]{1,40})\]")
KNOWN_TAGS = set(MOOD_TAGS) | set(SOUND_TAGS) | set(RETIRED_TAGS)
