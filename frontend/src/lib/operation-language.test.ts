import { describe, expect, it } from "vitest"

import { operatorErrorMessage } from "./operation-language"

describe("operatorErrorMessage", () => {
  it("does not expose database internals as the operator message", () => {
    expect(operatorErrorMessage('ForeignKeyViolation: relation "takes" failed')).toBe("Audio Studio could not save this operation. Its technical record is available in Details.")
  })

  it("explains known provider failures", () => {
    expect(operatorErrorMessage("Alibaba returned no audio.")).toBe("The provider did not return a complete usable recording.")
    expect(operatorErrorMessage("Voice abc no longer exists")).toBe("The selected provider voice is no longer available for this exact route.")
  })
})
