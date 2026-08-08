import { describe, expect, it } from "vitest"

import { clipText, formatDuration, formatMoney, partDurationMs, textDirection } from "@/lib/format"

describe("Production formatting contracts", () => {
  it("uses the explicit duration for recorded audio", () => {
    expect(partDurationMs({ kind: "audio", duration_ms: 6360 })).toBe(6360)
  })

  it("uses the editable title as the duration of silence", () => {
    expect(partDurationMs({ kind: "silence", duration_ms: null, title: "2.1" })).toBe(2100)
  })

  it("formats long production duration on one clock", () => {
    expect(formatDuration(3671)).toBe("1:01:11")
  })

  it("does not damage Arabic while shortening display copy", () => {
    expect(clipText("  مشتركة   يتعلمها الإنسان  ", 80)).toBe("مشتركة يتعلمها الإنسان")
    expect(textDirection("مشتركة يتعلمها الإنسان")).toBe("rtl")
    expect(textDirection("A spoken English line")).toBe("ltr")
  })

  it("keeps tiny historical generation costs visible", () => {
    expect(formatMoney(0.001335)).toBe("$0.0013")
  })
})
