import { describe, expect, it } from "vitest"

import type { GeneratePayload, RecordingSession } from "@/types/domain"
import { belongsToRecordingSession, recordingAttemptStatus, recoverSpeakExecutions } from "./speak-execution"

const request = { text: "Hello", voice: "voice", binding_id: "binding" } as GeneratePayload

describe("Speak execution ownership", () => {
  it("rejects a completion from session A after the operator starts session B", () => {
    expect(belongsToRecordingSession("session-a", "session-b")).toBe(false)
    expect(belongsToRecordingSession("session-b", "session-b")).toBe(true)
  })

  it("recovers active durable attempts after a reload without duplicating local Jobs", () => {
    const session = {
      id: "session-a", total_cost: 0,
      attempts: [
        { id: "running-job", status: "running", request },
        { id: "finished-job", status: "ok", request },
      ],
    } as RecordingSession
    const recovered = recoverSpeakExecutions([], session)
    expect(recovered).toEqual([{ jobId: "running-job", sessionId: "session-a", payload: request }])
    expect(recoverSpeakExecutions(recovered, session)).toBe(recovered)
  })

  it("keeps ambiguous work separate from ordinary failures and successful Takes", () => {
    expect(recordingAttemptStatus({ status: "blocked" })).toBe("review")
    expect(recordingAttemptStatus({ status: "failed" })).toBe("failed")
    expect(recordingAttemptStatus({ status: "running" })).toBe("pending")
    expect(recordingAttemptStatus({ status: "ok" })).toBe("ready")
  })
})
