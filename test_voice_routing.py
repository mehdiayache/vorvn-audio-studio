#!/usr/bin/env python3
"""Exact route contracts: no inference, fallback, provider call or DB write."""

from uuid import uuid4

from audio_studio.domain import voice_routing


BINDING_ID = str(uuid4())
MULTIMODE_ID = str(uuid4())
BINDINGS = [{
    "binding_id": BINDING_ID,
    "identity_id": "voice_eve",
    "reference_id": str(uuid4()),
    "provider_voice_id": "eve-audio",
    "provider": "alibaba",
    "region": "intl",
    "engine": "audio",
    "tier": "flash",
    "model_id": "qwen-audio-3.0-tts-flash",
    "status": "ready",
    "capabilities": [{"id": "expressive_tags", "name": "Expressive"}],
}, {
    "binding_id": MULTIMODE_ID,
    "identity_id": "voice_eve",
    "reference_id": str(uuid4()),
    "provider_voice_id": "eve-future",
    "provider": "future",
    "region": "intl",
    "engine": "future_tts",
    "tier": "plus",
    "model_id": "future-voice-1",
    "status": "active",
    "capabilities": [
        {"id": "story", "name": "Story"},
        {"id": "dialogue", "name": "Dialogue"},
    ],
}]
CATALOGUE_ID = "alibaba:intl:qwen-audio-3.0-tts-flash:eva"
CATALOGUE = [{
    "catalogue_voice_id": CATALOGUE_ID,
    "provider_voice_id": "eva",
    "provider": "alibaba",
    "region": "intl",
    "engine": "audio",
    "tier": "flash",
    "model_id": "qwen-audio-3.0-tts-flash",
    "status": "active",
    "capabilities": [{"id": "expressive_tags", "name": "Expressive"}],
}]


exact = voice_routing.resolve({"binding_id": BINDING_ID}, BINDINGS, CATALOGUE)
assert exact.provider_voice_id == "eve-audio"
assert exact.capability_id == "expressive_tags"
assert exact.binding_id == BINDING_ID and exact.catalogue_voice_id is None

stock = voice_routing.resolve(
    {"catalogue_voice_id": CATALOGUE_ID}, BINDINGS, CATALOGUE)
assert stock.provider_voice_id == "eva"
assert stock.catalogue_voice_id == CATALOGUE_ID and stock.binding_id is None

for payload in ({}, {"binding_id": BINDING_ID,
                     "catalogue_voice_id": CATALOGUE_ID}):
    try:
        voice_routing.resolve(payload, BINDINGS, CATALOGUE)
        raise AssertionError("an ambiguous or missing route was accepted")
    except ValueError as error:
        assert "exactly one" in str(error)

try:
    voice_routing.resolve({
        "binding_id": "old-provider-voice-name",
        "voice": "eve-audio", "engine": "audio", "language": "Arabic",
    }, BINDINGS, CATALOGUE)
    raise AssertionError("legacy fields reconstructed a route")
except ValueError as error:
    assert "no longer exists" in str(error)

not_ready = [{**BINDINGS[0], "status": "creating"}]
try:
    voice_routing.resolve({"binding_id": BINDING_ID}, not_ready, CATALOGUE)
    raise AssertionError("a creating binding was accepted")
except ValueError as error:
    assert "not ready" in str(error)

try:
    voice_routing.resolve({"binding_id": MULTIMODE_ID}, BINDINGS, CATALOGUE)
    raise AssertionError("a multimode binding silently chose a capability")
except ValueError as error:
    assert "Choose a recording mode" in str(error)

mode = voice_routing.resolve({
    "binding_id": MULTIMODE_ID, "capability_id": "dialogue",
}, BINDINGS, CATALOGUE)
assert mode.capability_id == "dialogue" and mode.capability_name == "Dialogue"

print("exact voice routing contracts passed")
