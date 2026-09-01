"""Atomic persistence boundary for Production Part + speech Job commands."""

from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from audio_studio.domain.jobs import Job
from audio_studio.infrastructure.postgres.jobs import JobRepository
from audio_studio.infrastructure.postgres.part_positions import (
    release_archived_positions,
)
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
            cursor.execute("""
                SELECT space_id FROM productions
                 WHERE id=%s AND archived_at IS NULL
            """, (production_id,))
            production = cursor.fetchone()
            if not production:
                raise LookupError("That Production no longer exists.")
            space_id = int(production[0]) if production[0] is not None else None
            job, created = self.jobs.enqueue_in_transaction(
                cursor, "speech", request_payload,
                idempotency_key=idempotency_key,
                actor_id=actor_id, organization_id=organization_id,
                production_id=production_id, source_tool=source_tool,
                operation_label=operation_label, space_id=space_id,
                creation_action_id="generate-speech" if space_id else None,
                creation_context={
                    "space_id": space_id,
                    "audiovisual_project_id": production_id,
                } if space_id else {})
            if not created:
                return job, False

            if request_payload.get("part_id") is None:
                part_id, source_revision, source_script = self._create_part(
                    cursor, production_id, request_payload,
                    before_part_public_id)
            else:
                part_id, source_revision, source_script = self._lock_part(
                    cursor, production_id, request_payload)

            runtime_payload = {
                **request_payload,
                "operation": "record",
                "part_id": part_id,
                "_source_part_revision": source_revision,
                "_source_script_hash": hashlib.sha256(
                    source_script.encode("utf-8")).hexdigest(),
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
        release_archived_positions(cursor, production_id)
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
            position = int(cursor.fetchone()[0])
        cursor.execute("""
            UPDATE production_parts SET position=position+1, updated_at=now()
             WHERE production_id=%s AND archived_at IS NULL AND position >= %s
        """, (production_id, position))
        canonical_script = str(payload.get("text_raw") or payload.get("text") or "")
        cursor.execute("""
            INSERT INTO production_parts
                (production_id, position, kind, script, title,
                 editorial_status, revision, authored_role)
            VALUES (%s, %s, 'speech', %s, %s, 'draft', 1, %s)
            RETURNING id
        """, (production_id, position, canonical_script,
              payload.get("title") or "",
              " ".join(str(payload.get("authored_role") or "").split())
              or None))
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
        if requested_script.strip() != str(part[1] or "").strip():
            raise ValueError(
                "Update the Part explicitly before replacing its recording with different words.")
        return part_id, int(part[0]), str(part[1] or "")
