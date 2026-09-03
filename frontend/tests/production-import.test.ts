import { describe, expect, it } from "vitest"

import { decodeProductionImportJson } from "@/features/productions/audiovisual/support/production-import"

describe("Production import decode", () => {
  it("preserves authored JSON verbatim for backend validation", () => {
    const source = { schema: "origins-production-import", version: 1, title: "A deliberate scene", description: "Test", language: "English", items: [{ type: "speech", role: "narrator", text: "The harbor woke before dawn." }] }
    expect(decodeProductionImportJson(JSON.stringify(source))).toEqual(source)
  })

  it("reports only JSON syntax errors locally", () => {
    expect(() => decodeProductionImportJson("{broken")).toThrow("This file is not valid JSON")
  })
})
