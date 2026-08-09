"""Read-only application and voice catalogues shared by every client."""

from __future__ import annotations

import os

import batch
import naming
import say
from audio_studio.infrastructure import object_storage as storage
from services import voice_routing
from audio_studio.domain import provider_catalog as alibaba_catalog
from services.alibaba import config as alibaba_environment, voice_registry

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
    return {
        "voices": say.VOICES,
        "default_voice": say.DEFAULT_VOICE,
        "chosen_default_voice": preferences.get("default_voice", ""),
        "models": say.MODELS,
        "formats": list(say.FORMATS),
        "tags": {"Moods": say.MOOD_TAGS, "Sounds": say.SOUND_TAGS},
        "retired_tags": say.RETIRED_TAGS,
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
            "configured": bool(alibaba_environment.workspace_id()),
            "id": alibaba_environment.workspace_id(),
            "region": alibaba_environment.region(),
            "region_label": (
                "Beijing" if alibaba_environment.region() == "cn" else "Singapore"
            ),
            "http_base": alibaba_environment.http_base(),
        },
        "instruction_max": 100,
        "rates": alibaba_catalog.CAPABILITIES["audio"]["rates_per_million_chars"],
        "batch_max_rows": batch.MAX_ROWS,
        "synth_flags": say.SYNTH_FLAGS,
        "chunk_size": say.MAX_CHARS,
        "has_key": bool(os.getenv("DASHSCOPE_API_KEY")),
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
