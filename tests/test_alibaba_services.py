"""Contract tests for the two Alibaba speech products (no network calls)."""

import base64
import json
import os

from audio_studio.providers.alibaba import omni
from audio_studio.providers.alibaba import config
from audio_studio.providers.alibaba import speech_generation as speech
from audio_studio.domain import speech_fidelity as fidelity
from audio_studio.domain import voice_registry
from types import SimpleNamespace


def check(label, condition):
    if not condition:
        raise AssertionError(label)
    print("PASS", label)


check("Arabic defaults to Omni", config.recommended_engine("Arabic") == "omni")
check("English defaults to exact-script Audio", config.recommended_engine("English") == "audio")
check("Audio cloning does not advertise Arabic", "ar" not in config.AUDIO_CLONE_LANGUAGES)
check("Omni cloning advertises Arabic", config.OMNI_CLONE_LANGUAGES["ar"] == "Arabic")
check("Qwen3 TTS cloning keeps its documented ten-language boundary",
      "en" in config.QWEN_TTS_CLONE_LANGUAGES
      and "ar" not in config.QWEN_TTS_CLONE_LANGUAGES)
check("Audio clone is Flash-only", config.CAPABILITIES["audio"]["clone_tiers"] == ["flash"])
check("Only Audio advertises inline delivery tags",
      config.CAPABILITIES["audio"]["inline_tags"] is True
      and config.CAPABILITIES["omni"]["inline_tags"] is False
      and config.CAPABILITIES["qwen_tts"]["inline_tags"] is False)
check("Only conversational Omni requires a returned-text fidelity check",
      config.CAPABILITIES["audio"]["fidelity_check"] is False
      and config.CAPABILITIES["omni"]["fidelity_check"] is True
      and config.CAPABILITIES["qwen_tts"]["fidelity_check"] is False)

pcm = bytes(range(64))
encoded = base64.b64encode(pcm).decode()
# Deliberately split on non-Base64 boundaries. Decoding each event separately
# would fail or lose bytes; the implementation must concatenate first.
pieces = [encoded[:7], encoded[7:31], encoded[31:]]
events = [
    {"id": "req-omni-test", "choices": [{"delta": {
        "audio": {"data": pieces[0]}}}]},
    {"choices": [{"delta": {
        "audio": {"data": pieces[1]}, "content": "مرحبا"
    }}]},
    {"choices": [{"delta": {"audio": {"data": pieces[2]}},
                  "finish_reason": "stop"}]},
]

captured = {}
original_stream_events = omni._stream_events
original_key = os.environ.get("DASHSCOPE_API_KEY")
original_workspace = os.environ.get("DASHSCOPE_WORKSPACE_ID")
os.environ["DASHSCOPE_API_KEY"] = "test-key"
os.environ["DASHSCOPE_WORKSPACE_ID"] = "ws-test"

def fake_stream_events(payload, key):
    captured["body"] = payload
    captured["key"] = key
    captured["base_url"] = config.compatible_base_url()
    yield from events


omni._stream_events = fake_stream_events
try:
    response = omni._speak_chunk(
        "مرحبا", "qwen3.5-omni-flash", "Tina", "calm and intimate")
finally:
    omni._stream_events = original_stream_events
    if original_key is None:
        os.environ.pop("DASHSCOPE_API_KEY", None)
    else:
        os.environ["DASHSCOPE_API_KEY"] = original_key
    if original_workspace is None:
        os.environ.pop("DASHSCOPE_WORKSPACE_ID", None)
    else:
        os.environ["DASHSCOPE_WORKSPACE_ID"] = original_workspace

check("Omni joins Base64 before decoding", response.audio == pcm)
check("Omni retains response text for fidelity review", response.text == "مرحبا")
check("Omni exposes streamed usage", response.usage["total"] == 0)
check("Omni retains request identity and completion reason",
      response.request_id == "req-omni-test" and response.finish_reason == "stop")
