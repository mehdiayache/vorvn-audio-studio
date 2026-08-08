import { describe, expect, it } from "vitest"

import { playableGenerateResult } from "./generated-audio"

describe("playableGenerateResult", () => {
  it("keeps the canonical URL returned by the server", () => {
    expect(playableGenerateResult({ name: "take.mp3", url: "/audio/canonical.mp3" }).url).toBe("/audio/canonical.mp3")
  })

  it("recovers a successful legacy take response from its filename", () => {
    expect(playableGenerateResult({ id: 127, name: "new take.mp3" }).url).toBe("/audio/new%20take.mp3")
  })

  it("rejects a response that cannot identify any audio", () => {
    expect(() => playableGenerateResult({ id: 127 })).toThrow(/without returning its audio file/i)
  })
})
