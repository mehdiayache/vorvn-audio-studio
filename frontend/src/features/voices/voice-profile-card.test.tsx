// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { VoiceProfile } from "@/types/domain"
import { VoiceProfileCard } from "./voice-profile-card"

afterEach(cleanup)

const profile: VoiceProfile = {
  id: "voice-serinity", name: "Serinity", metadata: { language: "en" },
  created_at: "2026-08-07", updated_at: "2026-08-07",
  references: [{ id: "ref-1", original_name: "serinity.wav", normalized_path: "serinity-24k.wav", source_language: "en", transcript: "", sha256: "fixture", created_at: "2026-08-07", updated_at: "2026-08-07" }],
  bindings: [{ provider_voice_id: "audio-serinity", model_id: "audio-flash", engine: "audio", tier: "flash", status: "active", languages: ["en"], created_at: "2026-08-07" }],
  jobs: [],
  usage: { uses: 0, productions: 0, spend: 0, last_used: null, preview_filename: "" },
  available_routes: [
    { provider: "alibaba", engine: "audio", tier: "flash", model_id: "audio-flash", label: "Qwen Audio · Flash", role: "Exact production", language: "en", source_language_documented: true, documented_output_languages: ["English", "French"], estimated_creation_cost: 0 },
    { provider: "alibaba", engine: "omni", tier: "plus", model_id: "omni-plus", label: "Qwen Omni · Plus", role: "Best-quality performance", language: "en", source_language_documented: true, documented_output_languages: ["English", "Arabic"], estimated_creation_cost: .01 },
  ],
}

describe("VoiceProfileCard", () => {
  it("presents one identity with model capabilities underneath", () => {
    render(<VoiceProfileCard profile={profile} onComplete={() => undefined} onRetry={() => undefined} onEdit={() => undefined} onPreview={() => undefined} />)
    expect(screen.getByRole("heading", { name: "Serinity" })).toBeTruthy()
    expect(screen.getByText("1 ready method · 1 to create")).toBeTruthy()
    expect(screen.getByText("Expressive + tags")).toBeTruthy()
    expect(screen.getByText(/Exact production · Qwen Audio/)).toBeTruthy()
    expect(screen.getByText("2 documented output languages")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create 1 missing method" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Edit Serinity" })).toBeTruthy()
  })

  it("does not pretend a historical voice can build versions without its source", () => {
    render(<VoiceProfileCard profile={{ ...profile, references: [] }} onComplete={() => undefined} onRetry={() => undefined} onEdit={() => undefined} onPreview={() => undefined} />)
    expect(screen.getByText("Source recording needed")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add source recording for 1 more method" })).toBeTruthy()
  })
})
