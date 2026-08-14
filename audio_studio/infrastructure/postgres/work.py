"""PostgreSQL repository for canonical Work navigation and lifecycle."""

from __future__ import annotations

from typing import Any, TypedDict
import json
import re

from audio_studio.domain.work import DomainConflict, DomainValidation
from audio_studio.infrastructure.postgres.accounting import (
    ProductionAccountingRepository,
)
from audio_studio.infrastructure.postgres.session import read_only, transaction


accounting_repository = ProductionAccountingRepository()


class ProductionSummary(TypedDict):
    id: int
    type: str
    key: str
    name: str
    description: str
    status: str
    series_id: int | None
    part_count: int
    duration_ms: int
    total_cost: float
    current_sequence_cost: float
    updated_at: str | None


class VentureOverview(TypedDict):
    resource: dict[str, Any]
    trail: list[dict[str, Any]]
    projects: list[dict[str, Any]]
    asset_summary: dict[str, Any]
    recent_productions: list[ProductionSummary]


class ProjectOverview(TypedDict):
    resource: dict[str, Any]
    trail: list[dict[str, Any]]
    series: list[dict[str, Any]]
    standalone_productions: list[ProductionSummary]
    metrics: dict[str, Any]


class SeriesOverview(TypedDict):
    resource: dict[str, Any]
    trail: list[dict[str, Any]]
    defaults: dict[str, Any]
    productions: list[ProductionSummary]
    metrics: dict[str, Any]


def _iso(value):
    return value.isoformat() if value else None


def resolve_id(collection: str, identifier: str) -> int | None:
    """Resolve one public UUID (or temporary numeric compatibility ID)."""
    tables = {
        "ventures": "ventures", "projects": "work_projects",
        "series": "series", "productions": "productions",
    }
    table = tables[collection]
    value = str(identifier or "").strip()
    if not value:
        return None
    with read_only() as cur:
        cur.execute(
            f"SELECT id FROM {table} WHERE public_id::text=%s "
            "OR id::text=%s LIMIT 1", (value, value))
        row = cur.fetchone()
    return int(row[0]) if row else None


def hierarchy() -> list[dict[str, Any]]:
    """Return a typed tree. Keys are typed because table-local IDs can collide."""
    with read_only() as cur:
        cur.execute("""
            SELECT 'venture', v.id, v.public_id, NULL::BIGINT, NULL::BIGINT, v.name,
                   v.description, v.icon, v.updated_at, v.locked, v.system_role,
                   0::BIGINT, 0::NUMERIC
              FROM ventures v WHERE v.archived_at IS NULL
            UNION ALL
            SELECT 'project', p.id, p.public_id, p.venture_id, NULL::BIGINT, p.name,
                   p.description, coalesce(nullif(p.cover_image, ''), p.icon), p.updated_at, false, NULL,
                   0::BIGINT, 0::NUMERIC
              FROM work_projects p WHERE p.archived_at IS NULL
            UNION ALL
            SELECT 'series', s.id, s.public_id, s.project_id, NULL::BIGINT, s.name,
                   s.description, s.icon, s.updated_at, false, NULL,
                   0::BIGINT, 0::NUMERIC
              FROM series s WHERE s.archived_at IS NULL
            UNION ALL
            SELECT 'production', p.id, p.public_id, p.project_id, p.series_id, p.name,
                   p.description, '', p.updated_at, false, NULL,
                   count(pp.id), coalesce(sum(clip.cost), 0)
              FROM productions p
              LEFT JOIN production_parts pp ON pp.production_id = p.id
               AND pp.archived_at IS NULL
              LEFT JOIN clips clip ON clip.part_id = pp.id
             WHERE p.archived_at IS NULL
             GROUP BY p.id
        """)
        rows = cur.fetchall()

    production_accounting = accounting_repository.many(
        [ident for kind, ident, *_ in rows if kind == "production"])

    nodes = []
    for kind, ident, public_id, owner_id, series_id, name, description, icon, updated, locked, role, parts, cost in rows:
        if kind == "production":
            cost = production_accounting.get(ident, {}).get("historical_spend", float(cost or 0))
        if kind == "venture":
            parent_key = None
        elif kind == "project":
            parent_key = f"venture:{owner_id}"
        elif kind == "series":
            parent_key = f"project:{owner_id}"
        else:
            parent_key = f"series:{series_id}" if series_id else f"project:{owner_id}"
        nodes.append({
            "key": f"{kind}:{ident}", "id": ident,
            "public_id": str(public_id), "type": kind,
            "parent_key": parent_key, "name": name,
            "description": description or "", "icon": icon or "",
            "updated_at": _iso(updated), "locked": bool(locked),
            "system_role": role, "metrics": {
                "parts": int(parts or 0), "cost": float(cost or 0),
            },
        })
    by_key = {node["key"]: node for node in nodes}
    depth = {"venture": 0, "project": 1, "series": 2, "production": 3}
    for node in sorted(nodes, key=lambda item: depth[item["type"]], reverse=True):
        parent = by_key.get(node["parent_key"])
        if parent:
            parent["metrics"]["parts"] += node["metrics"]["parts"]
            parent["metrics"]["cost"] += node["metrics"]["cost"]
    return sorted(nodes, key=lambda node: (depth[node["type"]], node["name"].lower()))


