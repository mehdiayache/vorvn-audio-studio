// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { VoiceProfile } from "@/types/domain"
import { VoiceProfileCard } from "./voice-profile-card"

afterEach(cleanup)

const profile: VoiceProfile = {
  id: "voice-serinity", name: "Serinity", metadata: { language: "en", gender: "female" },
  created_at: "2026-08-07", updated_at: "2026-08-07",
  references: [
    { id: "ref-1", original_name: "serinity.wav", normalized_path: "serinity-24k.wav", source_language: "en", transcript: "", sha256: "fixture", created_at: "2026-08-07", updated_at: "2026-08-07" },
    { id: "ref-2", original_name: "serinity-studio.wav", normalized_path: "serinity-studio-24k.wav", source_language: "en", transcript: "", sha256: "fixture-2", created_at: "2026-08-08", updated_at: "2026-08-08" },
  ],
  preferred_reference_id: "ref-1",
  bindings: [
    { binding_id: "binding-1", provider_voice_id: "audio-serinity", provider: "alibaba", region: "intl", provider_model_id: "alibaba:intl:audio-flash", reference_id: "ref-1", model_id: "audio-flash", engine: "audio", tier: "flash", status: "active", languages: ["en"], created_at: "2026-08-07" },
    { binding_id: "binding-2", provider_voice_id: "audio-serinity-studio", provider: "alibaba", region: "intl", provider_model_id: "alibaba:intl:audio-flash", reference_id: "ref-2", model_id: "audio-flash", engine: "audio", tier: "flash", status: "active", languages: ["en"], created_at: "2026-08-08" },
  ],
  jobs: [],
  usage: { uses: 0, productions: 0, spend: 0, last_used: null, preview_filename: "" },
  available_routes: [
    { provider_model_id: "alibaba:intl:audio-flash", provider: "alibaba", region: "intl", adapter_key: "audio", engine: "audio", tier: "flash", model_id: "audio-flash", label: "Qwen Audio · Flash", role: "Exact production", language: "en", source_language_documented: true, documented_output_languages: ["English", "French"], estimated_creation_cost: 0 },
    { provider_model_id: "alibaba:intl:omni-plus", provider: "alibaba", region: "intl", adapter_key: "omni", engine: "omni", tier: "plus", model_id: "omni-plus", label: "Qwen Omni · Plus", role: "Best-quality performance", language: "en", source_language_documented: true, documented_output_languages: ["English", "Arabic"], estimated_creation_cost: .01 },
  ],
}

describe("VoiceProfileCard", () => {
  it("presents one identity with model capabilities underneath", () => {
    render(<VoiceProfileCard profile={profile} onComplete={() => undefined} onRetry={() => undefined} onEdit={() => undefined} onPreview={() => undefined} />)
    expect(screen.getByRole("heading", { name: "Serinity" })).toBeTruthy()
    expect(screen.getByText("Female")).toBeTruthy()
    expect(screen.getByText("1 of 2 installed provider models · 2 exact bindings")).toBeTruthy()
    expect(screen.getByText("Exact production")).toBeTruthy()
    expect(screen.getByText(/alibaba · Qwen Audio/)).toBeTruthy()
    expect(screen.getByText("Reference: serinity.wav")).toBeTruthy()
    expect(screen.getByText("Reference: serinity-studio.wav")).toBeTruthy()
    expect(screen.getAllByText("2 documented output languages")).toHaveLength(2)
    expect(screen.getByRole("button", { name: "Create 1 missing method" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Edit Serinity" })).toBeTruthy()
  })

  it("does not pretend a historical voice can build versions without its source", () => {
    render(<VoiceProfileCard profile={{ ...profile, references: [], preferred_reference_id: null, bindings: [] }} onComplete={() => undefined} onRetry={() => undefined} onEdit={() => undefined} onPreview={() => undefined} />)
    expect(screen.getAllByText("Source recording needed").length).toBe(2)
    expect(screen.getByRole("button", { name: "Add reference for 2 provider models" })).toBeTruthy()
  })
})
