import { describe, expect, it } from "vitest"

import { operationStatusLabel, operatorErrorMessage } from "./operation-language"

describe("operatorErrorMessage", () => {
  it("does not expose database internals as the operator message", () => {
    expect(operatorErrorMessage('ForeignKeyViolation: relation "clips" failed')).toBe("Auvi Studio could not save this operation. Its technical record is available in Details.")
  })

  it("explains known provider failures", () => {
    expect(operatorErrorMessage("Alibaba returned no audio.")).toBe("The provider did not return a complete usable recording.")
    expect(operatorErrorMessage("Voice abc no longer exists")).toBe("The selected provider voice is no longer available for this exact route.")
  })
})

describe("operationStatusLabel", () => {
  it.each([
    ["queued", null, "Queued"],
    ["running", null, "Running"],
    ["retrying", null, "Retrying"],
    ["blocked", { needs_confirmation: true }, "Cost confirmation needed"],
    ["blocked", { requires_review: true }, "Review required"],
    ["failed", null, "Failed"],
    ["ok", null, "Completed"],
    ["warning", null, "Completed with warning"],
    ["cancelled", null, "Cancelled"],
  ] as const)("maps %s to the shared operator state", (status, result, expected) => {
    expect(operationStatusLabel(status, result)).toBe(expected)
  })
})
