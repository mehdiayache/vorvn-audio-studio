"""Canonical PostgreSQL persistence for reusable Venture Assets."""

from __future__ import annotations

import hashlib
import json

from audio_studio.domain.uploads import (
    ASSET_CATEGORIES, AssetCategory, AssetScope,
)
from audio_studio.domain.media import ASSET_MEDIA_TYPES, AssetMediaType
from audio_studio.infrastructure.postgres.session import read_only, transaction


COLLECTIONS = (("assets", "Assets"),)

_ASSET_FIELDS = (
    "id", "venture_id", "collection_id", "name", "kind", "media_type",
    "scope", "tags", "metadata", "legacy_generation_id", "created_at",
    "updated_at", "version_id",
    "filename", "path", "size_bytes", "duration_ms", "mime_type",
    "audio_format", "sample_rate", "channels", "media_format", "width",
    "height", "video_codec", "frame_rate", "version_metadata",
)

_CATEGORY_BY_COLLECTION = {
    "assets": "audio",
    "intros": "intro",
    "outros": "outro",
    "music": "music",
    "stingers": "sfx",
}


def _asset_url(asset: dict) -> str:
    prefix = "audio" if asset.get("media_type", "audio") == "audio" else "media"
    return f'/{prefix}/{asset["filename"]}'


