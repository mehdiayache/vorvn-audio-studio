// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VoiceChoice } from "@/lib/voice-options"
import { VoiceMethodPicker } from "./voice-method-picker"

afterEach(cleanup)

const qwen3: VoiceChoice = {
  id: "qwen3-voice", identityId: "voice-x", name: "Voice X",
  description: "", source: "mine", engine: "qwen_tts", model: "vc",
  modelId: "qwen3-tts-vc-2026-01-22", compatible: true,
  languages: ["English", "French", "German"], status: "active",
}

describe("VoiceMethodPicker", () => {
  it("shows the exact cloned-voice capability and model", () => {
    const onSelect = vi.fn()
    render(<VoiceMethodPicker
      routes={[qwen3]}
      availableRoutes={[qwen3]}
      selectedRouteId="qwen3-voice"
      language="Arabic"
      customVoice
      config={null}
      onSelect={onSelect}
    />)
    const method = screen.getByRole("button", { name: /Exact long reading/ })
    expect(method.hasAttribute("disabled")).toBe(false)
    expect(screen.getAllByText("Qwen3 TTS Voice Clone · Voice Clone")).toHaveLength(2)
    expect(screen.getByText("qwen3-tts-vc-2026-01-22")).toBeTruthy()
    expect(screen.getByText("Not documented for Arabic")).toBeTruthy()
    expect(screen.getByText("Details")).toBeTruthy()
    fireEvent.click(method)
    expect(onSelect).toHaveBeenCalledWith(qwen3)
  })
})
