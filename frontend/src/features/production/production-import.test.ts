import { describe, expect, it } from "vitest"

import { parseProductionImportText } from "@/features/production/production-import"

describe("Production import V1", () => {
  it("accepts the lean editorial form without technical speech settings", () => {
    const parsed = parseProductionImportText(JSON.stringify({
      schema: "audio-studio-production-import",
      version: 1,
      title: "Quiet story",
      items: [
        { type: "speech", role: "Narrator", text: "The room became quiet." },
        { type: "silence", seconds: 1.5 },
      ],
    }))

    expect(parsed.document.items[0]).toEqual({
      type: "speech", role: "Narrator", text: "The room became quiet.",
      language: "Auto", speech_mode: "exact", instruction: "",
      rate: 1, pitch: 1, volume: 50, seed: 0, format: "mp3",
    })
    expect(parsed.roles).toEqual([{ name: "Narrator", count: 1 }])
  })

  it("maps role variants to the first visible label", () => {
    const parsed = parseProductionImportText(JSON.stringify({
      schema: "audio-studio-production-import",
      version: 1,
      title: "Role normalization",
      items: [
        { type: "speech", role: " Narrator ", text: "First." },
        { type: "speech", role: "narrator", text: "Second." },
        { type: "speech", role: "NARRATOR   ", text: "Third." },
      ],
    }))

    expect(parsed.roles).toEqual([{ name: "Narrator", count: 3 }])
    expect(parsed.document.items.map((item) => item.type === "speech" && item.role))
      .toEqual(["Narrator", "Narrator", "Narrator"])
  })

  it("validates optional overrides only when they are supplied", () => {
    expect(() => parseProductionImportText(JSON.stringify({
      schema: "audio-studio-production-import",
      version: 1,
      title: "Bad override",
      items: [{ type: "speech", role: "Narrator", text: "Speak.", format: "flac" }],
    }))).toThrow("format must be")
  })
})
