"""Contract checks for the installed exact-text Alibaba speech products."""

from audio_studio.domain import voice_registry
from audio_studio.providers.alibaba import config


def check(label, condition):
    if not condition:
        raise AssertionError(label)
    print("PASS", label)


check("Only exact-text speech engines are installed",
      set(config.CAPABILITIES) == {"audio", "qwen_tts", "cosyvoice"})
check("Audio cloning keeps its documented language boundary",
      "en" in config.AUDIO_CLONE_LANGUAGES
      and "ar" not in config.AUDIO_CLONE_LANGUAGES)
check("Qwen3 TTS cloning keeps its documented language boundary",
      "en" in config.QWEN_TTS_CLONE_LANGUAGES
      and "ar" not in config.QWEN_TTS_CLONE_LANGUAGES)
check("Audio clone is Flash-only",
      config.CAPABILITIES["audio"]["clone_tiers"] == ["flash"])
check("Only Qwen Audio exposes inline delivery tags",
      config.CAPABILITIES["audio"]["inline_tags"] is True
      and config.CAPABILITIES["qwen_tts"]["inline_tags"] is False
      and config.CAPABILITIES["cosyvoice"]["inline_tags"] is False)
check("Qwen3 TTS is the exact cloned-voice route",
      config.CAPABILITIES["qwen_tts"]["models"]
      == {"vc": "qwen3-tts-vc-2026-01-22"}
      and config.CAPABILITIES["cosyvoice"]["models"]
      == {"plus": "cosyvoice-v3-plus"})

registry = voice_registry.assemble([], {}, {})
model_counts = {(item["engine"], item["tier"]): item["system_count"]
                for item in registry["models"]}
check("The registry exposes only installed exact-text products",
      model_counts == {("audio", "plus"): 2,
                       ("audio", "flash"): 12,
                       ("qwen_tts", "vc"): 0,
                       ("cosyvoice", "plus"): 0})
check("Voice counts are derived from bindings",
      all(item["total_count"] == item["system_count"] + item["custom_count"]
          for item in registry["models"]))
check("Performance presets target an installed capability",
      registry["presets"] and all(
          item.get("capability_ids") == ["expressive_tags"]
          for item in registry["presets"]))

print("9/9 passed")
