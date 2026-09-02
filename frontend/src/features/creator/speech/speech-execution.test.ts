import { describe, expect, it } from "vitest"

import type { GeneratePayload, RecordingHistory } from "@/types/domain"
import { recordingAttemptStatus, recoverSpeechExecutions, reusableGeneratePayload } from "./speech-execution"

const request: GeneratePayload = {
  text: "Hello", voice_identity_id: "identity", binding_id: "binding",
  capability_id: null, format: "mp3", language: "English", instruction: "",
  speech_mode: "exact", rate: 1, pitch: 1, volume: 50, seed: 0,
}

describe("Speak execution history", () => {
  it("recovers active durable attempts after a reload without duplicating local Jobs", () => {
    const history = {
      total_cost: 0,
      recordings: [
        { id: "running-job", status: "running", request },
        { id: "finished-job", status: "ok", request },
      ],
    } as RecordingHistory
    const recovered = recoverSpeechExecutions([], history)
    expect(recovered).toEqual([{ jobId: "running-job", payload: request }])
    expect(recoverSpeechExecutions(recovered, history)).toBe(recovered)
  })

  it("keeps ambiguous work separate from ordinary failures and successful recordings", () => {
    expect(recordingAttemptStatus({ status: "blocked" })).toBe("review")
    expect(recordingAttemptStatus({ status: "failed" })).toBe("failed")
    expect(recordingAttemptStatus({ status: "running" })).toBe("pending")
    expect(recordingAttemptStatus({ status: "ok" })).toBe("ready")
    expect(recordingAttemptStatus({ status: "blocked", continued_by_job_id: "next-job" })).toBe("continued")
  })

  it("replays the provider-neutral command without resolved server facts", () => {
    const replay = reusableGeneratePayload({
      ...request, enable_ssml: true, voice: "provider-voice", engine: "cosyvoice",
      model: "plus", model_id: "cosyvoice-v3-plus", provider: "alibaba",
      provider_region: "intl",
    })
    expect(replay.enable_ssml).toBe(true)
    expect(replay).not.toHaveProperty("voice")
    expect(replay).not.toHaveProperty("engine")
    expect(replay).not.toHaveProperty("model")
    expect(replay).not.toHaveProperty("model_id")
    expect(replay).not.toHaveProperty("provider")
    expect(replay).not.toHaveProperty("provider_region")
  })
})