def production_get(production_id: int) -> dict[str, Any] | None:
    with read_only() as cur:
        cur.execute("""
            SELECT production.id, production.public_id, production.name,
                   production.description, production.status,
                   production.project_id, production.series_id,
                   production.legacy_container_id, production.settings,
                   production.updated_at,
                   project.name, project.public_id, project.venture_id,
                   venture.name, venture.public_id, venture.icon,
                   series.name, series.public_id
              FROM productions production
              JOIN work_projects project ON project.id = production.project_id
              JOIN ventures venture ON venture.id = project.venture_id
              LEFT JOIN series ON series.id = production.series_id
             WHERE production.id = %s
               AND production.archived_at IS NULL
               AND project.archived_at IS NULL
               AND venture.archived_at IS NULL
        """, (production_id,))
        row = cur.fetchone()
    if not row:
        return None
    (ident, public_id, name, description, status, project_id, series_id,
     legacy_id, production_settings, updated, project_name, project_public_id,
     venture_id, venture_name, venture_public_id, venture_icon,
     series_name, series_public_id) = row
    trail = [
        {"id": venture_id, "public_id": str(venture_public_id), "type": "venture", "name": venture_name,
         "icon": venture_icon or ""},
        {"id": project_id, "public_id": str(project_public_id), "type": "project", "name": project_name},
    ]
    if series_id:
        trail.append({"id": series_id, "public_id": str(series_public_id), "type": "series", "name": series_name})
    return {
        "id": ident, "public_id": str(public_id), "type": "production",
        "key": f"production:{ident}", "name": name,
        "description": description or "", "status": status,
        "project_id": project_id, "series_id": series_id,
        "legacy_container_id": legacy_id,
        "settings": production_settings or {}, "trail": trail,
        "updated_at": _iso(updated),
    }


def resource_get(kind: str, resource_id: int) -> dict[str, Any] | None:
    node = next((item for item in hierarchy()
                 if item["type"] == kind and item["id"] == resource_id), None)
    if not node:
        return None
    node["children"] = [item for item in hierarchy()
                        if item["parent_key"] == node["key"]]
    return node


def _production_summaries(cur, where_sql: str, params: tuple = ()) -> list[ProductionSummary]:
    """Compact, durable Production cards shared by all overview DTOs."""
    cur.execute(f"""
        SELECT production.id, production.public_id, production.name, production.description,
               production.status, production.series_id, production.updated_at,
               count(part.id),
               coalesce(sum(coalesce(clip.duration_ms, part.duration_ms, 0)), 0),
               coalesce(sum(clip.cost), 0)
          FROM productions production
          LEFT JOIN production_parts part ON part.production_id = production.id
           AND part.archived_at IS NULL
          LEFT JOIN clips clip ON clip.part_id = part.id
         WHERE production.archived_at IS NULL AND ({where_sql})
         GROUP BY production.id
         ORDER BY production.position NULLS LAST, production.updated_at DESC,
                  production.name
    """, params)
    rows = cur.fetchall()
    accounting = accounting_repository.many([row[0] for row in rows])
    return [{
        "id": ident, "public_id": str(public_id), "type": "production", "key": f"production:{ident}",
        "name": name, "description": description or "", "status": status,
        "series_id": series_id, "part_count": int(part_count or 0),
        "duration_ms": int(duration_ms or 0),
        "total_cost": accounting.get(ident, {}).get("historical_spend", float(total_cost or 0)),
        "current_sequence_cost": accounting.get(ident, {}).get("current_sequence_cost", float(total_cost or 0)),
        "updated_at": _iso(updated_at),
    } for (ident, public_id, name, description, status, series_id, updated_at,
           part_count, duration_ms, total_cost) in rows]


