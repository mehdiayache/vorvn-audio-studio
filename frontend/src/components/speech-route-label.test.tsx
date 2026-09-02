// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SpeechRouteLabel } from "./speech-route-label"

describe("SpeechRouteLabel", () => {
  it("keeps exact model identity separate from its friendly tier", () => {
    render(<SpeechRouteLabel route={{
      engine: "audio", model: "qwen-audio-3.0-tts-flash", tier: "flash",
      language: "Arabic",
    }} includeLanguage />)

    expect(screen.getByText("Qwen Audio 3.0 TTS · Flash")).toBeTruthy()
    expect(screen.getByText("qwen-audio-3.0-tts-flash")).toBeTruthy()
    expect(screen.getByText("Arabic")).toBeTruthy()
  })

  it("supports a resolved Creator route without treating its tier as a model ID", () => {
    render(<SpeechRouteLabel route={{
      engine: "qwen_tts", model: "vc", model_id: "qwen3-tts-vc-2026-01-22",
    }} />)

    expect(screen.getByText("Qwen3 TTS Voice Clone · Voice Clone")).toBeTruthy()
    expect(screen.getByText("qwen3-tts-vc-2026-01-22")).toBeTruthy()
  })
})
