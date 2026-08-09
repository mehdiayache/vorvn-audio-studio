#!/usr/bin/env python3
"""Read-only verification for the canonical domain and baseline migration."""

from audio_studio.migrations import run as run_migrations
from audio_studio.infrastructure.postgres.exports import ProductionExportRepository
from audio_studio.infrastructure.postgres.session import read_only
from audio_studio.infrastructure.postgres.venture_assets import VentureAssetRepository
from audio_studio.infrastructure.postgres import work as work_repository


results = []
asset_repository = VentureAssetRepository()
export_repository = ProductionExportRepository()


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(f"  {'PASS' if condition else 'FAIL'}  {name}" +
          (f" — {detail}" if detail and not condition else ""))


check("schema initializes idempotently", run_migrations() == [])
tree = work_repository.hierarchy()
types = {item["type"] for item in tree}
check("hierarchy exposes explicit canonical domain types",
      {"venture", "project", "series", "production"}.issubset(types),
      sorted(types))

with read_only() as cursor:
    cursor.execute("""
        SELECT count(*), count(*) FILTER (WHERE system_role = 'inbox')
          FROM projects WHERE container_type = 'inbox'
    """)
    inbox_count, identified_inboxes = cursor.fetchone()
    cursor.execute("""
        SELECT count(*) FROM projects
         WHERE container_type = 'library' AND system_role = 'venture_assets'
    """)
    library_count = cursor.fetchone()[0]
    cursor.execute("""
        SELECT count(*) FROM asset_collections
         WHERE kind IN ('intros', 'outros', 'music', 'stingers')
    """)
    collection_count = cursor.fetchone()[0]
    cursor.execute("""
        SELECT count(*) FROM generations generation
         JOIN projects container ON container.id = generation.project_id
         LEFT JOIN assets asset
           ON asset.legacy_generation_id = generation.id
        WHERE container.container_type = 'asset_collection'
          AND generation.version_of IS NULL AND generation.filename <> ''
          AND asset.id IS NULL
    """)
    unmapped_library_audio = cursor.fetchone()[0]
    cursor.execute("""
        SELECT count(*) FROM assets asset
         WHERE NOT EXISTS (
           SELECT 1 FROM asset_versions version WHERE version.asset_id = asset.id)
    """)
    assets_without_version = cursor.fetchone()[0]

check("Inbox identity is a system role, not a display-name test",
      inbox_count == identified_inboxes == 1,
      (inbox_count, identified_inboxes))
check("every Venture library has explicit identity",
      library_count > 0, library_count)
check("asset collections carry stable roles",
      collection_count == library_count * 4,
      (collection_count, library_count))
check("legacy library audio is backfilled as typed Assets",
      unmapped_library_audio == 0, unmapped_library_audio)
check("every Asset has an immutable current version",
      assets_without_version == 0, assets_without_version)

ownership = []
for production in [item for item in tree if item["type"] == "production"]:
    canonical = work_repository.production_get(production["id"])
    if not canonical or not canonical["trail"]:
        continue
    venture_id = canonical["trail"][0]["id"]
    for asset in asset_repository.list_for_venture(venture_id):
        ownership.append(asset_repository.allowed_for_production(
            production["id"], asset["id"], {asset["collection"]}))
check("same-Venture Asset permissions survive migration",
      bool(ownership) and all(ownership), ownership)

nodes = {item["key"]: item for item in tree}
for venture in [item for item in tree if item["type"] == "venture"]:
    descendants = []
    todo = [venture["key"]]
    while todo:
        parent = todo.pop()
        children = [item for item in tree if item["parent_key"] == parent]
        descendants.extend(children)
        todo.extend(item["key"] for item in children)
    expected_parts = sum(item["metrics"]["parts"] for item in descendants
                         if item["type"] == "production")
    check(f"{venture['name']} metrics exclude library files",
          venture["metrics"]["parts"] == expected_parts,
          (venture["metrics"]["parts"], expected_parts))

exports = []
for production in [item for item in tree if item["type"] == "production"]:
    exports.extend(export_repository.list(production["id"]))
check("legacy snapshots are represented as Export resources", bool(exports), exports)
check("Exports retain manifests and renderer identity",
      all(isinstance(item["manifest"], dict) and item["renderer"] for item in exports),
      exports)

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
