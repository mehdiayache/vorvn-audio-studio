"""Versioned Director model manifests owned by the backend.

The Director UI renders these declarations. Provider request shapes stay in
model adapters and never leak into React.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal


ModelStatus = Literal["draft", "verified", "enabled"]
MANIFEST_VERSION = "2026-08-29.3"

# Exact enabled KIE contracts used to build the manifests below. Begin at
# KIE's model index, then use the page whose request example names the same
# provider_model_id. Generic Kling 3.0 and neighbouring Kling routes are not
# evidence for these Omni contracts.
KIE_CONTRACT_EVIDENCE: dict[str, dict[str, str]] = {
    "kling-3.0-omni/text-to-video": {
        "index": "https://docs.kie.ai/llms.txt",
        "schema": "https://docs.kie.ai/market/kling/v3-omni-text-to-video",
        "endpoint": "/api/v1/jobs/createTask",
        "retrieved": "2026-08-29",
    },
    "kling-3.0-omni/image-to-video": {
        "index": "https://docs.kie.ai/llms.txt",
        "schema": "https://docs.kie.ai/market/kling/v3-omni-image-to-video",
        "endpoint": "/api/v1/jobs/createTask",
        "retrieved": "2026-08-29",
    },
    "kling-3.0-omni/reference-to-video": {
        "index": "https://docs.kie.ai/llms.txt",
        "schema": "https://docs.kie.ai/market/kling/v3-omni-reference-to-video",
        "endpoint": "/api/v1/jobs/createTask",
        "retrieved": "2026-08-29",
    },
}


AVAILABLE_MODEL_STATUSES = {"enabled"}


OPERATION_TAXONOMY: tuple[dict[str, str], ...] = (
    {"id": "image_generate", "label": "Create image",
     "detail": "Create a new still visual"},
    {"id": "image_edit", "label": "Edit image",
     "detail": "Change an existing image"},
    {"id": "image_set", "label": "Create image set",
     "detail": "Create a related set of still visuals"},
    {"id": "text_to_video", "label": "Create video",
     "detail": "Create motion from a written direction"},
    {"id": "image_to_video", "label": "Animate image",
     "detail": "Create motion from a source image"},
    {"id": "frames_to_video", "label": "Animate between frames",
     "detail": "Move from a first frame to a final frame"},
    {"id": "audio_driven_image_to_video", "label": "Animate from audio",
     "detail": "Drive an image with an audio performance"},
    {"id": "video_continue", "label": "Continue video",
     "detail": "Extend an existing video"},
    {"id": "video_continue_to_frame", "label": "Continue to frame",
     "detail": "Extend a video toward a chosen final frame"},
    {"id": "reference_to_video", "label": "Direct with references",
     "detail": "Use visual references to guide a new video"},
    {"id": "video_edit", "label": "Edit video",
     "detail": "Change an existing video"},
    {"id": "video_transform", "label": "Transform video",
     "detail": "Restyle a video while preserving its action"},
    {"id": "motion_transfer", "label": "Transfer motion",
     "detail": "Apply motion from one source to another"},
    {"id": "character_swap", "label": "Replace character",
     "detail": "Replace a character while preserving motion"},
    {"id": "talking_video", "label": "Create talking video",
     "detail": "Animate a character from a voice performance"},
    {"id": "video_lip_sync", "label": "Lip-sync video",
     "detail": "Synchronize an existing video to speech"},
)


def _prompt(*, required: bool = True, maximum: int = 3072) -> dict[str, Any]:
    return {
        "supported": True, "required": required,
        "negative_prompt": False, "max_length": maximum,
    }


def _slot(role: str, label: str, media_type: str, *, required: bool,
          maximum: int = 1, **constraints: Any) -> dict[str, Any]:
    return {
        "role": role, "label": label, "required": required,
        "media_types": [media_type], "max": maximum,
        **constraints,
    }


def _field(key: str, field_type: str, label: str, **values: Any) -> dict[str, Any]:
    return {"key": key, "type": field_type, "label": label, **values}


def _kling_video_fields() -> list[dict[str, Any]]:
    return [
        _field(
            "audio", "boolean", "Generate audio",
            default=False, exposure="primary",
        ),
        _field(
            "customize_multi_shots", "boolean", "Direct multiple shots",
            default=False, exposure="advanced",
            conflicts_with=["prefer_multi_shots"],
        ),
        _field(
            "prefer_multi_shots", "boolean", "Plan shots automatically",
            default=False, exposure="advanced",
            conflicts_with=["customize_multi_shots"],
        ),
        _field(
            "multi_prompt", "structured_shots", "Shots", default=[],
            required=True, exposure="advanced",
            visible_when={"customize_multi_shots": True},
            item={"prompt_max_length": 512, "duration_min": 1,
                  "duration_max": 15, "max_items": 6},
        ),
        _field(
            "elements", "asset_list", "Characters & subjects", default=[],
            max=3, exposure="advanced",
            item={
                "name_max_length": 64,
                "description_max_length": 300,
                "description_required": True,
                "variants": [
                    {
                        "id": "images", "label": "Image subject",
                        "media_types": ["image"],
                        "min_assets": 2, "max_assets": 4,
                        "constraints": {
                            "mime_types": ["image/jpeg", "image/png"],
                            "max_bytes": 50_000_000,
                            "min_width": 300, "min_height": 300,
                            "aspect_ratio_min": 0.4,
                            "aspect_ratio_max": 2.5,
                        },
                    },
                    {
                        "id": "video", "label": "Video character",
                        "media_types": ["video"],
                        "min_assets": 1, "max_assets": 1,
                        "constraints": {
                            "mime_types": ["video/mp4", "video/quicktime"],
                            "max_bytes": 200_000_000,
                            "min_width": 700, "min_height": 700,
                            "max_width": 4553, "max_height": 4553,
                            "max_pixels": 8_294_400,
                            "aspect_ratio_min": 0.4,
                            "aspect_ratio_max": 2.0,
                            "fps_min": 24, "fps_max": 60,
                        },
                        "trim": {
                            "start_default": 0, "end_default": 8000,
                            "duration_min": 3000, "duration_max": 8000,
                        },
                    },
                ],
                "audio": {
                    "media_types": ["audio"], "max_assets": 1,
                    "duration_min_ms": 5000,
                    "duration_max_ms": 30000,
                },
            },
        ),
    ]


def _kling_operation(
    operation: str, *, inputs: tuple[dict[str, Any], ...] = (),
    required_any_of: tuple[tuple[str, ...], ...] = (),
    ratios: tuple[str, ...] = ("16:9", "9:16", "1:1"),
    ratio_rules: tuple[dict[str, Any], ...] = (),
) -> dict[str, Any]:
    return {
        "operation": operation,
        "output_media_type": "video",
        "prompt": _prompt(),
        "inputs": list(inputs),
        "input_order": [],
        "input_modes": [],
        "required_any_of": [list(group) for group in required_any_of],
        "ratios": list(ratios),
        "ratio_rules": [deepcopy(rule) for rule in ratio_rules],
        "resolutions": ["720p", "1080p", "4k"],
        "durations": [],
        "duration_range": {"min": 3, "max": 15, "step": 1,
                           "default": 5},
        "fps": [],
        "supports_seed": False,
        "supports_cancel": False,
        "parameters": _kling_video_fields(),
        "output": {"mime_type": "video/mp4", "extension": "mp4"},
    }


MODELS: tuple[dict[str, Any], ...] = (
    {
        "id": "kling-3.0-omni/text-to-video",
        "label": "Kling 3.0 Omni",
        "provider": "KIE",
        "provider_id": "kie",
        "provider_model_id": "kling-3.0-omni/text-to-video",
        "adapter_key": "kie-kling-omni",
        "adapter_version": "kie-kling-omni-1",
        "capability_manifest_version": MANIFEST_VERSION,
        "status": "enabled",
        "description": "Create video from a written direction; advanced audio, shot and persistent-subject controls remain available in model settings",
        "operations": [_kling_operation("text_to_video")],
    },
    {
        "id": "kling-3.0-omni/image-to-video",
        "label": "Kling 3.0 Omni",
        "provider": "KIE",
        "provider_id": "kie",
        "provider_model_id": "kling-3.0-omni/image-to-video",
        "adapter_key": "kie-kling-omni",
        "adapter_version": "kie-kling-omni-1",
        "capability_manifest_version": MANIFEST_VERSION,
        "status": "enabled",
        "description": "Animate one source image or direct motion between a start and end frame",
        "operations": [
            _kling_operation(
                "image_to_video",
                inputs=(_slot(
                    "source-image", "Source image", "image", required=True,
                    mime_types=["image/jpeg", "image/png"],
                    max_bytes=50_000_000,
                    min_width=300, min_height=300,
                    aspect_ratio_min=0.4, aspect_ratio_max=2.5,
                ),),
                ratios=("auto", "16:9", "9:16", "1:1"),
                ratio_rules=(
                    {
                        "when": {"customize_multi_shots": False},
                        "values": ["auto"], "default": "auto",
                    },
                    {
                        "when": {"customize_multi_shots": True},
                        "values": ["16:9", "9:16", "1:1"],
                        "default": "16:9",
                    },
                ),
            ),
            {
                **_kling_operation(
                    "frames_to_video",
                    inputs=(
                        _slot(
                            "start-frame", "Start frame", "image",
                            required=True,
                            mime_types=["image/jpeg", "image/png"],
                            max_bytes=50_000_000,
                            min_width=300, min_height=300,
                            aspect_ratio_min=0.4, aspect_ratio_max=2.5,
                        ),
                        _slot(
                            "end-frame", "End frame", "image",
                            required=True,
                            mime_types=["image/jpeg", "image/png"],
                            max_bytes=50_000_000,
                            min_width=300, min_height=300,
                            aspect_ratio_min=0.4, aspect_ratio_max=2.5,
                        ),
                    ),
                    ratios=("auto",),
                ),
                "parameters": [
                    field for field in _kling_video_fields()
                    if field["key"] not in {
                        "customize_multi_shots", "prefer_multi_shots",
                        "multi_prompt",
                    }
                ],
                "input_order": ["start-frame", "end-frame"],
            },
        ],
    },
    {
        "id": "kling-3.0-omni/reference-to-video",
        "label": "Kling 3.0 Omni",
        "provider": "KIE",
        "provider_id": "kie",
        "provider_model_id": "kling-3.0-omni/reference-to-video",
        "adapter_key": "kie-kling-omni",
        "adapter_version": "kie-kling-omni-1",
        "capability_manifest_version": MANIFEST_VERSION,
        "status": "enabled",
        "description": "Create video from image and video references",
        "operations": [{
            **_kling_operation(
                "reference_to_video",
                inputs=(
                    _slot(
                        "reference-image", "Reference images", "image",
                        required=False, maximum=7,
                        mime_types=["image/jpeg", "image/png"],
                        max_bytes=50_000_000,
                        min_width=300, min_height=300,
                        aspect_ratio_min=0.4, aspect_ratio_max=2.5,
                    ),
                    _slot(
                        "reference-video", "Reference video", "video",
                        required=False,
                        mime_types=["video/mp4", "video/quicktime"],
                        max_bytes=200_000_000,
                        duration_min_ms=3000, duration_max_ms=15_500,
                        min_width=700, min_height=700,
                        max_width=4553, max_height=4553,
                        max_pixels=8_294_400,
                        aspect_ratio_min=0.4, aspect_ratio_max=2.0,
                        fps_min=24, fps_max=60,
                    ),
                ),
                required_any_of=(("reference-image", "reference-video"),),
                ratios=("auto", "16:9", "9:16", "1:1"),
            ),
            # KIE exposes three distinct request contracts behind the same
            # model route. The UI and validator consume this declaration;
            # neither guesses from the provider name.
            "input_modes": [
                {
                    "id": "images",
                    "when_counts": {
                        "reference-image": {"min": 1},
                        "reference-video": {"max": 0},
                    },
                    "ratios": ["16:9", "9:16", "1:1"],
                    "default_ratio": "16:9",
                    "parameter_values": {"audio": [False, True]},
                    "elements": {
                        "available": True,
                        "max_video_subjects": 3,
                        "max_image_assets_total": 7,
                        "max_image_assets_with_video_subjects": 4,
                    },
                },
                {
                    "id": "video",
                    "when_counts": {
                        "reference-image": {"max": 0},
                        "reference-video": {"min": 1, "max": 1},
                    },
                    "ratios": ["auto"],
                    "default_ratio": "auto",
                    "parameter_values": {"audio": [False]},
                    "elements": {
                        "available_when": {"customize_multi_shots": True},
                        "max_video_subjects": 1,
                        "max_image_assets_total": 4,
                        "allow_video_subject_with_images": False,
                    },
                },
                {
                    "id": "video-images",
                    "when_counts": {
                        "reference-image": {"min": 1, "max": 4},
                        "reference-video": {"min": 1, "max": 1},
                    },
                    "ratios": ["16:9", "9:16", "1:1"],
                    "default_ratio": "16:9",
                    "parameter_values": {"audio": [False]},
                    "elements": {
                        "available_when": {"customize_multi_shots": True},
                        "max_video_subjects": 1,
                        "max_image_assets_total": 4,
                        "allow_video_subject_with_images": False,
                    },
                },
            ],
        }],
    },
    {
        "id": "kling-3.0-omni/transformation",
        "label": "Kling 3.0 Omni",
        "provider": "KIE",
        "provider_id": "kie",
        "provider_model_id": "kling-3.0-omni/transformation",
        "adapter_key": "kie-kling-omni",
        "adapter_version": "kie-kling-omni-1",
        "capability_manifest_version": MANIFEST_VERSION,
        "status": "draft",
        "description": "Transform an existing video with optional image references",
        "operations": [_kling_operation(
            "video_transform",
            inputs=(
                _slot("source-video", "Source video", "video",
                      required=True),
                _slot("reference-image", "Reference images", "image",
                      required=False, maximum=4),
            ),
            ratios=("auto", "16:9", "9:16", "1:1"),
        )],
    },
)


def models(*, include_unavailable: bool = False) -> list[dict[str, Any]]:
    selected = MODELS if include_unavailable else tuple(
        model for model in MODELS
        if model["status"] in AVAILABLE_MODEL_STATUSES)
    return deepcopy(list(selected))


def model_capability(
    model_id: str, operation: str, *, require_enabled: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]]:
    for model in MODELS:
        if model["id"] != model_id:
            continue
        if require_enabled and model["status"] not in AVAILABLE_MODEL_STATUSES:
            break
        for item in model["operations"]:
            if item["operation"] == operation:
                return deepcopy(model), deepcopy(item)
    raise ValueError("That model does not support the selected Director operation.")


def operations_for(models_value: list[dict[str, Any]]) -> list[dict[str, str]]:
    available = {
        operation["operation"]
        for model in models_value for operation in model["operations"]
    }
    return [deepcopy(item) for item in OPERATION_TAXONOMY
            if item["id"] in available]
