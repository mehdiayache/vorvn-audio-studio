"""Atomic persistence boundary for Production Part + speech Job commands."""

from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from audio_studio.domain.jobs import Job
from audio_studio.infrastructure.postgres.jobs import JobRepository
from audio_studio.infrastructure.postgres.session import transaction


class ProductionSpeechCommandRepository:
    def __init__(self, jobs: JobRepository | None = None):
        self.jobs = jobs or JobRepository()

    def enqueue(self, payload: dict[str, Any], *, idempotency_key: str,
                production_id: int,
                before_part_public_id: UUID | None = None,
                actor_id: str | None = None,
                organization_id: str | None = None,
                source_tool: str = "production",
                operation_label: str = "Generate speech") -> tuple[Job, bool]:
        request_payload = dict(payload)
        with transaction() as cursor:
            job, created = self.jobs.enqueue_in_transaction(
                cursor, "speech", request_payload,
                idempotency_key=idempotency_key,
                actor_id=actor_id, organization_id=organization_id,
                production_id=production_id, source_tool=source_tool,
                operation_label=operation_label)
            if not created:
                return job, False

            operation = str(request_payload.get("operation") or "create")
            if operation == "create":
                part_id, source_revision, source_script = self._create_part(
                    cursor, production_id, request_payload,
                    before_part_public_id)
                runtime_operation = "record_part"
            else:
                part_id, source_revision, source_script = self._lock_part(
                    cursor, production_id, request_payload)
                runtime_operation = operation

            runtime_payload = {
                **request_payload,
                "operation": runtime_operation,
                "part_id": part_id,
                "_source_part_revision": source_revision,
                "_source_script_hash": hashlib.sha256(
                    (str(request_payload.get("text_raw")
                         or request_payload.get("text") or source_script)
                     if not bool(request_payload.get("select_result", True))
                     else source_script).encode("utf-8")).hexdigest(),
            }
            runtime_payload.pop("insert_before_part_id", None)
            cursor.execute("""
                UPDATE jobs SET payload=%s::jsonb, part_id=%s
                 WHERE id=%s
            """, (json.dumps(runtime_payload), part_id, job.id))
            return self.jobs.get_by_id_in_transaction(cursor, job.id), True

    @staticmethod
    def _create_part(cursor, production_id: int,
                     payload: dict[str, Any],
                     before_part_public_id: UUID | None) \
            -> tuple[int, int, str]:
        cursor.execute("""
            SELECT id FROM productions
             WHERE id=%s AND archived_at IS NULL FOR UPDATE
        """, (production_id,))
        if not cursor.fetchone():
            raise LookupError("That Production no longer exists.")
        if before_part_public_id:
            cursor.execute("""
                SELECT position FROM production_parts
                 WHERE public_id=%s AND production_id=%s
                   AND archived_at IS NULL FOR UPDATE
            """, (before_part_public_id, production_id))
            anchor = cursor.fetchone()
            if not anchor:
                raise LookupError(
                    "The selected insertion point no longer exists.")
            position = int(anchor[0])
        else:
            cursor.execute("""
                SELECT coalesce(max(position), -1) + 1
                  FROM production_parts
                 WHERE production_id=%s AND archived_at IS NULL
            """, (production_id,))
            next_position = int(cursor.fetchone()[0])
            legacy_position = payload.get("insert_at")
            position = (next_position if legacy_position is None else
                        max(0, min(int(legacy_position), next_position)))
        cursor.execute("""
            UPDATE production_parts SET position=position+1, updated_at=now()
             WHERE production_id=%s AND archived_at IS NULL AND position >= %s
        """, (production_id, position))
        role_id = None
        if payload.get("cast_role_id"):
            cursor.execute("""
                SELECT id FROM production_cast_roles
                 WHERE public_id=%s AND production_id=%s
            """, (payload["cast_role_id"], production_id))
            role = cursor.fetchone()
            if not role:
                raise ValueError(
                    "That Cast Role does not belong to this Production.")
            role_id = int(role[0])
        canonical_script = str(payload.get("text_raw") or payload.get("text") or "")
        cursor.execute("""
            INSERT INTO production_parts
                (production_id, position, kind, script, title,
                 cast_role_id, editorial_status, revision)
            VALUES (%s, %s, 'speech', %s, %s, %s, 'draft', 1)
            RETURNING id
        """, (production_id, position, canonical_script,
              payload.get("title") or "", role_id))
        return int(cursor.fetchone()[0]), 1, canonical_script

    @staticmethod
    def _lock_part(cursor, production_id: int,
                   payload: dict[str, Any]) -> tuple[int, int, str]:
        part_id = int(payload.get("part_id") or 0)
        cursor.execute("""
            SELECT revision, script FROM production_parts
             WHERE id=%s AND production_id=%s
               AND archived_at IS NULL FOR UPDATE
        """, (part_id, production_id))
        part = cursor.fetchone()
        if not part:
            raise LookupError("That Part no longer belongs to this Production.")
        requested_script = str(
            payload.get("text_raw") or payload.get("text") or "")
        if (bool(payload.get("select_result", True))
                and requested_script.strip() != str(part[1] or "").strip()):
            raise ValueError(
                "Update the Part explicitly before selecting audio made from different words.")
        return part_id, int(part[0]), str(part[1] or "")
