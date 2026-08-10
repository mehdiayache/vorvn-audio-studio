import { describe, expect, it } from "vitest"

import { officialCoverageLabel, outputLanguageOptions, voiceLanguageStatus } from "./voice-capabilities"
import type { VoiceChoice, VoiceIdentityChoice } from "./voice-options"

const route: VoiceChoice = {
  id: "qwen3-voice", identityId: "voice-x", name: "Voice X",
  description: "", source: "mine", engine: "qwen_tts", model: "vc",
  modelId: "qwen3-tts-vc-2026-01-22", compatible: true,
  languages: ["English", "French"], status: "active",
}

describe("voice capability language policy", () => {
  it("separates official model coverage from cloned-voice freedom", () => {
    expect(voiceLanguageStatus(route, "English", true)).toBe("documented")
    expect(voiceLanguageStatus(route, "Arabic", true)).toBe("experimental")
    expect(voiceLanguageStatus({ ...route, source: "alibaba" }, "Arabic", false)).toBe("unavailable")
    expect(voiceLanguageStatus(route, "Auto", true)).toBe("undetermined")
  })

  it("reports the real documented list and keeps Studio languages selectable", () => {
    const identity: VoiceIdentityChoice = {
      identityId: "voice-x", name: "Voice X", description: "",
      source: "mine", sourceLanguage: "en", routes: [route],
    }
    expect(officialCoverageLabel(route)).toBe("2 documented languages")
    expect(outputLanguageOptions({ languages: ["Auto", "Arabic"], capabilities: {} } as never, identity)).toEqual(["Auto", "Arabic", "English", "French"])
  })
})
