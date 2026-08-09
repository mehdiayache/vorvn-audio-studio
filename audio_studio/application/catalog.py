"""Read-only application and voice catalogues shared by every client."""

from __future__ import annotations

from audio_studio.domain import (
    batch,
    delivery_tags,
    naming,
    provider_catalog,
    speech_text,
)
from audio_studio.infrastructure import object_storage as storage
from audio_studio.domain import (
    provider_catalog as alibaba_catalog,
    voice_registry,
    voice_routing,
)
from audio_studio.config import alibaba_environment

from audio_studio.application.preferences import load_preferences
from audio_studio.application.text_preparation import variables as tag_variables
from audio_studio.infrastructure.postgres.voices import VoiceRepository
from audio_studio.infrastructure.postgres.control_plane import (
    ControlPlaneRepository,
)
from audio_studio.infrastructure.media_paths import media_root


LANGUAGES = ["Auto", "English", "Chinese", "Japanese", "Korean", "French",
             "German", "Spanish", "Italian", "Portuguese", "Russian", "Arabic",
             "Indonesian", "Malay", "Thai", "Vietnamese", "Tagalog"]
repository = VoiceRepository()
control_repository = ControlPlaneRepository()


def configuration() -> dict:
    preferences = load_preferences()
    metadata = repository.catalog_metadata()
    environment = alibaba_environment()
    return {
        "voices": provider_catalog.AUDIO_SYSTEM_VOICES,
        "default_voice": provider_catalog.AUDIO_DEFAULT_VOICES,
        "chosen_default_voice": preferences.get("default_voice", ""),
        "models": provider_catalog.CAPABILITIES["audio"]["models"],
        "formats": list(speech_text.OUTPUT_FORMATS),
        "tags": {"Moods": delivery_tags.MOOD_TAGS,
                 "Sounds": delivery_tags.SOUND_TAGS},
        "retired_tags": delivery_tags.RETIRED_TAGS,
        "tag_variables": tag_variables(),
        "naming": naming.merged(
            control_repository.setting(
                "naming", preferences.get("naming", {})), None),
        "voice_images": {voice: value["image"] for voice, value in metadata.items() if value.get("image")},
        "voice_favourites": [voice for voice, value in metadata.items() if value.get("favourite")],
        "naming_tokens": list(naming.TOKENS),
        "languages": LANGUAGES,
        "capabilities": alibaba_catalog.CAPABILITIES,
        "performance_presets": voice_registry.presets(),
        "clone_languages": alibaba_catalog.AUDIO_CLONE_LANGUAGES,
        "workspace": {
            "configured": bool(environment.workspace_id),
            "id": environment.workspace_id,
            "region": environment.region,
            "region_label": environment.region_label,
            "http_base": environment.native_http_base,
        },
        "instruction_max": 100,
        "rates": alibaba_catalog.CAPABILITIES["audio"]["rates_per_million_chars"],
        "batch_max_rows": batch.MAX_ROWS,
        "synth_flags": speech_text.SYNTH_FLAGS,
        "chunk_size": speech_text.MAX_CHARS,
        "has_key": environment.api_key_configured,
        "out_dir": str(media_root()),
        "prefs": {**preferences, "out_dir": str(media_root())},
        "spend": control_repository.spend_totals(),
        "database": control_repository.database_status(),
        "storage": storage.status(),
        "storage_settings": {key: value for key, value in storage.settings().items()
                             if "key" not in key},
    }


def registry() -> dict:
    return voice_registry.assemble(
        repository.custom_bindings(), repository.catalog_metadata(),
        repository.binding_references())


def voice_usage() -> dict:
    return repository.catalog_usage()


def voice_metadata() -> dict:
    return repository.catalog_metadata()


def resolve_voice(payload: dict) -> dict:
    bindings = [*voice_registry.system_bindings(), *repository.custom_bindings()]
    return voice_routing.resolve(payload, bindings).payload()
