"""Canonical spend categories shared by Production and Activity read models."""

from __future__ import annotations

from typing import Literal


SpendCategory = Literal["audio", "video", "other"]

# These are intentionally explicit. New paid operations stay in ``other`` until
# their product owner classifies the output they actually produce.
AUDIO_SPEND_KINDS = frozenset({"speech", "audio_generate", "clone"})
VIDEO_SPEND_KINDS = frozenset({"media_generate"})


def spend_category(kind: str) -> SpendCategory:
    if kind in AUDIO_SPEND_KINDS:
        return "audio"
    if kind in VIDEO_SPEND_KINDS:
        return "video"
    return "other"
