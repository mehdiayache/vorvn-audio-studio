"""Canonical Sound Recipe normalization and Stable Audio prompt compilation."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import re
from typing import Any, Iterable, Literal

from audio_studio.domain.sound_recipe_taxonomy import INDEX, TAXONOMY_VERSION


RecipeCapability = Literal["music", "sfx"]
SCHEMA_VERSIONS = {
    "music": "music-semantic-v1",
    "sfx": "sfx-semantic-v1",
}
COMPILER_VERSIONS = {
    "music": "music-compiler-v1",
    "sfx": "sfx-compiler-v1",
}
MODEL_IDS = {
    "music": "stable-audio-3-small-music",
    "sfx": "stable-audio-3-small-sfx",
}
MAX_PROMPT_CHARS = 500


@dataclass(frozen=True, slots=True)
class RecipeConflict:
    id: str
    title: str
    structured: str
    free_text: str
    field: str

    def as_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "title": self.title,
            "structured": self.structured,
            "free_text": self.free_text,
            "field": self.field,
        }


@dataclass(frozen=True, slots=True)
class CompiledSoundRecipe:
    capability: RecipeCapability
    semantic_state: dict[str, Any]
    source_free_text: str
    compiled_prompt: str
    conflicts: tuple[RecipeConflict, ...]
    model: str
    semantic_schema_version: str
    compiler_version: str
    taxonomy_version: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "capability": self.capability,
            "semantic_state": self.semantic_state,
            "source_free_text": self.source_free_text,
            "compiled_prompt": self.compiled_prompt,
            "conflicts": [item.as_dict() for item in self.conflicts],
            "model": self.model,
            "semantic_schema_version": self.semantic_schema_version,
            "compiler_version": self.compiler_version,
            "taxonomy_version": self.taxonomy_version,
        }


def empty_recipe(capability: RecipeCapability) -> dict[str, Any]:
    if capability == "music":
        return {
            "model_type": "music", "creative_brief": "",
            "context": [], "cue_role": [], "moment": [],
            "voice_relationship": None, "speech_presence": None,
            "moods": [], "energy": None, "tension": None,
            "emotional_arc": None, "genres": [], "era_context": [],
            "harmonic_feel": [], "pace": None, "exact_bpm": None,
            "rhythm_groove": [], "instruments": [],
            "arrangement": {
                "density": None, "melody_prominence": None,
                "rhythmic_activity": None, "percussion_presence": None,
                "dynamics": None, "evolution": None,
                "harmonic_movement": None, "phrase_space": None,
                "low_end_weight": None,
            },
            "production": {
                "characters": [], "palette": None, "tone": None,
                "space": [], "recording_character": [],
            },
            "cue_behaviour": {"ending": None, "loop_intention": None},
            "constraints": [], "conflict_resolutions": {},
            "duration": 30, "seed": -1, "variation_count": 1,
        }
    return {
        "model_type": "sfx", "creative_brief": "",
        "family": [], "source": [], "material": [], "action": [],
        "motion": None, "perspective": None, "environment": [],
        "intensity": None, "envelope": [], "character": [],
        "processing": [], "realism": None, "behaviour": None,
        "constraints": [], "conflict_resolutions": {},
        "duration": 5, "seed": -1, "variation_count": 1,
    }


def _clean_text(value: Any, *, maximum: int = 2_000) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:maximum]


def _selection_id(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        canonical = _clean_text(value.get("canonical_en"), maximum=120)
        display = _clean_text(value.get("display"), maximum=120)
        return canonical or display
    return ""


def _values(value: Any) -> list[str]:
    raw = value if isinstance(value, list) else ([value] if value else [])
    result: list[str] = []
    seen: set[str] = set()
    for item in raw:
        identifier = _selection_id(item)
        key = identifier.casefold()
        if identifier and key not in seen:
            seen.add(key)
            result.append(identifier)
    return result


def _item_prompt(identifier: str) -> str:
    item = INDEX.get(identifier)
    return str(item["prompt_en"]) if item else _clean_text(identifier, maximum=120)


def _item_label(identifier: str) -> str:
    item = INDEX.get(identifier)
    if item:
        return str(item["labels"]["en"])
    return _clean_text(identifier, maximum=120)


def normalize_recipe(capability: RecipeCapability,
                     state: dict[str, Any] | None) -> dict[str, Any]:
    """Apply shape and bounds without inventing creative choices."""
    base = empty_recipe(capability)
    source = state if isinstance(state, dict) else {}
    for key in base:
        if key in source:
            base[key] = source[key]
    base["model_type"] = capability
    base["creative_brief"] = _clean_text(source.get("creative_brief"))
    base["conflict_resolutions"] = {
        str(key): str(value) for key, value in (
            source.get("conflict_resolutions") or {}).items()
        if value in {"structured", "brief"}
    } if isinstance(source.get("conflict_resolutions"), dict) else {}
    minimum = 1 if capability == "sfx" else 5
    try:
        duration = int(source.get("duration", base["duration"]))
    except (TypeError, ValueError):
        duration = base["duration"]
    base["duration"] = max(minimum, min(120, duration))
    try:
        seed = int(source.get("seed", -1))
    except (TypeError, ValueError):
        seed = -1
    base["seed"] = seed if -1 <= seed <= 2_147_483_647 else -1
    try:
        count = int(source.get("variation_count", 1))
    except (TypeError, ValueError):
        count = 1
    base["variation_count"] = count if count in {1, 2, 4} else 1
    if capability == "music":
        for key in ("context", "cue_role", "moment", "moods", "genres",
                    "era_context", "harmonic_feel", "rhythm_groove",
                    "constraints"):
            base[key] = _values(source.get(key))
        for key in ("voice_relationship", "speech_presence", "energy",
                    "tension", "emotional_arc", "pace"):
            base[key] = _selection_id(source.get(key)) or None
        bpm = source.get("exact_bpm")
        try:
            base["exact_bpm"] = max(30, min(240, int(bpm))) if bpm else None
        except (TypeError, ValueError):
            base["exact_bpm"] = None
        instruments = []
        for raw in source.get("instruments") or []:
            if isinstance(raw, str):
                raw = {"id": raw, "modifiers": []}
            if not isinstance(raw, dict):
                continue
            identifier = _selection_id(raw.get("id") or raw)
            if identifier:
                instruments.append({
                    "id": identifier,
                    "modifiers": _values(raw.get("modifiers")),
                })
        base["instruments"] = instruments[:12]
        for group, defaults in (("arrangement", base["arrangement"]),
                                ("production", base["production"]),
                                ("cue_behaviour", base["cue_behaviour"])):
            incoming = source.get(group) if isinstance(source.get(group), dict) else {}
            normalized = dict(defaults)
            for key in normalized:
                value = incoming.get(key)
                normalized[key] = _values(value) if isinstance(
                    defaults[key], list) else (_selection_id(value) or None)
            base[group] = normalized
    else:
        for key in ("family", "source", "material", "action", "environment",
                    "envelope", "character", "processing", "constraints"):
            base[key] = _values(source.get(key))
        for key in ("motion", "perspective", "intensity", "realism",
                    "behaviour"):
            base[key] = _selection_id(source.get(key)) or None
    return base


def _all_ids(state: dict[str, Any]) -> list[str]:
    result: list[str] = []
    def visit(value: Any) -> None:
        if isinstance(value, str):
            if value in INDEX:
                result.append(value)
        elif isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            for item in value.values():
                visit(item)
    visit(state)
    return result


def _conflicts(state: dict[str, Any], brief: str) -> tuple[RecipeConflict, ...]:
    selected = set(_all_ids(state))
    results: list[RecipeConflict] = []
    found: set[tuple[str, str]] = set()
    for identifier in selected:
        for other in INDEX[identifier].get("conflicts_with", []):
            pair = tuple(sorted((identifier, other)))
            if other in selected and pair not in found:
                found.add(pair)
                conflict_id = hashlib.sha1("|".join(pair).encode()).hexdigest()[:12]
                results.append(RecipeConflict(
                    conflict_id, "These selections pull in opposite directions",
                    f"{_item_label(identifier)} + {_item_label(other)}", "",
                    "structured_selections"))
    lowered = brief.casefold()
    if "arrangement.dynamics_restrained" in selected and re.search(
            r"\b(explosive|huge climax|massive climax|dramatic climax)\b", lowered):
        results.append(RecipeConflict(
            "restrained-vs-explosive", "Dynamics conflict",
            "Very restrained dynamics", "The brief asks for an explosive climax",
            "arrangement.dynamics"))
    return tuple(results)


def _join_words(values: Iterable[str]) -> str:
    items = [value for value in values if value]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def _pack(parts: Iterable[str], *, maximum: int = MAX_PROMPT_CHARS) -> str:
    """Keep complete high-priority sentences; never slice a prompt mid-word."""
    output = ""
    for raw in parts:
        part = _clean_text(raw, maximum=maximum).strip(" .,")
        if not part:
            continue
        candidate = f"{output} {part}.".strip()
        if len(candidate) <= maximum:
            output = candidate
    return output


def _music_parts(state: dict[str, Any], brief: str,
                 resolutions: dict[str, str]) -> list[str]:
    genres = [_item_label(value) for value in state["genres"]]
    instruments = state["instruments"]
    metadata = ["TrackType: Music, VocalType: Instrumental"]
    metadata.extend(f"Genre: {genre}" for genre in genres)
    if instruments:
        metadata.append("Instruments: " + ", ".join(
            _item_prompt(item["id"]) for item in instruments))
    parts = [", ".join(metadata)]
    context = _join_words(_item_prompt(value) for value in state["context"])
    moments = _join_words(_item_prompt(value) for value in state["moment"])
    roles = _join_words(_item_prompt(value) for value in state["cue_role"])
    voice = _item_prompt(state["voice_relationship"]) if state[
        "voice_relationship"] else ""
    role_bits = [value for value in (roles, moments, context) if value]
    if role_bits:
        sentence = "A " + ", for ".join(role_bits)
        if voice:
            sentence += f", {voice}"
        parts.append(sentence)
    elif voice:
        parts.append(voice.capitalize())
    if instruments:
        phrases = []
        for instrument in instruments:
            modifiers = [_item_prompt(value) for value in instrument["modifiers"]]
            label = _item_prompt(instrument["id"])
            phrases.append(" ".join([*modifiers, label]).strip())
        parts.append(_join_words(phrases))
    pace = _item_prompt(state["pace"]) if state["pace"] else ""
    bpm = f"around {state['exact_bpm']} BPM" if state["exact_bpm"] else ""
    rhythm = _join_words(_item_prompt(value) for value in state["rhythm_groove"])
    if pace or bpm or rhythm:
        parts.append(" ".join(value for value in (pace, bpm, rhythm) if value))
    moods = _join_words(_item_prompt(value) for value in state["moods"])
    energy = _item_prompt(state["energy"]) if state["energy"] else ""
    tension = _item_prompt(state["tension"]) if state["tension"] else ""
    if moods or energy or tension:
        parts.append(_join_words(value for value in (moods, energy, tension) if value))
    arrangement = state["arrangement"]
    arrangement_parts = [_item_prompt(value) for value in arrangement.values() if value]
    if arrangement_parts:
        if resolutions.get("restrained-vs-explosive") == "brief":
            arrangement_parts = [item for item in arrangement_parts
                                 if "restrained dynamics" not in item]
        parts.append(_join_words(arrangement_parts))
    production = state["production"]
    production_parts: list[str] = []
    for value in production.values():
        for identifier in _values(value):
            production_parts.append(_item_prompt(identifier))
    if production_parts:
        parts.append(_join_words(production_parts))
    ending = state["cue_behaviour"].get("ending")
    if ending:
        parts.append(_item_prompt(ending))
    if state["constraints"]:
        parts.append(_join_words(_item_prompt(value) for value in state["constraints"]))
    if brief and resolutions.get("restrained-vs-explosive") != "structured":
        parts.insert(2, brief)
    return parts


def _sfx_parts(state: dict[str, Any], brief: str) -> list[str]:
    source = _join_words(_item_prompt(value) for value in state["source"])
    action = _join_words(_item_prompt(value) for value in state["action"])
    material = _join_words(_item_prompt(value) for value in state["material"])
    family = _join_words(_item_prompt(value) for value in state["family"])
    core = " ".join(value for value in (material, source, action) if value)
    parts = ["TrackType: SFX", core or family]
    if brief:
        parts.insert(2, brief)
    motion = _item_prompt(state["motion"]) if state["motion"] else ""
    perspective = _item_prompt(state["perspective"]) if state["perspective"] else ""
    if motion or perspective:
        parts.append(_join_words(value for value in (motion, perspective) if value))
    envelope = _join_words(_item_prompt(value) for value in state["envelope"])
    character = _join_words(_item_prompt(value) for value in state["character"])
    intensity = _item_prompt(state["intensity"]) if state["intensity"] else ""
    if envelope or character or intensity:
        parts.append(_join_words(value for value in (intensity, envelope, character) if value))
    environment = _join_words(_item_prompt(value) for value in state["environment"])
    behaviour = _item_prompt(state["behaviour"]) if state["behaviour"] else ""
    if environment or behaviour:
        parts.append(_join_words(value for value in (environment, behaviour) if value))
    processing = _join_words(_item_prompt(value) for value in state["processing"])
    realism = _item_prompt(state["realism"]) if state["realism"] else ""
    if processing or realism:
        parts.append(_join_words(value for value in (realism, processing) if value))
    return parts


def compile_sound_recipe(capability: RecipeCapability,
                         semantic_state: dict[str, Any] | None,
                         source_free_text: str = "",
                         final_prompt_override: str | None = None) \
        -> CompiledSoundRecipe:
    if capability not in {"music", "sfx"}:
        raise ValueError("Choose Music or Sound Effect.")
    state = normalize_recipe(capability, semantic_state)
    brief = _clean_text(source_free_text or state.get("creative_brief"))
    state["creative_brief"] = brief
    conflicts = _conflicts(state, brief)
    resolutions = state.get("conflict_resolutions") or {}
    unresolved = tuple(item for item in conflicts if item.id not in resolutions)
    if final_prompt_override is not None:
        prompt = _clean_text(final_prompt_override, maximum=MAX_PROMPT_CHARS)
        if not prompt:
            raise ValueError("The final prompt override cannot be empty.")
    else:
        parts = (_music_parts(state, brief, resolutions) if capability == "music"
                 else _sfx_parts(state, brief))
        prompt = _pack(parts)
    return CompiledSoundRecipe(
        capability, state, brief, prompt, unresolved,
        MODEL_IDS[capability], SCHEMA_VERSIONS[capability],
        COMPILER_VERSIONS[capability], TAXONOMY_VERSION)
