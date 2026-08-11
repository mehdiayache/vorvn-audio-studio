"""Canonical persistence for exact provider-owned speech routes.

The versioned documentation snapshot is refreshed into PostgreSQL at process
startup.  Runtime consumers then share one exact catalogue instead of each
rebuilding provider/model/voice tuples independently.
"""

from __future__ import annotations

import json

from audio_studio.domain import voice_registry
from audio_studio.infrastructure.postgres.session import read_only, transaction


class ProviderCatalogueRepository:
    def refresh_documented_snapshot(self) -> int:
        records = voice_registry.system_bindings()
        with transaction() as cursor:
            for item in records:
                provider_model_id = (
                    f"{item['provider']}:{item['region']}:{item['model_id']}")
                cursor.execute("""
                    INSERT INTO provider_models
                        (id,provider,region,model_id,tier,operation,
                         output_languages,status,adapter_key,
                         enrollment_supported,metadata,updated_at)
                    VALUES (%s,%s,%s,%s,%s,'speech',%s::jsonb,%s,%s,false,
                            %s::jsonb,now())
                    ON CONFLICT (id) DO UPDATE SET
                        output_languages=EXCLUDED.output_languages,
                        status=EXCLUDED.status,
                        adapter_key=EXCLUDED.adapter_key,
                        metadata=provider_models.metadata || EXCLUDED.metadata,
                        updated_at=now()
                """, (
                    provider_model_id, item["provider"], item["region"],
                    item["model_id"], item["tier"],
                    json.dumps(item.get("languages") or []),
                    item.get("status") or "active", item["engine"],
                    json.dumps({"catalogue_source": "documented_snapshot"}),
                ))
                for capability in item.get("capabilities") or []:
                    cursor.execute("""
                        INSERT INTO provider_model_capabilities
                            (provider_model_id,capability_id)
                        VALUES (%s,%s) ON CONFLICT DO NOTHING
                    """, (provider_model_id, capability["id"]))
                metadata = {
                    "identity_id": item.get("identity_id"),
                    "name": item.get("name") or item["provider_voice_id"],
                    "description": item.get("description") or "",
                }
                cursor.execute("""
                    INSERT INTO provider_catalogue_voices
                        (id,provider,region,model_id,tier,provider_voice_id,
                         engine,status,languages,metadata,refreshed_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,now())
                    ON CONFLICT (id) DO UPDATE SET
                        provider=EXCLUDED.provider,
                        region=EXCLUDED.region,
                        model_id=EXCLUDED.model_id,
                        tier=EXCLUDED.tier,
                        provider_voice_id=EXCLUDED.provider_voice_id,
                        engine=EXCLUDED.engine,
                        status=EXCLUDED.status,
                        languages=EXCLUDED.languages,
                        metadata=EXCLUDED.metadata,
                        refreshed_at=now()
                """, (
                    item["catalogue_voice_id"], item["provider"], item["region"],
                    item["model_id"], item["tier"], item["provider_voice_id"],
                    item["engine"], item.get("status") or "active",
                    json.dumps(item.get("languages") or []), json.dumps(metadata),
                ))
        return len(records)

    def bindings(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT catalogue.id,catalogue.provider,catalogue.region,
                       catalogue.model_id,catalogue.tier,
                       catalogue.provider_voice_id,catalogue.engine,
                       catalogue.status,catalogue.languages,catalogue.metadata,
                       coalesce(jsonb_agg(jsonb_build_object(
                           'id',capability.id,'name',capability.name
                       ) ORDER BY capability.id)
                       FILTER (WHERE capability.id IS NOT NULL),'[]'::jsonb)
                  FROM provider_catalogue_voices catalogue
             LEFT JOIN provider_models model
                    ON model.provider=catalogue.provider
                   AND model.region=catalogue.region
                   AND model.model_id=catalogue.model_id
                   AND model.tier=catalogue.tier
             LEFT JOIN provider_model_capabilities model_capability
                    ON model_capability.provider_model_id=model.id
             LEFT JOIN capabilities capability
                    ON capability.id=model_capability.capability_id
                 WHERE catalogue.status='active'
              GROUP BY catalogue.id,catalogue.provider,catalogue.region,
                       catalogue.model_id,catalogue.tier,
                       catalogue.provider_voice_id,catalogue.engine,
                       catalogue.status,catalogue.languages,catalogue.metadata
                 ORDER BY catalogue.engine,catalogue.model_id,
                          catalogue.provider_voice_id
            """)
            rows = cursor.fetchall()
        result = []
        for row in rows:
            metadata = row[9] or {}
            result.append({
                "catalogue_voice_id": row[0],
                "identity_id": metadata.get("identity_id") or row[0],
                "provider": row[1], "region": row[2], "model_id": row[3],
                "tier": row[4], "provider_voice_id": row[5],
                "engine": row[6], "status": row[7],
                "languages": row[8] or [],
                "name": metadata.get("name") or row[5],
                "description": metadata.get("description") or "",
                "source": "system", "capabilities": row[10] or [],
            })
        return result
