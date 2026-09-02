"""Canonical persistence for exact provider-owned speech routes.

The versioned documentation snapshot is refreshed into PostgreSQL at process
startup.  Runtime consumers then share one exact catalogue instead of each
rebuilding provider/model/voice tuples independently.
"""

from __future__ import annotations

import json

from origins.domain import provider_catalog, voice_registry
from origins.infrastructure.postgres.session import read_only, transaction


class ProviderCatalogueRepository:
    def refresh_documented_snapshot(self) -> int:
        records = voice_registry.system_bindings()
        with transaction() as cursor:
            for item in records:
                provider_model_id = (
                    f"{item['provider']}:{item['region']}:{item['model_id']}")
                capability_facts = provider_catalog.CAPABILITIES.get(
                    item["engine"], {})
                model_label = (
                    f"{capability_facts.get('label') or item['model_id']} · "
                    f"{str(item['tier']).title()}")
                cursor.execute("""
                    INSERT INTO provider_models
                        (id,provider,region,model_id,tier,operation,
                        enrollment_languages,output_languages,status,adapter_key,pricing,
                         enrollment_supported,metadata,updated_at)
                    VALUES (%s,%s,%s,%s,%s,'speech',%s::jsonb,%s::jsonb,%s,%s,%s::jsonb,false,
                            %s::jsonb,now())
                    ON CONFLICT (id) DO UPDATE SET
                        enrollment_languages=CASE
                            WHEN provider_models.enrollment_supported
                            THEN EXCLUDED.enrollment_languages
                            ELSE provider_models.enrollment_languages END,
                        output_languages=EXCLUDED.output_languages,
                        status=EXCLUDED.status,
                        adapter_key=EXCLUDED.adapter_key,
                        pricing=provider_models.pricing || EXCLUDED.pricing,
                        metadata=provider_models.metadata || EXCLUDED.metadata,
                        updated_at=now()
                """, (
                    provider_model_id, item["provider"], item["region"],
                    item["model_id"], item["tier"],
                    json.dumps(list(capability_facts.get(
                        "clone_languages", {}).keys())),
                    json.dumps(list(capability_facts.get(
                        "output_languages") or item.get("languages") or [])),
                    item.get("status") or "active", item["engine"],
                    json.dumps({"speech_per_million_chars": float(
                        (capability_facts.get(
                            "estimate_rates_per_million_chars") or {}).get(
                                item["tier"]) or 0)}),
                    json.dumps({"catalogue_source": "documented_snapshot",
                                "model_label": model_label}),
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
                    "gender": item.get("gender") or "",
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

    def enrollment_methods(self) -> list[dict]:
        """Return active exact enrollment routes from persisted provider data."""
        with read_only() as cursor:
            cursor.execute("""
                SELECT model.id,model.provider,model.region,model.model_id,
                       model.tier,model.adapter_key,model.enrollment_languages,
                       model.output_languages,model.pricing,model.metadata,
                       coalesce(jsonb_agg(jsonb_build_object(
                           'id',capability.id,'name',capability.name,
                           'description',capability.description,
                           'controls',capability.controls,
                           'ui_metadata',capability.ui_metadata)
                       ORDER BY capability.id)
                       FILTER (WHERE capability.id IS NOT NULL),'[]'::jsonb)
                  FROM provider_models model
             LEFT JOIN provider_model_capabilities model_capability
                    ON model_capability.provider_model_id=model.id
             LEFT JOIN capabilities capability
                    ON capability.id=model_capability.capability_id
                 WHERE model.status='active'
                   AND model.enrollment_supported
                   AND model.adapter_key IS NOT NULL
              GROUP BY model.id
                 ORDER BY model.provider,model.region,model.model_id,model.tier
            """)
            rows = cursor.fetchall()
        methods = []
        for row in rows:
            metadata = row[9] or {}
            capabilities = row[10] or []
            capability_names = [str(item.get("name") or "")
                                for item in capabilities if item.get("name")]
            methods.append({
                "provider_model_id": row[0], "provider": row[1],
                "region": row[2], "model_id": row[3], "tier": row[4],
                "adapter_key": row[5],
                "enrollment_languages": list(row[6] or []),
                "output_languages": list(row[7] or []),
                "label": str(metadata.get("model_label") or row[3]),
                "role": " · ".join(capability_names) or "Voice enrollment",
                "capability_ids": [str(item.get("id")) for item in capabilities
                                   if item.get("id")],
                "estimated_creation_cost": float(
                    (row[8] or {}).get("enrollment_cost_usd") or 0),
                "clone_source_duration_ms": dict(
                    provider_catalog.CAPABILITIES.get(
                        str(row[5] or ""), {}
                    ).get("clone_source_duration_ms") or {}
                ),
            })
        return methods

    def bindings(self) -> list[dict]:
        with read_only() as cursor:
            cursor.execute("""
                SELECT catalogue.id,catalogue.provider,catalogue.region,
                       catalogue.model_id,catalogue.tier,
                       catalogue.provider_voice_id,catalogue.engine,
                       catalogue.status,catalogue.languages,catalogue.metadata,
                       coalesce(model.adapter_key,catalogue.engine),model.pricing,
                       coalesce(jsonb_agg(jsonb_build_object(
                           'id',capability.id,'name',capability.name,
                           'description',capability.description,
                           'controls',capability.controls,
                           'ui_metadata',capability.ui_metadata
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
                       ,model.adapter_key,model.pricing
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
                "gender": metadata.get("gender") or "",
                "adapter_key": row[10] or row[6],
                "estimate_rate_per_million_chars": float(
                    (row[11] or {}).get("speech_per_million_chars") or 0),
                "source": "system", "capabilities": row[12] or [],
            })
        return result
