import { describe, expect, it } from "vitest"

import { recordingInputLabel, speechPartCardFacts } from "./speech-part-card-model"
import type { DurableJob, GenerateResult, ProjectPart, VoiceDirectory } from "@/types/domain"

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

function part(values: Partial<ProjectPart> = {}): ProjectPart {
  return {
    id: 12, created_at: "2026-08-13T10:00:00Z", position: 2, kind: "speech",
    text: "Selected immutable script", clip_id: 93,
    clip_spoken_text: "Selected immutable spoken script",
    recording_text_state: "shaped",
    voice_identity_id: "voice-maya", voice_name: "Maya",
    engine: "audio", tier: "flash", model: "qwen-audio-3.0-tts-flash",
    capability_name: "Expressive + tags", language: "English",
    duration_ms: 12420, spent: .0312, cost: .01,
    filename: "part-12.mp3", caption_source_language: "English",
    subtitled: true, languages: ["French"],
    ...values,
  }
}

describe("speechPartCardFacts", () => {
  it("describes the selected immutable recording voice", () => {
    const facts = speechPartCardFacts({ part: part(), speechJob: null, directory })
    expect(facts.selectedVoiceName).toBe("Maya")
    expect(facts.methodLine).toBe("Qwen Audio · Flash · Expressive + tags · EN")
    expect(facts.technicalDetail).toContain("Language: English")
    expect(facts.recordingSummary).toBe("Active recording · 0:12.4 · Spoken input")
    expect(facts.script).toBe("Selected immutable spoken script")
    expect(facts.scriptState).toBe("shaped")
    expect(facts.captionSummary).toBe("EN + FR captions")
  })

  it("does not invent a model for an authored Draft whose recording method is intentionally unset", () => {
    const facts = speechPartCardFacts({
      part: part({
        kind: "draft", clip_id: null, filename: "", engine: undefined, model: undefined,
        tier: null, provider: null, binding_id: null, capability_id: null,
        capability_name: null, language: "English",
      }),
      speechJob: null,
      directory,
    })

    expect(facts.methodLine).toBe("Recording method not chosen · EN")
    expect(facts.exactModel).toBe("")
  })

  it("resolves a saved Draft method from its exact registry route", () => {
    const routeDirectory = {
      ...directory,
      registry: {
        bindings: [{
          binding_id: "binding-cosy", catalogue_voice_id: null,
          provider: "alibaba", engine: "cosyvoice", tier: "plus",
          model_id: "cosyvoice-v3-plus", capabilities: [{
            id: "controlled_exact", name: "Controlled exact reading",
          }],
        }],
      },
    } as unknown as VoiceDirectory
    const facts = speechPartCardFacts({
      part: part({
        kind: "draft", clip_id: null, filename: "", engine: undefined,
        model: undefined, tier: null, provider: null,
        binding_id: "binding-cosy", capability_id: "controlled_exact",
        capability_name: null, language: "English",
      }),
      speechJob: null,
      directory: routeDirectory,
    })

    expect(facts.methodLine).toBe("CosyVoice V3 Plus · Plus · Controlled exact reading · EN")
    expect(facts.exactModel).toBe("cosyvoice-v3-plus")
  })

  it("never infers selected input truth from populated text variants", () => {
    const historical = part({ recording_text_state: null, clip_tagged_text: "<happy>Tagged</happy>" })
    const facts = speechPartCardFacts({ part: historical, speechJob: null, directory })
    expect(facts.inputLabel).toBeNull()
    expect(facts.recordingSummary).toContain("Input unknown")
    expect(facts.script).toBe("Selected immutable script")
    expect(facts.scriptState).toBeNull()
    expect(recordingInputLabel("unexpected")).toBeNull()
  })

  it("shows the immutable Tagged input rather than mutable Part words", () => {
    const facts = speechPartCardFacts({
      part: part({
        text: "Mutable editorial words",
        recording_text_state: "tagged",
        clip_tagged_text: "[whispers] Immutable recorded words",
      }),
      speechJob: null,
      directory,
    })
    expect(facts.script).toBe("[whispers] Immutable recorded words")
    expect(facts.scriptState).toBe("tagged")
  })

  it("keeps orthogonal warnings and one shared durable operation interpretation", () => {
    const job: DurableJob<GenerateResult> = {
      id: "speech-1", type: "speech", status: "blocked", progress: 0,
      detail: "Provider may have completed", retries: 1,
      result: { ambiguous: true, requires_review: true },
    }
    const facts = speechPartCardFacts({
      part: part({ outdated: true, missing: true, binding_resolution_status: "unresolved" }),
      speechJob: job, directory,
    })
    expect(facts.alerts.map((item) => item.key)).toEqual(["outdated", "missing", "route"])
    expect(facts.operation).toMatchObject({ kind: "review", label: "RECORDING · REVIEW REQUIRED", canRetry: false })
    expect(facts.methodLine).toContain("Expressive + tags")
  })

  it.each([
    ["queued", 0, {}, "active", "RECORDING · QUEUED", false, false],
    ["running", 43, {}, "active", "RECORDING · GENERATING 43%", false, false],
    ["retrying", 27, {}, "active", "RECORDING · RETRYING", false, false],
    ["blocked", 0, { needs_confirmation: true }, "confirmation", "RECORDING · WAITING FOR CONFIRMATION", false, true],
    ["blocked", 0, { requires_review: true }, "review", "RECORDING · REVIEW REQUIRED", false, false],
    ["failed", 0, {}, "failed", "RECORDING · FAILED", true, false],
    ["lost", 0, {}, "failed", "RECORDING · FAILED", true, false],
    ["cancelled", 0, {}, "failed", "RECORDING · CANCELLED", false, false],
  ] as const)("maps durable %s truth into the conditional operation presentation", (status, progress, result, kind, label, canRetry, canConfirm) => {
    const job = {
      id: `speech-${status}`, type: "speech", status, progress,
      detail: `${status} detail`, retries: 0, result,
    } as DurableJob<GenerateResult>

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
