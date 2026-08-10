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
  it("uses the exact model as the only output-language authority", () => {
    expect(voiceLanguageStatus(route, "English", true)).toBe("documented")
    expect(voiceLanguageStatus(route, "Arabic", true)).toBe("unavailable")
    expect(voiceLanguageStatus({ ...route, source: "alibaba" }, "Arabic", false)).toBe("unavailable")
    expect(voiceLanguageStatus(route, "Auto", true)).toBe("undetermined")
  })

  it("reports the real documented list and keeps Studio languages selectable", () => {
    const identity: VoiceIdentityChoice = {
      identityId: "voice-x", name: "Voice X", description: "",
      source: "mine", editorialLanguage: "en", routes: [route],
    }
    expect(officialCoverageLabel(route)).toBe("2 documented languages")
    expect(outputLanguageOptions({ languages: ["Auto", "Arabic"], capabilities: {} } as never, identity)).toEqual(["Auto", "Arabic", "English", "French"])
  })
})
