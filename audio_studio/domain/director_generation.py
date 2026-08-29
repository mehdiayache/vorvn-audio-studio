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
    counts: dict[str, int] | None = None,
) -> list[str]:
    mode = _input_mode(selected, counts or {})
    if mode:
        return list(mode["ratios"])
    for rule in selected.get("ratio_rules", []):
        if all(parameters.get(key) == expected
               for key, expected in rule.get("when", {}).items()):
            return list(rule["values"])
    return list(selected["ratios"])


def _input_mode(
    selected: dict[str, Any], counts: dict[str, int],
) -> dict[str, Any] | None:
    for mode in selected.get("input_modes", []):
        matches = True
        for role, limit in (mode.get("when_counts") or {}).items():
            count = counts.get(role, 0)
            if count < int(limit.get("min") or 0):
                matches = False
            if limit.get("max") is not None and count > int(limit["max"]):
                matches = False
        if matches:
            return mode
    return None


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
            _validate_input_asset({
                "label": variant["label"],
                **(variant.get("constraints") or {}),
            }, asset)
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


def input_asset_compatibility(
    slot: dict[str, Any], asset: dict[str, Any],
) -> dict[str, Any]:
    """Return the canonical compatibility state used by picker and submit.

    Unknown technical metadata is deliberately not compatible: the operator
    must re-import/analyse that media before it can reach a paid provider call.
    """
    label = str(slot["label"])
    violations: list[str] = []
    unknown: list[str] = []
    media_type = str(asset.get("media_type") or "")
    allowed_media_types = slot.get("media_types") or []
    if allowed_media_types and not media_type:
        unknown.append(f"{label} media type is not known.")
    elif allowed_media_types and media_type not in allowed_media_types:
        violations.append(f"{label} does not accept {media_type}.")
    mime_types = slot.get("mime_types") or []
    mime_type = str(asset.get("mime_type") or "")
    if mime_types and not mime_type:
        unknown.append(f"{label} file format is not known.")
    elif mime_types and mime_type not in mime_types:
        violations.append(f"{label} must use a supported file format.")
    size_value = asset.get("size_bytes")
    if slot.get("max_bytes") is not None and size_value is None:
        unknown.append(f"{label} file size is not known.")
    elif slot.get("max_bytes") is not None and int(size_value) > int(slot["max_bytes"]):
        violations.append(f"{label} is larger than this model accepts.")
    duration_value = asset.get("duration_ms")
    if (slot.get("duration_min_ms") is not None
            or slot.get("duration_max_ms") is not None) and duration_value is None:
        unknown.append(f"{label} duration is not known.")
    elif duration_value is not None:
        duration = int(duration_value)
        if slot.get("duration_min_ms") is not None and duration < int(slot["duration_min_ms"]):
            violations.append(f"{label} is shorter than this model accepts.")
        if slot.get("duration_max_ms") is not None and duration > int(slot["duration_max_ms"]):
            violations.append(f"{label} is longer than this model accepts.")
    dimension_constraints = any(slot.get(key) is not None for key in (
        "min_width", "min_height", "max_width", "max_height", "max_pixels",
        "aspect_ratio_min", "aspect_ratio_max",
    ))
    width_value, height_value = asset.get("width"), asset.get("height")
    if dimension_constraints and (
        width_value is None or height_value is None
        or int(width_value) <= 0 or int(height_value) <= 0
    ):
        unknown.append(f"{label} dimensions are not known.")
    elif width_value is not None and height_value is not None:
        width, height = int(width_value), int(height_value)
        if slot.get("min_width") is not None and width < int(slot["min_width"]):
            violations.append(f"{label} is too narrow for this model.")
        if slot.get("min_height") is not None and height < int(slot["min_height"]):
            violations.append(f"{label} is too short for this model.")
        if slot.get("max_width") is not None and width > int(slot["max_width"]):
            violations.append(f"{label} is too wide for this model.")
        if slot.get("max_height") is not None and height > int(slot["max_height"]):
            violations.append(f"{label} is too tall for this model.")
        if slot.get("max_pixels") is not None and width * height > int(slot["max_pixels"]):
            violations.append(f"{label} resolution is too large for this model.")
        ratio = width / height
        if (slot.get("aspect_ratio_min") is not None
                and ratio < float(slot["aspect_ratio_min"])):
            violations.append(f"{label} aspect ratio is too narrow.")
        if (slot.get("aspect_ratio_max") is not None
                and ratio > float(slot["aspect_ratio_max"])):
            violations.append(f"{label} aspect ratio is too wide.")
    fps_value = asset.get("frame_rate")
    if (slot.get("fps_min") is not None
            or slot.get("fps_max") is not None) and fps_value is None:
        unknown.append(f"{label} frame rate is not known.")
    elif fps_value is not None:
        fps = float(fps_value)
        if slot.get("fps_min") is not None and fps < float(slot["fps_min"]):
            violations.append(f"{label} frame rate is too low for this model.")
        if slot.get("fps_max") is not None and fps > float(slot["fps_max"]):
            violations.append(f"{label} frame rate is too high for this model.")
    if violations:
        return {"state": "incompatible", "reasons": violations}
    if unknown:
        return {"state": "unknown", "reasons": unknown}
    return {"state": "compatible", "reasons": []}


