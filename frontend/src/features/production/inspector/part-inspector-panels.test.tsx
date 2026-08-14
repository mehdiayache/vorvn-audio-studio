// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PartInspectorDetails } from "./part-inspector-details"
import { PartInspectorScript, selectedTakeWording } from "./part-inspector-script"
import { partInspectorTabs } from "./part-inspector"
import type { ProductionPart, VoiceDirectory } from "@/types/domain"

afterEach(cleanup)

const directory = { config: null, cloned: [], meta: {}, catalog: [], identities: [], registry: null } as VoiceDirectory
const part = {
  id: 4, public_id: "part-public", created_at: "2026-08-12T00:00:00Z", position: 0,
  kind: "speech", text: "Canonical words", revision: 4, selected_take_id: 8,
  selected_take_text_state: "raw",
  take_public_id: "take-public", take_raw_text: "Canonical words",
  take_spoken_text: "Provider wording", provider_text: "Provider wording",
  voice: "provider-voice", voice_name: "Sarah", cost: 0.04, spent: 0.08,
  provider: "alibaba", provider_region: "intl", model: "qwen-model",
  tier: "plus", binding_id: "binding-public", reference_id: "reference-public",
  provider_attempt_id: "attempt-public", provider_attempt_status: "succeeded",
} as ProductionPart

describe("Part Inspector panels", () => {
  it("separates canonical Part script from active recording wording", () => {
    render(<PartInspectorScript part={part} directory={directory} currentPlaying={false} onPlay={vi.fn()} onRecordPart={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText("Canonical Part script")).toBeTruthy()
    expect(screen.getAllByText("Canonical words")).toHaveLength(2)
    expect(screen.getByText("Provider returned wording")).toBeTruthy()
    expect(screen.getByText("Provider wording")).toBeTruthy()
    expect(screen.queryByText("Alibaba returned")).toBeNull()
  })

  it("shows exact immutable route and ProviderAttempt evidence", () => {
    render(<PartInspectorDetails part={part} directory={directory} />)
    expect(screen.getByText("binding-public")).toBeTruthy()
    expect(screen.getByText("reference-public")).toBeTruthy()
    expect(screen.getByText(/attempt-public/)).toBeTruthy()
    expect(screen.getAllByText("qwen-model")).toHaveLength(2)
  })

  it("does not project speech route concepts onto Silence Parts", () => {
    const silence = { ...part, id: 5, kind: "silence", text: "", duration_ms: 2500, selected_take_id: null } as ProductionPart
    render(<PartInspectorScript part={silence} directory={directory} currentPlaying={false} onPlay={vi.fn()} onRecordPart={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText("Intentional silence")).toBeTruthy()
    expect(screen.getByText(/no Voice, recording, provider operation, captions, or generation spend/i)).toBeTruthy()
    expect(screen.queryByText("Canonical Part script")).toBeNull()
  })

  it("shows Asset provenance instead of a fictional recording route", () => {
    const asset = { ...part, id: 6, kind: "asset", text: "Intro", title: "Evening intro", filename: "intro.mp3", selected_take_id: null } as ProductionPart
    render(<PartInspectorDetails part={asset} directory={directory} />)
    expect(screen.getByText("Linked Venture audio")).toBeTruthy()
    expect(screen.getByText("Evening intro")).toBeTruthy()
    expect(screen.queryByText("Recording route")).toBeNull()
  })

  it("limits tabs by the current Part type", () => {
    expect(partInspectorTabs(part)).toEqual(["script", "captions", "details"])
    expect(partInspectorTabs({ ...part, kind: "draft", selected_take_id: null })).toEqual(["script", "details"])
    expect(partInspectorTabs({ ...part, kind: "asset", selected_take_id: null })).toEqual(["script", "details"])
    expect(partInspectorTabs({ ...part, kind: "silence", selected_take_id: null })).toEqual(["script", "details"])
  })

  it("shows Draft editorial facts without pretending a recording route exists", () => {
    render(<PartInspectorDetails part={{ ...part, kind: "draft", selected_take_id: null }} directory={directory} />)
    expect(screen.getByText("Draft speech")).toBeTruthy()
    expect(screen.queryByText("Recording route")).toBeNull()
    expect(screen.queryByText("Immutable evidence")).toBeNull()
  })

  it("does not guess the recording input state from populated fields", () => {
    expect(selectedTakeWording({ ...part, selected_take_text_state: null, take_raw_text: "Present", take_spoken_text: "Also present" })).toEqual({ state: null, label: "Unknown", value: "" })
  })

  it("compares canonical editorial truth with the active recording wording", () => {
    render(<PartInspectorScript part={part} directory={directory} currentPlaying={false} onPlay={vi.fn()} onRecordPart={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Compare" }))
    expect(screen.getByRole("dialog", { name: "Compare Part and active recording" })).toBeTruthy()
    expect(screen.getByText("Current editorial truth beside the wording used to create the active recording.")).toBeTruthy()
    expect(screen.getAllByText("Original · used").length).toBeGreaterThan(0)
  })
})
