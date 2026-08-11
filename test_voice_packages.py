#!/usr/bin/env python3
"""Pure contract tests: no provider calls and no voice creation."""

from audio_studio.domain import voice_packages

methods = [
    {"provider_model_id": "alibaba:intl:audio", "provider": "alibaba",
     "region": "intl", "model_id": "audio", "tier": "flash",
     "adapter_key": "audio", "label": "Audio", "role": "Expressive",
     "capability_ids": ["expressive_tags"],
     "enrollment_languages": ["en"], "output_languages": ["English"],
     "estimated_creation_cost": 0},
    {"provider_model_id": "alibaba:intl:omni", "provider": "alibaba",
     "region": "intl", "model_id": "omni", "tier": "plus",
     "adapter_key": "omni", "label": "Omni", "role": "Natural",
     "capability_ids": ["natural_performance"],
     "enrollment_languages": ["en", "ar"],
     "output_languages": ["English", "Arabic"],
     "estimated_creation_cost": .01},
    {"provider_model_id": "cosy:global:v3", "provider": "cosy",
     "region": "global", "model_id": "cosy-v3", "tier": "plus",
     "adapter_key": "cosy", "label": "Cosy V3", "role": "Character",
     "capability_ids": ["character_performance"],
     "enrollment_languages": ["en"],
     "output_languages": ["English", "Arabic"],
     "estimated_creation_cost": .02},
]

english = voice_packages.plan("English", methods)
assert [route["model_id"] for route in english["routes"]] == [
    "audio", "omni", "cosy-v3"]
assert english["region"] == "multiple"

arabic = voice_packages.plan("Arabic", methods)
assert [route["model_id"] for route in arabic["routes"]] == [
    "audio", "omni", "cosy-v3"]
assert [route["classification"] for route in arabic["routes"]] == [
    "experimental", "documented", "experimental"]

exact_arabic = voice_packages.plan("ar", methods, "exact")
assert [route["engine"] for route in exact_arabic["routes"]] == [
    "audio"]
assert all(route["classification"] == "experimental"
           for route in exact_arabic["routes"])
assert next(item for item in exact_arabic["packages"]
            if item["id"] == "exact")["available"] is True

assert voice_packages.plan("en", methods, "omni")["routes"] == english["routes"][1:2]
natural_package = next(item for item in english["packages"]
                       if item["id"] == "omni")
assert natural_package["name"] == "Natural performance"
assert "qwen" not in natural_package["description"].lower()
assert "alibaba" not in natural_package["description"].lower()
assert [route["engine"] for route in
        voice_packages.plan("en", methods, "exact")["routes"]] == ["audio"]
assert any(route["provider"] == "cosy" for route in english["routes"])
print("voice package contracts passed")
