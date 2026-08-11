"""PostgreSQL character library and cast persistence."""

from __future__ import annotations

from audio_studio.infrastructure.postgres.session import read_only, transaction


def _persona(row) -> dict:
    return {"id": str(row[0]), "name": row[1], "image": row[2] or "",
            "description": row[3] or "", "aliases": row[4] or [],
            "notes": row[5] or "", "presentation": row[6] or {},
            "metadata": row[7] or {}}


def _role(row) -> dict:
    return {"id": str(row[0]), "persona_id": str(row[1]) if row[1] else None,
            "persona_name": row[2], "name": row[3], "color": row[4] or "",
            "position": row[5], "voice_source_kind": row[6],
            "voice_identity_id": row[7], "catalogue_voice_id": row[8],
            "assignment_revision": row[9], "part_count": row[10]}


class CastRepository:
    def personas(self, venture_public_id: str) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT persona.public_id, persona.name, persona.image,
                       persona.description, persona.aliases, persona.notes,
                       persona.presentation, persona.metadata
                  FROM personas persona
                  JOIN ventures venture ON venture.id = persona.venture_id
                 WHERE venture.public_id = %s AND persona.archived_at IS NULL
                 ORDER BY persona.name
            """, (venture_public_id,))
            return [_persona(row) for row in cursor.fetchall()]

    def create_persona(self, venture_public_id: str, values: dict) -> dict:
        with transaction() as cursor:
            cursor.execute("SELECT id FROM ventures WHERE public_id = %s AND archived_at IS NULL",
                           (venture_public_id,))
            owner = cursor.fetchone()
            if not owner:
                raise LookupError("That Venture no longer exists.")
            cursor.execute("""
                INSERT INTO personas
                    (venture_id, name, image, description, aliases, notes,
                     presentation, metadata)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s::jsonb)
                RETURNING public_id, name, image, description, aliases, notes,
                          presentation, metadata
            """, (owner[0], values["name"], values.get("image", ""),
                  values.get("description", ""), __import__("json").dumps(values.get("aliases", [])),
                  values.get("notes", ""), __import__("json").dumps(values.get("presentation", {})),
                  __import__("json").dumps(values.get("metadata", {}))))
            return _persona(cursor.fetchone())

    def cast(self, production_public_id: str) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT role.public_id, persona.public_id, persona.name,
                       role.name, role.color, role.position,
                       role.voice_source_kind, role.voice_identity_id,
                       role.catalogue_voice_id, role.assignment_revision,
                       count(part.id) FILTER (WHERE part.archived_at IS NULL)
                  FROM production_cast_roles role
                  JOIN productions production ON production.id = role.production_id
             LEFT JOIN personas persona ON persona.id = role.persona_id
             LEFT JOIN production_parts part ON part.cast_role_id = role.id
                 WHERE production.public_id = %s
              GROUP BY role.id, persona.id
                 ORDER BY role.position NULLS LAST, role.name
            """, (production_public_id,))
            return [_role(row) for row in cursor.fetchall()]

    def create_role(self, production_public_id: str, values: dict) -> dict:
        with transaction() as cursor:
            cursor.execute("""
                SELECT production.id, project.venture_id
                  FROM productions production
                  JOIN work_projects project ON project.id = production.project_id
                 WHERE production.public_id = %s AND production.archived_at IS NULL
            """, (production_public_id,))
            owner = cursor.fetchone()
            if not owner:
                raise LookupError("That Production no longer exists.")
            persona_id = None
            if values.get("persona_id"):
                cursor.execute("SELECT id FROM personas WHERE public_id = %s AND venture_id = %s AND archived_at IS NULL",
                               (values["persona_id"], owner[1]))
                found = cursor.fetchone()
                if not found:
                    raise ValueError("That Persona does not belong to this Venture.")
                persona_id = found[0]
            self._validate_voice(cursor, values)
            cursor.execute("""
                INSERT INTO production_cast_roles
                    (production_id, persona_id, name, color, position,
                     voice_source_kind, voice_identity_id, catalogue_voice_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING public_id
            """, (owner[0], persona_id, values["name"], values.get("color", ""),
                  values.get("position"), values["voice_source_kind"],
                  values.get("voice_identity_id"), values.get("catalogue_voice_id")))
            role_id = str(cursor.fetchone()[0])
        return next(item for item in self.cast(production_public_id) if item["id"] == role_id)

    def recast(self, role_public_id: str, values: dict) -> dict:
        with transaction() as cursor:
            cursor.execute("""
                SELECT role.id, production.public_id
                  FROM production_cast_roles role
                  JOIN productions production ON production.id = role.production_id
                 WHERE role.public_id = %s FOR UPDATE OF role
            """, (role_public_id,))
            role = cursor.fetchone()
            if not role:
                raise LookupError("That Cast Role no longer exists.")
            self._validate_voice(cursor, values)
            cursor.execute("""
                UPDATE production_cast_roles
                   SET voice_source_kind=%s, voice_identity_id=%s,
                       catalogue_voice_id=%s,
                       assignment_revision=assignment_revision+1,
                       updated_at=now()
                 WHERE id=%s
            """, (values["voice_source_kind"], values.get("voice_identity_id"),
                  values.get("catalogue_voice_id"), role[0]))
            cursor.execute("""
                UPDATE production_parts
                   SET revision=revision+1, updated_at=now()
                 WHERE cast_role_id=%s AND archived_at IS NULL
            """, (role[0],))
            affected = cursor.rowcount
            cursor.execute("""
                INSERT INTO audit_records
                    (action, resource_type, resource_id, detail)
                VALUES ('cast.reassigned','production_cast_role',%s,%s::jsonb)
            """, (role_public_id, __import__("json").dumps({"parts_revised": affected})))
            production_public_id = str(role[1])
        result = next(item for item in self.cast(production_public_id)
                      if item["id"] == role_public_id)
        return {**result, "parts_revised": affected}

    @staticmethod
    def _validate_voice(cursor, values: dict) -> None:
        kind = values.get("voice_source_kind")
        identity = values.get("voice_identity_id")
        catalogue = values.get("catalogue_voice_id")
        if kind == "identity" and identity and not catalogue:
            cursor.execute("SELECT 1 FROM voice_identities WHERE id=%s AND status='active'",
                           (identity,))
            if not cursor.fetchone():
                raise ValueError("That Voice Identity is unavailable.")
            return
        if kind == "catalogue" and catalogue and not identity:
            cursor.execute("""
                SELECT 1 FROM provider_catalogue_voices
                 WHERE id=%s AND status='active'
            """, (catalogue,))
            if not cursor.fetchone():
                raise ValueError("That catalogue voice route is unavailable.")
            return
        raise ValueError("Choose exactly one Voice Identity or catalogue voice.")
