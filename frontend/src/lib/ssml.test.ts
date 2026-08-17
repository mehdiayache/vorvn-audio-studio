// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { ssmlToPlainText, validateSsmlDocument, wrapPlainTextAsSsml } from "@/lib/ssml"

describe("SSML authoring contract", () => {
  it("wraps plain words without turning their punctuation into XML", () => {
    expect(wrapPlainTextAsSsml("Stay <still> & breathe."))
      .toBe("<speak>\nStay &lt;still&gt; &amp; breathe.\n</speak>")
  })

  it("accepts one speak document and rejects malformed or unsafe XML", () => {
    expect(validateSsmlDocument('<speak>Rest. <break time="500ms"/> Breathe.</speak>').valid).toBe(true)
    expect(validateSsmlDocument("Rest without a root.").valid).toBe(false)
    expect(validateSsmlDocument("<speak>Broken</speak").valid).toBe(false)
    expect(validateSsmlDocument('<!DOCTYPE speak [<!ENTITY x "unsafe">]><speak>&x;</speak>').message)
      .toBe("SSML document declarations and entities are not supported.")
  })

  it("returns only readable words when leaving SSML mode", () => {
    expect(ssmlToPlainText('<speak>Rest. <break time="500ms"/> Breathe.</speak>'))
      .toBe("Rest.  Breathe.")
  })
})
