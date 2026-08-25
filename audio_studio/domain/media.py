"""Provider-neutral media objects exposed by Auvi Studio."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class MediaFile:
    path: Path
    download_name: str | None = None
