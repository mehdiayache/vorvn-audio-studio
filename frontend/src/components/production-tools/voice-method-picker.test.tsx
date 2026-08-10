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
  it("keeps an installed cloned-voice method selectable for an experimental language", () => {
    const onSelect = vi.fn()
    render(<VoiceMethodPicker
      routes={[qwen3]}
      availableRoutes={[qwen3]}
      selectedEngine="qwen_tts"
      language="Arabic"
      customVoice
      config={null}
      onSelect={onSelect}
    />)
    const method = screen.getByRole("button", { name: /Clean long reading/ })
    expect(method.hasAttribute("disabled")).toBe(false)
    expect(screen.getByText("Qwen3 TTS Voice Clone · Voice Clone")).toBeTruthy()
    expect(screen.getByText("qwen3-tts-vc-2026-01-22")).toBeTruthy()
    expect(screen.getByText("Experimental for Arabic")).toBeTruthy()
    fireEvent.click(method)
    expect(onSelect).toHaveBeenCalledWith("qwen_tts")
  })
})