def venture_overview(venture_id: int) -> VentureOverview | None:
    """Brand-level overview: work, reusable media, and recent outputs."""
    with read_only() as cur:
        cur.execute("""
            SELECT id, public_id, name, description, icon, locked, updated_at
              FROM ventures WHERE id = %s AND archived_at IS NULL
        """, (venture_id,))
        row = cur.fetchone()
        if not row:
            return None
        ident, public_id, name, description, icon, locked, updated_at = row
        cur.execute("""
            SELECT project.id, project.public_id, project.name, project.description,
                   coalesce(nullif(project.cover_image, ''), project.icon),
                   project.updated_at, count(DISTINCT production.id),
                   count(DISTINCT part.id),
                   coalesce(sum(coalesce(clip.duration_ms, part.duration_ms, 0)), 0),
                   coalesce(sum(clip.cost), 0)
              FROM work_projects project
              LEFT JOIN productions production
                ON production.project_id = project.id
               AND production.archived_at IS NULL
              LEFT JOIN production_parts part ON part.production_id = production.id
               AND part.archived_at IS NULL
              LEFT JOIN clips clip ON clip.part_id = part.id
             WHERE project.venture_id = %s AND project.archived_at IS NULL
             GROUP BY project.id
             ORDER BY project.updated_at DESC, project.name
        """, (venture_id,))
        projects = [{
            "id": project_id, "public_id": str(project_public_id), "type": "project", "key": f"project:{project_id}",
            "name": project_name, "description": project_description or "",
            "cover_image": project_icon or "", "updated_at": _iso(project_updated),
            "metrics": {"production_count": int(production_count or 0),
                        "part_count": int(part_count or 0),
                        "duration_ms": int(duration_ms or 0),
                        "total_cost": float(total_cost or 0),
                        "current_sequence_cost": float(total_cost or 0)},
        } for (project_id, project_public_id, project_name, project_description, project_icon,
               project_updated, production_count, part_count, duration_ms,
               total_cost) in cur.fetchall()]
        # Cost on a Project card is spend attributable to all of its
        # Productions, including paid work whose Part was later removed.
        # Duration and Part counts remain a description of the current edit.
        project_ids = [item["id"] for item in projects]
        cur.execute("""
            SELECT id, project_id FROM productions
             WHERE archived_at IS NULL AND project_id = ANY(%s)
        """, (project_ids,))
        production_owners = cur.fetchall()
        project_accounting: dict[int, dict[str, float]] = {
            project_id: {"historical_spend": 0.0, "current_sequence_cost": 0.0}
            for project_id in project_ids
        }
        accounting = accounting_repository.many(
            [production_id for production_id, _ in production_owners])
        for production_id, project_id in production_owners:
            values = accounting.get(production_id, {})
            project_accounting[project_id]["historical_spend"] += float(
                values.get("historical_spend", 0))
            project_accounting[project_id]["current_sequence_cost"] += float(
                values.get("current_sequence_cost", 0))
        for project in projects:
            values = project_accounting[project["id"]]
            project["metrics"]["total_cost"] = round(values["historical_spend"], 6)
            project["metrics"]["current_sequence_cost"] = round(
                values["current_sequence_cost"], 6)
        cur.execute("""
            SELECT collection.id, collection.kind, collection.name,
                   count(asset.id), coalesce(sum(version.duration_ms), 0)
              FROM asset_collections collection
              LEFT JOIN assets asset ON asset.collection_id = collection.id
              LEFT JOIN LATERAL (
                SELECT duration_ms FROM asset_versions
                 WHERE asset_id = asset.id ORDER BY version DESC LIMIT 1
              ) version ON true
             WHERE collection.venture_id = %s
             GROUP BY collection.id
             ORDER BY collection.name
        """, (venture_id,))
        by_kind = {kind: {"collection_id": collection_id, "name": collection_name,
                          "count": int(count), "duration_ms": int(duration or 0)}
                   for collection_id, kind, collection_name, count, duration in cur.fetchall()}
        recent = sorted(_production_summaries(
            cur, "production.project_id IN (SELECT id FROM work_projects WHERE venture_id = %s)",
            (venture_id,)), key=lambda item: item["updated_at"] or "", reverse=True)[:8]
    return {
        "resource": {"id": ident, "public_id": str(public_id), "type": "venture",
                     "key": f"venture:{ident}", "name": name,
                     "description": description or "", "icon": icon or "",
                     "locked": bool(locked), "updated_at": _iso(updated_at)},
        "trail": [], "projects": projects,
        "asset_summary": {"total": sum(item["count"] for item in by_kind.values()),
                          "duration_ms": sum(item["duration_ms"] for item in by_kind.values()),
                          "by_kind": by_kind},
        "recent_productions": recent,
    }


