"""One Alibaba adapter for every Audio Studio speech-producing capability."""

from __future__ import annotations

import json
import os
import re

import say
from services import voice_routing
from services.alibaba import config, fidelity as alibaba_fidelity
from services.alibaba import speech as alibaba_speech
from services.alibaba.pricing import PRICE_VERSION, qwen_audio_tts_cost

from audio_studio.domain.speech import PreparedSpeech, SynthesizedSpeech


INSTRUCTION_MAX = 100


class _Options:
    """Provider request values resolved exactly once before a paid call."""

    def __init__(self, values: dict, bindings: list[dict],
                 pronunciations: list[dict], preferences: dict):
        language = values.get("language")
        text = str(values.get("text") or "")
        if language in (None, "", "Auto") and re.search(r"[\u0600-\u06ff]", text):
            language = "Arabic"
        route = voice_routing.resolve(
            {**values, "language": language, "text": text}, bindings)
        self.language = None if language in (None, "", "Auto") else str(language)
        self.voice_identity_id = route.identity_id
        self.voice = route.provider_voice_id or (
            "Tina" if route.engine == "omni" else say.DEFAULT_VOICE[route.tier])
        self.engine = route.engine
        self.model = route.tier
        self.model_id = route.model_id
        self.voice_route = {**route.payload(), "provider_voice_id": self.voice}
        self.format = str(values.get("format") or "mp3")
        instruction = str(values.get("instruction") or "").strip()
        self.instruction = instruction[:INSTRUCTION_MAX] or None
        self.speech_mode = (
            "directed" if self.engine == "omni"
            and values.get("speech_mode") == "directed" and self.instruction
            else "exact"
        )
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


class AlibabaSpeechProvider:
    @staticmethod
    def is_configured() -> bool:
        return bool(os.getenv("DASHSCOPE_API_KEY", "").strip())

    def prepare(self, *, text: str, values: dict, bindings: list[dict],
                pronunciations: list[dict], preferences: dict) -> PreparedSpeech:
        requested_identity = str(values.get("voice_identity_id") or "").strip()
        if requested_identity and not any(
                str(item.get("identity_id") or "") == requested_identity
                for item in bindings):
            raise ValueError(
                "That cloned voice has no active Alibaba model version. "
                "Reload Voices before generating.")
        options = _Options(values, bindings, pronunciations, preferences)
        tagged = [tag for tag in say.TAG_RE.findall(text)
                  if tag.casefold() in say.KNOWN_TAGS]
        if options.engine == "omni" and tagged:
            raise ValueError(
                "Qwen 3.5 Omni does not support inline delivery tags. "
                "Choose Raw or Spoken text, or use a Qwen Audio voice.")
        spoken, applied = say.apply_pronunciations(text, pronunciations)
        rewrites: list = []
        if preferences.get("fix_dates_phones", True):
            spoken, rewrites = say.normalise_ambiguous(
                spoken, day_first=bool(preferences.get("day_first", True)))
        return PreparedSpeech(
            original_text=text, spoken_text=spoken, voice=options.voice,
            voice_identity_id=options.voice_identity_id,
            engine=options.engine, tier=options.model,
            model_id=options.model_id, output_format=options.format,
            extension=_extension(options.format), language=options.language,
            instruction=options.instruction, speech_mode=options.speech_mode,
            rate=options.rate, pitch=options.pitch, volume=options.volume,
            seed=options.seed, request_count=len(say.chunk_text(spoken)),
            estimated_cost=_guard_estimate(spoken, options.engine, options.model),
            voice_route=options.voice_route, pronunciations=applied,
            rewrites=rewrites, context=options,
        )

    def synthesize(self, prepared: PreparedSpeech,
                   on_progress=None) -> SynthesizedSpeech:
        chunks = say.chunk_text(prepared.spoken_text)
        audio, failures, transcripts, usage = alibaba_speech.synthesize(
            chunks, prepared.context, on_progress=on_progress)
        failure_rows = [item._asdict() for item in failures]
        provider_text = " ".join(
            item.strip() for item in transcripts if item.strip()) or None
        compared = (say.strip_known_tags(prepared.spoken_text)
                    if prepared.engine == "omni" else prepared.spoken_text)
        fidelity = (alibaba_fidelity.assess(compared, provider_text or "")
                    if prepared.engine == "omni" else {})
        measured_usage = dict(usage or {})
        if prepared.engine == "omni":
            actual = config.omni_usage_cost(measured_usage, prepared.tier)
            cost = actual if actual is not None else prepared.estimated_cost
            basis = "actual_tokens" if actual is not None else "estimate"
            endpoint = config.compatible_base_url()
            rate = None
        else:
            generated_characters = max(
                0, len(prepared.spoken_text)
                - sum(len(str(item.get("text") or "")) for item in failure_rows))
            measured_usage.update({
                "submitted_characters": len(prepared.spoken_text),
                "generated_characters": generated_characters,
            })
            priced = qwen_audio_tts_cost(
                generated_characters, config.region(), prepared.tier)
            cost, basis = priced.catalog_cost, priced.cost_basis
            endpoint = config.websocket_base()
            rate = priced.catalog_rate
        return SynthesizedSpeech(
            audio=audio, cost=cost, cost_basis=basis,
            usage=measured_usage, failures=failure_rows,
            returned_text=provider_text, fidelity=fidelity,
            provider_region=config.region(), provider_endpoint=endpoint,
            price_version=PRICE_VERSION, catalog_rate=rate,
        )
