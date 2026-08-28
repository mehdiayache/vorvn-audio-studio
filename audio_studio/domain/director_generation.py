"""Provider-neutral Director recipe validation."""

from __future__ import annotations

import re
from typing import Any

from audio_studio.domain.director_models import model_capability


DIRECTOR_GENERATION_KIND = "director_generate"


def capability(model_id: str, operation: str) -> tuple[dict[str, Any], dict[str, Any]]:
    return model_capability(model_id, operation)


def _parameter_values(
    selected: dict[str, Any], supplied: dict[str, Any],
) -> dict[str, Any]:
    return {
        field["key"]: supplied.get(field["key"], field.get("default"))
        for field in selected.get("parameters", [])
    }


def _allowed_ratios(
    selected: dict[str, Any], parameters: dict[str, Any],
) -> list[str]:
    for rule in selected.get("ratio_rules", []):
        if all(parameters.get(key) == expected
               for key, expected in rule.get("when", {}).items()):
            return list(rule["values"])
    return list(selected["ratios"])


def _validate_asset_list(
    field: dict[str, Any], value: Any, assets: dict[int, dict[str, Any]],
) -> None:
    label = field["label"]
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list.")
    maximum = int(field.get("max") or 0)
    if maximum and len(value) > maximum:
        raise ValueError(f"{label} accepts at most {maximum} items.")
    contract = field.get("item") or {}
    variants = {item["id"]: item for item in contract.get("variants", [])}
    names: set[str] = set()
    variant_counts = {key: 0 for key in variants}
    used_assets: set[int] = set()
    for item in value:
        if not isinstance(item, dict):
            raise ValueError(f"Every {label.lower()} item must be structured.")
        name = str(item.get("name") or "").strip()
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", name):
            raise ValueError(
                "Every subject needs a unique name using letters, numbers, _ or -.")
        if len(name) > int(contract.get("name_max_length") or 120):
            raise ValueError("A subject name is too long for this model.")
        if name.casefold() in names:
            raise ValueError("Subject reference names must be unique.")
        names.add(name.casefold())
        description = str(item.get("description") or "").strip()
        if contract.get("description_required") and not description:
            raise ValueError("Every subject needs a description.")
        if len(description) > int(
                contract.get("description_max_length") or 2000):
            raise ValueError("A subject description is too long for this model.")
        variant_id = str(item.get("variant") or "")
        variant = variants.get(variant_id)
        if not variant:
            raise ValueError("Choose a supported subject reference type.")
        variant_counts[variant_id] += 1
        asset_ids = item.get("asset_ids") or []
        if not isinstance(asset_ids, list):
            raise ValueError("Subject references must use canonical Assets.")
        if not (int(variant.get("min_assets") or 0) <= len(asset_ids)
                <= int(variant.get("max_assets") or 0)):
            raise ValueError(
                f"{variant['label']} needs between "
                f"{variant['min_assets']} and {variant['max_assets']} Assets.")
        for asset_id_value in asset_ids:
            asset_id = int(asset_id_value or 0)
            asset = assets.get(asset_id)
            if not asset or asset_id in used_assets:
                raise ValueError(
                    "Every subject reference must be a unique canonical Asset.")
            if str(asset.get("media_type") or "") not in variant["media_types"]:
                raise ValueError(
                    f"{variant['label']} received an incompatible Asset.")
            used_assets.add(asset_id)
        trim = variant.get("trim") or {}
        if trim:
            start = int(item.get("start_time_ms") or trim.get(
                "start_default") or 0)
            end = int(item.get("end_time_ms") or trim.get("end_default") or 0)
            duration = end - start
            if start < 0 or end <= start or not (
                int(trim["duration_min"]) <= duration
                <= int(trim["duration_max"])
            ):
                raise ValueError(
                    f"{variant['label']} trim must be between "
                    f"{int(trim['duration_min']) // 1000} and "
                    f"{int(trim['duration_max']) // 1000} seconds.")
            source = assets[int(asset_ids[0])]
            source_duration = int(source.get("duration_ms") or 0)
            if source_duration and end > source_duration:
                raise ValueError("Subject trim extends past the source video.")
        audio_contract = contract.get("audio") or {}
        audio_ids = item.get("audio_asset_ids") or []
        if not isinstance(audio_ids, list) or len(audio_ids) > int(
                audio_contract.get("max_assets") or 0):
            raise ValueError("A subject has too many audio references.")
        for asset_id_value in audio_ids:
            asset_id = int(asset_id_value or 0)
            asset = assets.get(asset_id)
            if not asset or asset_id in used_assets:
                raise ValueError(
                    "Every subject reference must be a unique canonical Asset.")
            if str(asset.get("media_type") or "") not in audio_contract.get(
                    "media_types", []):
                raise ValueError("Subject audio received an incompatible Asset.")
            duration = int(asset.get("duration_ms") or 0)
            if duration and not (
                int(audio_contract.get("duration_min_ms") or 0) <= duration
                <= int(audio_contract.get("duration_max_ms") or duration)
            ):
                raise ValueError("Subject audio must be between 5 and 30 seconds.")
            used_assets.add(asset_id)
    for limit in contract.get("combination_limits", []):
        condition = limit.get("when") or {}
        if not all(bool(variant_counts.get(key)) is expected
                   for key, expected in condition.items()):
            continue
        for key, allowed in (limit.get("max") or {}).items():
            if variant_counts.get(key, 0) > int(allowed):
                raise ValueError(
                    "This combination has too many subject references for the model.")


