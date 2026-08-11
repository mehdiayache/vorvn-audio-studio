// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProductionPart, StudioConfig, VoiceDirectory } from "@/types/domain"
import { SpeechTool } from "./speech-tool"

afterEach(cleanup)

const directory = {
  config: null, cloned: [], meta: {}, catalog: [], identities: [], usage: {},
  registry: {
    bindings: [
      { binding_id: "binding-sarah", identity_id: "identity-sarah", provider_voice_id: "sarah-provider", name: "Sarah", description: "", languages: ["English"], source: "custom", provider: "alibaba", region: "intl", adapter_key: "audio", engine: "audio", tier: "flash", model_id: "qwen-audio-flash", status: "ready", capabilities: [{ id: "expressive_tags", name: "Expressive + tags", description: "Expressive speech", controls: { delivery_tags: true, natural_direction: true, rate: true, pitch: true, volume: true }, ui_metadata: { direction_label: "Voice direction" } }] },
      { binding_id: "binding-maya", identity_id: "identity-maya", provider_voice_id: "maya-provider", name: "Maya", description: "", languages: ["English"], source: "custom", provider: "alibaba", region: "intl", adapter_key: "audio", engine: "audio", tier: "flash", model_id: "qwen-audio-flash", status: "ready", capabilities: [{ id: "expressive_tags", name: "Expressive + tags", description: "Expressive speech", controls: { delivery_tags: true, natural_direction: true, rate: true, pitch: true, volume: true }, ui_metadata: { direction_label: "Voice direction" } }] },
    ],
    models: [], presets: [], source: { provider: "Alibaba", verified_at: "", audio_url: "", omni_url: "" },
  },
} as unknown as VoiceDirectory

const config = {
  has_key: true,
  formats: ["mp3"],
  languages: ["Auto", "English"],
  capabilities: {
    audio: { estimate_rates_per_million_chars: { flash: 1 }, inline_tags: true, purpose: "Speech", models: { flash: "qwen-audio-flash" } },
  },
  tags: {}, retired_tags: {}, prefs: {}, text_preparation: {},
} as unknown as StudioConfig

const common = {
  config,
  clonedVoices: [],
  directory,
  playerPlaying: false,
  onGenerate: vi.fn(),
  onPlay: vi.fn(),
}

describe("SpeechTool contract adapters", () => {
  it("does not silently select the first identity or exact route in fresh Speak", async () => {
    render(<SpeechTool {...common} />)
    await waitFor(() => expect(screen.getByText("Choose a voice to see its exact routes.")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Choose a voice" })).toBeTruthy()
    expect(screen.getByText("No route selected")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Generate audio" }).hasAttribute("disabled")).toBe(true)
  })

  it("restores explicit Part identity context without inventing a route", async () => {
    const part = { id: 7, kind: "speech", text: "Hello", cost: 0, created_at: "", position: 0, voice_identity_id: "identity-sarah", binding_id: "binding-sarah" } as ProductionPart
    render(<SpeechTool {...common} projectId={3} part={part} />)
    await waitFor(() => expect(screen.getAllByText("Sarah").length).toBeGreaterThan(0))
    expect(screen.getByText("Choose one exact provider binding. Audio Studio never picks one for you.")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Generate new take/ }).hasAttribute("disabled")).toBe(true)
  })

  it("requires an explicit editorial decision before generating changed Part words", async () => {
    const onGenerate = vi.fn().mockResolvedValue({ id: "job-1" })
    const onUpdateEditorial = vi.fn().mockResolvedValue(undefined)
    const part = { id: 8, kind: "draft", text: "Original words", text_raw: "Original words", revision: 3, cost: 0, created_at: "", position: 0, voice_identity_id: "identity-sarah", binding_id: "binding-sarah" } as ProductionPart
    render(<SpeechTool {...common} projectId={3} part={part} onGenerate={onGenerate} onUpdateEditorial={onUpdateEditorial} />)
    await waitFor(() => expect(screen.getByRole("button", { name: /Record Part/ }).hasAttribute("disabled")).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: /Script:/ }))
    fireEvent.change(screen.getByPlaceholderText("Type or paste what should be said…"), { target: { value: "Revised words" } })
    fireEvent.click(screen.getByRole("button", { name: /Record Part/ }))
    expect(screen.getByText("The Part has unsaved editorial changes")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Generate alternative only" }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ select_result: false })))
    expect(onUpdateEditorial).not.toHaveBeenCalled()
  })
})
