"""PostgreSQL persistence for Workspace-owned Files and immutable versions."""

from __future__ import annotations

import hashlib
import json

from origins.domain.files import FILE_FAMILIES, FileFamily
from origins.domain.uploads import FILE_CATEGORIES, FileCategory
from origins.infrastructure.postgres.session import read_only, transaction


def _file_url(file: dict) -> str:
    prefix = "audio" if file.get("media_type") == "audio" else "media"
    return f'/{prefix}/{file["filename"]}'


class FileRepository:
    """Persist reusable Files without production or provider-specific ownership."""

    def workspace_exists(self, workspace_id: int) -> bool:
        with read_only() as cursor:
            cursor.execute("SELECT 1 FROM workspaces WHERE id=%s", (workspace_id,))
            return cursor.fetchone() is not None

    def production_exists(self, production_id: int) -> bool:
        with read_only() as cursor:
            cursor.execute(
                "SELECT 1 FROM productions WHERE id=%s AND production_type='audiovisual'",
                (production_id,),
            )
            return cursor.fetchone() is not None

    def output_workspace_for_production(self, production_id: int) -> int | None:
        with read_only() as cursor:
            cursor.execute(
                "SELECT workspace_id FROM productions WHERE id=%s", (production_id,)
            )
            row = cursor.fetchone()
        return int(row[0]) if row else None

    @staticmethod
    def _listed(where: str, parameters: tuple) -> list[dict]:
        with read_only() as cursor:
            cursor.execute(f"""
                SELECT file.id, file.public_id, file.workspace_id,
                       file.folder_id, file.name, file.kind, file.media_type,
                       file.category, file.tags, file.metadata, file.source,
                       file.created_at, file.updated_at,
                       version.id, version.public_id, version.version,
                       version.filename, version.path, version.storage_key,
                       version.size_bytes, version.duration_ms,
                       version.mime_type, version.audio_format,
                       version.sample_rate, version.channels,
                       version.media_format, version.width, version.height,
                       version.video_codec, version.frame_rate,
                       version.metadata
                  FROM files file
                  JOIN LATERAL (
                       SELECT item.* FROM file_versions item
                        WHERE item.file_id=file.id
                        ORDER BY item.version DESC, item.id DESC LIMIT 1
                  ) version ON true
                 WHERE {where}
                 ORDER BY file.updated_at DESC, file.id DESC
            """, parameters)
            rows = cursor.fetchall()
        return [FileRepository._production_row(row) for row in rows]

    @staticmethod
    def _production_row(row) -> dict:
        item = {
            "id": int(row[0]), "public_id": str(row[1]),
            "workspace_id": int(row[2]), "folder_id": row[3],
            "name": row[4], "title": row[4], "kind": row[5],
            "media_type": row[6], "category": row[7],
            "tags": row[8] or [], "metadata": row[9] or {},
            "source": row[10], "created_at": row[11].isoformat(),
            "updated_at": row[12].isoformat(), "version_id": int(row[13]),
            "version_public_id": str(row[14]), "version": int(row[15]),
            "filename": row[16], "path": row[17],
            "storage_key": row[18], "size_bytes": int(row[19]),
            "duration_ms": row[20], "mime_type": row[21],
            "audio_format": row[22], "sample_rate": row[23],
            "channels": row[24], "media_format": row[25],
            "width": row[26], "height": row[27],
            "video_codec": row[28], "frame_rate": row[29],
            "version_metadata": row[30] or {},
        }
        item["url"] = _file_url(item)
        return item

    def list_for_workspace(self, workspace_id: int) -> list[dict]:
        return self._listed("file.workspace_id=%s", (workspace_id,))

    def list_for_production(self, production_id: int) -> list[dict]:
        """Return the owning Workspace Library available to a Production."""
        return self._listed("""
            file.workspace_id=(
                SELECT workspace_id FROM productions WHERE id=%s
            )
        """, (production_id,))

    def production_files(self, production_id: int) -> list[dict]:
        return self._listed("""
            EXISTS (
                SELECT 1 FROM production_file_usages usage
                 WHERE usage.production_id=%s AND usage.file_id=file.id
            )
        """, (production_id,))

    def library_file_ids(self, production_id: int) -> list[int]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT DISTINCT usage.file_id
                  FROM production_file_usages usage
                  JOIN files file ON file.id=usage.file_id
                 WHERE usage.production_id=%s
                   AND usage.purpose='library'
                 ORDER BY usage.file_id
            """, (production_id,))
            return [int(row[0]) for row in cursor.fetchall()]

    def production_file_ids(self, production_id: int) -> list[int]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT DISTINCT file_id FROM production_file_usages
                 WHERE production_id=%s ORDER BY file_id
            """, (production_id,))
            return [int(row[0]) for row in cursor.fetchall()]

    def attach_to_production(
        self, production_id: int, file_id: int, purpose: str = "media",
    ) -> bool | None:
        with transaction() as cursor:
            cursor.execute("""
                INSERT INTO production_file_usages (production_id, file_id, purpose)
                SELECT production.id, file.id, %s
                  FROM productions production
                  JOIN files file ON file.id=%s
                 WHERE production.id=%s
                   AND production.workspace_id=file.workspace_id
                ON CONFLICT (production_id, file_id, purpose) DO NOTHING
                RETURNING production_id
            """, (purpose, file_id, production_id))
            return cursor.fetchone() is not None

    def attach_to_production_library(self, production_id: int, file_id: int) -> bool | None:
        if not self.allowed_for_production(production_id, file_id):
            return None
        return self.attach_to_production(production_id, file_id, "library")

    def detach_from_production_library(self, production_id: int, file_id: int) -> bool | None:
        if not self.production_exists(production_id):
            return None
        with transaction() as cursor:
            cursor.execute("""
                DELETE FROM production_file_usages
                 WHERE production_id=%s AND file_id=%s AND purpose='library'
            """, (production_id, file_id))
        return True

    def allowed_for_production(self, production_id: int, file_id: int) -> bool:
        with read_only() as cursor:
            cursor.execute("""
                SELECT 1 FROM productions production
                  JOIN files file ON file.workspace_id=production.workspace_id
                 WHERE production.id=%s AND file.id=%s
            """, (production_id, file_id))
            return cursor.fetchone() is not None

    def get(self, file_id: int) -> dict | None:
        items = self._listed("file.id=%s", (file_id,))
        return items[0] if items else None

    def generated_workspace_file(
        self, *, workspace_id: int, candidate_id: str,
    ) -> dict | None:
        items = self._listed("""
            file.workspace_id=%s
            AND file.source='generated'
            AND file.metadata->>'external_id'=%s
        """, (workspace_id, candidate_id))
        return items[0] if items else None

    def imported_file(
        self, *, workspace_id: int, provider_id: str, external_id: str,
    ) -> dict | None:
        items = self._listed("""
            file.workspace_id=%s AND file.source='imported'
            AND file.metadata->>'provider_id'=%s
            AND file.metadata->>'external_id'=%s
        """, (workspace_id, provider_id, external_id))
        return items[0] if items else None

    def create_workspace_file(
        self, workspace_id: int, *, name: str, filename: str, path: str,
        size_bytes: int, duration_ms: int | None, audio_format: str | None,
        mime_type: str, category: FileCategory | None = None,
        sample_rate: int | None = None, channels: int | None = None,
        tags: tuple[str, ...] = (),
        metadata: dict | None = None, version_metadata: dict | None = None,
        media_type: FileFamily = "audio", media_format: str | None = None,
        width: int | None = None, height: int | None = None,
        video_codec: str | None = None, frame_rate: float | None = None,
        folder_id: int | None = None,
    ) -> dict | None:
        with transaction() as cursor:
            cursor.execute("SELECT 1 FROM workspaces WHERE id=%s", (workspace_id,))
            if not cursor.fetchone():
                return None
            if folder_id is not None:
                cursor.execute(
                    "SELECT 1 FROM folders WHERE id=%s AND workspace_id=%s",
                    (folder_id, workspace_id),
                )
                if not cursor.fetchone():
                    return None
            created = self._create_file(
                cursor, workspace_id=workspace_id, folder_id=folder_id,
                name=name, filename=filename, path=path,
                size_bytes=size_bytes, duration_ms=duration_ms,
                audio_format=audio_format, mime_type=mime_type,
                category=category, sample_rate=sample_rate, channels=channels,
                tags=tags, metadata=metadata, version_metadata=version_metadata,
                media_type=media_type, media_format=media_format, width=width,
                height=height, video_codec=video_codec, frame_rate=frame_rate,
            )
        return self.get(int(created["id"]))

    def create_imported_workspace_file(
        self, workspace_id: int, *, provider_id: str, external_id: str, **values,
    ) -> tuple[dict | None, bool]:
        with transaction() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(%s)",
                (self._identity_lock(workspace_id, provider_id, external_id),),
            )
            existing = self.imported_file(
                workspace_id=workspace_id, provider_id=provider_id,
                external_id=external_id)
            if existing:
                return existing, True
            folder_id = values.pop("folder_id", None)
            if folder_id is not None:
                cursor.execute(
                    "SELECT 1 FROM folders WHERE id=%s AND workspace_id=%s",
                    (folder_id, workspace_id),
                )
                if not cursor.fetchone():
                    return None, False
            metadata = {**(values.pop("metadata", None) or {}),
                        "origin": "imported", "provider_id": provider_id,
                        "external_id": external_id}
            values["metadata"] = metadata
            created = self._create_file(
                cursor, workspace_id=workspace_id, folder_id=folder_id,
                source="imported", **values)
            file_id = int(created["id"])
        return self.get(file_id), False

    def create_generated_workspace_file(
        self, workspace_id: int, *, candidate_id: str, **values,
    ) -> tuple[dict | None, bool]:
        with transaction() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(%s)",
                (self._identity_lock(workspace_id, "generated", candidate_id),),
            )
            existing = self.generated_workspace_file(
                workspace_id=workspace_id, candidate_id=candidate_id)
            if existing:
                return existing, True
            folder_id = values.pop("folder_id", None)
            if folder_id is not None:
                cursor.execute(
                    "SELECT 1 FROM folders WHERE id=%s AND workspace_id=%s",
                    (folder_id, workspace_id),
                )
                if not cursor.fetchone():
                    return None, False
            metadata = {**(values.pop("metadata", None) or {}),
                        "origin": "generated", "external_id": candidate_id}
            created = self._create_file(
                cursor, workspace_id=workspace_id, folder_id=folder_id,
                source="generated", metadata=metadata, **values)
            file_id = int(created["id"])
        return self.get(file_id), False

    def update_details(
        self, file_id: int, *, name: str, category: FileCategory | None,
        tags: tuple[str, ...] = (),
    ) -> dict | None:
        with transaction() as cursor:
            cursor.execute("""
                UPDATE files SET name=%s, category=%s, tags=%s, updated_at=now()
                 WHERE id=%s RETURNING id
            """, (name, category, list(tags), file_id))
            if not cursor.fetchone():
                return None
        return self.get(file_id)

    @staticmethod
    def _identity_lock(workspace_id: int, origin: str, external_id: str) -> int:
        digest = hashlib.sha256(
            f"{workspace_id}:{origin}:{external_id}".encode()).digest()
        return int.from_bytes(digest[:8], "big", signed=True)

    @staticmethod
    def _create_file(
        cursor, *, workspace_id: int, name: str, filename: str, path: str,
        size_bytes: int, duration_ms: int | None, audio_format: str | None,
        mime_type: str, category: FileCategory | None = None,
        sample_rate: int | None = None, channels: int | None = None,
        tags: tuple[str, ...] = (), metadata: dict | None = None,
        version_metadata: dict | None = None,
        media_type: FileFamily = "audio", media_format: str | None = None,
        width: int | None = None, height: int | None = None,
        video_codec: str | None = None, frame_rate: float | None = None,
        folder_id: int | None = None, source: str | None = None,
    ) -> dict:
        if media_type not in FILE_FAMILIES:
            raise ValueError("File family is not supported.")
        if media_type != "audio" and category is not None:
            raise ValueError("Audio categories cannot classify visual Files.")
        if category is not None and category not in FILE_CATEGORIES:
            raise ValueError("File category is not supported.")
        origin = source or str((metadata or {}).get("origin") or "uploaded")
        if origin not in {"generated", "uploaded", "imported"}:
            raise ValueError("File provenance must be generated, uploaded or imported.")
        cursor.execute("""
            INSERT INTO files
                (workspace_id, folder_id, name, kind, media_type, category,
                 tags, metadata, source)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (workspace_id, folder_id, name, media_type, media_type,
              category, list(tags), json.dumps(metadata or {}), origin))
        file_id = int(cursor.fetchone()[0])
        cursor.execute("""
            INSERT INTO file_versions
                (file_id, version, filename, path, storage_key, size_bytes,
                 duration_ms, mime_type, audio_format, sample_rate, channels,
                 media_format, width, height, video_codec, frame_rate, metadata)
            VALUES (%s,1,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (file_id, filename, path, path, size_bytes, duration_ms,
              mime_type, audio_format, sample_rate, channels,
              media_format or audio_format, width, height, video_codec,
              frame_rate, json.dumps(version_metadata or {})))
        return {"id": file_id, "version_id": int(cursor.fetchone()[0])}
