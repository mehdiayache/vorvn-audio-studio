"""Provider-neutral Director generation capabilities and recipe validation."""

from __future__ import annotations

from typing import Any


DIRECTOR_GENERATION_KIND = "director_generate"

OPERATIONS = (
    {"id": "image", "label": "Image", "detail": "Create a still visual"},
    {"id": "image-to-video", "label": "Image to video", "detail": "Animate one source image"},
    {"id": "frames-to-video", "label": "Frames to video", "detail": "Move between a start and end frame"},
    {"id": "reference-video", "label": "Reference video", "detail": "Guide motion with media references"},
    {"id": "talking-video", "label": "Talking video", "detail": "Animate a character from audio"},
)


def _prompt(*, required: bool, negative: bool) -> dict[str, bool]:
    return {"supported": True, "required": required,
            "negative_prompt": negative}


def _slot(role: str, label: str, *, required: bool,
          media_types: tuple[str, ...], maximum: int) -> dict[str, Any]:
    return {"role": role, "label": label, "required": required,
            "media_types": list(media_types), "max": maximum}


CAPABILITIES: tuple[dict[str, Any], ...] = (
    {
        "id": "model-a", "label": "Model A", "provider": "Prototype Lab",
        "version": "a-1", "description": "Still images and single-image motion",
        "operations": (
            {
                "operation": "image", "output_media_type": "image",
                "prompt": _prompt(required=True, negative=True),
                "inputs": (_slot("reference", "Reference", required=False,
                                 media_types=("image",), maximum=1),),
                "ratios": ("1:1", "16:9", "9:16", "4:5"),
                "resolutions": ("1K", "2K"), "durations": (), "fps": (),
                "supports_seed": True, "supports_cancel": True,
            },
            {
                "operation": "image-to-video", "output_media_type": "video",
                "prompt": _prompt(required=False, negative=True),
                "inputs": (_slot("source-image", "Source image", required=True,
                                 media_types=("image",), maximum=1),),
                "ratios": ("1:1", "16:9", "9:16", "4:5"),
                "resolutions": ("720p", "1080p"), "durations": (5, 8),
                "fps": (24,), "supports_seed": True, "supports_cancel": True,
            },
        ),
    },
    {
        "id": "model-b", "label": "Model B", "provider": "Prototype Lab",
        "version": "b-1", "description": "Start and end frame motion",
        "operations": (
            {
                "operation": "frames-to-video", "output_media_type": "video",
                "prompt": _prompt(required=False, negative=True),
                "inputs": (
                    _slot("start-frame", "Start frame", required=True,
                          media_types=("image",), maximum=1),
                    _slot("end-frame", "End frame", required=False,
                          media_types=("image",), maximum=1),
                ),
                "ratios": ("16:9", "9:16", "1:1"),
                "resolutions": ("720p", "1080p"), "durations": (5, 8, 10),
                "fps": (24, 30), "supports_seed": True, "supports_cancel": True,
            },
        ),
    },
    {
        "id": "model-c", "label": "Model C", "provider": "Prototype Lab",
        "version": "c-1", "description": "Multiple visual references with optional audio",
        "operations": (
            {
                "operation": "reference-video", "output_media_type": "video",
                "prompt": _prompt(required=True, negative=True),
                "inputs": (
                    _slot("reference", "Reference image", required=True,
                          media_types=("image",), maximum=3),
                    _slot("motion-reference", "Motion reference", required=False,
                          media_types=("video",), maximum=1),
                    _slot("audio-reference", "Audio reference", required=False,
                          media_types=("audio",), maximum=1),
                ),
                "ratios": ("16:9", "9:16", "1:1"),
                "resolutions": ("720p", "1080p"), "durations": (5, 10, 15),
                "fps": (24, 30), "supports_seed": True, "supports_cancel": True,
            },
            {
                "operation": "talking-video", "output_media_type": "video",
                "prompt": _prompt(required=False, negative=True),
                "inputs": (
                    _slot("character", "Character", required=True,
                          media_types=("image",), maximum=1),
                    _slot("voice", "Voice audio", required=True,
                          media_types=("audio",), maximum=1),
                    _slot("reference", "Reference image", required=False,
                          media_types=("image",), maximum=2),
                ),
                "ratios": ("16:9", "9:16", "1:1"),
                "resolutions": ("720p", "1080p"), "durations": (5, 10, 15),
                "fps": (24, 30), "supports_seed": True, "supports_cancel": True,
            },
        ),
    },
)


def capability(model_id: str, operation: str) -> tuple[dict[str, Any], dict[str, Any]]:
    for model in CAPABILITIES:
        if model["id"] != model_id:
            continue
        for item in model["operations"]:
            if item["operation"] == operation:
                return model, item
    raise ValueError("That model does not support the selected Director operation.")


def validate_recipe(recipe: dict[str, Any], assets: dict[int, dict[str, Any]]) -> None:
    _, selected = capability(str(recipe.get("model_id") or ""),
                             str(recipe.get("operation") or ""))
    prompt = str(recipe.get("prompt") or "").strip()
    prompt_contract = selected["prompt"]
    if prompt_contract["required"] and not prompt:
        raise ValueError("Write what you want to create.")
    if not prompt_contract["supported"] and prompt:
        raise ValueError("This model operation does not accept a prompt.")
    if recipe.get("negative_prompt") and not prompt_contract["negative_prompt"]:
        raise ValueError("This model operation does not accept a negative prompt.")

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
            raise ValueError("Every Director reference must be a canonical Asset.")
        media_type = str(asset.get("media_type") or "")
        if media_type not in slot["media_types"]:
            raise ValueError(f"{slot['label']} does not accept {media_type or 'that media type'}.")
        if item.get("media_type") != media_type:
            raise ValueError("The reference media type does not match its canonical Asset.")
        if asset_id in seen_assets:
            raise ValueError("The same Asset cannot fill two input positions.")
        seen_assets.add(asset_id)
        counts[role] += 1
        if counts[role] > slot["max"]:
            raise ValueError(f"{slot['label']} accepts at most {slot['max']} item(s).")
        if int(item.get("position", position)) != position:
            raise ValueError("Director input positions must be contiguous and ordered.")
    missing = [slot["label"] for slot in selected["inputs"]
               if slot["required"] and counts[slot["role"]] == 0]
    if missing:
        raise ValueError(f"Add {' and '.join(missing)}.")

    controls = recipe.get("controls") or {}
    for key, values in (("ratio", selected["ratios"]),
                        ("resolution", selected["resolutions"]),
                        ("duration", selected["durations"]),
                        ("fps", selected["fps"])):
        value = controls.get(key)
        if values and value not in values:
            raise ValueError(f"Unsupported {key} for this model operation.")
    if controls.get("seed") is not None and not selected["supports_seed"]:
        raise ValueError("This model operation does not support a seed.")

