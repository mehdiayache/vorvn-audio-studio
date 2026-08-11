import { describe, expect, it } from "vitest"

import { belongsToRecordingSession } from "./speak-execution"

describe("Speak execution ownership", () => {
  it("rejects a completion from session A after the operator starts session B", () => {
    expect(belongsToRecordingSession("session-a", "session-b")).toBe(false)
    expect(belongsToRecordingSession("session-b", "session-b")).toBe(true)
  })
})
