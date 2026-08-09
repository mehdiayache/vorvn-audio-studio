#!/usr/bin/env python3
"""Read-only domain verification for the additive Phase 2 migration."""

import db
from audio_studio.infrastructure.postgres.exports import ProductionExportRepository
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)
from audio_studio.infrastructure.postgres import work as work_repository


results = []
asset_repository = VentureAssetRepository()
export_repository = ProductionExportRepository()


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(f"  {'PASS' if condition else 'FAIL'}  {name}" +
          (f" — {detail}" if detail and not condition else ""))


check("schema initializes idempotently", db.init())
tree = db.project_tree()
types = {item["container_type"] for item in tree}
check("hierarchy exposes explicit domain types",
      {"venture", "project", "production", "inbox", "library",
       "asset_collection"}.issubset(types), sorted(types))

inboxes = [item for item in tree if item["container_type"] == "inbox"]
check("Inbox identity is a system role, not a display-name test",
      len(inboxes) == 1 and inboxes[0]["system_role"] == "inbox", inboxes)

libraries = [item for item in tree if item["container_type"] == "library"]
collections = [item for item in tree if item["container_type"] == "asset_collection"]
check("every Venture library has explicit identity",
      libraries and all(item["system_role"] == "venture_assets" for item in libraries),
      libraries)
check("asset collections carry stable roles",
      collections and all(str(item["system_role"]).startswith("assets:")
                          for item in collections), collections)

assets = []
for venture in [item for item in tree if item["container_type"] == "venture"]:
    assets.extend(asset_repository.get(item["id"])
                  for item in asset_repository.list_for_venture(venture["id"]))
check("legacy library audio is backfilled as typed Assets", bool(assets), assets)
check("every Asset has an immutable current version",
      all(asset["version_id"] and asset["filename"] for asset in assets), assets)

ownership = []
for production in [item for item in tree if item["container_type"] == "production"]:
    canonical = work_repository.production_get(production["id"])
    if not canonical or not canonical["trail"]:
        continue
    venture_id = canonical["trail"][0]["id"]
    for asset in asset_repository.list_for_venture(venture_id):
        ownership.append(asset_repository.allowed_for_production(
            production["id"], asset["id"], {asset["collection"]}))
check("same-Venture Asset permissions survive migration",
      bool(ownership) and all(ownership), ownership)

for venture in [item for item in tree if item["container_type"] == "venture"]:
    descendants = []
    todo = [venture["id"]]
    while todo:
        parent = todo.pop()
        children = [item for item in tree if item["parent_id"] == parent]
        descendants.extend(children)
        todo.extend(item["id"] for item in children)
    expected_parts = sum(item["parts"] for item in descendants
                         if item["container_type"] == "production")
    check(f"{venture['name']} metrics exclude library files",
          venture["all_parts"] == expected_parts,
          (venture["all_parts"], expected_parts, venture["all_files"]))

exports = []
for production in [item for item in tree if item["container_type"] == "production"]:
    exports.extend(export_repository.list(production["id"]))
check("legacy snapshots are represented as Export resources", bool(exports), exports)
check("Exports retain manifests and renderer identity",
      all(isinstance(item["manifest"], dict) and item["renderer"] for item in exports),
      exports)

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