check("Omni uses the regional compatible endpoint that returns audio data",
      captured["base_url"]
      == "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
os.environ["DASHSCOPE_WORKSPACE_ID"] = "ws-test"
check("Text models use the workspace-compatible endpoint",
      config.workspace_compatible_base_url()
      == "https://ws-test.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1")
if original_workspace is None:
    os.environ.pop("DASHSCOPE_WORKSPACE_ID", None)
else:
    os.environ["DASHSCOPE_WORKSPACE_ID"] = original_workspace
check("Omni sends the bound model and voice together",
      captured["body"]["model"] == "qwen3.5-omni-flash"
      and captured["body"]["audio"]["voice"] == "Tina"
      and captured["body"]["stream"] is True)
check("Omni sends one user message and no system role",
      len(captured["body"]["messages"]) == 1
      and captured["body"]["messages"][0]["role"] == "user")
check("Omni preserves intentional repetitions",
      captured["body"]["presence_penalty"] == 0.0)
check("Omni asks for an exact bounded read without Composer metadata",
      "BEGIN PASSAGE\nمرحبا\nEND PASSAGE" in
      captured["body"]["messages"][0]["content"]
      and "exactly" in captured["body"]["messages"][0]["content"]
      and "calm and intimate" not in captured["body"]["messages"][0]["content"]
      and "<read>" not in captured["body"]["messages"][0]["content"])

native_audio, native_text, native_shapes = omni._event_parts({
    "output": {"choices": [{"message": {"content": [
        {"text": "مرحبا"}, {"audio": {"data": encoded}}
    ]}}]}
})
check("Omni accepts the native DashScope streaming envelope",
      native_audio == [encoded] and native_text == ["مرحبا"]
      and native_shapes == ["output.choices.message:content"])

direct_audio, direct_text, direct_shapes = omni._event_parts({
    "choices": [{"delta": {"content": "نعم", "audio": encoded}}]
})
check("Omni accepts Singapore's direct delta.audio Base64 envelope",
      direct_audio == [encoded] and direct_text == ["نعم"]
      and direct_shapes == ["choices.delta:audio,content", f"choices.audio:string[{len(encoded)}]"])

nested_audio, _, _ = omni._event_parts({
    "choices": [{"delta": {"audio": [{"chunk": {"data": encoded}}]}}]
})
check("Omni accepts nested/list audio envelopes", nested_audio == [encoded])
check("Omni reads an audio-object transcript as a fallback",
      omni._event_transcript({"choices": [{"delta": {
          "audio": {"transcript": "fallback words"}}}]}) == "fallback words")

no_audio_error = ""
original_stream_events = omni._stream_events

def fake_transcript_only_events(_payload, _key):
    yield {"choices": [{"delta": {"content": "مرحبا"}}]}
    yield {"usage": {
        "completion_tokens": 9,
        "completion_tokens_details": {"audio_tokens": 9},
    }}

omni._stream_events = fake_transcript_only_events
os.environ["DASHSCOPE_API_KEY"] = "test-key"
try:
    try:
        omni._speak_chunk(
            "مرحبا", "qwen3.5-omni-flash", "Tina", None)
    except RuntimeError as error:
        no_audio_error = str(error)
finally:
    omni._stream_events = original_stream_events
    if original_key is None:
        os.environ.pop("DASHSCOPE_API_KEY", None)
    else:
        os.environ["DASHSCOPE_API_KEY"] = original_key

check("Omni rejects transcript-only streams even when audio tokens are billed",
      "returned no audio across 2 SSE events" in no_audio_error
      and "reported 9 output audio tokens" in no_audio_error
      and "Text returned: مرحبا" in no_audio_error)

original_omni_synthesize = omni.synthesize

def fake_omni_synthesize(chunks, options, on_progress=None):
    return (b"audio", [], ["مرحبا [ملاحظة]"], {"output_audio": 10},
            ["req-test"], [])

omni.synthesize = fake_omni_synthesize
try:
    rejected_tags = False
    try:
        speech.synthesize(
            ["[sad] مرحبا [laughing] [ملاحظة]"],
            SimpleNamespace(engine="omni"))
    except ValueError:
        rejected_tags = True
finally:
    omni.synthesize = original_omni_synthesize

check("Omni rejects Audio-only tags instead of silently discarding them",
      rejected_tags)
check("Omni token pricing uses Alibaba's returned classes",
      config.omni_usage_cost({"input_text": 100, "output_text": 10,
                              "output_audio": 1000}, "plus") == 0.044223)

faithful = fidelity.assess("Noah built an ark.", "Noah built an ark")
omitted = fidelity.assess(
    "God told Noah to build an ark and bring the animals inside.",
    "God told Noah. The dove returned.")
check("Fidelity ignores punctuation but accepts a complete script",
      faithful["status"] == "pass" and faithful["coverage"] == 1.0)
arabic_faithful = fidelity.assess(
    "إِنَّ الأَمَلَ يَبْقَى فِي القَلْبِ.",
    "إن الأمل يبقى في القلب")
check("Fidelity accepts Arabic transcripts without optional harakat",
      arabic_faithful["status"] == "pass"
      and arabic_faithful["coverage"] == 1.0)
check("Fidelity rejects a materially omitted script",
      omitted["status"] == "failed" and omitted["coverage"] < 0.9)

registry = voice_registry.assemble([], {}, {})
model_counts = {(item["engine"], item["tier"]): item["system_count"]
                for item in registry["models"]}
check("The registry exposes the complete documented system catalog",
      model_counts == {("audio", "plus"): 2, ("audio", "flash"): 12,
                       ("omni", "plus"): 56, ("omni", "flash"): 56,
                       ("qwen_tts", "vc"): 0})
check("Voice counts are derived from bindings",
      all(item["total_count"] == item["system_count"] + item["custom_count"]
          for item in registry["models"]))
check("Performance presets declare provider-neutral capabilities",
      registry["presets"] and all(item.get("capability_ids")
                                  for item in registry["presets"]))

print("31/31 passed")