def _validate_parameter(
    field: dict[str, Any], value: Any, assets: dict[int, dict[str, Any]],
) -> None:
    label = field["label"]
    field_type = field["type"]
    if field_type == "boolean":
        if not isinstance(value, bool):
            raise ValueError(f"{label} must be on or off.")
        return
    if field_type in {"integer", "number"}:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{label} must be a number.")
        if field.get("min") is not None and value < field["min"]:
            raise ValueError(f"{label} is below this model's minimum.")
        if field.get("max") is not None and value > field["max"]:
            raise ValueError(f"{label} is above this model's maximum.")
        return
    if field_type == "select":
        options = [item["value"] if isinstance(item, dict) else item
                   for item in field.get("options", [])]
        if value not in options:
            raise ValueError(f"Choose a supported {label.lower()}.")
        return
    if field_type in {"text", "textarea"}:
        if not isinstance(value, str):
            raise ValueError(f"{label} must be text.")
        maximum = field.get("max_length")
        if maximum and len(value) > maximum:
            raise ValueError(f"{label} is too long for this model.")
        return
    if field_type == "structured_shots":
        if not isinstance(value, list):
            raise ValueError(f"{label} must be an ordered shot list.")
        item_contract = field.get("item") or {}
        maximum_items = int(item_contract.get("max_items") or 0)
        if maximum_items and len(value) > maximum_items:
            raise ValueError(f"{label} accepts at most {maximum_items} shots.")
        for shot in value:
            if (not isinstance(shot, dict)
                    or not str(shot.get("prompt") or "").strip()):
                raise ValueError("Every shot needs a direction.")
            duration = shot.get("duration")
            if not isinstance(duration, int):
                raise ValueError("Every shot needs a duration in seconds.")
            if not (item_contract.get("duration_min", 1) <= duration
                    <= item_contract.get("duration_max", 60)):
                raise ValueError(
                    "A shot duration is outside this model's limits.")
            if len(str(shot["prompt"])) > item_contract.get(
                    "prompt_max_length", 500):
                raise ValueError(
                    "A shot direction is too long for this model.")
        return
    if field_type == "asset_list":
        _validate_asset_list(field, value, assets)
        return
    raise ValueError(f"Unsupported Director field type: {field_type}.")


def _validate_input_asset(slot: dict[str, Any], asset: dict[str, Any]) -> None:
    """Enforce provider media limits before a paid request can be sent."""
    label = str(slot["label"])
    mime_types = slot.get("mime_types") or []
    if mime_types and str(asset.get("mime_type") or "") not in mime_types:
        raise ValueError(f"{label} must use a supported file format.")
    size = int(asset.get("size_bytes") or 0)
    if slot.get("max_bytes") and size > int(slot["max_bytes"]):
        raise ValueError(f"{label} is larger than this model accepts.")
    duration = int(asset.get("duration_ms") or 0)
    if slot.get("duration_min_ms") is not None and duration < int(
            slot["duration_min_ms"]):
        raise ValueError(f"{label} is shorter than this model accepts.")
    if slot.get("duration_max_ms") is not None and duration > int(
            slot["duration_max_ms"]):
        raise ValueError(f"{label} is longer than this model accepts.")
    width = int(asset.get("width") or 0)
    height = int(asset.get("height") or 0)
    if slot.get("min_width") is not None and width < int(slot["min_width"]):
        raise ValueError(f"{label} is too narrow for this model.")
    if slot.get("min_height") is not None and height < int(slot["min_height"]):
        raise ValueError(f"{label} is too short for this model.")
    if width > 0 and height > 0:
        ratio = width / height
        if (slot.get("aspect_ratio_min") is not None
                and ratio < float(slot["aspect_ratio_min"])):
            raise ValueError(f"{label} aspect ratio is too narrow.")
        if (slot.get("aspect_ratio_max") is not None
                and ratio > float(slot["aspect_ratio_max"])):
            raise ValueError(f"{label} aspect ratio is too wide.")