def project_overview(project_id: int) -> ProjectOverview | None:
    """Project workspace with Series and standalone Productions kept distinct."""
    with read_only() as cur:
        cur.execute("""
            SELECT project.id, project.public_id, project.name,
                   project.description,
                   coalesce(nullif(project.cover_image, ''), project.icon),
                   project.updated_at,
                   venture.id, venture.public_id, venture.name, venture.icon
              FROM work_projects project
              JOIN ventures venture ON venture.id = project.venture_id
             WHERE project.id = %s AND project.archived_at IS NULL
               AND venture.archived_at IS NULL
        """, (project_id,))
        row = cur.fetchone()
        if not row:
            return None
        (ident, public_id, name, description, icon, updated_at,
         venture_id, venture_public_id, venture_name, venture_icon) = row
        cur.execute("""
            SELECT series.id, series.public_id, series.name, series.description, series.icon,
                   series.defaults, series.updated_at,
                   count(DISTINCT production.id), count(part.id),
                   coalesce(sum(coalesce(clip.duration_ms, part.duration_ms, 0)), 0),
                   coalesce(sum(clip.cost), 0)
              FROM series
              LEFT JOIN productions production ON production.series_id = series.id
               AND production.archived_at IS NULL
              LEFT JOIN production_parts part ON part.production_id = production.id
               AND part.archived_at IS NULL
              LEFT JOIN clips clip ON clip.part_id = part.id
             WHERE series.project_id = %s AND series.archived_at IS NULL
             GROUP BY series.id
             ORDER BY series.position NULLS LAST, series.updated_at DESC, series.name
        """, (project_id,))
        series_items = [{
            "id": series_id, "public_id": str(series_public_id), "type": "series", "key": f"series:{series_id}",
            "name": series_name, "description": series_description or "",
            "icon": series_icon or "", "defaults": defaults or {},
            "updated_at": _iso(series_updated),
            "metrics": {"production_count": int(production_count or 0),
                        "part_count": int(part_count or 0),
                        "duration_ms": int(duration_ms or 0),
                        "total_cost": float(total_cost or 0)},
        } for (series_id, series_public_id, series_name, series_description, series_icon, defaults,
               series_updated, production_count, part_count, duration_ms,
               total_cost) in cur.fetchall()]
        standalone = _production_summaries(
            cur, "production.project_id = %s AND production.series_id IS NULL",
            (project_id,))
        all_productions = _production_summaries(cur, "production.project_id = %s", (project_id,))
        productions_by_series: dict[int, list[dict[str, Any]]] = {}
        for production in all_productions:
            if production["series_id"] is not None:
                productions_by_series.setdefault(
                    int(production["series_id"]), []).append(production)
        for series in series_items:
            series["productions"] = productions_by_series.get(series["id"], [])
        series_costs: dict[int, dict[str, float]] = {}
        for production in all_productions:
            if production["series_id"] is None:
                continue
            values = series_costs.setdefault(
                production["series_id"],
                {"historical_spend": 0.0, "current_sequence_cost": 0.0})
            values["historical_spend"] += production["total_cost"]
            values["current_sequence_cost"] += production["current_sequence_cost"]
        for series in series_items:
            values = series_costs.get(
                series["id"],
                {"historical_spend": 0.0, "current_sequence_cost": 0.0})
            series["metrics"]["total_cost"] = round(values["historical_spend"], 6)
            series["metrics"]["current_sequence_cost"] = round(
                values["current_sequence_cost"], 6)
    return {
        "resource": {"id": ident, "public_id": str(public_id), "type": "project",
                     "key": f"project:{ident}", "name": name,
                     "description": description or "", "icon": icon or "",
                     "cover_image": icon or "",
                     "updated_at": _iso(updated_at)},
        "trail": [{"id": venture_id, "public_id": str(venture_public_id), "type": "venture", "name": venture_name,
                   "icon": venture_icon or ""}],
        "series": series_items, "standalone_productions": standalone,
        "metrics": {"series_count": len(series_items),
                    "standalone_count": len(standalone),
                    "production_count": len(all_productions),
                    "part_count": sum(item["part_count"] for item in all_productions),
                    "duration_ms": sum(item["duration_ms"] for item in all_productions),
                    "total_cost": sum(item["total_cost"] for item in all_productions),
                    "current_sequence_cost": sum(
                        item["current_sequence_cost"] for item in all_productions)},
    }


