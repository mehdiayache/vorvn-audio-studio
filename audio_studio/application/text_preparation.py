"""Prepare written text for speech without owning HTTP or provider details."""

from __future__ import annotations

from dataclasses import dataclass
import difflib
import re
from typing import Callable, Protocol

from audio_studio.domain.delivery_tags import (
    KNOWN_TAGS,
    MOOD_TAGS,
    RETIRED_TAGS,
    SOUND_TAGS,
    TAG_RE,
)
from audio_studio.domain.jobs import Job


MODEL = "qwen3.7-plus"
PRICE_VERSION = "qwen3.7-text-estimate-v1"
INPUT_PRICE_PER_MILLION = 0.4
OUTPUT_PRICE_PER_MILLION = 1.2
DENSITIES = ("none", "light", "normal", "heavy")

DEFAULTS = {
    "shape": (
        "You rewrite text so it sounds right when spoken aloud. Keep the "
        "meaning, the language and the facts exactly. Change only how it is "
        "built for a listener:\n"
        "- shorter sentences; break long ones\n"
        "- punctuation that gives the reader room to breathe, including "
        "ellipses where a pause helps\n"
        "- no headings, no bullet symbols, no markdown, no parentheses read "
        "aloud as clutter\n"
        "- spell out anything a reader would stumble over\n"
        "- do not add new information, do not summarise, do not add tags\n"
        "Reply with the rewritten text only, nothing else."
    ),
    "tag": (
        "You add inline delivery tags to text that is about to be spoken by a "
        "text-to-speech model.\n"
        "MOOD tags set a delivery that holds until the next mood tag: {moods}\n"
        "SOUND tags make one effect then return to normal: {sounds}\n"
        "Never use any other tag, including {retired}.\n"
        "Rules: use ONLY tags from those two lists, exactly as written. Never "
        "invent a tag. Never change, add or remove any of the words. Place a "
        "tag immediately before the words it applies to.\n"
        "{density}\n"
        "Reply with the tagged text only, nothing else."
    ),
    "style_line": "The voice of this work, in the owner's words: {style}",
    "density_none": "Do not add any tags at all.",
    "density_light": "Add very few tags — only where one clearly helps, at most one every few sentences.",
    "density_normal": "Add tags where they genuinely help the delivery.",
    "density_heavy": "Add tags generously, several per paragraph, wherever a shift in delivery would make it more alive.",
}


@dataclass(frozen=True, slots=True)
class Completion:
    text: str
    usage: dict
    request_id: str | None = None
    provider_region: str | None = None
    provider_endpoint: str | None = None


class TextProvider(Protocol):
    def complete(self, *, model: str, messages: list[dict[str, str]]) -> Completion: ...


class TextPreparationRepository(Protocol):
    def prompt_settings(self) -> dict: ...
    def style_for(self, production_id: int) -> str: ...
    def today_spend(self) -> float: ...


class JobProgressRepository(Protocol):
    def progress(self, job_id: int, done: int, total: int,
                 detail: str = "") -> None: ...


def templates(saved: dict | None = None) -> dict:
    edited = {key: value for key, value in (saved or {}).items()
              if key in DEFAULTS and str(value).strip()}
    return {**DEFAULTS, **edited}


def variables() -> dict:
    return {
        "moods": ", ".join(f"[{tag}]" for tag in MOOD_TAGS),
        "sounds": ", ".join(f"[{tag}]" for tag in SOUND_TAGS),
        "retired": ", ".join(f"[{tag}]" for tag in RETIRED_TAGS) or "none",
    }


def _fill(template: str, extra: dict | None = None) -> str:
    values = {**variables(), **(extra or {})}
    result = template or ""
    for key, value in values.items():
        result = result.replace("{" + key + "}", str(value))
    return result


def estimate(text: str) -> float:
    tokens = max(1, len(text) / 4)
    return round((tokens * INPUT_PRICE_PER_MILLION
                  + tokens * OUTPUT_PRICE_PER_MILLION) / 1_000_000, 5)


def _with_style(prompt: str, style: str, kept: dict) -> str:
    if not style:
        return prompt
    return prompt + "\n\n" + _fill(kept["style_line"], {"style": style})


def shape_prompt(style: str = "", saved: dict | None = None) -> str:
    kept = templates(saved)
    return _with_style(_fill(kept["shape"]), style, kept)


