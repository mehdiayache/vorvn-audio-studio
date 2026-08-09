"""Contained filesystem workspace for parsed sheets and Batch output files."""

from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import re
from uuid import uuid4

import batch as spreadsheet

from audio_studio.infrastructure.media_paths import media_root
from audio_studio.config import settings


TOKEN = re.compile(r"^[A-Za-z0-9-]{1,120}$")


class FilesystemBatchWorkspace:
    def __init__(self, sheet_root: Path | None = None,
                 output_root: Path | None = None):
        self.sheet_root = (sheet_root or settings.root / ".batches").resolve()
        self._output_root = output_root

    @property
    def output_root(self) -> Path:
        value = self._output_root or media_root()
        return value.expanduser().resolve()

    def save_sheet(self, sheet: dict) -> str:
        self.sheet_root.mkdir(parents=True, exist_ok=True)
        token = f"{datetime.now():%Y%m%d-%H%M%S}-{uuid4().hex[:8]}"
        target = self._sheet(token)
        temporary = target.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(sheet), encoding="utf-8")
        temporary.replace(target)
        return token

    def load_sheet(self, token: str) -> dict:
        target = self._sheet(token)
        if not target.is_file():
            raise LookupError("Load the spreadsheet again.")
        try:
            sheet = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError("That saved spreadsheet cannot be read.") from error
        if not isinstance(sheet, dict) or not isinstance(sheet.get("headers"), list) \
                or not isinstance(sheet.get("rows"), list):
            raise ValueError("That saved spreadsheet is invalid.")
        if len(sheet["rows"]) > spreadsheet.MAX_ROWS:
            raise ValueError("That saved spreadsheet exceeds the Batch limit.")
        return sheet

    def create_output(self, token: str, run_id: str) -> str:
        self._validate(token)
        safe_run = re.sub(r"[^A-Za-z0-9]+", "", run_id)[:12] or uuid4().hex[:12]
        folder = f"batch-{token}-{safe_run}-{uuid4().hex[:6]}"
        target = self.output_root / folder
        target.mkdir(parents=True, exist_ok=False)
        return folder

    def write_audio(self, folder: str, filename: str, audio: bytes) -> None:
        if not audio:
            raise ValueError("Cannot save an empty audio file.")
        target = self._output_file(folder, filename)
        target.write_bytes(audio)

    def write_zip(self, folder: str, filenames: list[str]) -> bool:
        paths = [self._output_file(folder, name) for name in filenames]
        payload = spreadsheet.make_zip(paths)
        if not payload:
            return False
        self._output_file(folder, "all.zip").write_bytes(payload)
        return True

    def _sheet(self, token: str) -> Path:
        self._validate(token)
        target = (self.sheet_root / f"{token}.json").resolve()
        if target.parent != self.sheet_root:
            raise ValueError("That Batch token is invalid.")
        return target

    @staticmethod
    def _validate(value: str) -> None:
        if not TOKEN.fullmatch(str(value or "")):
            raise ValueError("That Batch token is invalid.")

    def _output_file(self, folder: str, filename: str) -> Path:
        if Path(folder).name != folder or not folder.startswith("batch-"):
            raise ValueError("That Batch output folder is invalid.")
        if Path(filename).name != filename:
            raise ValueError("That Batch output filename is invalid.")
        root = (self.output_root / folder).resolve()
        target = (root / filename).resolve()
        if root.parent != self.output_root or target.parent != root:
            raise ValueError("That Batch output path is invalid.")
        return target