def series_overview(series_id: int) -> SeriesOverview | None:
    """Editorial catalog. Series itself never pretends to be playable media."""
    with read_only() as cur:
        cur.execute("""
            SELECT series.id, series.public_id, series.name, series.description,
                   series.icon, series.defaults, series.updated_at,
                   project.id, project.public_id, project.name,
                   venture.id, venture.public_id, venture.name, venture.icon
              FROM series
              JOIN work_projects project ON project.id = series.project_id
              JOIN ventures venture ON venture.id = project.venture_id
             WHERE series.id = %s AND series.archived_at IS NULL
               AND project.archived_at IS NULL AND venture.archived_at IS NULL
        """, (series_id,))
        row = cur.fetchone()
        if not row:
            return None
        (ident, public_id, name, description, icon, defaults, updated_at,
         project_id, project_public_id, project_name,
         venture_id, venture_public_id, venture_name, venture_icon) = row
        productions = _production_summaries(cur, "production.series_id = %s", (series_id,))
    return {
        "resource": {"id": ident, "public_id": str(public_id), "type": "series",
                     "key": f"series:{ident}", "name": name,
                     "description": description or "", "icon": icon or "",
                     "project_id": project_id, "updated_at": _iso(updated_at)},
        "trail": [{"id": venture_id, "public_id": str(venture_public_id), "type": "venture", "name": venture_name,
                   "icon": venture_icon or ""},
                  {"id": project_id, "public_id": str(project_public_id), "type": "project", "name": project_name}],
        "defaults": defaults or {}, "productions": productions,
        "metrics": {"production_count": len(productions),
                    "part_count": sum(item["part_count"] for item in productions),
                    "duration_ms": sum(item["duration_ms"] for item in productions),
                    "total_cost": sum(item["total_cost"] for item in productions),
                    "current_sequence_cost": sum(
                        item["current_sequence_cost"] for item in productions)},
    }


_TABLES = {"venture": "ventures", "project": "work_projects",
           "series": "series", "production": "productions"}


def update_resource(kind: str, resource_id: int, changes: dict[str, Any]) -> dict[str, Any] | None:
    """Patch whitelisted canonical fields and keep legacy adapters readable."""
    table = _TABLES.get(kind)
    if not table:
        raise DomainValidation("Unknown resource type.")
    allowed = {"name", "description"}
    if kind == "venture":
        allowed.add("icon")
    if kind == "project":
        allowed.add("cover_image")
    if kind == "series":
        allowed.add("defaults")
    if kind == "production":
        allowed.update({"status", "settings"})
    provided = {key: value for key, value in changes.items() if key in allowed}
    if not provided:
        raise DomainValidation("No editable fields were provided.")
    if "name" in provided:
        provided["name"] = str(provided["name"] or "").strip()
        if not provided["name"]:
            raise DomainValidation("Give this resource a name.")
    if "description" in provided:
        provided["description"] = str(provided["description"] or "").strip()
    if "cover_image" in provided:
        cover = str(provided["cover_image"] or "").strip()
        if cover and not cover.startswith(("/icon/", "data:image/", "https://images.pexels.com/")):
            raise DomainValidation("That Project cover is not an approved image source.")
        provided["cover_image"] = cover[:500]
    if "icon" in provided:
        icon = str(provided["icon"] or "").strip()
        if icon and not icon.startswith(("/icon/", "data:image/")) and len(icon) > 16:
            raise DomainValidation("Choose one emoji or upload a Venture logo.")
        provided["icon"] = icon[:500]
    if "status" in provided and provided["status"] not in {
            "draft", "in_progress", "review", "approved", "released"}:
        raise DomainValidation("That Production status is invalid.")
    assignments = ", ".join(
        f"{column} = %s::jsonb" if column in {"defaults", "settings"}
        else f"{column} = %s" for column in provided)
    values = [json.dumps(value) if column in {"defaults", "settings"} else value
              for column, value in provided.items()]
    with transaction() as cur:
        cur.execute(f"UPDATE {table} SET {assignments}, updated_at = now() WHERE id = %s RETURNING id",
                    (*values, resource_id))
        if not cur.fetchone():
            return None
        if kind in {"venture", "project", "production"}:
            legacy_fields = {key: provided[key] for key in ("name", "description") if key in provided}
            if kind == "venture" and "icon" in provided:
                legacy_fields["icon"] = provided["icon"]
            if legacy_fields:
                legacy_assignments = ", ".join(f"{key} = %s" for key in legacy_fields)
                cur.execute(f"UPDATE projects SET {legacy_assignments}, updated_at = now() WHERE id = %s",
                            (*legacy_fields.values(), resource_id))
    return production_get(resource_id) if kind == "production" else resource_get(kind, resource_id)


