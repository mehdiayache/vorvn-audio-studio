"""Materialize canonical AUVI Assets for temporary provider access."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from audio_studio.infrastructure import object_storage


class DirectorAssetMaterializer:
    def __init__(self, storage=object_storage):
        self.storage = storage

    def materialize(
        self, asset: dict[str, Any], *, job_id: str, role: str,
    ) -> dict[str, Any]:
        path = Path(str(asset.get("path") or ""))
        if not path.is_file():
            raise RuntimeError(
                f"{asset.get('name') or 'That Asset'} is no longer available.")
        if not self.storage.configured():
            raise RuntimeError(
                "Set up Reference storage before sending media to a Director provider.")
        url = self.storage.upload(
            path,
            content_type=str(asset.get("mime_type")
                             or "application/octet-stream"),
            kind="director-inputs",
            object_id=f"{job_id}-{int(asset['id'])}",
            retention="temporary",
        )
        return {
            "asset_id": int(asset["id"]),
            "role": role,
            "media_type": str(asset["media_type"]),
            "url": url,
        }
