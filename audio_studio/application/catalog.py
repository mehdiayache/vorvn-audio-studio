"""Read-only application and voice catalogues shared by every client."""

from __future__ import annotations

from typing import Callable, Protocol

from audio_studio.config import alibaba_environment
from audio_studio.domain import (
    delivery_tags,
    naming,
    provider_catalog,
    speech_text,
)
from audio_studio.domain import voice_registry, voice_routing
from audio_studio.application.text_preparation import (
    INPUT_PRICE_PER_MILLION as TEXT_INPUT_PRICE_PER_MILLION,
    MODEL as TEXT_PREPARATION_MODEL,
    OUTPUT_PRICE_PER_MILLION as TEXT_OUTPUT_PRICE_PER_MILLION,
    variables as tag_variables,
)


LANGUAGES = ["Auto", "English", "Chinese", "Japanese", "Korean", "French",
             "German", "Spanish", "Italian", "Portuguese", "Russian", "Arabic",
             "Indonesian", "Malay", "Thai", "Vietnamese", "Tagalog"]


class VoiceCatalogue(Protocol):
    def catalog_metadata(self) -> dict: ...
    def custom_bindings(self) -> list[dict]: ...
    def binding_references(self) -> dict: ...
    def catalog_usage(self) -> dict: ...
    def catalogue_bindings(self) -> list[dict]: ...


class CatalogueControlPlane(Protocol):
    def setting(self, key: str, fallback=None): ...
    def spend_totals(self) -> dict: ...
    def database_status(self) -> dict: ...


class CatalogueEnvironment(Protocol):
    def media_root(self) -> str: ...
    def storage_status(self) -> dict: ...
    def storage_settings(self) -> dict: ...


class CatalogService:
    def __init__(
        self,
        voices: VoiceCatalogue,
        control_plane: CatalogueControlPlane,
        environment: CatalogueEnvironment,
        load_preferences: Callable[[], dict],
    ):
        self.voices = voices
        self.control_plane = control_plane
        self.environment = environment
        self.load_preferences = load_preferences

    def configuration(self) -> dict:
        preferences = self.load_preferences()
        metadata = self.voices.catalog_metadata()
        environment = alibaba_environment()
        media_root = self.environment.media_root()
        clone_languages = {
            code: label
            for capability in provider_catalog.CAPABILITIES.values()
            for code, label in capability.get("clone_languages", {}).items()
        }
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
                self.control_plane.setting(
                    "naming", preferences.get("naming", {})), None),
            "voice_images": {
                voice: value["image"] for voice, value in metadata.items()
                if value.get("image")},
            "voice_favourites": [
                voice for voice, value in metadata.items()
                if value.get("favourite")],
            "naming_tokens": list(naming.TOKENS),
            "languages": LANGUAGES,
            "capabilities": provider_catalog.CAPABILITIES,
            "performance_presets": voice_registry.presets(),
            "clone_languages": clone_languages,
            "workspace": {
                "configured": bool(environment.workspace_id),
                "id": environment.workspace_id,
                "region": environment.region,
                "region_label": environment.region_label,
                "http_base": environment.native_http_base,
            },
            "text_preparation": {
                "model": TEXT_PREPARATION_MODEL,
                "reasoning": False,
                "input_price_per_million_tokens": TEXT_INPUT_PRICE_PER_MILLION,
                "output_price_per_million_tokens": TEXT_OUTPUT_PRICE_PER_MILLION,
                "estimated_price_per_million_characters": (
                    TEXT_INPUT_PRICE_PER_MILLION
                    + TEXT_OUTPUT_PRICE_PER_MILLION
                ) / 4,
            },
            "rates": provider_catalog.CAPABILITIES[
                "audio"]["rates_per_million_chars"],
            "synth_flags": speech_text.SYNTH_FLAGS,
            "segmentation": provider_catalog.SEGMENTATION,
            "has_key": environment.api_key_configured,
            "out_dir": media_root,
            "prefs": {**preferences, "out_dir": media_root},
            "spend": self.control_plane.spend_totals(),
            "database": self.control_plane.database_status(),
            "storage": self.environment.storage_status(),
            "storage_settings": self.environment.storage_settings(),
        }

    def registry(self) -> dict:
        return voice_registry.assemble(
            self.voices.custom_bindings(), self.voices.catalog_metadata(),
            self.voices.binding_references(), self.voices.catalogue_bindings())

    def voice_usage(self) -> dict:
        return self.voices.catalog_usage()

    def voice_metadata(self) -> dict:
        return self.voices.catalog_metadata()

    def resolve_voice(self, payload: dict) -> dict:
        bindings = self.voices.custom_bindings()
        catalogue = self.voices.catalogue_bindings()
        # Capabilities are provider-model data.  The current catalogue snapshot
        # is single-mode per exact route; future multi-mode routes can publish
        # more than one capability without changing this contract.
        for item in bindings:
            item.setdefault("region", "intl")
            item.setdefault("provider", "alibaba")
            item.setdefault("capabilities", [{
                "id": {"audio": "expressive_tags", "omni": "natural_performance",
                       "qwen_tts": "exact_longform"}[item["engine"]],
                "name": {"audio": "Expressive + tags", "omni": "Natural performance",
                         "qwen_tts": "Exact long reading"}[item["engine"]],
            }])
        for item in catalogue:
            item.setdefault("region", "intl")
            item.setdefault("capabilities", [{
                "id": "expressive_tags" if item["engine"] == "audio"
                      else "natural_performance",
                "name": "Expressive + tags" if item["engine"] == "audio"
                        else "Natural performance",
            }])
        return voice_routing.resolve(payload, bindings, catalogue).payload()
