// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VoiceProfile } from "@/types/domain"
import { originsApi } from "@/lib/api"
import { CompleteVoiceDialog } from "./complete-voice-dialog"

vi.mock("@/lib/api", () => ({ originsApi: {
  createVoicePackage: vi.fn(),
  uploadVoiceReference: vi.fn(),
} }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const profile: VoiceProfile = {
  id: "voice-sarah", name: "Sarah", metadata: { recording_language: "ar" },
  preferred_reference_id: "ref-english",
  created_at: "2026-08-10", updated_at: "2026-08-10",
  references: [
    { id: "ref-arabic", original_name: "sarah-arabic.wav", normalized_path: "ref-arabic.wav", source_language: "ar", transcript: "", sha256: "ar", created_at: "2026-08-10", updated_at: "2026-08-10" },
    { id: "ref-english", original_name: "sarah-english.wav", normalized_path: "ref-english.wav", source_language: "en", transcript: "", sha256: "en", created_at: "2026-08-10", updated_at: "2026-08-10" },
  ],
  bindings: [], jobs: [],
  usage: { uses: 0, projects: 0, spend: 0, last_used: null, preview_filename: "" },
  available_routes: [{ provider_model_id: "alibaba:intl:audio-flash", provider: "alibaba", region: "intl", adapter_key: "audio", engine: "audio", tier: "flash", model_id: "audio-flash", label: "Qwen Audio · Flash", role: "Expressive", language: "en", source_language_documented: true, documented_output_languages: ["English"], estimated_creation_cost: 0 }],
}

describe("CompleteVoiceDialog", () => {
  it("shows and snapshots the explicitly confirmed reference", async () => {
    vi.mocked(originsApi.createVoicePackage).mockResolvedValue({
      identity: profile,
      queued: 1,
      plan: {
        region: "intl", region_label: "Singapore", language: "en",
        package: "complete", routes: profile.available_routes,
        available_routes: profile.available_routes, packages: [],
        total_estimated_creation_cost: 0,
      },
    })
    render(<CompleteVoiceDialog profile={profile} config={null} onOpenChange={() => undefined} onQueued={() => undefined} />)

    expect(screen.getByRole("combobox", { name: "Source for these model versions" }).textContent).toContain("sarah-english.wav")
    fireEvent.click(screen.getByRole("button", { name: "Create 1 model version" }))

    await waitFor(() => expect(originsApi.createVoicePackage).toHaveBeenCalledWith(expect.objectContaining({
      identity_id: "voice-sarah",
      reference_id: "ref-english",
      language: "en",
      package: "complete",
      provider_model_ids: ["alibaba:intl:audio-flash"],
    })))
  })
})