def tag_prompt(density: str = "normal", style: str = "",
               saved: dict | None = None) -> str:
    kept = templates(saved)
    line = kept.get(f"density_{density}") or kept["density_normal"]
    return _with_style(_fill(kept["tag"], {"density": line}), style, kept)


def strip_unknown(text: str) -> str:
    known = {tag.lower() for tag in KNOWN_TAGS}
    cleaned = TAG_RE.sub(
        lambda match: match.group(0)
        if match.group(1).lower() in known else "", text)
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


def difference(before: str, after: str) -> list[dict[str, str]]:
    split = lambda value: re.findall(r"\S+\s*", value or "")
    old, new = split(before), split(after)
    marks: list[dict[str, str]] = []
    for operation, old_start, old_end, new_start, new_end in \
            difflib.SequenceMatcher(None, old, new).get_opcodes():
        if operation == "equal":
            marks.append({"kind": "same", "text": "".join(new[new_start:new_end])})
            continue
        if old_start != old_end:
            marks.append({"kind": "removed", "text": "".join(old[old_start:old_end])})
        if new_start != new_end:
            marks.append({"kind": "added", "text": "".join(new[new_start:new_end])})
    return marks


class TextPreparationService:
    def __init__(self, repository: TextPreparationRepository,
                 provider: TextProvider,
                 preferences: Callable[[], dict]):
        self.repository = repository
        self.provider = provider
        self.preferences = preferences

    def prepare(self, *, operation: str, text: str,
                production_id: int | None = None,
                part_id: int | None = None, density: str = "normal",
                engine: str = "audio", confirmed: bool = False) -> dict:
        before = (text or "").strip()
        if not before:
            raise ValueError("There's nothing to work on.")
        if operation not in {"shape", "tag"}:
            raise ValueError("Unknown text operation.")
        if operation == "tag" and engine != "audio":
            raise ValueError(
                "Inline delivery tags belong to Qwen Audio TTS. Qwen 3.5 "
                "Omni uses one natural-language performance direction instead.")
        if density not in DENSITIES:
            raise ValueError("Unknown tag density.")

        estimated = estimate(before)
        preferences = self.preferences()
        cap = float(preferences.get("daily_cap") or 0)
        spent = self.repository.today_spend() if cap > 0 else 0.0
        if cap > 0 and spent + estimated > cap:
            raise PermissionError(
                f"Daily cap reached. You've spent ${spent:.4f} today and this "
                f"would add ${estimated:.4f}, over your ${cap:.2f} cap. Raise "
                "it in Settings if you want to continue.")
        warning = float(preferences.get("warn_above") or 0)
        if warning > 0 and estimated > warning and not confirmed:
            return {"needs_confirmation": True, "estimate": round(estimated, 4),
                    "warn_above": warning, "model": MODEL,
                    "cost_basis": "estimate", "price_version": PRICE_VERSION}

        style = self.repository.style_for(production_id) if production_id else ""
        saved = self.repository.prompt_settings()
        prompt = (shape_prompt(style, saved) if operation == "shape"
                  else tag_prompt(density, style, saved))
        completion = self.provider.complete(
            model=MODEL,
            messages=[{"role": "system", "content": prompt},
                      {"role": "user", "content": before}],
        )
        after = completion.text if operation == "shape" else strip_unknown(completion.text)
        return {
            "before": before,
            "after": after,
            "difference": difference(before, after),
            "cost": estimated,
            "cost_basis": "estimate",
            "price_version": PRICE_VERSION,
            "style_used": bool(style),
            "part": part_id or 0,
            "model": MODEL,
            "usage": completion.usage,
            "provider_request_id": completion.request_id,
            "provider_region": completion.provider_region,
            "provider_endpoint": completion.provider_endpoint,
        }


class TextPreparationJobHandler:
    """Translate a durable Job payload into the provider-neutral use case."""

    def __init__(self, service: TextPreparationService):
        self.service = service

    def __call__(self, job: Job, repository: JobProgressRepository) -> dict:
        operation = str(job.payload.get("operation") or "")
        repository.progress(
            job.id, 0, 1,
            "Rewriting for the ear" if operation == "shape" else "Placing tags",
        )
        result = self.service.prepare(
            operation=operation,
            text=str(job.payload.get("text") or ""),
            production_id=job.payload.get("production_id"),
            part_id=job.payload.get("part_id"),
            density=str(job.payload.get("density") or "normal"),
            engine=str(job.payload.get("engine") or "audio"),
            confirmed=bool(job.payload.get("confirmed")),
        )
        repository.progress(job.id, 1, 1, "Complete")
        return result
