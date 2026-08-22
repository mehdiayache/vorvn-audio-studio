"""Canonical PostgreSQL persistence for reusable Venture Assets."""

from __future__ import annotations

import json

from audio_studio.domain.uploads import (
    ASSET_CATEGORIES, AssetCategory, AssetScope,
)
from audio_studio.infrastructure.postgres.session import read_only, transaction


COLLECTIONS = (
    ("intros", "Intros"),
    ("outros", "Outros"),
    ("music", "Music"),
    ("stingers", "Stingers"),
)

_ASSET_FIELDS = (
    "id", "venture_id", "collection_id", "name", "kind",
    "scope", "tags", "metadata", "legacy_generation_id", "version_id",
    "filename", "path", "size_bytes", "duration_ms", "mime_type",
    "audio_format", "sample_rate", "channels", "version_metadata",
)

_CATEGORY_BY_COLLECTION = {
    "intros": "intro",
    "outros": "outro",
    "music": "music",
    "stingers": "sfx",
}


class VentureAssetRepository:
    """Own Asset collections, immutable versions and ownership checks."""

    def ensure_collections(self, venture_id: int) -> list[dict]:
        """Create the four fixed collections while IDs still bridge legacy rows."""
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
                 WHERE venture_id = %s ORDER BY name
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
                       asset.kind, version.id, asset.venture_id, asset.scope,
                       asset.tags, asset.metadata, version.audio_format,
                       version.sample_rate, version.channels,
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
                "category": kind, "kind": kind, "id": asset_id,
                "version_id": version_id, "text": text or "", "title": title,
                "voice": voice or "", "duration_ms": duration,
                "filename": filename, "venture_id": owner, "scope": scope,
                "tags": tags or [], "metadata": metadata or {},
                "audio_format": audio_format, "sample_rate": sample_rate,
                "channels": channels, "size_bytes": size_bytes,
                "mime_type": mime_type,
                "version_metadata": version_metadata or {},
            } for (folder, asset_id, text, title, voice, duration, filename,
                   kind, version_id, owner, scope, tags, metadata,
                   audio_format, sample_rate, channels, size_bytes, mime_type,
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

    def get(self, asset_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT asset.id, asset.venture_id, asset.collection_id,
                       asset.name, asset.kind, asset.scope, asset.tags,
                       asset.metadata, asset.legacy_generation_id,
                       version.id, version.filename, version.path,
                       version.size_bytes, version.duration_ms,
                       version.mime_type, version.audio_format,
                       version.sample_rate, version.channels,
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

    def library_context(self, asset_id: int) -> dict | None:
        with read_only() as cursor:
            cursor.execute("""
                SELECT asset.venture_id, collection.name, asset.kind, asset.id,
                       asset.legacy_generation_id, asset.scope
                  FROM assets asset
                  JOIN asset_collections collection
                    ON collection.id = asset.collection_id
                 WHERE asset.id = %s
            """, (asset_id,))
            row = cursor.fetchone()
        return ({"venture_id": row[0], "collection": row[1],
                 "kind": row[2], "category": row[2], "asset_id": row[3],
                 "legacy_generation_id": row[4], "scope": row[5]}
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
            size_bytes: int, duration_ms: int, audio_format: str,
            mime_type: str, category: AssetCategory | None = None,
            sample_rate: int | None = None, channels: int | None = None,
            scope: AssetScope = "venture", tags: tuple[str, ...] = (),
            metadata: dict | None = None,
            version_metadata: dict | None = None,
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
            venture_id, _legacy_container_id, collection_kind = collection
            canonical_category = category or _CATEGORY_BY_COLLECTION.get(
                collection_kind, "other")
            if canonical_category not in ASSET_CATEGORIES:
                raise ValueError("Asset category is not supported.")
            cursor.execute("""
                INSERT INTO assets
                    (venture_id, collection_id, name, kind, scope, tags,
                     metadata, legacy_generation_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NULL) RETURNING id
            """, (venture_id, collection_id, name, canonical_category,
                  scope, list(tags), json.dumps(metadata or {})))
            asset_id = cursor.fetchone()[0]
            cursor.execute("""
                INSERT INTO asset_versions
                    (asset_id, version, source_generation_id, filename, path,
                     size_bytes, duration_ms, mime_type, audio_format,
                     sample_rate, channels, metadata)
                VALUES (%s, 1, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (asset_id, filename, path, size_bytes,
                  duration_ms, mime_type, audio_format, sample_rate, channels,
                  json.dumps(version_metadata or {})))
            version_id = cursor.fetchone()[0]
        return {"id": asset_id,
                "version_id": version_id, "name": name,
                "filename": filename, "duration_ms": duration_ms,
                "category": canonical_category, "scope": scope,
                "tags": list(tags), "metadata": metadata or {},
                "audio_format": audio_format, "sample_rate": sample_rate,
                "channels": channels, "size_bytes": size_bytes,
                "mime_type": mime_type,
                "version_metadata": version_metadata or {}}
