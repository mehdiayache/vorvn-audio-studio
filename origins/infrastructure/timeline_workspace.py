"""Local media operations for Project timeline commands."""

from pathlib import Path
import shutil
from uuid import uuid4

from origins.infrastructure.media_paths import media_root


class LocalTimelineWorkspace:
    def __init__(self, root: Path | None = None):
        self._root = root

    def _output(self) -> Path:
        return (self._root or media_root()).resolve()

    def duplicate(self, filename: str) -> str:
        if not filename:
            return ""
        output = self._output()
        source = (output / Path(filename).name).resolve()
        if output not in source.parents or not source.is_file():
            return ""
        copied = f"{source.stem}-copy-{uuid4().hex[:10]}{source.suffix}"
        shutil.copyfile(source, output / copied)
        return copied

    def discard(self, filename: str) -> None:
        if not filename:
            return
        output = self._output()
        target = (output / Path(filename).name).resolve()
        if output in target.parents:
            target.unlink(missing_ok=True)
