import { describe, expect, it } from "vitest"

import { playableGenerateResult } from "./generated-audio"

describe("playableGenerateResult", () => {
  it("keeps the canonical URL returned by the server", () => {
    expect(playableGenerateResult({ name: "clip.mp3", url: "/audio/canonical.mp3" }).url).toBe("/audio/canonical.mp3")
  })

  it("recovers a successful legacy clip response from its filename", () => {
    expect(playableGenerateResult({ id: 127, name: "new clip.mp3" }).url).toBe("/audio/new%20clip.mp3")
  })

  it("rejects a response that cannot identify any audio", () => {
    expect(() => playableGenerateResult({ id: 127 })).toThrow(/without returning its audio file/i)
  })
})
