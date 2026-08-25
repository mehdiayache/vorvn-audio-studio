import { describe, expect, it } from "vitest"

import { decodeProductionImportJson } from "@/features/production/production-import"

describe("Production import JSON boundary", () => {
  it("decodes JSON without inventing configuration", () => {
    const document = decodeProductionImportJson(JSON.stringify({
      schema: "audio-studio-production-import",
      version: 1,
      title: "Quiet story",
      items: [{ type: "speech", role: "Narrator", text: "The room became quiet." }],
    })) as Record<string, unknown>

    expect(document.title).toBe("Quiet story")
    expect((document.items as Record<string, unknown>[])[0]).not.toHaveProperty("speech_mode")
  })

  it("rejects malformed JSON and delegates all schema validation", () => {
    expect(() => decodeProductionImportJson("{broken")).toThrow("not valid JSON")
    expect(decodeProductionImportJson(JSON.stringify({ anything: true }))).toEqual({ anything: true })
  })
})
