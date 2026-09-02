"""PostgreSQL persistence for recoverable Creator preparation state."""

from __future__ import annotations

import json
from typing import Any

from origins.domain.creator import CreatorDraftConflict
from origins.infrastructure.postgres.session import read_only, transaction


_STANDALONE_STORAGE_OWNER = "00000000-0000-0000-0000-000000000001"


def _result(row) -> dict[str, Any]:
    return {
        "id": str(row[0]), "state": row[1] or {}, "version": int(row[2]),
        "updated_at": row[3].isoformat(),
    }


class CreatorDraftRepository:
    @staticmethod
    def _validate_context(cursor, context: dict[str, Any]) -> None:
        if context["kind"] != "project":
            return
        project_id = int(context["project_id"])
        cursor.execute(
            "SELECT 1 FROM projects WHERE id=%s",
            (project_id,))
        if not cursor.fetchone():
            raise ValueError("That Project does not exist.")
        part_id = context.get("part_id")
        if part_id is not None:
            cursor.execute("""
                SELECT 1 FROM project_parts
                 WHERE id=%s AND project_id=%s AND archived_at IS NULL
            """, (int(part_id), project_id))
            if not cursor.fetchone():
                raise ValueError("That Creator Part does not exist.")
        anchor = context.get("insert_before_part_id")
        if anchor:
            cursor.execute("""
                SELECT 1 FROM project_parts
                 WHERE public_id=%s AND project_id=%s AND archived_at IS NULL
            """, (str(anchor), project_id))
            if not cursor.fetchone():
                raise ValueError("That insertion point no longer exists.")

    def get(self, context: dict[str, Any],
            context_key: str) -> dict[str, Any] | None:
        with read_only() as cursor:
            self._validate_context(cursor, context)
            cursor.execute("""
                SELECT public_id, state, version, updated_at
                  FROM creator_working_drafts WHERE context_key=%s
            """, (context_key,))
            row = cursor.fetchone()
            return _result(row) if row else None

    def put(self, context: dict[str, Any], context_key: str,
            state: dict[str, Any], expected_version: int | None) -> dict[str, Any]:
        with transaction() as cursor:
            self._validate_context(cursor, context)
            cursor.execute("""
                SELECT id, version FROM creator_working_drafts
                 WHERE context_key=%s FOR UPDATE
            """, (context_key,))
            existing = cursor.fetchone()
            if existing:
                current = int(existing[1])
                if expected_version is not None and expected_version != current:
                    raise CreatorDraftConflict(
                        "This Creator Draft changed in another view.")
                cursor.execute("""
                    UPDATE creator_working_drafts
                       SET state=%s::jsonb, version=version+1, updated_at=now()
                     WHERE id=%s
                 RETURNING public_id, state, version, updated_at
                """, (json.dumps(state), int(existing[0])))
            else:
                if expected_version not in (None, 0):
                    raise CreatorDraftConflict(
                        "This Creator Draft no longer exists.")
                cursor.execute("""
                    INSERT INTO creator_working_drafts
                        (context_key, context_kind, session_id, project_id,
                         part_id, insert_before_part_public_id, state)
                    VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)
                    RETURNING public_id, state, version, updated_at
                """, (
                    context_key, context["kind"],
                    (_STANDALONE_STORAGE_OWNER
                     if context["kind"] == "standalone" else None),
                    context.get("project_id"),
                    context.get("part_id"),
                    context.get("insert_before_part_id"), json.dumps(state),
                ))
            return _result(cursor.fetchone())

    def delete(self, context_key: str, expected_version: int | None) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                SELECT id, version FROM creator_working_drafts
                 WHERE context_key=%s FOR UPDATE
            """, (context_key,))
            existing = cursor.fetchone()
            if not existing:
                return False
            if (expected_version is not None
                    and expected_version != int(existing[1])):
                raise CreatorDraftConflict(
                    "This Creator Draft changed in another view.")
            cursor.execute(
                "DELETE FROM creator_working_drafts WHERE id=%s",
                (int(existing[0]),))
            return True
