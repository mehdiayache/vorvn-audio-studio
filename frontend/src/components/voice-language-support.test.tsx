// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { VoiceChoice } from "@/lib/voice-options"
import { VoiceLanguageSupport } from "./voice-language-support"

afterEach(cleanup)

const qwen3: VoiceChoice = {
  id: "qwen3-voice", identityId: "voice-x", name: "Voice X",
  description: "", source: "mine", engine: "qwen_tts", model: "vc",
  modelId: "qwen3-tts-vc-2026-01-22", compatible: true,
  languages: ["English", "French", "German"], status: "active",
}

describe("VoiceLanguageSupport", () => {
  it("shows experimental output without blocking a cloned voice", () => {
    render(<VoiceLanguageSupport route={qwen3} language="Arabic" customVoice />)
    expect(screen.getByText("Arabic is experimental with this model")).toBeTruthy()
    expect(screen.getByText(/You can still try it/)).toBeTruthy()
    fireEvent.click(screen.getByText("3 documented languages"))
    expect(screen.getByText("English")).toBeTruthy()
    expect(screen.getByText("French")).toBeTruthy()
  })

  it("marks a documented language as officially supported", () => {
    render(<VoiceLanguageSupport route={qwen3} language="English" customVoice />)
    expect(screen.getByText("English is officially supported")).toBeTruthy()
    expect(screen.getByText(/exact model binding/)).toBeTruthy()
  })
})
