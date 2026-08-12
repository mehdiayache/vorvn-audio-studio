// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RecordingTakeCard } from "@/components/recording-take-card"
import type { VoiceDirectory } from "@/types/domain"

afterEach(cleanup)

const directory: VoiceDirectory = {
  config: null,
  cloned: [],
  meta: { "voice-3zzi": { name: "3zzi khoya", languages: "en" } },
  catalog: [],
  usage: {},
}

describe("RecordingTakeCard", () => {
  it("keeps playback and exact-setup retry as separate actions", () => {
    const play = vi.fn()
    const retry = vi.fn()
    render(<RecordingTakeCard take={{ id: "job-1", status: "ready", voice: "voice-3zzi", durationMs: 3100, cost: 0.0012, language: "Arabic", method: "Expressive + tags", engine: "audio", modelId: "qwen-audio-3.0-tts-flash", audioUrl: "/audio/take.mp3", script: "مرحبا" }} directory={directory} onPlay={play} onSecondaryAction={retry} secondaryLabel="Another take · same setup" />)

    expect(screen.getByText("Expressive + tags · Arabic")).toBeTruthy()
    expect(screen.getByText("Qwen Audio 3.0 TTS · Flash")).toBeTruthy()
    expect(screen.getByText("qwen-audio-3.0-tts-flash")).toBeTruthy()
    expect(screen.getByText("مرحبا")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Play take" }))
    fireEvent.click(screen.getByRole("button", { name: /Another take/ }))
    expect(play).toHaveBeenCalledOnce()
    expect(retry).toHaveBeenCalledOnce()
  })

  it("shows a pending attempt without a false playback action", () => {
    render(<RecordingTakeCard take={{ id: "pending", status: "pending", voice: "voice-3zzi", script: "Working" }} directory={directory} />)
    expect(screen.getByText("Generating")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Play take/ })).toBeNull()
  })

  it("shows an ambiguous attempt as review-required without retry", () => {
    render(<RecordingTakeCard take={{ id: "blocked", status: "review", voice: "voice-3zzi", message: "Review before retrying" }} directory={directory} />)
    expect(screen.getByText("Review required")).toBeTruthy()
    expect(screen.getByText("Review before retrying")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Another take/ })).toBeNull()
  })
})
