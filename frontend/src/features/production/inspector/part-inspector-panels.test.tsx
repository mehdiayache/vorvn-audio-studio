// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PartInspectorDetails } from "./part-inspector-details"
import { PartInspectorScript } from "./part-inspector-script"
import type { ProductionPart, VoiceDirectory } from "@/types/domain"

afterEach(cleanup)

const directory = { config: null, cloned: [], meta: {}, catalog: [], identities: [], registry: null } as VoiceDirectory
const part = {
  id: 4, public_id: "part-public", created_at: "2026-08-12T00:00:00Z", position: 0,
  kind: "speech", text: "Canonical words", revision: 4, selected_take_id: 8,
  take_public_id: "take-public", take_raw_text: "Canonical words",
  take_spoken_text: "Provider wording", provider_text: "Provider wording",
  voice: "provider-voice", voice_name: "Sarah", cost: 0.04, spent: 0.08,
  provider: "alibaba", provider_region: "intl", model: "qwen-model",
  tier: "plus", binding_id: "binding-public", reference_id: "reference-public",
  provider_attempt_id: "attempt-public", provider_attempt_status: "succeeded",
} as ProductionPart

describe("Part Inspector panels", () => {
  it("separates canonical Part script from selected Take wording", () => {
    render(<PartInspectorScript part={part} directory={directory} currentPlaying={false} onPlay={vi.fn()} onNewTake={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText("Canonical Part script")).toBeTruthy()
    expect(screen.getAllByText("Canonical words")).toHaveLength(2)
    expect(screen.getByText("Provider wording")).toBeTruthy()
    expect(screen.queryByText("Alibaba returned")).toBeNull()
  })

  it("shows exact immutable route and ProviderAttempt evidence", () => {
    render(<PartInspectorDetails part={part} directory={directory} />)
    expect(screen.getByText("binding-public")).toBeTruthy()
    expect(screen.getByText("reference-public")).toBeTruthy()
    expect(screen.getByText("attempt-public")).toBeTruthy()
    expect(screen.getAllByText("qwen-model")).toHaveLength(2)
  })
})
