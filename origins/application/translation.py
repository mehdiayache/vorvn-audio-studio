"""Translate timed subtitles while preserving alignment and delivery tags."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import re
from typing import Callable, Protocol

from origins.domain import captions
from origins.domain.delivery_tags import TAG_RE
from origins.domain.jobs import Job, JobFailed
from origins.domain.text import ProviderText
from origins.application.provider_operations import (
    ProviderOperationService, enforce_daily_cap,
)
from origins.application.creation_files import CreationFileService


MODELS = {"fast": "qwen-mt-flash", "best": "qwen-mt-plus"}
LANGUAGES = [
    "English", "Chinese", "Japanese", "Korean", "French", "German",
    "Spanish", "Italian", "Portuguese", "Russian", "Arabic", "Indonesian",
    "Malay", "Thai", "Vietnamese", "Tagalog", "Dutch", "Turkish",
    "Polish", "Hindi",
]
SPEAKABLE = LANGUAGES[:16]
UNRELIABLE_SPEECH: dict = {}
BATCH_SIZE = 40
PRICE_VERSION = "alibaba-model-studio-2026-07-15"

# USD per million tokens from Alibaba's published Model Studio catalogue.
TOKEN_PRICES = {
    "intl": {
        "qwen-mt-flash": {"input": 0.16, "output": 0.49},
        "qwen-mt-plus": {"input": 2.46, "output": 7.37},
    },
    "beijing": {
        "qwen-mt-flash": {"input": 0.101, "output": 0.280},
        "qwen-mt-plus": {"input": 0.259, "output": 0.775},
    },
}


@dataclass(frozen=True, slots=True)
class TranslatedLines:
    lines: list[str]
    usage: dict
    request_ids: list[str]
    provider_region: str | None
    provider_endpoint: str | None


class TranslationProvider(Protocol):
    def translate(self, *, model: str, text: str, source: str | None,
                  target: str) -> ProviderText: ...


class TranslationRepository(Protocol):
    def get(self, transcript_id: int) -> dict | None: ...
    def save(self, values: dict) -> int: ...
    def today_spend(self) -> float: ...


class JobProgressRepository(Protocol):
    def progress(self, job_id: int, done: int, total: int,
                 detail: str = "") -> None: ...


def estimate_cost(characters: int) -> float:
    """Compatibility estimate used only by the pre-call spending guard."""
    return round(max(0, characters) / 1_000_000 * 2.0, 6)


def usage_cost(usage: dict, model: str, region: str) -> float | None:
    prices = TOKEN_PRICES.get(region, TOKEN_PRICES["intl"]).get(model)
    if not prices or not usage:
        return None
    prompt = int(usage.get("prompt_tokens") or 0)
    completion = int(usage.get("completion_tokens") or 0)
    if prompt + completion <= 0:
        return None
    return round((prompt * prices["input"]
                  + completion * prices["output"]) / 1_000_000, 6)


def _merge_usage(total: dict, incoming: dict) -> dict:
    merged = dict(total)
    for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
        merged[key] = int(merged.get(key) or 0) + int(incoming.get(key) or 0)
    merged["requests"] = int(merged.get("requests") or 0) + 1
    return merged


def _unnumber(reply: str, expected: int) -> list[str] | None:
    found: dict[int, str] = {}
    for line in reply.splitlines():
        match = re.match(r"\s*(\d+)\s*[.)、]\s*(.*)", line)
        if match:
            found[int(match.group(1))] = match.group(2).strip()
    if len(found) != expected or set(found) != set(range(1, expected + 1)):
        return None
    return [found[index + 1] for index in range(expected)]


class Translator:
    def __init__(self, provider: TranslationProvider):
        self.provider = provider

    def _call(self, quality: str, text: str, source: str | None,
              target: str) -> ProviderText:
        return self.provider.translate(
            model=MODELS.get(quality, MODELS["fast"]), text=text,
            source=source, target=target,
        )

    def translate_text(self, text: str, target: str,
                       source: str | None = None,
                       quality: str = "fast") -> str:
        if not text.strip():
            return ""
        pieces = TAG_RE.split(text)
        if len(pieces) == 1:
            return self._call(quality, text, source, target).text

        words = [pieces[index] for index in range(0, len(pieces), 2)]
        sendable = [index for index, value in enumerate(words) if value.strip()]
        if sendable:
            translated = self.translate_lines(
                [words[index] for index in sendable], target, source, quality)
            for index, line in zip(sendable, translated.lines):
                words[index] = self._respace(words[index], line)

        output: list[str] = []
        for index, piece in enumerate(pieces):
            output.append(f"[{piece}]" if index % 2 else words[index // 2])
        return "".join(output)

    @staticmethod
    def _respace(original: str, translated: str) -> str:
        lead = original[:len(original) - len(original.lstrip())]
        trail = original[len(original.rstrip()):]
        return lead + translated.strip() + trail

    def translate_lines(self, lines: list[str], target: str,
                        source: str | None = None, quality: str = "fast",
                        on_progress=None) -> TranslatedLines:
        held = [TAG_RE.findall(line or "") for line in lines]
        bare = [TAG_RE.sub("", line or "").strip() for line in lines]
        sendable = [index for index, line in enumerate(bare) if line]
        payload = [bare[index] for index in sendable]
        results: list[str] = []
        usage: dict = {}
        request_ids: list[str] = []
        provider_region = None
        provider_endpoint = None

        def retain(response: ProviderText) -> None:
            nonlocal usage, provider_region, provider_endpoint
            usage = _merge_usage(usage, response.usage)
            if response.request_id:
                request_ids.append(response.request_id)
            provider_region = provider_region or response.provider_region
            provider_endpoint = provider_endpoint or response.provider_endpoint

        for start in range(0, len(payload), BATCH_SIZE):
            batch = payload[start:start + BATCH_SIZE]
            if on_progress:
                on_progress(start, len(payload))
            numbered = "\n".join(
                f"{index + 1}. {line}" for index, line in enumerate(batch))
            response = self._call(quality, numbered, source, target)
            retain(response)
            parsed = _unnumber(response.text, len(batch))
            if parsed is None:
                parsed = []
                for line in batch:
                    fallback = self._call(quality, line, source, target)
                    retain(fallback)
                    parsed.append(fallback.text)
            results.extend(parsed)

        done = dict(zip(sendable, results))
        translated = [
            " ".join(piece for piece in (
                "".join(f"[{tag}]" for tag in held[index]),
                done.get(index, ""),
            ) if piece)
            for index in range(len(lines))
        ]
        return TranslatedLines(
            translated, usage, request_ids, provider_region, provider_endpoint)


class SubtitleTranslationService:
    def __init__(self, repository: TranslationRepository,
                 translator: Translator, preferences: Callable[[], dict],
                 operations: ProviderOperationService | None = None):
        self.repository = repository
        self.translator = translator
        self.preferences = preferences
        self.operations = operations

    def translate(self, *, transcript_id: int, target: str,
                  source: str = "", quality: str = "fast",
                  confirmed: bool = False, source_job_id: int | None = None,
                  on_progress=None) -> dict:
        transcript = self.repository.get(transcript_id)
        if not transcript:
            raise LookupError("That transcript is gone.")
        target = target.strip()
        if not target:
            raise ValueError("Pick a language to translate into.")
        sentences = transcript.get("sentences") or []
        if not sentences:
            raise ValueError("Nothing to translate.")
        if quality not in MODELS:
            raise ValueError("Unknown translation quality.")

        characters = sum(len(str(sentence.get("text") or ""))
                         for sentence in sentences)
        estimate = estimate_cost(characters)
        preferences = self.preferences()
        if not (self.operations and source_job_id):
            enforce_daily_cap(
                estimate, preferences, self.repository.today_spend())
        warning = float(preferences.get("warn_above") or 0)
        if warning > 0 and estimate > warning and not confirmed:
            return {"needs_confirmation": True, "estimate": round(estimate, 4),
                    "warn_above": warning, "model": MODELS[quality],
                    "cost_basis": "estimate"}

        reservation_id = None
        attempt_id = None
        model = MODELS[quality]
        if self.operations and source_job_id:
            reservation_id = self.operations.authorize(
                source_job_id, "translation", estimate, preferences, confirmed)
            attempt_id = self.operations.repository.begin_attempt(
                source_job_id, "translation", {
                    "provider": "alibaba", "region": "intl", "model": model,
                }, {"transcript_id": transcript_id, "source": source,
                    "target": target, "quality": quality}, reservation_id)
        try:
            if attempt_id:
                self.operations.repository.mark_sent(attempt_id)
            translated = self.translator.translate_lines(
                [str(sentence.get("text") or "") for sentence in sentences],
                target=target, source=source or None, quality=quality,
                on_progress=on_progress,
            )
        except Exception as exc:
            if attempt_id:
                status = self.operations.failure_status(exc)
                self.operations.repository.finish_attempt(
                    attempt_id, status, cost=0, usage={}, request_ids=[],
                    error={"type": type(exc).__name__, "message": str(exc)[:600]})
            raise
        region = translated.provider_region or "intl"
        actual = usage_cost(translated.usage, model, region)
        cost = actual if actual is not None else estimate
        cost_basis = "actual_tokens" if actual is not None else "estimate"
        if attempt_id:
            joined = "\n".join(translated.lines)
            self.operations.repository.finish_attempt(
                attempt_id, "succeeded", cost=cost, usage=translated.usage,
                request_ids=translated.request_ids, error={}, receipt={
                    "text_sha256": hashlib.sha256(
                        joined.encode("utf-8")).hexdigest(),
                    "line_count": len(translated.lines),
                    "provider_region": region,
                    "provider_endpoint": translated.provider_endpoint,
                })
        translated_sentences = [
            {**sentence, "text": line, "words": []}
            for sentence, line in zip(sentences, translated.lines)
        ]
        text = " ".join(translated.lines)
        cues = captions.build_cues(translated_sentences, "standard")
        srt = captions.render_srt(cues)
        vtt = captions.render_vtt(cues)
        name = f"{transcript['name']} [{target}]"
        new_id = self.repository.save({
            "name": name,
            "source_url": transcript.get("source_url"),
            "audio_url": transcript.get("audio_url"),
            "language": target,
            "duration_ms": int(transcript.get("duration_ms") or 0),
            "text": text,
            "srt": srt,
            "vtt": vtt,
            "sentences": translated_sentences,
            "part_id": transcript.get("part_id"),
            "clip_id": transcript.get("clip_id"),
            "translated_from": transcript["id"],
            "source_job_id": source_job_id,
            "model": model,
            "provider_region": region,
            "price_version": PRICE_VERSION,
            "catalog_rate": None,
            "catalog_cost": cost,
            "cost_basis": cost_basis,
            "timing_source": "translated_source_cues",
            "workspace_id": transcript.get("workspace_id"),
        })
        return {
            "id": new_id,
            "file": name,
            "url": transcript.get("audio_url"),
            "language": target,
            "text": text,
            "sentences": translated_sentences,
            "duration_ms": int(transcript.get("duration_ms") or 0),
            "srt": srt,
            "vtt": vtt,
            "cost": cost,
            "cost_basis": cost_basis,
            "estimated_cost": estimate,
            "model": model,
            "provider_region": region,
            "provider_endpoint": translated.provider_endpoint,
            "provider_request_id": translated.request_ids[0]
            if translated.request_ids else None,
            "provider_request_ids": translated.request_ids,
            "price_version": PRICE_VERSION,
            "usage": translated.usage,
            "chars": characters,
            "part_id": transcript.get("part_id"),
            "workspace_id": transcript.get("workspace_id"),
        }


class SubtitleTranslationJobHandler:
    def __init__(self, service: SubtitleTranslationService,
                 files: CreationFileService):
        self.service = service
        self.files = files

    def __call__(self, job: Job, repository: JobProgressRepository) -> dict:
        target = str(job.payload.get("target") or "")
        repository.progress(job.id, 0, 1, f"Translating into {target}")
        result = self.service.translate(
            transcript_id=int(job.payload.get("transcript_id") or 0),
            target=target,
            source=str(job.payload.get("source") or ""),
            quality=str(job.payload.get("quality") or "fast"),
            confirmed=bool(job.payload.get("confirmed")),
            source_job_id=job.id,
            on_progress=lambda done, total: repository.progress(
                job.id, done, max(1, total), f"Translating into {target}"),
        )
        if result.get("id"):
            result["source_job_id"] = str(job.public_id)
        if (result.get("id") and job.workspace_id is not None
                and not result.get("part_id")):
            try:
                outputs = self.files.write_subtitles(
                    job, base_name=str(result.get("file") or "Subtitles"),
                    language=result.get("language"),
                    srt=str(result.get("srt") or ""),
                    vtt=str(result.get("vtt") or ""),
                    metadata={
                        "provider": "alibaba",
                        "model": result.get("model"),
                        "language": result.get("language"),
                        "transcript_id": result.get("id"),
                        "translated_from": job.payload.get("transcript_id"),
                    },
                )
            except Exception as exc:
                raise JobFailed(
                    "Translated subtitles were created, but their canonical "
                    "Files could not be committed. The provider result needs "
                    "review, not another translation call.",
                    {**result, "provider_succeeded": True,
                     "requires_review": True},
                ) from exc
            result["output_file_ids"] = [int(file["id"]) for file in outputs]
        repository.progress(job.id, 1, 1, "Complete")
        return result
