"""Materialize canonical Origins Files for temporary provider access."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from origins.infrastructure import object_storage


class MediaInputMaterializer:
    def __init__(self, storage=object_storage):
        self.storage = storage

    def materialize(
        self, file: dict[str, Any], *, job_id: str, role: str,
    ) -> dict[str, Any]:
        path = Path(str(file.get("path") or ""))
        if not path.is_file():
            raise RuntimeError(
                f"{file.get('name') or 'That File'} is no longer available.")
        if not self.storage.configured():
            raise RuntimeError(
                "Set up Reference storage before sending media to a Media generation provider.")
        url = self.storage.upload(
            path,
            content_type=str(file.get("mime_type")
                             or "application/octet-stream"),
            kind="composer-inputs",
            object_id=f"{job_id}-{int(file['id'])}",
            retention="temporary",
        )
        return {
            "file_id": int(file["id"]),
            "role": role,
            "media_type": str(file["media_type"]),
            "url": url,
        }
