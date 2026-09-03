"""Atomic persistence boundary for Project Part + speech Job commands."""

from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from origins.domain.jobs import Job
from origins.infrastructure.postgres.jobs import JobRepository
from origins.infrastructure.postgres.part_positions import (
    release_archived_positions,
)
from origins.infrastructure.postgres.session import transaction


class ProjectSpeechCommandRepository:
    def __init__(self, jobs: JobRepository | None = None):
        self.jobs = jobs or JobRepository()

    def enqueue(self, payload: dict[str, Any], *, idempotency_key: str,
                project_id: int,
                before_part_public_id: UUID | None = None,
                creation_context: dict[str, Any] | None = None,
                actor_id: str | None = None,
                organization_id: str | None = None,
                source_tool: str = "project",
                operation_label: str = "Generate speech") -> tuple[Job, bool]:
        request_payload = dict(payload)
        with transaction() as cursor:
            cursor.execute("""
                SELECT workspace_id FROM projects
                 WHERE id=%s AND project_type='audiovisual'
            """, (project_id,))
            project = cursor.fetchone()
            if not project:
                raise LookupError("That Project no longer exists.")
            workspace_id = int(project[0])
            context = dict(creation_context or {})
            if context.get("workspace_id") != workspace_id:
                raise ValueError("Creator context does not belong to this Project Workspace.")
            if context.get("project_id") != project_id:
                raise ValueError("Creator context does not target this Project.")
            job, created = self.jobs.enqueue_in_transaction(
                cursor, "speech", request_payload,
                idempotency_key=idempotency_key,
                actor_id=actor_id, organization_id=organization_id,
                project_id=project_id, source_tool=source_tool,
                operation_label=operation_label, workspace_id=workspace_id,
                creation_action_id="generate-speech" if workspace_id else None,
                creation_context=context)
            if not created:
                return job, False

            if request_payload.get("part_id") is None:
                part_id, source_revision, source_script = self._create_part(
                    cursor, project_id, request_payload,
                    before_part_public_id)
            else:
                part_id, source_revision, source_script = self._lock_part(
                    cursor, project_id, request_payload)

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
    def _create_part(cursor, project_id: int,
                     payload: dict[str, Any],
                     before_part_public_id: UUID | None) \
            -> tuple[int, int, str]:
        cursor.execute("""
            SELECT id FROM projects
             WHERE id=%s AND project_type='audiovisual' FOR UPDATE
        """, (project_id,))
        if not cursor.fetchone():
            raise LookupError("That Project no longer exists.")
        release_archived_positions(cursor, project_id)
        if before_part_public_id:
            cursor.execute("""
                SELECT position FROM project_parts
                 WHERE public_id=%s AND project_id=%s
                   AND archived_at IS NULL FOR UPDATE
            """, (before_part_public_id, project_id))
            anchor = cursor.fetchone()
            if not anchor:
                raise LookupError(
                    "The selected insertion point no longer exists.")
            position = int(anchor[0])
        else:
            cursor.execute("""
                SELECT coalesce(max(position), -1) + 1
                  FROM project_parts
                 WHERE project_id=%s AND archived_at IS NULL
            """, (project_id,))
            position = int(cursor.fetchone()[0])
        cursor.execute("""
            UPDATE project_parts SET position=position+1, updated_at=now()
             WHERE project_id=%s AND archived_at IS NULL AND position >= %s
        """, (project_id, position))
        canonical_script = str(payload.get("text_raw") or payload.get("text") or "")
        cursor.execute("""
            INSERT INTO project_parts
                (project_id, position, kind, script, title,
                 editorial_status, revision, authored_role)
            VALUES (%s, %s, 'speech', %s, %s, 'draft', 1, %s)
            RETURNING id
        """, (project_id, position, canonical_script,
              payload.get("title") or "",
              " ".join(str(payload.get("authored_role") or "").split())
              or None))
        return int(cursor.fetchone()[0]), 1, canonical_script

    @staticmethod
    def _lock_part(cursor, project_id: int,
                   payload: dict[str, Any]) -> tuple[int, int, str]:
        part_id = int(payload.get("part_id") or 0)
        cursor.execute("""
            SELECT revision, script FROM project_parts
             WHERE id=%s AND project_id=%s
               AND archived_at IS NULL FOR UPDATE
        """, (part_id, project_id))
        part = cursor.fetchone()
        if not part:
            raise LookupError("That Part no longer belongs to this Project.")
        requested_script = str(
            payload.get("text_raw") or payload.get("text") or "")
        if requested_script.strip() != str(part[1] or "").strip():
            raise ValueError(
                "Update the Part explicitly before replacing its recording with different words.")
        return part_id, int(part[0]), str(part[1] or "")
