"""PostgreSQL persistence for recoverable Composer preparation state."""

from __future__ import annotations

import json
from typing import Any

from audio_studio.domain.composer import ComposerDraftConflict
from audio_studio.infrastructure.postgres.session import read_only, transaction


_STANDALONE_STORAGE_OWNER = "00000000-0000-0000-0000-000000000001"


def _result(row) -> dict[str, Any]:
    return {
        "id": str(row[0]), "state": row[1] or {}, "version": int(row[2]),
        "updated_at": row[3].isoformat(),
    }


class ComposerDraftRepository:
    @staticmethod
    def _validate_context(cursor, context: dict[str, Any]) -> None:
        if context["kind"] != "production":
            return
        production_id = int(context["production_id"])
        cursor.execute(
            "SELECT 1 FROM productions WHERE id=%s AND archived_at IS NULL",
            (production_id,))
        if not cursor.fetchone():
            raise ValueError("That Production does not exist.")
        part_id = context.get("part_id")
        if part_id is not None:
            cursor.execute("""
                SELECT 1 FROM production_parts
                 WHERE id=%s AND production_id=%s AND archived_at IS NULL
            """, (int(part_id), production_id))
            if not cursor.fetchone():
                raise ValueError("That Composer Part does not exist.")
        anchor = context.get("insert_before_part_id")
        if anchor:
            cursor.execute("""
                SELECT 1 FROM production_parts
                 WHERE public_id=%s AND production_id=%s AND archived_at IS NULL
            """, (str(anchor), production_id))
            if not cursor.fetchone():
                raise ValueError("That insertion point no longer exists.")

    def get(self, context: dict[str, Any],
            context_key: str) -> dict[str, Any] | None:
        with read_only() as cursor:
            self._validate_context(cursor, context)
            cursor.execute("""
                SELECT public_id, state, version, updated_at
                  FROM composer_working_drafts WHERE context_key=%s
            """, (context_key,))
            row = cursor.fetchone()
            return _result(row) if row else None

    def put(self, context: dict[str, Any], context_key: str,
            state: dict[str, Any], expected_version: int | None) -> dict[str, Any]:
        with transaction() as cursor:
            self._validate_context(cursor, context)
            cursor.execute("""
                SELECT id, version FROM composer_working_drafts
                 WHERE context_key=%s FOR UPDATE
            """, (context_key,))
            existing = cursor.fetchone()
            if existing:
                current = int(existing[1])
                if expected_version is not None and expected_version != current:
                    raise ComposerDraftConflict(
                        "This Composer Draft changed in another view.")
                cursor.execute("""
                    UPDATE composer_working_drafts
                       SET state=%s::jsonb, version=version+1, updated_at=now()
                     WHERE id=%s
                 RETURNING public_id, state, version, updated_at
                """, (json.dumps(state), int(existing[0])))
            else:
                if expected_version not in (None, 0):
                    raise ComposerDraftConflict(
                        "This Composer Draft no longer exists.")
                cursor.execute("""
                    INSERT INTO composer_working_drafts
                        (context_key, context_kind, session_id, production_id,
                         part_id, insert_before_part_public_id, state)
                    VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)
                    RETURNING public_id, state, version, updated_at
                """, (
                    context_key, context["kind"],
                    (_STANDALONE_STORAGE_OWNER
                     if context["kind"] == "standalone" else None),
                    context.get("production_id"),
                    context.get("part_id"),
                    context.get("insert_before_part_id"), json.dumps(state),
                ))
            return _result(cursor.fetchone())

    def delete(self, context_key: str, expected_version: int | None) -> bool:
        with transaction() as cursor:
            cursor.execute("""
                SELECT id, version FROM composer_working_drafts
                 WHERE context_key=%s FOR UPDATE
            """, (context_key,))
            existing = cursor.fetchone()
            if not existing:
                return False
            if (expected_version is not None
                    and expected_version != int(existing[1])):
                raise ComposerDraftConflict(
                    "This Composer Draft changed in another view.")
            cursor.execute(
                "DELETE FROM composer_working_drafts WHERE id=%s",
                (int(existing[0]),))
            return True
