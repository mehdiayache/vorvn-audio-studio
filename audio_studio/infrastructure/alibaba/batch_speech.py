"""Alibaba speech adapter used by the native Batch capability."""

from __future__ import annotations

import json
import re

import say
from services import voice_routing
from services.alibaba import config, speech
from services.alibaba.pricing import PRICE_VERSION, qwen_audio_tts_cost

from audio_studio.application.batches import (
    PreparedBatchSpeech,
    SynthesizedBatchSpeech,
)


INSTRUCTION_MAX = 100


class _Options:
    """Provider request values resolved once before any paid call."""

    def __init__(self, values: dict, bindings: list[dict],
                 pronunciations: list[dict], preferences: dict):
        language = values.get("language")
        text = str(values.get("text") or "")
        if language in (None, "", "Auto") and re.search(r"[\u0600-\u06ff]", text):
            language = "Arabic"
        route = voice_routing.resolve(
            {**values, "language": language, "text": text}, bindings)
        self.language = None if language in (None, "", "Auto") else language
        self.voice_identity_id = route.identity_id
        self.voice = route.provider_voice_id or (
            "Tina" if route.engine == "omni" else say.DEFAULT_VOICE[route.tier])
        self.engine = route.engine
        self.model = route.tier
        self.model_id = route.model_id
        self.format = values.get("format", "mp3")
        instruction = str(values.get("instruction") or "").strip()
        self.instruction = instruction[:INSTRUCTION_MAX] or None
        self.speech_mode = "exact"
        self.rate = float(values.get("rate", 1))
        self.pitch = float(values.get("pitch", 1))
        self.volume = int(values.get("volume", 50))
        self.seed = int(values.get("seed") or 0)
        defaults = preferences.get("synth_flags") or {}
        for flag in say.SYNTH_FLAGS:
            value = values.get(flag, defaults.get(flag))
            setattr(self, flag, None if value is None else bool(value))
        self.hot_fix = say.build_hot_fix(pronunciations)
        extra = values.get("extra_params", preferences.get("extra_params"))
        if isinstance(extra, str) and extra.strip():
            try:
                extra = json.loads(extra)
            except json.JSONDecodeError:
                extra = None
        self.extra_params = extra if isinstance(extra, dict) else None


def _extension(output_format: str) -> str:
    return "ogg" if output_format == "opus" else output_format.split("-")[0]


def _guard_estimate(text: str, engine: str, tier: str) -> float:
    if engine == "audio":
        return qwen_audio_tts_cost(
            len(text), config.region(), tier).catalog_cost
    rates = config.CAPABILITIES["omni"]["estimate_rates_per_million_chars"]
    return round(len(text) * rates.get(tier, rates["plus"]) / 1_000_000, 6)


class AlibabaBatchSpeechProvider:
    def prepare(self, *, text: str, values: dict, bindings: list[dict],
                pronunciations: list[dict], preferences: dict
                ) -> PreparedBatchSpeech:
        options = _Options(values, bindings, pronunciations, preferences)
        tagged = [tag for tag in say.TAG_RE.findall(text)
                  if tag.casefold() in say.KNOWN_TAGS]
        if options.engine == "omni" and tagged:
            raise ValueError(
                "Qwen 3.5 Omni does not support inline delivery tags. "
                "Use a Qwen Audio voice for tagged Batch rows.")
        spoken, _ = say.apply_pronunciations(text, pronunciations)
        if preferences.get("fix_dates_phones", True):
            spoken, _ = say.normalise_ambiguous(
                spoken, day_first=bool(preferences.get("day_first", True)))
        return PreparedBatchSpeech(
            original_text=text, spoken_text=spoken, voice=options.voice,
            voice_identity_id=options.voice_identity_id,
            engine=options.engine, tier=options.model,
            model_id=options.model_id, output_format=options.format,
            extension=_extension(options.format),
            estimated_cost=_guard_estimate(
                spoken, options.engine, options.model), context=options,
        )

    def synthesize(self, prepared: PreparedBatchSpeech,
                   on_progress=None) -> SynthesizedBatchSpeech:
        options = prepared.context
        chunks = say.chunk_text(prepared.spoken_text)
        audio, failures, transcripts, usage = speech.synthesize(
            chunks, options, on_progress=on_progress)
        if prepared.engine == "omni":
            actual = config.omni_usage_cost(usage, prepared.tier)
            cost = (actual if actual is not None
                    else prepared.estimated_cost)
            basis = "actual_tokens" if actual is not None else "estimate"
            endpoint = config.compatible_base_url()
            rate = None
        else:
            priced = qwen_audio_tts_cost(
                len(prepared.spoken_text), config.region(), prepared.tier)
            cost, basis = priced.catalog_cost, priced.cost_basis
            endpoint = config.websocket_base()
            rate = priced.catalog_rate
        return SynthesizedBatchSpeech(
            audio=audio, cost=cost, cost_basis=basis, usage=usage or {},
            failures=[item._asdict() for item in failures],
            returned_text=(" ".join(item.strip() for item in transcripts
                                    if item.strip()) or None),
            provider_region=config.region(), provider_endpoint=endpoint,
            price_version=PRICE_VERSION, catalog_rate=rate,
        )
