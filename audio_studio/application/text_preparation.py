"""Prepare written text for speech without owning HTTP or provider details."""

from __future__ import annotations

import difflib
import hashlib
import re
import unicodedata
from typing import Callable, Protocol

from audio_studio.domain.delivery_tags import (
    KNOWN_TAGS,
    MOOD_TAGS,
    RETIRED_TAGS,
    SOUND_TAGS,
    TAG_RE,
)
from audio_studio.domain.jobs import Job
from audio_studio.domain.text import ProviderText
from audio_studio.application.provider_operations import (
    ProviderOperationService, enforce_daily_cap,
)


MODEL = "qwen3.7-plus"
PRICE_VERSION = "qwen3.7-text-estimate-v1"
INPUT_PRICE_PER_MILLION = 0.4
OUTPUT_PRICE_PER_MILLION = 1.2
DENSITIES = ("none", "light", "normal", "heavy")
SPOKEN_PROFILES = ("spoken_1", "spoken_2")

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
    "shape_2": """Transform the input into text designed to be heard aloud.

Read the entire text first.

Understand:

- the meaning
- the facts
- the point of view
- the sequence of events
- the emotional movement
- the intention
- what matters most
- where attention shifts
- what should move quickly
- what should slow down
- what should land strongly
- what should feel tense, soft, intimate, urgent, surprising, uncertain, sad, excited, reflective, or calm

Then imagine the entire piece being spoken aloud to someone who cannot see the words.

They only hear it.

Shape the text for that experience.

Preserve the meaning, facts, point of view, sequence of events, intended emotion, existing voice, and personality.

First try to solve the spoken-performance problem through segmentation, punctuation, sentence boundaries, spacing, and rhythm.

Change wording only when the existing wording itself prevents natural spoken delivery.

Treat the text as a vocal performance.

Break sentences where the voice should naturally breathe, react, shift intention, reset, or let something land.

Join sentences where the thought should keep moving.

Let information arrive at a pace the listener can understand on first hearing.

Use punctuation as part of the performance.

`,` = light continuation or a small internal pause

`.` = completed thought, reset, or clean landing

`...` = meaningful held space, hesitation, suspense, reflection, emotional space, delayed arrival, or trailing thought

`?` = genuine questioning, uncertainty, disbelief, challenge, or upward conversational movement

`!` = genuine force, urgency, excitement, shock, anger, or emotional release

Let the meaning decide the rhythm.

Action can move quickly.

Reflection can breathe.

Tension can tighten.

Intimacy can become quieter.

Important moments can receive more space.

Simple information can pass quickly.

Some thoughts can flow.

Some can stop sharply.

Some can linger.

Some can arrive almost immediately after the previous thought.

Think in spoken phrases rather than written sentences.

Consider where the voice would naturally:

- continue
- breathe
- pause
- reset
- accelerate
- slow down
- soften
- hesitate
- react
- emphasize
- change intention
- let something land

Shape the text around those moments.

Allow sentence length to vary naturally.

Allow fragments when the spoken moment calls for them.

Allow repetition when it naturally comes from emotion, hesitation, insistence, memory, surprise, emphasis, or rhythm.

Let irregularity emerge naturally from the meaning and performance.

Keep passages that already sound good aloud with minimal intervention.

Reshape more strongly when the written structure creates stiffness, overload, flatness, rushing, mechanical rhythm, weak emphasis, or unnatural spoken phrasing.

The text may look unusual on the page.

The auditory result is the target.

Before returning the result, internally hear the entire transformed text from beginning to end as if performed by a high-quality natural voice.

Listen to the pacing.

Listen to the phrasing.

Listen to the breathing.

Listen to the emotional movement.

Listen to where thoughts continue and where they land.

Listen for sections that feel flat, rushed, overloaded, chopped, monotonous, overly polished, or strongly written rather than naturally spoken.

Reshape those sections.

Perform one final pass focused only on how the voice moves through the text.

Return only the transformed text.

Use only words, punctuation, spacing, and line breaks intended for the final spoken performance.""",
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


class TextProvider(Protocol):
    def complete(self, *, model: str,
                 messages: list[dict[str, str]],
                 reasoning: bool = False) -> ProviderText: ...


class TextPreparationRepository(Protocol):
    def prompt_settings(self) -> dict: ...
    def style_for(self, production_id: int) -> str: ...
    def today_spend(self) -> float: ...
    def capability_controls(self, capability_id: str) -> dict: ...


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
                  + tokens * OUTPUT_PRICE_PER_MILLION) / 1_000_000, 6)


def usage_cost(usage: dict | None) -> float | None:
    """Price a completed text pass from the tokens Alibaba returned."""
    if not usage:
        return None
    input_tokens = usage.get("prompt_tokens", usage.get("input_tokens"))
    output_tokens = usage.get("completion_tokens", usage.get("output_tokens"))
    if input_tokens is None or output_tokens is None:
        return None
    return round((float(input_tokens) * INPUT_PRICE_PER_MILLION
                  + float(output_tokens) * OUTPUT_PRICE_PER_MILLION)
                 / 1_000_000, 6)


def _with_style(prompt: str, style: str, kept: dict) -> str:
    if not style:
        return prompt
    return prompt + "\n\n" + _fill(kept["style_line"], {"style": style})