def validate_recipe(recipe: dict[str, Any], assets: dict[int, dict[str, Any]]) -> None:
    _, selected = capability(
        str(recipe.get("model_id") or ""), str(recipe.get("operation") or ""))
    prompt = str(recipe.get("prompt") or "").strip()
    prompt_contract = selected["prompt"]
    if prompt_contract["required"] and not prompt:
        raise ValueError("Write what you want to create.")
    if not prompt_contract["supported"] and prompt:
        raise ValueError("This model operation does not accept a prompt.")
    maximum = int(prompt_contract.get("max_length") or 20_000)
    if len(prompt) > maximum:
        raise ValueError(f"Keep the direction under {maximum:,} characters.")
    if recipe.get("negative_prompt") and not prompt_contract["negative_prompt"]:
        raise ValueError(
            "This model operation does not accept a negative prompt.")

    inputs = recipe.get("inputs") or []
    slots = {slot["role"]: slot for slot in selected["inputs"]}
    counts = {role: 0 for role in slots}
    seen_assets: set[int] = set()
    for position, item in enumerate(inputs):
        role = str(item.get("role") or "")
        slot = slots.get(role)
        if not slot:
            raise ValueError(f"Input role {role or position} is not supported.")
        asset_id = int(item.get("asset_id") or 0)
        asset = assets.get(asset_id)
        if not asset:
            raise ValueError(
                "Every Director reference must be a canonical Asset.")
        media_type = str(asset.get("media_type") or "")
        if media_type not in slot["media_types"]:
            raise ValueError(
                f"{slot['label']} does not accept "
                f"{media_type or 'that media type'}.")
        _validate_input_asset(slot, asset)
        if item.get("media_type") != media_type:
            raise ValueError(
                "The reference media type does not match its canonical Asset.")
        if asset_id in seen_assets:
            raise ValueError("The same Asset cannot fill two input positions.")
        seen_assets.add(asset_id)
        counts[role] += 1
        if counts[role] > slot["max"]:
            raise ValueError(
                f"{slot['label']} accepts at most {slot['max']} item(s).")
        if int(item.get("position", position)) != position:
            raise ValueError(
                "Director input positions must be contiguous and ordered.")
    missing = [slot["label"] for slot in selected["inputs"]
               if slot["required"] and counts[slot["role"]] == 0]
    if missing:
        raise ValueError(f"Add {' and '.join(missing)}.")
    for group in selected.get("required_any_of", []):
        if not any(counts.get(role, 0) for role in group):
            labels = [slots[role]["label"] for role in group]
            raise ValueError(f"Add {' or '.join(labels)}.")

    controls = recipe.get("controls") or {}
    parameters = controls.get("provider_parameters") or {}
    effective_parameters = _parameter_values(selected, parameters)
    for key, values in (("ratio", _allowed_ratios(
                            selected, effective_parameters)),
                        ("resolution", selected["resolutions"]),
                        ("fps", selected["fps"])):
        value = controls.get(key)
        if values and value not in values:
            raise ValueError(f"Unsupported {key} for this model operation.")
    duration = controls.get("duration")
    if selected["durations"] and duration not in selected["durations"]:
        raise ValueError("Unsupported duration for this model operation.")
    duration_range = selected.get("duration_range") or {}
    if duration_range:
        if not isinstance(duration, int):
            raise ValueError("Choose a duration for this model operation.")
        if not duration_range["min"] <= duration <= duration_range["max"]:
            raise ValueError("Duration is outside this model's limits.")
        step = int(duration_range.get("step") or 1)
        if (duration - duration_range["min"]) % step:
            raise ValueError("Duration does not match this model's step.")
    if controls.get("seed") is not None and not selected["supports_seed"]:
        raise ValueError("This model operation does not support a seed.")

    fields = {field["key"]: field for field in selected.get("parameters", [])}
    unknown = set(parameters) - set(fields)
    if unknown:
        raise ValueError(
            f"Unsupported model parameter: {sorted(unknown)[0]}.")
    for key, field in fields.items():
        value = parameters.get(key, field.get("default"))
        if value is None:
            if field.get("required"):
                raise ValueError(f"Choose {field['label'].lower()}.")
            continue
        visible_when = field.get("visible_when") or {}
        if visible_when and any(
            parameters.get(
                dependency, fields.get(dependency, {}).get("default")) != expected
            for dependency, expected in visible_when.items()
        ):
            if key in parameters and value not in (None, [], ""):
                raise ValueError(
                    f"{field['label']} is not available with these settings.")
            continue
        for conflict in field.get("conflicts_with", []):
            other = parameters.get(
                conflict, fields.get(conflict, {}).get("default"))
            if bool(value) and bool(other):
                raise ValueError(
                    f"{field['label']} cannot be used with "
                    f"{fields.get(conflict, {}).get('label', conflict)}.")
        _validate_parameter(field, value, assets)

    if parameters.get("customize_multi_shots"):
        shots = parameters.get("multi_prompt") or []
        if not shots:
            raise ValueError("Add at least one directed shot.")
        if sum(int(shot["duration"]) for shot in shots) != duration:
            raise ValueError(
                "Shot durations must add up to the video duration.")