def _validate_input_asset(slot: dict[str, Any], asset: dict[str, Any]) -> None:
    """Enforce the same picker contract before a paid request is sent."""
    result = input_asset_compatibility(slot, asset)
    if result["state"] == "compatible":
        return
    reason = result["reasons"][0]
    if result["state"] == "unknown":
        raise ValueError(
            f"{reason} Re-import this media so AUVI can inspect it before generation.")
    raise ValueError(reason)


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
    ordered_roles = list(selected.get("input_order") or [])
    if ordered_roles:
        role_rank = {role: index for index, role in enumerate(ordered_roles)}
        actual = [role_rank.get(str(item.get("role") or ""), len(role_rank))
                  for item in inputs]
        if actual != sorted(actual):
            raise ValueError(
                "Director references are not in their semantic order. "
                "Place the Start frame before the End frame.")

    controls = recipe.get("controls") or {}
    parameters = controls.get("provider_parameters") or {}
    effective_parameters = _parameter_values(selected, parameters)
    input_mode = _input_mode(selected, counts)
    if selected.get("input_modes") and input_mode is None:
        raise ValueError("This combination of references is not supported.")
    for key, values in (("ratio", _allowed_ratios(
                            selected, effective_parameters, counts)),
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

    if input_mode:
        for key, allowed in (input_mode.get("parameter_values") or {}).items():
            value = effective_parameters.get(key)
            if value not in allowed:
                label = fields.get(key, {}).get("label", key)
                raise ValueError(
                    f"{label} is not available with these references.")
        element_policy = input_mode.get("elements") or {}
        elements = effective_parameters.get("elements") or []
        available = element_policy.get("available", True)
        when = element_policy.get("available_when") or {}
        if when and not all(effective_parameters.get(key) == expected
                            for key, expected in when.items()):
            available = False
        if elements and not available:
            raise ValueError(
                "Character references require directed multi-shot mode with "
                "this video input.")
        video_subjects = sum(
            1 for item in elements if item.get("variant") == "video")
        nested_images = sum(
            len(item.get("asset_ids") or []) for item in elements
            if item.get("variant") == "images")
        direct_images = counts.get("reference-image", 0)
        maximum_videos = int(element_policy.get("max_video_subjects") or 0)
        if maximum_videos and video_subjects > maximum_videos:
            raise ValueError("This reference mode has too many video subjects.")
        maximum_images = int(
            element_policy.get("max_image_assets_total") or 0)
        if maximum_images and direct_images + nested_images > maximum_images:
            raise ValueError("This reference mode has too many image references.")
        if video_subjects:
            mixed_maximum = element_policy.get(
                "max_image_assets_with_video_subjects")
            if mixed_maximum is not None and direct_images + nested_images > int(
                    mixed_maximum):
                raise ValueError(
                    "This mix of image and video subjects has too many images.")
            if (not element_policy.get(
                    "allow_video_subject_with_images", True)
                    and direct_images + nested_images):
                raise ValueError(
                    "Video subjects cannot be mixed with image references in "
                    "this reference mode.")

    if parameters.get("customize_multi_shots"):
        shots = parameters.get("multi_prompt") or []
        if not shots:
            raise ValueError("Add at least one directed shot.")
        if sum(int(shot["duration"]) for shot in shots) != duration:
            raise ValueError(
                "Shot durations must add up to the video duration.")
