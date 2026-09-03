// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { VoiceProfile } from "@/types/domain"
import { VoiceProfileCard } from "./voice-profile-card"

afterEach(cleanup)

const profile: VoiceProfile = {
  id: "voice-serinity", name: "Serinity", metadata: { recording_language: "en", editorial_language: "en", gender: "female" },
  created_at: "2026-08-07", updated_at: "2026-08-07",
  references: [
    { id: "ref-1", original_name: "serinity.wav", normalized_path: "serinity-24k.wav", source_language: "en", transcript: "", sha256: "fixture", created_at: "2026-08-07", updated_at: "2026-08-07" },
    { id: "ref-2", original_name: "serinity-studio.wav", normalized_path: "serinity-studio-24k.wav", source_language: "en", transcript: "", sha256: "fixture-2", created_at: "2026-08-08", updated_at: "2026-08-08" },
  ],
  preferred_reference_id: "ref-1",
  bindings: [
    { binding_id: "binding-1", provider_voice_id: "audio-serinity", provider: "alibaba", region: "intl", provider_model_id: "alibaba:intl:audio-flash", reference_id: "ref-1", model_id: "audio-flash", engine: "audio", tier: "flash", status: "active", validation_state: "approved", languages: ["en"], created_at: "2026-08-07" },
    { binding_id: "binding-2", provider_voice_id: "audio-serinity-studio", provider: "alibaba", region: "intl", provider_model_id: "alibaba:intl:audio-flash", reference_id: "ref-2", model_id: "audio-flash", engine: "audio", tier: "flash", status: "active", validation_state: "candidate", languages: ["en"], created_at: "2026-08-08" },
  ],
  jobs: [],
  usage: { uses: 0, productions: 0, spend: 0, last_used: null, preview_filename: "" },
  available_routes: [
    { provider_model_id: "alibaba:intl:audio-flash", provider: "alibaba", region: "intl", adapter_key: "audio", engine: "audio", tier: "flash", model_id: "audio-flash", label: "Qwen Audio · Flash", role: "Exact production", language: "en", source_language_documented: true, documented_output_languages: ["English", "French"], estimated_creation_cost: 0 },
    { provider_model_id: "alibaba:intl:qwen3-tts", provider: "alibaba", region: "intl", adapter_key: "qwen_tts", engine: "qwen_tts", tier: "vc", model_id: "qwen3-tts-vc-2026-01-22", label: "Qwen3 TTS Voice Clone", role: "Exact long reading", language: "en", source_language_documented: true, documented_output_languages: ["English", "French"], estimated_creation_cost: .01 },
  ],
}

describe("VoiceProfileCard", () => {
  it("keeps the card focused on the human identity and active methods", () => {
    render(<VoiceProfileCard profile={profile} onOpen={() => undefined} onPreview={() => undefined} />)
    expect(screen.getByRole("heading", { name: "Serinity" })).toBeTruthy()
    expect(screen.getByText("Female")).toBeTruthy()
    expect(screen.getByText("English")).toBeTruthy()
    expect(screen.getByText("1 method ready")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open Serinity" })).toBeTruthy()
  })

  it("reports the number of approved methods without exposing provider clutter", () => {
    render(<VoiceProfileCard profile={{ ...profile, bindings: [profile.bindings[0]!] }} onOpen={() => undefined} onPreview={() => undefined} />)
    expect(screen.getByText("1 method ready")).toBeTruthy()
    expect(screen.queryByText(/qwen/i)).toBeNull()
  })

  it("keeps a failed enrollment available as a missing method", () => {
    render(<VoiceProfileCard profile={{
      ...profile,
      bindings: [profile.bindings[0]!],
      jobs: [{
        id: "job-failed",
        identity_id: profile.id,
        reference_id: "ref-1",
        provider: "alibaba",
        region: "intl",
        provider_model_id: "alibaba:intl:qwen3-tts",
        adapter_key: "qwen_tts",
        engine: "qwen_tts",
        tier: "vc",
        model_id: "qwen3-tts-vc-2026-01-22",
        status: "failed",
        classification: "provider_rejected",
        attempts: 2,
        error: "Audio.DurationLimitError",
        updated_at: "2026-08-08",
      }],
    }} onOpen={() => undefined} onPreview={() => undefined} />)

    expect(screen.getByText("Needs attention")).toBeTruthy()
  })
})
