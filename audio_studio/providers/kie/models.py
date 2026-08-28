"""KIE model request translation; Director remains provider-neutral."""

from __future__ import annotations

from typing import Any


class KieModelAdapter:
    provider_id = "kie"

    _URL_FIELD_BY_ROLE = {
        "source-image": "image_urls",
        "reference-image": "image_urls",
        "reference-video": "video_urls",
        "source-video": "video_urls",
    }

    def request(
        self, *, model: dict[str, Any], operation: dict[str, Any],
        recipe: dict[str, Any], materialized_inputs: list[dict[str, Any]],
        materialized_parameters: dict[str, Any],
    ) -> dict[str, Any]:
        controls = recipe.get("controls") or {}
        input_payload: dict[str, Any] = {
            "prompt": str(recipe.get("prompt") or "").strip(),
            "resolution": controls.get("resolution"),
            "aspect_ratio": controls.get("ratio"),
            "duration": controls.get("duration"),
        }
        for key, value in (controls.get("provider_parameters") or {}).items():
            if key in materialized_parameters:
                continue
            input_payload[key] = value
        for key, groups in materialized_parameters.items():
            input_payload[key] = [self._element(group) for group in groups]
        for item in materialized_inputs:
            field = self._URL_FIELD_BY_ROLE.get(str(item.get("role") or ""))
            if not field:
                raise ValueError(
                    "That KIE input role has no request translation.")
            input_payload.setdefault(field, []).append(item["url"])
        return {
            "model": model["provider_model_id"],
            "input": {
                key: value for key, value in input_payload.items()
                if value not in (None, "", [])
            },
        }

    @staticmethod
    def _element(group: dict[str, Any]) -> dict[str, Any]:
        element = {
            "name": str(group.get("name") or "").strip(),
            "description": str(group.get("description") or "").strip(),
            "element_input_urls": [item["url"] for item in group["assets"]],
        }
        audio_urls = [item["url"] for item in group.get("audio_assets") or []]
        if audio_urls:
            element["element_input_audio_urls"] = audio_urls
        if group.get("variant") == "video":
            element["start_time"] = int(group.get("start_time_ms") or 0)
            element["end_time"] = int(group.get("end_time_ms") or 8000)
        return element
