#!/usr/bin/env python3
"""Pure cloned-voice planning contracts; no provider calls."""

from origins.domain import voice_packages


methods = [
    {"provider_model_id": "alibaba:intl:audio", "provider": "alibaba",
     "region": "intl", "model_id": "audio", "tier": "flash",
     "adapter_key": "audio", "label": "Audio", "role": "Expressive",
     "capability_ids": ["expressive_tags"],
     "enrollment_languages": ["en"], "output_languages": ["English"],
     "estimated_creation_cost": 0},
    {"provider_model_id": "alibaba:intl:qwen-tts", "provider": "alibaba",
     "region": "intl", "model_id": "qwen-tts", "tier": "vc",
     "adapter_key": "qwen_tts", "label": "Qwen3 TTS", "role": "Exact",
     "capability_ids": ["exact_longform"],
     "enrollment_languages": ["en", "fr"],
     "output_languages": ["English", "French"],
     "estimated_creation_cost": .01},
    {"provider_model_id": "cosy:global:v3", "provider": "cosy",
     "region": "global", "model_id": "cosy-v3", "tier": "plus",
     "adapter_key": "cosy", "label": "Cosy V3", "role": "Character",
     "capability_ids": ["character_performance"],
     "enrollment_languages": ["en"],
     "output_languages": ["English", "Arabic"],
     "estimated_creation_cost": .02},
]

cosyvoice = {
    "provider_model_id": "alibaba:intl:cosyvoice-v3-plus",
    "provider": "alibaba", "region": "intl",
    "model_id": "cosyvoice-v3-plus", "tier": "plus",
    "adapter_key": "cosyvoice", "label": "CosyVoice V3 Plus",
    "role": "Exact", "capability_ids": ["controlled_exact"],
    "enrollment_languages": ["en", "fr"],
    "output_languages": ["English", "French"],
    "estimated_creation_cost": 0,
}

english = voice_packages.plan("English", methods)
assert [route["model_id"] for route in english["routes"]] == [
    "audio", "qwen-tts", "cosy-v3"]
assert english["region"] == "multiple"

arabic = voice_packages.plan("Arabic", methods)
assert [route["classification"] for route in arabic["routes"]] == [
    "experimental", "experimental", "experimental"]

exact_arabic = voice_packages.plan("ar", methods, "exact")
assert [route["engine"] for route in exact_arabic["routes"]] == [
    "audio", "qwen_tts"]
assert all(route["classification"] == "experimental"
           for route in exact_arabic["routes"])
assert {item["id"] for item in exact_arabic["packages"]} == {
    "complete", "exact"}
assert any(route["provider"] == "cosy" for route in english["routes"])

controlled_exact = voice_packages.plan("English", [cosyvoice], "exact")
assert [route["model_id"] for route in controlled_exact["routes"]] == [
    "cosyvoice-v3-plus"]
assert next(item for item in controlled_exact["packages"]
            if item["id"] == "exact")["available"] is True

print("voice package contracts passed")
