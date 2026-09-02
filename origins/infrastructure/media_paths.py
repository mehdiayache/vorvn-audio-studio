"""Authoritative filesystem locations for local media storage.

Runtime preferences must never move the lookup root for already-persisted
media. Deployments choose the root through ``ORIGINS_OUTPUT_DIR`` before
startup; application code receives the same resolved location everywhere.
"""

from __future__ import annotations

from pathlib import Path
import re

from origins.config import settings


_PUBLIC_ID = re.compile(r"^[a-z][a-z0-9_]{7,127}$")


def media_root() -> Path:
    return settings.output_dir.expanduser().resolve()


def voice_reference_root() -> Path:
    return (settings.root / ".media" / "voice-references").resolve()


def voice_reference_directory(reference_id: str) -> Path:
    value = str(reference_id or "").strip()
    if not _PUBLIC_ID.fullmatch(value):
        raise ValueError("The voice reference ID is invalid.")
    root = voice_reference_root()
    target = (root / value).resolve()
    if target.parent != root:
        raise ValueError("The voice reference path is invalid.")
    return target


def contained(root: Path, relative: str) -> Path:
    """Resolve a persisted relative object name without allowing escape."""
    base = root.expanduser().resolve()
    value = str(relative or "").strip()
    if not value or Path(value).is_absolute():
        raise RuntimeError("The saved media path is invalid.")
    target = (base / value).resolve()
    if target == base or base not in target.parents:
        raise RuntimeError("The saved media path is invalid.")
    return target
