import { describe, expect, it } from "vitest"

import { parseProductionImportText } from "@/features/production/production-import"

const document = {
  schema: "audio-studio-production-import",
  version: 1,
  title: "A deliberate scene",
  items: [
    { type: "speech", role: "narrator", text: "The harbor woke before dawn.", language: "English", speech_mode: "directed", instruction: "Quiet documentary narration.", rate: 0.9, pitch: 1, volume: 58, seed: 4, format: "mp3" },
    { type: "silence", seconds: 1.25 },
    { type: "speech", role: "narrator", text: "A single lamp remained lit.", language: "English", speech_mode: "exact", instruction: "", rate: 1, pitch: 1, volume: 60, seed: 5, format: "wav" },
    { type: "speech", role: "keeper", text: "No boat leaves until the weather clears.", language: "English", speech_mode: "directed", instruction: "Firm, practical, not angry.", rate: 0.95, pitch: 0.94, volume: 64, seed: 6, format: "mp3" },
  ],
}

describe("Production import parser", () => {
  it("detects exact counts and stable first-seen roles locally", () => {
    const parsed = parseProductionImportText(JSON.stringify(document))
    expect(parsed.speechCount).toBe(3)
    expect(parsed.silenceCount).toBe(1)
    expect(parsed.roles).toEqual([
      { name: "narrator", count: 2 },
      { name: "keeper", count: 1 },
    ])
    expect(parsed.document).toEqual(document)
  })

  it("reports invalid JSON and item-numbered contract errors", () => {
    expect(() => parseProductionImportText("{broken"))
      .toThrow("This file is not valid JSON")
    const invalid = structuredClone(document) as typeof document & { items: Array<Record<string, unknown>> }
    invalid.items[2]!.provider = "not-supported"
    expect(() => parseProductionImportText(JSON.stringify(invalid)))
      .toThrow("Item 3: unsupported field “provider”")
  })

  it("preserves long creative direction without imposing a character limit", () => {
    const longDirection = "Warm, intimate bedtime narration with natural pauses and restrained cinematic tension. ".repeat(30)
    const authored = structuredClone(document)
    authored.items[0]!.instruction = longDirection

    expect(parseProductionImportText(JSON.stringify(authored)).document.items[0])
      .toMatchObject({ instruction: longDirection })
  })
})
