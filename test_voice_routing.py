#!/usr/bin/env python3
"""Pure routing contracts: no database writes and no Alibaba calls."""

from services import voice_routing


BINDINGS = [
    {"identity_id": "voice_eve", "voice_id": "eve-audio", "engine": "audio",
     "tier": "flash", "target_model": "qwen-audio-3.0-tts-flash", "status": "active"},
    {"identity_id": "voice_eve", "voice_id": "eve-omni", "engine": "omni",
     "tier": "plus", "target_model": "qwen3.5-omni-plus", "status": "active"},
]

SYSTEM_BINDINGS = [{"identity_id": "alibaba:audio:eva", "provider_voice_id": "eva",
                    "source": "system", "engine": "audio", "tier": "flash",
                    "model_id": "qwen-audio-3.0-tts-flash", "status": "active"}]

exact = voice_routing.resolve({"voice_identity_id": "voice_eve", "voice": "eve-audio",
                               "engine": "audio", "model": "flash"}, BINDINGS)
assert exact.provider_voice_id == "eve-audio" and exact.reason == "selected_binding"

switched = voice_routing.resolve({"voice_identity_id": "voice_eve", "voice": "eve-audio",
                                  "engine": "omni", "model": "plus"}, BINDINGS)
assert switched.provider_voice_id == "eve-omni" and switched.engine == "omni"

preserved = voice_routing.resolve({"voice_identity_id": "voice_eve", "voice": "eve-audio",
                                   "engine": "audio", "model": "plus"}, BINDINGS)
assert preserved.provider_voice_id == "eve-audio" and preserved.reason == "preserved_available_binding"

legacy_id = "qwen-audio-3.0-tts-flash-oldvoice-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
legacy = voice_routing.resolve({"voice": legacy_id, "engine": "audio", "model": "flash",
                                "language": "Arabic"}, BINDINGS)
assert legacy.provider_voice_id == legacy_id and legacy.engine == "audio"

stock_arabic = voice_routing.resolve({"voice": "loongeva_v3.6", "engine": "audio",
                                      "model": "flash", "language": "Arabic"}, BINDINGS)
assert stock_arabic.provider_voice_id == "Tina" and stock_arabic.engine == "omni"

system = voice_routing.resolve({"voice": "eva", "engine": "audio", "model": "plus"},
                               BINDINGS + SYSTEM_BINDINGS)
assert system.provider_voice_id == "eva" and system.tier == "flash"
assert system.identity_id is None

system_arabic = voice_routing.resolve({"voice": "eva", "engine": "audio",
                                       "model": "flash", "language": "Arabic"},
                                      BINDINGS + SYSTEM_BINDINGS)
assert system_arabic.provider_voice_id == "Tina" and system_arabic.engine == "omni"

print("voice routing contracts passed")
