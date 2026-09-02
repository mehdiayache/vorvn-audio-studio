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
  originsApi: {
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
  usage: { uses: 2, projects: 1, spend: 0.01, last_used: null, preview_filename: "" },
}

describe("VoiceProfileDialog", () => {
  it("opens on recording methods with the preserved source in context", () => {
    render(<VoiceProfileDialog profile={profile} open onOpenChange={() => undefined} onEditIdentity={() => undefined} onChanged={() => undefined} />)

    expect(screen.getByRole("tab", { name: "Recording methods" }).getAttribute("data-state")).toBe("active")
    expect(screen.getByRole("tab", { name: "Voice tests" })).toBeTruthy()
    expect(screen.queryByRole("tab", { name: "Voice" })).toBeNull()
    expect(screen.getByText("Original recording")).toBeTruthy()
    expect(screen.getByText("Preserved master")).toBeTruthy()
    expect(screen.getByText("Ready")).toBeTruthy()
  })

  it("reveals source selection only while preparing a specific recording method", async () => {
    render(<VoiceProfileDialog profile={profile} open onOpenChange={() => undefined} onEditIdentity={() => undefined} onChanged={() => undefined} />)

    await waitFor(() => expect(screen.getByRole("tab", { name: "Recording methods" }).getAttribute("data-state")).toBe("active"))
    fireEvent.click(screen.getByRole("button", { name: "Reclone" }))

    expect(screen.getByRole("heading", { name: "Reclone Qwen Audio TTS · Flash" })).toBeTruthy()
    expect(screen.getByText("Best result")).toBeTruthy()
    expect(screen.getByText("Required range")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Recording cleanup" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Reclone method" })).toBeTruthy()
  })

  it("shows expression controls only for a method that supports inline tags", async () => {
    render(<VoiceProfileDialog profile={profile} open onOpenChange={() => undefined} onEditIdentity={() => undefined} onChanged={() => undefined} />)
    fireEvent.click(screen.getByRole("button", { name: "Test voice" }))
    await waitFor(() => expect(screen.getByRole("tab", { name: "Voice tests" }).getAttribute("data-state")).toBe("active"))

    await waitFor(() => expect(screen.getByText("Expression")).toBeTruthy())
    expect(screen.getByDisplayValue("The morning arrived quietly, carrying the promise of a new beginning.")).toBeTruthy()
  })

  it("keeps Voice tests open when refreshed profile truth arrives", async () => {
    const view = render(<VoiceProfileDialog profile={profile} open onOpenChange={() => undefined} onEditIdentity={() => undefined} onChanged={() => undefined} />)
    fireEvent.click(screen.getByRole("button", { name: "Test voice" }))
    await waitFor(() => expect(screen.getByRole("tab", { name: "Voice tests" }).getAttribute("data-state")).toBe("active"))

    view.rerender(<VoiceProfileDialog profile={{ ...profile, updated_at: "2026-08-25T12:00:00Z" }} open onOpenChange={() => undefined} onEditIdentity={() => undefined} onChanged={() => undefined} />)

    expect(screen.getByRole("tab", { name: "Voice tests" }).getAttribute("data-state")).toBe("active")
  })

  it("shows only tests from the selected recording method and truthful states", async () => {
    const profileWithTests: VoiceProfile = { ...profile, previews: [
      { id: "ready", identity_id: profile.id, binding_id: "binding-eva", model_id: route.model_id, tag: null, text: "A ready sample.", instruction: "", seed: 0, status: "ready", approval_state: "unreviewed", filename: "ready.wav", error: "", created_at: "" },
      { id: "other", identity_id: profile.id, binding_id: "historical-binding", model_id: "other", tag: null, text: "An unrelated sample.", instruction: "", seed: 0, status: "failed", approval_state: "unreviewed", filename: "", error: "failed", created_at: "" },
    ] }
    render(<VoiceProfileDialog profile={profileWithTests} open onOpenChange={() => undefined} onEditIdentity={() => undefined} onChanged={() => undefined} />)
    fireEvent.click(screen.getByRole("button", { name: "Test voice" }))

    await waitFor(() => expect(screen.getByText("A ready sample.")).toBeTruthy())
    expect(screen.getByText("Ready")).toBeTruthy()
    expect(screen.queryByText("An unrelated sample.")).toBeNull()
    expect(screen.queryByText("Saved test")).toBeNull()
  })
})
