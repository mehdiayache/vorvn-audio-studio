// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VoiceProfile } from "@/types/domain"
import { VoiceProfileDialog } from "./voice-profile-dialog"

vi.mock("@/components/global-player-provider", () => ({
  useGlobalPlayer: () => ({ source: null, state: "idle", toggleSource: vi.fn() }),
}))

vi.mock("@/lib/api", () => ({
  audioUrl: (value: string) => value,
  studioApi: {
    approveVoicePreview: vi.fn(),
    createVoicePackage: vi.fn(),
    createVoicePreview: vi.fn(),
    saveVoiceReferenceWindow: vi.fn(),
    voicePreviewResult: vi.fn(),
  },
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const route = {
  provider_model_id: "alibaba:intl:qwen-audio-3.0-tts-flash",
  provider: "alibaba", region: "intl", adapter_key: "audio",
  engine: "audio", tier: "flash", model_id: "qwen-audio-3.0-tts-flash",
  label: "Qwen Audio TTS · Flash", role: "Expressive speech + tags",
  language: "en", source_language_documented: true,
  documented_output_languages: ["English"], estimated_creation_cost: 0,
  capability_ids: ["expressive_tags"],
  clone_source_duration_ms: { minimum: 5_000, recommended_minimum: 10_000, recommended_maximum: 20_000, maximum: 30_000 },
}

const profile: VoiceProfile = {
  id: "voice-eva", name: "Eva", metadata: { recording_language: "en", gender: "female" },
  preferred_reference_id: "ref-eva", created_at: "2026-08-25", updated_at: "2026-08-25",
  references: [{
    id: "ref-eva", original_name: "eva-master.wav", normalized_path: "eva.wav",
    source_language: "en", transcript: "", sha256: "source", duration_ms: 45_000,
    sample_rate: 24_000, channels: 1, metadata: {}, diagnostics: {}, windows: [{
      id: "window-audio", reference_id: "ref-eva", provider_model_id: route.provider_model_id,
      start_ms: 5_000, duration_ms: 15_000, source_language: "en", transcript: "",
      enable_preprocess: false, derived_path: "", created_at: "", updated_at: "",
    }], created_at: "", updated_at: "",
  }],
  bindings: [{
    binding_id: "binding-eva", provider_voice_id: "eva-provider", provider: "alibaba",
    region: "intl", provider_model_id: route.provider_model_id, model_id: route.model_id,
    engine: "audio", tier: "flash", status: "active", languages: ["en"],
    reference_id: "ref-eva", reference_window_id: "window-audio", validation_state: "approved",
    superseded_by: null, created_at: "",
  }],
  jobs: [], previews: [], used_tags: ["whispers"], available_routes: [route],
  usage: { uses: 2, productions: 1, spend: 0.01, last_used: null, preview_filename: "" },
}

describe("VoiceProfileDialog", () => {
  it("opens on the human voice overview instead of the source-window implementation", () => {
    render(<VoiceProfileDialog profile={profile} open onOpenChange={() => undefined} onEditIdentity={() => undefined} onChanged={() => undefined} />)

    expect(screen.getByRole("tab", { name: "Voice" }).getAttribute("data-state")).toBe("active")
    expect(screen.getByRole("tab", { name: "Recording methods" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Voice tests" })).toBeTruthy()
    expect(screen.getByText("Original recording")).toBeTruthy()
    expect(screen.queryByText("Choose the performance evidence")).toBeNull()
    expect(screen.queryByText(/Methods 1/)).toBeNull()
  })

  it("reveals source selection only while preparing a specific recording method", async () => {
    render(<VoiceProfileDialog profile={profile} open onOpenChange={() => undefined} onEditIdentity={() => undefined} onChanged={() => undefined} />)

    await waitFor(() => expect(screen.getByRole("tab", { name: "Voice" }).getAttribute("data-state")).toBe("active"))
    const voiceTab = screen.getByRole("tab", { name: "Voice" })
    voiceTab.focus()
    fireEvent.keyDown(voiceTab, { key: "ArrowRight" })
    await waitFor(() => expect(screen.getByRole("tab", { name: "Recording methods" }).getAttribute("data-state")).toBe("active"))
    await waitFor(() => expect(screen.getByText("Ready to use")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Reclone" }))

    expect(screen.getByRole("heading", { name: "Reclone for Qwen Audio TTS · Flash" })).toBeTruthy()
    expect(screen.getByText("Best result")).toBeTruthy()
    expect(screen.getByText("Required range")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Recording cleanup" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Create test version/ })).toBeTruthy()
  })

  it("shows expression controls only for a method that supports inline tags", async () => {
    render(<VoiceProfileDialog profile={profile} open onOpenChange={() => undefined} onEditIdentity={() => undefined} onChanged={() => undefined} />)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Voice" }).getAttribute("data-state")).toBe("active"))
    const voiceTab = screen.getByRole("tab", { name: "Voice" })
    voiceTab.focus()
    fireEvent.keyDown(voiceTab, { key: "ArrowLeft" })
    await waitFor(() => expect(screen.getByRole("tab", { name: "Voice tests" }).getAttribute("data-state")).toBe("active"))

    await waitFor(() => expect(screen.getByText("Expression")).toBeTruthy())
    expect(screen.getByDisplayValue("The morning arrived quietly, carrying the promise of a new beginning.")).toBeTruthy()
  })
})
