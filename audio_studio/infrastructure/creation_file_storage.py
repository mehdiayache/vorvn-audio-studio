"""Local immutable storage for non-media Creation output representations."""

from pathlib import Path
from uuid import uuid4

from audio_studio.domain.files import StoredFileVersion, file_family
from audio_studio.infrastructure.media_paths import media_root


class LocalCreationFileStorage:
    def __init__(self, root: Path | None = None):
        self._root = root

    @property
    def root(self) -> Path:
        return (self._root or media_root()).expanduser().resolve()

    def write_text(self, text: str, extension: str,
                   mime_type: str) -> StoredFileVersion:
        suffix = extension.casefold().lstrip(".")
        if suffix not in {"srt", "vtt"}:
            raise ValueError("That Creation output format is not supported.")
        raw = text.encode("utf-8")
        if not raw:
            raise ValueError("The subtitle output is empty.")
        self.root.mkdir(parents=True, exist_ok=True)
        target = (self.root / f"{uuid4().hex}.{suffix}").resolve()
        if target.parent != self.root:
            raise ValueError("The output path is invalid.")
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_bytes(raw)
        temporary.replace(target)
        return StoredFileVersion(
            filename=target.name, path=str(target), mime_type=mime_type,
            family=file_family(mime_type), media_format=suffix,
            metadata={"encoding": "utf-8"},
        )

    def discard(self, stored: StoredFileVersion) -> None:
        target = Path(stored.path).expanduser().resolve()
        if target.parent == self.root:
            target.unlink(missing_ok=True)