def move_production(production_id: int, series_id: int | None) -> dict[str, Any] | None:
    """Join a same-Project Series, or make the Production standalone."""
    with transaction() as cur:
        cur.execute("SELECT project_id FROM productions WHERE id = %s", (production_id,))
        row = cur.fetchone()
        if not row:
            return None
        project_id = row[0]
        if series_id is not None:
            cur.execute("SELECT project_id FROM series WHERE id = %s AND archived_at IS NULL", (series_id,))
            series_row = cur.fetchone()
            if not series_row:
                raise DomainValidation("That Series does not exist.")
            if series_row[0] != project_id:
                raise DomainConflict("A Production can only join a Series in its own Project.")
        cur.execute("UPDATE productions SET series_id = %s, updated_at = now() WHERE id = %s",
                    (series_id, production_id))
    return production_get(production_id)


def archive_resource(kind: str, resource_id: int) -> dict[str, Any] | None:
    """Recoverable lifecycle operation; descendants are hidden, never erased."""
    table = _TABLES.get(kind)
    if not table:
        raise DomainValidation("Unknown resource type.")
    with transaction() as cur:
        cur.execute(f"SELECT id FROM {table} WHERE id = %s", (resource_id,))
        if not cur.fetchone():
            return None
        if kind == "venture":
            cur.execute("UPDATE ventures SET archived_at = now(), updated_at = now() WHERE id = %s", (resource_id,))
            cur.execute("UPDATE work_projects SET archived_at = now(), updated_at = now() WHERE venture_id = %s", (resource_id,))
            cur.execute("UPDATE series SET archived_at = now(), updated_at = now() WHERE project_id IN (SELECT id FROM work_projects WHERE venture_id = %s)", (resource_id,))
            cur.execute("UPDATE productions SET archived_at = now(), status = 'archived', updated_at = now() WHERE project_id IN (SELECT id FROM work_projects WHERE venture_id = %s)", (resource_id,))
        elif kind == "project":
            cur.execute("UPDATE work_projects SET archived_at = now(), updated_at = now() WHERE id = %s", (resource_id,))
            cur.execute("UPDATE series SET archived_at = now(), updated_at = now() WHERE project_id = %s", (resource_id,))
            cur.execute("UPDATE productions SET archived_at = now(), status = 'archived', updated_at = now() WHERE project_id = %s", (resource_id,))
        elif kind == "series":
            # Hiding an editorial grouping must not make its audio disappear
            # from the Project workspace. Its Productions become standalone.
            cur.execute("UPDATE productions SET series_id = NULL, updated_at = now() WHERE series_id = %s",
                        (resource_id,))
            cur.execute("UPDATE series SET archived_at = now(), updated_at = now() WHERE id = %s", (resource_id,))
        else:
            cur.execute("UPDATE productions SET archived_at = now(), status = 'archived', updated_at = now() WHERE id = %s", (resource_id,))
    return {"id": resource_id, "type": kind, "archived": True}