def shape_prompt(style: str = "", saved: dict | None = None,
                 profile: str = "spoken_1") -> str:
    kept = templates(saved)
    key = "shape_2" if profile == "spoken_2" else "shape"
    return _with_style(_fill(kept[key]), style, kept)


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


def _without_delivery_tags(text: str) -> str:
    known = {tag.lower() for tag in KNOWN_TAGS}
    return TAG_RE.sub(
        lambda match: "" if match.group(1).lower() in known else match.group(0),
        text,
    )


def _canonical_words(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).split())


def assert_tag_fidelity(before: str, tagged: str) -> None:
    """Tags are metadata; the provider is never allowed to rewrite words."""
    returned = _canonical_words(_without_delivery_tags(tagged))
    requested = _canonical_words(before)
    if returned != requested:
        raise ValueError(
            "Alibaba changed the script while adding delivery tags. "
            "Auvi Studio rejected that version so your original words stay safe."
        )


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
                 preferences: Callable[[], dict],
                 operations: ProviderOperationService | None = None):
        self.repository = repository
        self.provider = provider
        self.preferences = preferences
        self.operations = operations

    def prepare(self, *, operation: str, text: str,
                production_id: int | None = None,
                part_id: int | None = None, density: str = "normal",
                spoken_profile: str = "spoken_1",
                capability_id: str, confirmed: bool = False,
                source_job_id: int | None = None) -> dict:
        before = (text or "").strip()
        if not before:
            raise ValueError("There's nothing to work on.")
        if operation not in {"shape", "tag"}:
            raise ValueError("Unknown text operation.")
        if spoken_profile not in SPOKEN_PROFILES:
            raise ValueError("Unknown Spoken preparation method.")
        capability_controls = self.repository.capability_controls(capability_id)
        if operation == "tag" and capability_controls.get("delivery_tags") is not True:
            raise ValueError(
                "The selected recording capability does not support inline "
                "delivery tags. Choose Raw or Spoken text instead.")
        if density not in DENSITIES:
            raise ValueError("Unknown tag density.")

        estimated = estimate(before)
        preferences = self.preferences()
        if not (self.operations and source_job_id):
            enforce_daily_cap(
                estimated, preferences, self.repository.today_spend())
        warning = float(preferences.get("warn_above") or 0)
        if warning > 0 and estimated > warning and not confirmed:
            return {"needs_confirmation": True, "estimate": round(estimated, 4),
                    "warn_above": warning, "model": MODEL,
                    "cost_basis": "estimate", "price_version": PRICE_VERSION}

        uses_venture_style = not (
            operation == "shape" and spoken_profile == "spoken_2")
        style = (self.repository.style_for(production_id)
                 if production_id and uses_venture_style else "")
        saved = self.repository.prompt_settings()
        prompt = (shape_prompt(style, saved, spoken_profile) if operation == "shape"
                  else tag_prompt(density, style, saved))
        reservation_id = None
        attempt_id = None
        if self.operations and source_job_id:
            reservation_id = self.operations.authorize(
                source_job_id, "text_preparation", estimated,
                preferences, confirmed)
            attempt_id = self.operations.repository.begin_attempt(
                source_job_id, "text_preparation", {
                    "provider": "alibaba", "region": "intl", "model": MODEL,
                }, {"operation": operation, "part_id": part_id,
                    "input_length": len(before)}, reservation_id)
        try:
            if attempt_id:
                self.operations.repository.mark_sent(attempt_id)
            completion = self.provider.complete(
                model=MODEL,
                messages=[{"role": "system", "content": prompt},
                          {"role": "user", "content": before}],
                reasoning=False,
            )
        except Exception as exc:
            if attempt_id:
                status = self.operations.failure_status(exc)
                self.operations.repository.finish_attempt(
                    attempt_id, status, cost=0, usage={}, request_ids=[],
                    error={"type": type(exc).__name__, "message": str(exc)[:600]})
            raise
        actual_cost = usage_cost(completion.usage)
        final_cost = actual_cost if actual_cost is not None else estimated
        if attempt_id:
            self.operations.repository.finish_attempt(
                attempt_id, "succeeded", cost=final_cost,
                usage=completion.usage or {},
                request_ids=[completion.request_id]
                if completion.request_id else [], error={}, receipt={
                    "text_sha256": hashlib.sha256(
                        completion.text.encode("utf-8")).hexdigest(),
                    "character_count": len(completion.text),
                    "provider_region": completion.provider_region,
                    "provider_endpoint": completion.provider_endpoint,
                })
        if operation == "shape":
            after = completion.text
        else:
            after = strip_unknown(completion.text)
            assert_tag_fidelity(before, after)
        return {
            "before": before,
            "after": after,
            "difference": difference(before, after),
            "cost": final_cost,
            "estimated_cost": estimated,
            "cost_basis": "actual_tokens" if actual_cost is not None else "estimate",
            "price_version": PRICE_VERSION,
            "style_used": bool(style),
            "part": part_id or 0,
            "model": MODEL,
            "spoken_profile": spoken_profile if operation == "shape" else None,
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
            spoken_profile=str(job.payload.get("spoken_profile") or "spoken_1"),
            capability_id=str(job.payload.get("capability_id") or ""),
            confirmed=bool(job.payload.get("confirmed")),
            source_job_id=job.id,
        )
        repository.progress(job.id, 1, 1, "Complete")
        return result