class VentureAssetRepository:
    """Own Asset collections, immutable versions and ownership checks."""

    def production_exists(self, production_id: int) -> bool:
        with read_only() as cursor:
            cursor.execute(
                "SELECT 1 FROM productions WHERE id = %s AND archived_at IS NULL",
                (production_id,),
            )
            return cursor.fetchone() is not None

    def output_collection_for_production(self, production_id: int) -> int | None:
        """Return one legacy container for generated visual Asset storage.

        Collection remains storage organization only; the generated Asset's
        canonical media type/category carries its product meaning.
        """
        with read_only() as cursor:
            cursor.execute("""
                SELECT project.venture_id
                  FROM productions production
                  JOIN work_projects project
                    ON project.id = production.project_id
                 WHERE production.id = %s
                   AND production.archived_at IS NULL
            """, (production_id,))
            row = cursor.fetchone()
        if not row:
            return None
        collections = self.ensure_collections(int(row[0]))
        preferred = next((item for item in collections if item["kind"] == "assets"), None)
        return int(preferred["id"]) if preferred else None

    def ensure_collections(self, venture_id: int) -> list[dict]:
        """Create one canonical Asset Library while IDs bridge legacy rows."""
        with transaction() as cursor:
            cursor.execute(
                "SELECT id FROM ventures WHERE id = %s AND archived_at IS NULL",
                (venture_id,),
            )
            if not cursor.fetchone():
                return []
            cursor.execute("""
                SELECT id FROM projects
                 WHERE parent_id = %s AND system_role = 'venture_assets'
            """, (venture_id,))
            row = cursor.fetchone()
            if row:
                library_id = row[0]
                cursor.execute("""
                    UPDATE projects
                       SET level = 'project', locked = true,
                           container_type = 'library',
                           system_role = 'venture_assets'
                     WHERE id = %s
                """, (library_id,))
            else:
                cursor.execute("""
                    INSERT INTO projects
                        (name, parent_id, level, locked, container_type,
                         system_role)
                    VALUES ('Assets', %s, 'project', true, 'library',
                            'venture_assets')
                    RETURNING id
                """, (venture_id,))
                library_id = cursor.fetchone()[0]

            for kind, name in COLLECTIONS:
                cursor.execute("""
                    SELECT legacy_container_id FROM asset_collections
                     WHERE venture_id = %s AND kind = %s
                """, (venture_id, kind))
                existing = cursor.fetchone()
                if existing:
                    collection_id = existing[0]
                    cursor.execute("""
                        UPDATE projects
                           SET name = %s, parent_id = %s, level = 'folder',
                               locked = true, container_type = 'asset_collection',
                               system_role = %s
                         WHERE id = %s
                    """, (name, library_id, f"assets:{kind}", collection_id))
                    cursor.execute("""
                        UPDATE asset_collections SET name = %s
                         WHERE venture_id = %s AND kind = %s
                    """, (name, venture_id, kind))
                    continue

                cursor.execute("""
                    SELECT id FROM projects
                     WHERE parent_id = %s AND system_role = %s
                """, (library_id, f"assets:{kind}"))
                legacy = cursor.fetchone()
                if legacy:
                    collection_id = legacy[0]
                    cursor.execute("""
                        UPDATE projects
                           SET name = %s, level = 'folder', locked = true,
                               container_type = 'asset_collection'
                         WHERE id = %s
                    """, (name, collection_id))
                else:
                    cursor.execute("""
                        INSERT INTO projects
                            (name, parent_id, level, locked, container_type,
                             system_role)
                        VALUES (%s, %s, 'folder', true, 'asset_collection', %s)
                        RETURNING id
                    """, (name, library_id, f"assets:{kind}"))
                    collection_id = cursor.fetchone()[0]
                cursor.execute("""
                    INSERT INTO asset_collections
                        (id, venture_id, legacy_container_id, kind, name)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE
                       SET venture_id = EXCLUDED.venture_id,
                           legacy_container_id = EXCLUDED.legacy_container_id,
                           kind = EXCLUDED.kind, name = EXCLUDED.name
                """, (collection_id, venture_id, collection_id, kind, name))
        return self.collections_for_venture(venture_id)

    def collections_for_venture(self, venture_id: int) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, venture_id, kind, name
                  FROM asset_collections
                 WHERE venture_id = %s AND kind = 'assets' ORDER BY name
            """, (venture_id,))
            return [{"id": ident, "venture_id": owner, "kind": kind,
                     "name": name}
                    for ident, owner, kind, name in cursor.fetchall()]

    def collection(self, collection_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT id, venture_id, legacy_container_id, kind, name
                  FROM asset_collections WHERE id = %s
            """, (collection_id,))
            row = cursor.fetchone()
        if not row:
            return None
        fields = ("id", "venture_id", "legacy_container_id", "kind", "name")
        return dict(zip(fields, row))

    @staticmethod
    def _listed_assets(where: str, parameters: tuple) -> list[dict]:
        with read_only() as cursor:
            cursor.execute(f"""
                SELECT collection.name, asset.id, '', asset.name,
                       'Uploaded', version.duration_ms, version.filename,
                       version.path,
                       asset.kind, asset.media_type, version.id,
                       asset.venture_id, asset.scope,
                       asset.tags, asset.metadata, version.audio_format,
                       version.sample_rate, version.channels,
                       version.media_format, version.width, version.height,
                       version.video_codec, version.frame_rate,
                       asset.created_at, asset.updated_at,
                       version.size_bytes, version.mime_type,
                       version.metadata
                  FROM assets asset
                  JOIN asset_collections collection
                    ON collection.id = asset.collection_id
                  JOIN LATERAL (
                       SELECT item.* FROM asset_versions item
                        WHERE item.asset_id = asset.id
                        ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE {where}
                 ORDER BY collection.name, asset.updated_at, asset.id
            """, parameters)
            return [{
                "folder": folder, "collection": folder,
                "category": kind, "kind": kind,
                "media_type": media_type, "id": asset_id,
                "version_id": version_id, "text": text or "", "title": title,
                "voice": voice or "", "duration_ms": duration,
                "filename": filename, "path": path,
                "venture_id": owner, "scope": scope,
                "tags": tags or [], "metadata": metadata or {},
                "created_at": created_at.isoformat(),
                "updated_at": updated_at.isoformat(),
                "audio_format": audio_format, "sample_rate": sample_rate,
                "channels": channels, "media_format": media_format,
                "width": width, "height": height,
                "video_codec": video_codec, "frame_rate": frame_rate,
                "size_bytes": size_bytes,
                "mime_type": mime_type,
                "version_metadata": version_metadata or {},
            } for (folder, asset_id, text, title, voice, duration, filename,
                   path, kind, media_type, version_id, owner, scope, tags, metadata,
                   audio_format, sample_rate, channels, media_format, width,
                   height, video_codec, frame_rate, created_at, updated_at,
                   size_bytes, mime_type,
                   version_metadata) in cursor.fetchall()]

    def list_for_venture(self, venture_id: int) -> list[dict]:
        """Return Assets owned by one Venture, regardless of reuse scope."""
        return self._listed_assets("asset.venture_id = %s", (venture_id,))

    def list_for_production(self, production_id: int) -> list[dict]:
        """Return every Asset the Production may legally reference."""
        return self._listed_assets("""
            EXISTS (
                SELECT 1
                  FROM productions production
                  JOIN work_projects project
                    ON project.id = production.project_id
                 WHERE production.id = %s
                   AND production.archived_at IS NULL
                   AND (asset.venture_id = project.venture_id
                        OR asset.scope = 'studio')
            )
        """, (production_id,))

    def director_asset_ids(self, production_id: int) -> list[int]:
        """Return visual material deliberately collected for Director."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT selection.asset_id
                  FROM production_director_assets selection
                  JOIN assets asset ON asset.id = selection.asset_id
                 WHERE selection.production_id = %s
                   AND asset.media_type IN ('image', 'video')
                 ORDER BY selection.created_at, selection.asset_id
            """, (production_id,))
            return [int(row[0]) for row in cursor.fetchall()]

    def attach_to_director(
        self, production_id: int, asset_id: int,
    ) -> bool | None:
        """Collect one allowed visual Asset; idempotent by database truth."""
        with transaction() as cursor:
            cursor.execute("""
                SELECT 1
                  FROM assets asset
                  JOIN productions production ON production.id = %s
                  JOIN work_projects project ON project.id = production.project_id
                 WHERE asset.id = %s
                   AND asset.media_type IN ('image', 'video')
                   AND (asset.venture_id = project.venture_id
                        OR asset.scope = 'studio')
                   AND production.archived_at IS NULL
            """, (production_id, asset_id))
            if not cursor.fetchone():
                return None
            cursor.execute("""
                INSERT INTO production_director_assets
                    (production_id, asset_id)
                VALUES (%s, %s)
                ON CONFLICT (production_id, asset_id) DO NOTHING
            """, (production_id, asset_id))
        return True

    def detach_from_director(
        self, production_id: int, asset_id: int,
    ) -> bool | None:
        """Remove Director availability without deleting the reusable Asset."""
        with transaction() as cursor:
            cursor.execute(
                "SELECT 1 FROM productions WHERE id = %s AND archived_at IS NULL",
                (production_id,),
            )
            if not cursor.fetchone():
                return None
            cursor.execute("""
                DELETE FROM production_director_assets
                 WHERE production_id = %s AND asset_id = %s
            """, (production_id, asset_id))
        return True

    def get(self, asset_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT asset.id, asset.venture_id, asset.collection_id,
                       asset.name, asset.kind, asset.media_type,
                       asset.scope, asset.tags,
                       asset.metadata, asset.legacy_generation_id,
                       asset.created_at, asset.updated_at,
                       version.id, version.filename, version.path,
                       version.size_bytes, version.duration_ms,
                       version.mime_type, version.audio_format,
                       version.sample_rate, version.channels,
                       version.media_format, version.width, version.height,
                       version.video_codec, version.frame_rate,
                       version.metadata
                  FROM assets asset
                  JOIN LATERAL (
                       SELECT item.* FROM asset_versions item
                        WHERE item.asset_id = asset.id
                        ORDER BY item.version DESC LIMIT 1
                  ) version ON true
                 WHERE asset.id = %s
            """, (asset_id,))
            row = cursor.fetchone()
        return dict(zip(_ASSET_FIELDS, row)) if row else None

    def catalog_asset(
            self, collection_id: int, *, origin: str, external_id: str,
            scope: AssetScope) -> dict | None:
        """Return an already-kept external sound that is reusable here."""
        with read_only() as cursor:
            asset_id = self._catalog_asset_id(
                cursor, collection_id=collection_id, origin=origin,
                external_id=external_id, scope=scope)
        if asset_id is None:
            return None
        asset = self.get(asset_id)
        if not asset:
            return None
        return {
            **asset, "category": asset["kind"],
            "url": _asset_url(asset),
        }

    def generated_asset(self, *, candidate_id: str) -> dict | None:
        """Resolve one exact generated candidate regardless of Keep scope."""
        with read_only() as cursor:
            asset_id = self._generated_asset_id(
                cursor, candidate_id=candidate_id)
        if asset_id is None:
            return None
        asset = self.get(asset_id)
        return ({
            **asset, "category": asset["kind"],
            "url": _asset_url(asset),
        } if asset else None)

    @staticmethod
    def _generated_asset_id(cursor, *, candidate_id: str) -> int | None:
        cursor.execute("""
            SELECT id FROM assets
             WHERE metadata ->> 'origin' = 'generated'
               AND metadata ->> 'external_id' = %s
             ORDER BY id LIMIT 1
        """, (candidate_id,))
        row = cursor.fetchone()
        return row[0] if row else None

    @staticmethod
    def _generation_lock_key(candidate_id: str) -> int:
        identity = f"audio-generation:{candidate_id}"
        return int.from_bytes(
            hashlib.blake2b(identity.encode(), digest_size=8).digest(),
            byteorder="big", signed=True)

    @staticmethod
    def _catalog_asset_id(
            cursor, *, collection_id: int, origin: str, external_id: str,
            scope: AssetScope) -> int | None:
        """Resolve the established Studio/Venture reuse semantics."""
        cursor.execute("""
            SELECT asset.id
              FROM asset_collections requested
              JOIN assets asset
                ON (asset.scope = 'studio'
                    OR asset.venture_id = requested.venture_id)
             WHERE requested.id = %s
               AND asset.metadata ->> 'origin' = %s
               AND asset.metadata ->> 'external_id' = %s
               AND (%s = 'studio' AND asset.scope = 'studio'
                    OR %s = 'venture'
                       AND asset.venture_id = requested.venture_id)
             ORDER BY (asset.scope = 'studio') DESC, asset.id
             LIMIT 1
        """, (collection_id, origin, external_id, scope, scope))
        row = cursor.fetchone()
        return row[0] if row else None

    @staticmethod
    def _catalog_lock_key(
            *, venture_id: int, origin: str, external_id: str,
            scope: AssetScope) -> int:
        scope_identity = "studio" if scope == "studio" else str(venture_id)
        identity = f"audio-catalog:{scope}:{scope_identity}:{origin}:{external_id}"
        return int.from_bytes(
            hashlib.blake2b(identity.encode(), digest_size=8).digest(),
            byteorder="big", signed=True)

    def library_context(self, asset_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT asset.venture_id, collection.name, asset.kind, asset.id,
                       asset.legacy_generation_id, asset.scope,
                       asset.media_type
                  FROM assets asset
                  JOIN asset_collections collection
                    ON collection.id = asset.collection_id
                 WHERE asset.id = %s
            """, (asset_id,))
            row = cursor.fetchone()
        return ({"venture_id": row[0], "collection": row[1],
                 "kind": row[2], "category": row[2], "asset_id": row[3],
                 "legacy_generation_id": row[4], "scope": row[5],
                 "media_type": row[6]}
                if row else None)

    def allowed_for_production(
            self, production_id: int, asset_id: int) -> bool:
        with read_only() as cursor:
            cursor.execute("""
                SELECT 1
                  FROM assets asset
                  JOIN productions production ON production.id = %s
                  JOIN work_projects project
                    ON project.id = production.project_id
                 WHERE asset.id = %s
                   AND (asset.venture_id = project.venture_id
                        OR asset.scope = 'studio')
                   AND production.archived_at IS NULL
            """, (production_id, asset_id))
            row = cursor.fetchone()
        return bool(row)

    def create_uploaded_asset(
            self, collection_id: int, *, name: str, filename: str, path: str,
            size_bytes: int, duration_ms: int | None, audio_format: str | None,
            mime_type: str, category: AssetCategory | None = None,
            sample_rate: int | None = None, channels: int | None = None,
            scope: AssetScope = "venture", tags: tuple[str, ...] = (),
            metadata: dict | None = None,
            version_metadata: dict | None = None,
            media_type: AssetMediaType = "audio",
            media_format: str | None = None,
            width: int | None = None, height: int | None = None,
            video_codec: str | None = None, frame_rate: float | None = None,
            ) -> dict | None:
        """Commit an Asset and its first immutable version atomically."""
        with transaction() as cursor:
            cursor.execute("""
                SELECT venture_id, legacy_container_id, kind
                  FROM asset_collections WHERE id = %s
            """, (collection_id,))
            collection = cursor.fetchone()
            if not collection:
                return None
            return self._create_uploaded_asset(
                cursor, collection_id=collection_id, collection=collection,
                name=name, filename=filename, path=path,
                size_bytes=size_bytes, duration_ms=duration_ms,
                audio_format=audio_format, mime_type=mime_type,
                category=category, sample_rate=sample_rate,
                channels=channels, scope=scope, tags=tags,
                metadata=metadata, version_metadata=version_metadata,
                media_type=media_type, media_format=media_format,
                width=width, height=height, video_codec=video_codec,
                frame_rate=frame_rate)

    def create_catalog_asset(
            self, collection_id: int, *, origin: str, external_id: str,
            name: str, filename: str, path: str, size_bytes: int,
            duration_ms: int | None, audio_format: str | None, mime_type: str,
            category: AssetCategory | None = None,
            sample_rate: int | None = None, channels: int | None = None,
            scope: AssetScope = "venture", tags: tuple[str, ...] = (),
            metadata: dict | None = None,
            version_metadata: dict | None = None,
            media_type: AssetMediaType = "audio",
            media_format: str | None = None,
            width: int | None = None, height: int | None = None,
            video_codec: str | None = None, frame_rate: float | None = None,
            ) -> tuple[dict | None, bool]:
        """Create once per external identity and reuse the concurrent winner."""
        with transaction() as cursor:
            cursor.execute("""
                SELECT venture_id, legacy_container_id, kind
                  FROM asset_collections WHERE id = %s
            """, (collection_id,))
            collection = cursor.fetchone()
            if not collection:
                return None, False
            cursor.execute(
                "SELECT pg_advisory_xact_lock(%s)",
                (self._catalog_lock_key(
                    venture_id=collection[0], origin=origin,
                    external_id=external_id, scope=scope),),
            )
            existing_id = self._catalog_asset_id(
                cursor, collection_id=collection_id, origin=origin,
                external_id=external_id, scope=scope)
            if existing_id is not None:
                duplicate = True
                asset_id = existing_id
            else:
                duplicate = False
                created = self._create_uploaded_asset(
                    cursor, collection_id=collection_id,
                    collection=collection, name=name, filename=filename,
                    path=path, size_bytes=size_bytes,
                    duration_ms=duration_ms, audio_format=audio_format,
                    mime_type=mime_type, category=category,
                    sample_rate=sample_rate, channels=channels, scope=scope,
                    tags=tags, metadata=metadata,
                    version_metadata=version_metadata,
                    media_type=media_type, media_format=media_format,
                    width=width, height=height, video_codec=video_codec,
                    frame_rate=frame_rate)
                asset_id = created["id"]
        asset = self.get(asset_id)
        if not asset:
            return None, duplicate
        return ({
            **asset, "category": asset["kind"],
            "url": _asset_url(asset),
        }, duplicate)

    def create_generated_asset(
            self, collection_id: int, *, candidate_id: str,
            name: str, filename: str, path: str, size_bytes: int,
            duration_ms: int | None, audio_format: str | None, mime_type: str,
            category: AssetCategory | None = None,
            sample_rate: int | None = None, channels: int | None = None,
            scope: AssetScope = "venture", tags: tuple[str, ...] = (),
            metadata: dict | None = None,
            version_metadata: dict | None = None,
            media_type: AssetMediaType = "audio",
            media_format: str | None = None,
            width: int | None = None, height: int | None = None,
            video_codec: str | None = None, frame_rate: float | None = None,
            ) -> tuple[dict | None, bool]:
        """Create one canonical Asset for one exact generation candidate."""
        with transaction() as cursor:
            cursor.execute("""
                SELECT venture_id, legacy_container_id, kind
                  FROM asset_collections WHERE id = %s
            """, (collection_id,))
            collection = cursor.fetchone()
            if not collection:
                return None, False
            cursor.execute(
                "SELECT pg_advisory_xact_lock(%s)",
                (self._generation_lock_key(candidate_id),),
            )
            existing_id = self._generated_asset_id(
                cursor, candidate_id=candidate_id)
            if existing_id is not None:
                duplicate = True
                asset_id = existing_id
            else:
                duplicate = False
                created = self._create_uploaded_asset(
                    cursor, collection_id=collection_id,
                    collection=collection, name=name, filename=filename,
                    path=path, size_bytes=size_bytes,
                    duration_ms=duration_ms, audio_format=audio_format,
                    mime_type=mime_type, category=category,
                    sample_rate=sample_rate, channels=channels, scope=scope,
                    tags=tags, metadata=metadata,
                    version_metadata=version_metadata,
                    media_type=media_type, media_format=media_format,
                    width=width, height=height, video_codec=video_codec,
                    frame_rate=frame_rate)
                asset_id = created["id"]
        asset = self.get(asset_id)
        if not asset:
            return None, duplicate
        return ({
            **asset, "category": asset["kind"],
            "url": _asset_url(asset),
        }, duplicate)

    @staticmethod
    def _create_uploaded_asset(
            cursor, *, collection_id: int, collection: tuple, name: str,
            filename: str, path: str, size_bytes: int,
            duration_ms: int | None,
            audio_format: str | None, mime_type: str,
            category: AssetCategory | None, sample_rate: int | None,
            channels: int | None, scope: AssetScope, tags: tuple[str, ...],
            metadata: dict | None, version_metadata: dict | None,
            media_type: AssetMediaType = "audio",
            media_format: str | None = None,
            width: int | None = None, height: int | None = None,
            video_codec: str | None = None,
            frame_rate: float | None = None) -> dict:
        venture_id, _legacy_container_id, collection_kind = collection
        if media_type not in ASSET_MEDIA_TYPES:
            raise ValueError("Asset media type is not supported.")
        if media_type != "audio" and category not in (None, "other"):
            raise ValueError("Audio categories cannot classify visual Assets.")
        canonical_category = (
            category or _CATEGORY_BY_COLLECTION.get(collection_kind, "other")
            if media_type == "audio" else "other"
        )
        if canonical_category not in ASSET_CATEGORIES:
            raise ValueError("Asset category is not supported.")
        cursor.execute("""
            INSERT INTO assets
                (venture_id, collection_id, name, kind, media_type, scope, tags,
                 metadata, legacy_generation_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL)
            RETURNING id, created_at, updated_at
        """, (venture_id, collection_id, name, canonical_category,
              media_type, scope, list(tags), json.dumps(metadata or {})))
        asset_id, created_at, updated_at = cursor.fetchone()
        cursor.execute("""
            INSERT INTO asset_versions
                (asset_id, version, source_generation_id, filename, path,
                 size_bytes, duration_ms, mime_type, audio_format,
                 sample_rate, channels, media_format, width, height,
                 video_codec, frame_rate, metadata)
            VALUES (%s, 1, NULL, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (asset_id, filename, path, size_bytes,
              duration_ms, mime_type, audio_format, sample_rate, channels,
              media_format or audio_format, width, height, video_codec,
              frame_rate, json.dumps(version_metadata or {})))
        version_id = cursor.fetchone()[0]
        return {"id": asset_id,
                "version_id": version_id, "name": name,
                "filename": filename, "duration_ms": duration_ms,
                "category": canonical_category, "scope": scope,
                "tags": list(tags), "metadata": metadata or {},
                "created_at": created_at.isoformat(),
                "updated_at": updated_at.isoformat(),
                "media_type": media_type,
                "media_format": media_format or audio_format,
                "width": width, "height": height,
                "video_codec": video_codec, "frame_rate": frame_rate,
                "audio_format": audio_format, "sample_rate": sample_rate,
                "channels": channels, "size_bytes": size_bytes,
                "mime_type": mime_type,
                "version_metadata": version_metadata or {}}
