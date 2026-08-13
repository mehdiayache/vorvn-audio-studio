import { describe, expect, it } from "vitest"

import { selectedTakeInputLabel, speechPartCardFacts } from "./speech-part-card-model"
import type { DurableJob, GenerateResult, ProductionCastRole, ProductionPart, VoiceDirectory } from "@/types/domain"

const directory = {
  config: {
    capabilities: {
      audio: { operator_title: "Expressive speech + tags", label: "Qwen Audio TTS", models: { flash: "qwen-audio-3.0-tts-flash" } },
    },
  },
  cloned: [], meta: {}, catalog: [], usage: {},
  identities: [
    { id: "voice-maya", name: "Maya", metadata: {}, usage: {} },
    { id: "voice-eve", name: "Eve", metadata: {}, usage: {} },
  ],
} as unknown as VoiceDirectory

function part(values: Partial<ProductionPart> = {}): ProductionPart {
  return {
    id: 12, created_at: "2026-08-13T10:00:00Z", position: 2, kind: "speech",
    text: "Selected immutable script", selected_take_id: 93,
    selected_take_number: 3, selected_take_text_state: "shaped",
    voice_identity_id: "voice-maya", voice_name: "Maya",
    engine: "audio", tier: "flash", model: "qwen-audio-3.0-tts-flash",
    capability_name: "Expressive + tags", language: "English",
    duration_ms: 12420, takes: 3, spent: .0312, cost: .01,
    cast_role_id: "role-paul", cast_role_name: "Paul",
    filename: "part-12.mp3", caption_source_language: "English",
    subtitled: true, languages: ["French"],
    ...values,
  }
}

const castRole = {
  id: "role-paul", name: "Paul", color: "#7567d8", position: 0,
  persona_id: null, persona_name: null, voice_source_kind: "identity",
  voice_identity_id: "voice-eve", catalogue_voice_id: null,
  assignment_revision: 2,
} satisfies ProductionCastRole

describe("speechPartCardFacts", () => {
  it("describes the immutable selected Take while separating future Cast voice", () => {
    const facts = speechPartCardFacts({ part: part(), speechJob: null, directory, castRole })
    expect(facts.selectedVoiceName).toBe("Maya")
    expect(facts.futureVoiceName).toBe("Eve")
    expect(facts.methodLine).toBe("Qwen Audio · Flash · Expressive + tags · EN")
    expect(facts.technicalDetail).toContain("Language: English")
    expect(facts.takeSummary).toBe("Take 3 selected · 0:12.4 · 4 Takes · Spoken input")
    expect(facts.captionSummary).toBe("EN + FR captions")
  })

  it("never infers selected input truth from populated text variants", () => {
    const historical = part({ selected_take_text_state: null, take_tagged_text: "<happy>Tagged</happy>" })
    const facts = speechPartCardFacts({ part: historical, speechJob: null, directory })
    expect(facts.inputLabel).toBeNull()
    expect(facts.takeSummary).toContain("Input unknown")
    expect(selectedTakeInputLabel("unexpected")).toBeNull()
  })

  it("keeps orthogonal warnings and one shared durable operation interpretation", () => {
    const job: DurableJob<GenerateResult> & { request: { select_result: boolean } } = {
      id: "speech-1", type: "speech", status: "blocked", progress: 0,
      detail: "Provider may have completed", retries: 1,
      result: { ambiguous: true, requires_review: true }, request: { select_result: false },
    }
    const facts = speechPartCardFacts({
      part: part({ outdated: true, missing: true, fidelity: { status: "warning", score: null, coverage: null, requested_words: 10, returned_words: 9, message: "Check wording" }, binding_resolution_status: "unresolved" }),
      speechJob: job, directory,
    })
    expect(facts.alerts.map((item) => item.key)).toEqual(["outdated", "missing", "fidelity", "route"])
    expect(facts.operation).toMatchObject({ kind: "review", label: "TAKE 5 · REVIEW REQUIRED", canRetry: false })
    expect(facts.methodLine).toContain("Expressive + tags")
  })

  it("shows a completed alternative without silently changing the selected Take", () => {
    const job: DurableJob<GenerateResult> & { request: { select_result: boolean } } = {
      id: "speech-2", type: "speech", status: "ok", progress: 1,
      detail: "Complete", retries: 0, result: { take_id: 99 }, request: { select_result: false },
    }
    const facts = speechPartCardFacts({ part: part(), speechJob: job, directory })
    expect(facts.operation).toMatchObject({ kind: "ready", label: "TAKE 4 READY", canReviewTake: true })
    expect(facts.takeSummary).toContain("Take 3 selected")
  })

  it.each([
    ["queued", 0, {}, "active", "TAKE 5 · QUEUED", false, false],
    ["running", 43, {}, "active", "TAKE 5 · GENERATING 43%", false, false],
    ["retrying", 27, {}, "active", "TAKE 5 · RETRYING", false, false],
    ["blocked", 0, { needs_confirmation: true }, "confirmation", "TAKE 5 · WAITING FOR CONFIRMATION", false, true],
    ["blocked", 0, { requires_review: true }, "review", "TAKE 5 · REVIEW REQUIRED", false, false],
    ["failed", 0, {}, "failed", "TAKE 5 · FAILED", true, false],
    ["lost", 0, {}, "failed", "TAKE 5 · FAILED", true, false],
    ["cancelled", 0, {}, "failed", "TAKE 5 · CANCELLED", false, false],
  ] as const)("maps durable %s truth into the conditional operation presentation", (status, progress, result, kind, label, canRetry, canConfirm) => {
    const job = {
      id: `speech-${status}`, type: "speech", status, progress,
      detail: `${status} detail`, retries: 0, result, request: { select_result: false },
    } as DurableJob<GenerateResult> & { request: { select_result: boolean } }

    const operation = speechPartCardFacts({ part: part(), speechJob: job, directory }).operation

    expect(operation).toMatchObject({ kind, label, canRetry, canConfirm })
  })

  it("uses only the current caption Job supplied by the read model", () => {
    const caption: DurableJob = { id: "caption-current", type: "transcribe", status: "running", progress: .4, detail: "Listening", retries: 0, result: {} }
    const facts = speechPartCardFacts({ part: part({ subtitled: false, languages: [] }), speechJob: null, captionJob: caption, directory })
    expect(facts.captionSummary).toBe("Creating captions…")
    expect(facts.captionTone).toBe("active")
  })

  it("keeps failed and stale translated caption states distinct", () => {
    const failedCaption: DurableJob = { id: "caption-failed", type: "transcribe", status: "failed", progress: 0, detail: "Failed", retries: 0, result: {} }
    const failed = speechPartCardFacts({ part: part({ subtitled: false, languages: [] }), speechJob: null, captionJob: failedCaption, directory })
    const stale = speechPartCardFacts({ part: part({ subtitles_stale: true }), speechJob: null, directory })

    expect(failed).toMatchObject({ captionSummary: "Captions failed", captionTone: "danger" })
    expect(stale).toMatchObject({ captionSummary: "EN + FR captions need review", captionTone: "warning" })
  })
})
