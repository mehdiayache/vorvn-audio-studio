"""PostgreSQL enrollment campaigns with explicit per-voice references."""

from __future__ import annotations

from uuid import uuid4

from audio_studio.domain.voice_packages import language_code
from audio_studio.infrastructure.postgres.session import read_only, transaction


class BulkEnrollmentRepository:
    @staticmethod
    def _campaign(cursor, campaign_id: str) -> dict | None:
        cursor.execute("""
            SELECT campaign.id, campaign.public_id, campaign.status,
                   campaign.estimated_cost, campaign.confirmed_at,
                   model.provider, model.region, model.model_id, model.tier
              FROM enrollment_campaigns campaign
              JOIN provider_models model ON model.id=campaign.provider_model_id
             WHERE campaign.public_id=%s
        """, (campaign_id,))
        row = cursor.fetchone()
        if not row:
            return None
        cursor.execute("""
            SELECT item.public_id, item.identity_id, identity.name,
                   item.reference_id, reference.source_language,
                   item.classification, item.status, item.package_job_id,
                   package.status, package.error
              FROM enrollment_campaign_items item
              JOIN voice_identities identity ON identity.id=item.identity_id
              JOIN voice_references reference ON reference.id=item.reference_id
              LEFT JOIN voice_package_jobs package ON package.id=item.package_job_id
             WHERE item.campaign_id=%s ORDER BY item.public_id
        """, (row[0],))
        items = [{
            "id": str(item[0]), "identity_id": item[1], "voice_name": item[2],
            "reference_id": item[3], "reference_language": item[4] or "",
            "classification": item[5], "status": item[8] or item[6],
            "job_id": item[7], "error": item[9] or "",
        } for item in cursor.fetchall()]
        statuses = {item["status"] for item in items}
        status = ("cancelling" if row[2] == "cancelled" and
                  statuses & {"queued", "creating"} else
                  "running" if statuses & {"queued", "creating"} else
                  "partial" if statuses & {"failed", "interrupted"} and
                  statuses & {"ready"} else
                  "failed" if statuses & {"failed", "interrupted"} else
                  "cancelled" if statuses and statuses <= {"cancelled"} else
                  "succeeded" if statuses and statuses <= {"ready"} else row[2])
        return {
            "id": str(row[1]), "status": status,
            "estimated_cost": float(row[3] or 0),
            "confirmed_at": row[4].isoformat() if row[4] else None,
            "route": {"provider": row[5], "region": row[6],
                      "model": row[7], "tier": row[8]},
            "items": items,
        }

    @staticmethod
    def _validated(cursor, provider_model_id: str,
                   selections: list[dict]) -> tuple[dict, list[dict]]:
        cursor.execute("""
            SELECT id, provider, region, model_id, tier, adapter_key,
                   enrollment_languages,
                   coalesce(pricing->>'enrollment_cost_usd','0')::numeric
              FROM provider_models WHERE id=%s AND enrollment_supported
        """, (provider_model_id,))
        model = cursor.fetchone()
        if not model:
            raise LookupError("That provider model cannot enroll voices here.")
        route = dict(zip(("id", "provider", "region", "model_id", "tier",
                          "engine", "enrollment_languages", "cost"), model))
        validated = []
        seen = set()
        for selection in selections:
            identity_id = str(selection.get("identity_id") or "").strip()
            reference_id = str(selection.get("reference_id") or "").strip()
            if not identity_id or not reference_id or (identity_id, reference_id) in seen:
                raise ValueError("Every selected voice needs one explicit reference.")
            seen.add((identity_id, reference_id))
            cursor.execute("""
                SELECT identity.name, reference.source_language,
                       reference.normalized_path, reference.storage_key
                  FROM voice_identities identity
                  JOIN voice_references reference
                    ON reference.identity_id=identity.id
                 WHERE identity.id=%s AND reference.id=%s
                   AND identity.status='active'
            """, (identity_id, reference_id))
            row = cursor.fetchone()
            if not row or not (row[2] or row[3]):
                raise ValueError(
                    f"{identity_id} has no usable explicitly selected reference.")
            documented = language_code(row[1] or "") in set(
                route["enrollment_languages"] or [])
            validated.append({
                "identity_id": identity_id, "reference_id": reference_id,
                "name": row[0], "reference_language": row[1] or "",
                "classification": "documented" if documented else "experimental",
            })
        return route, validated

    def preflight(self, provider_model_id: str, selections: list[dict]) -> dict:
        with read_only() as cursor:
            route, items = self._validated(cursor, provider_model_id, selections)
        return {"provider_model": {key: value for key, value in route.items()
                                    if key not in {"cost", "enrollment_languages"}},
                "items": items, "estimated_cost": round(
                    float(route["cost"] or 0) * len(items), 6)}

    def create_campaign(self, provider_model_id: str,
                        selections: list[dict]) -> dict:
        with transaction() as cursor:
            route, items = self._validated(cursor, provider_model_id, selections)
            estimate = round(float(route["cost"] or 0) * len(items), 6)
            cursor.execute("""
                INSERT INTO enrollment_campaigns
                    (provider_model_id,status,estimated_cost,confirmed_at,metadata)
                VALUES (%s,'queued',%s,now(),jsonb_build_object(
                    'explicit_reference_selection',true))
                RETURNING id, public_id
            """, (provider_model_id, estimate))
            campaign_id, public_id = cursor.fetchone()
            queued = []
            for item in items:
                job_id = f"vjob_{uuid4().hex}"
                cursor.execute("""
                    INSERT INTO voice_package_jobs
                        (id,identity_id,reference_id,model_id,engine,tier,
                         provider,provider_region,provider_model_id,
                         classification,status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'queued')
                    RETURNING id
                """, (job_id, item["identity_id"], item["reference_id"],
                      route["model_id"], route["engine"], route["tier"],
                      route["provider"], route["region"], route["id"],
                      item["classification"]))
                queued_id = cursor.fetchone()[0]
                cursor.execute("""
                    INSERT INTO enrollment_campaign_items
                        (campaign_id,identity_id,reference_id,classification,
                         package_job_id,status)
                    VALUES (%s,%s,%s,%s,%s,'queued')
                """, (campaign_id, item["identity_id"], item["reference_id"],
                      item["classification"], queued_id))
                queued.append(queued_id)
        return {"id": str(public_id), "status": "queued",
                "queued": len(queued), "job_ids": queued,
                "estimated_cost": estimate}

    def campaign(self, campaign_id: str) -> dict | None:
        with read_only() as cursor:
            return self._campaign(cursor, campaign_id)

    def cancel_campaign(self, campaign_id: str) -> dict | None:
        with transaction() as cursor:
            cursor.execute("""
                SELECT id FROM enrollment_campaigns
                 WHERE public_id=%s FOR UPDATE
            """, (campaign_id,))
            row = cursor.fetchone()
            if not row:
                return None
            campaign_db_id = row[0]
            cursor.execute("""
                UPDATE voice_package_jobs package SET status='cancelled',
                       error='Cancelled by operator', updated_at=now()
                  FROM enrollment_campaign_items item
                 WHERE item.campaign_id=%s AND item.package_job_id=package.id
                   AND package.status='queued'
            """, (campaign_db_id,))
            cursor.execute("""
                UPDATE enrollment_campaign_items item
                   SET status=coalesce(package.status,item.status)
                  FROM voice_package_jobs package
                 WHERE item.campaign_id=%s AND package.id=item.package_job_id
            """, (campaign_db_id,))
            cursor.execute("""
                UPDATE enrollment_campaigns SET status='cancelled',updated_at=now()
                 WHERE id=%s
            """, (campaign_db_id,))
            return self._campaign(cursor, campaign_id)

    def retry_items(self, campaign_id: str,
                    item_ids: list[str]) -> dict | None:
        with transaction() as cursor:
            cursor.execute("""
                SELECT id FROM enrollment_campaigns
                 WHERE public_id=%s FOR UPDATE
            """, (campaign_id,))
            row = cursor.fetchone()
            if not row:
                return None
            campaign_db_id = row[0]
            cursor.execute("""
                UPDATE voice_package_jobs package SET status='queued', error=NULL,
                       updated_at=now()
                  FROM enrollment_campaign_items item
                 WHERE item.campaign_id=%s AND item.public_id=ANY(%s::uuid[])
                   AND item.package_job_id=package.id
                   AND package.status IN ('failed','interrupted','cancelled')
                RETURNING item.public_id
            """, (campaign_db_id, item_ids))
            retried = [str(row[0]) for row in cursor.fetchall()]
            if len(retried) != len(set(item_ids)):
                raise ValueError(
                    "Every selected campaign item must be failed, interrupted or cancelled.")
            cursor.execute("""
                UPDATE enrollment_campaign_items SET status='queued'
                 WHERE campaign_id=%s AND public_id=ANY(%s::uuid[])
            """, (campaign_db_id, item_ids))
            cursor.execute("""
                UPDATE enrollment_campaigns SET status='queued',updated_at=now()
                 WHERE id=%s
            """, (campaign_db_id,))
            return self._campaign(cursor, campaign_id)
