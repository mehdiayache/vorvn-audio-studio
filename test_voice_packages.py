#!/usr/bin/env python3
"""Pure contract tests: no provider calls and no voice creation."""

from audio_studio.domain import voice_packages


english = voice_packages.plan("English", region="intl")
assert [route["model_id"] for route in english["routes"]] == [
    "qwen-audio-3.0-tts-flash", "qwen3.5-omni-plus",
    "qwen3.5-omni-flash", "qwen3-tts-vc-2026-01-22"]
assert all(route["model_id"] != "qwen-audio-3.0-tts-plus" for route in english["routes"])

arabic = voice_packages.plan("Arabic", region="intl")
assert [route["model_id"] for route in arabic["routes"]] == [
    "qwen3.5-omni-plus", "qwen3.5-omni-flash"]
assert all(route["engine"] == "omni" for route in arabic["routes"])

exact_arabic = voice_packages.plan("ar", "exact", region="intl")
assert exact_arabic["routes"] == []
assert next(item for item in exact_arabic["packages"] if item["id"] == "exact")["available"] is False

assert voice_packages.plan("en", "omni", region="intl")["routes"] == english["routes"][1:3]
assert [route["engine"] for route in
        voice_packages.plan("en", "exact", region="intl")["routes"]] == [
            "audio", "qwen_tts"]
assert voice_packages.plan("en", region="beijing")["region_label"] == "Beijing"
assert voice_packages.plan("en", region="intl")["region_label"] == "Singapore"
print("voice package contracts passed")