def delete_series(series_id: int, make_standalone: bool = False) -> dict[str, Any] | None:
    """Delete editorial grouping without ever deleting paid Productions."""
    with transaction() as cur:
        cur.execute("SELECT id FROM series WHERE id = %s", (series_id,))
        if not cur.fetchone():
            return None
        cur.execute("SELECT count(*) FROM productions WHERE series_id = %s", (series_id,))
        production_count = int(cur.fetchone()[0] or 0)
        if production_count and not make_standalone:
            raise DomainConflict(
                "This Series still contains Productions. Choose make_standalone to preserve them.")
        if production_count:
            cur.execute("UPDATE productions SET series_id = NULL, updated_at = now() WHERE series_id = %s",
                        (series_id,))
        cur.execute("DELETE FROM series WHERE id = %s", (series_id,))
    return {"id": series_id, "type": "series", "deleted": True,
            "productions_made_standalone": production_count}


def _slug(name: str, ident: int) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "untitled"
    return f"{base}-{ident}"


def create_venture(name: str, description: str = "") -> dict[str, Any] | None:
    clean_name = name.strip() or "Untitled Venture"
    with transaction() as cur:
        cur.execute("""
            INSERT INTO projects
                (name, description, level, container_type, locked)
            VALUES (%s, %s, 'venture', 'venture', false) RETURNING id
        """, (clean_name, description.strip()))
        ident = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO ventures (id, slug, name, description)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
              description = EXCLUDED.description
        """, (ident, _slug(clean_name, ident), clean_name, description.strip()))
    return resource_get("venture", ident)


def create_project(venture_id: int, name: str, description: str = "") -> dict[str, Any] | None:
    if not resource_get("venture", venture_id):
        return None
    clean_name = name.strip() or "Untitled Project"
    with transaction() as cur:
        cur.execute("""
            INSERT INTO projects
                (parent_id, name, description, level, container_type)
            VALUES (%s, %s, %s, 'project', 'project') RETURNING id
        """, (venture_id, clean_name, description.strip()))
        ident = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO work_projects (id, venture_id, slug, name, description)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET venture_id = EXCLUDED.venture_id,
              name = EXCLUDED.name, description = EXCLUDED.description
        """, (ident, venture_id, _slug(clean_name, ident), clean_name, description.strip()))
    return resource_get("project", ident)


def create_series(project_id: int, name: str, description: str = "") -> dict[str, Any] | None:
    if not resource_get("project", project_id):
        return None
    clean_name = name.strip() or "Untitled Series"
    with transaction() as cur:
        cur.execute("""
            INSERT INTO series (project_id, slug, name, description)
            VALUES (%s, 'pending-' || gen_random_uuid()::text, %s, %s) RETURNING id
        """, (project_id, clean_name, description.strip()))
        ident = cur.fetchone()[0]
        cur.execute("UPDATE series SET slug = %s WHERE id = %s",
                    (_slug(clean_name, ident), ident))
    return resource_get("series", ident)


def create_production(project_id: int, name: str, description: str = "",
                      series_id: int | None = None) -> dict[str, Any] | None:
    project = resource_get("project", project_id)
    if not project:
        return None
    if series_id:
        series_resource = resource_get("series", series_id)
        if not series_resource or series_resource["parent_key"] != f"project:{project_id}":
            return None
    clean_name = name.strip() or "Untitled Production"
    with transaction() as cur:
        cur.execute("""
            INSERT INTO projects
                (parent_id, name, description, level, container_type)
            VALUES (%s, %s, %s, 'folder', 'production') RETURNING id
        """, (project_id, clean_name, description.strip()))
        ident = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO productions
                (id, project_id, series_id, legacy_container_id, slug, name,
                 description, settings)
            VALUES (%s, %s, %s, %s, %s, %s, %s,
                    coalesce((SELECT defaults FROM series WHERE id = %s), '{}'::jsonb))
            ON CONFLICT (id) DO UPDATE SET project_id = EXCLUDED.project_id,
              series_id = EXCLUDED.series_id, name = EXCLUDED.name,
              description = EXCLUDED.description,
              settings = EXCLUDED.settings
        """, (ident, project_id, series_id, ident, _slug(clean_name, ident),
              clean_name, description.strip(), series_id))
        cur.execute("INSERT INTO production_mixes (production_id) VALUES (%s) ON CONFLICT DO NOTHING", (ident,))
    return production_get(ident)
