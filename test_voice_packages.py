#!/usr/bin/env python3
"""Pure contract tests: no provider calls and no voice creation."""

from services import voice_packages


english = voice_packages.plan("English")
assert [route["model_id"] for route in english["routes"]] == [
    "qwen-audio-3.0-tts-flash", "qwen3.5-omni-plus", "qwen3.5-omni-flash"]
assert all(route["model_id"] != "qwen-audio-3.0-tts-plus" for route in english["routes"])

arabic = voice_packages.plan("Arabic")
assert [route["model_id"] for route in arabic["routes"]] == [
    "qwen3.5-omni-plus", "qwen3.5-omni-flash"]
assert all(route["engine"] == "omni" for route in arabic["routes"])

exact_arabic = voice_packages.plan("ar", "exact")
assert exact_arabic["routes"] == []
assert next(item for item in exact_arabic["packages"] if item["id"] == "exact")["available"] is False

assert voice_packages.plan("en", "omni")["routes"] == english["routes"][1:]
print("voice package contracts passed")
