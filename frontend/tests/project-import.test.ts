import { describe, expect, it } from "vitest"

import { decodeProjectImportJson } from "@/features/projects/audiovisual/support/project-import"

describe("Project import decode", () => {
  it("preserves authored JSON verbatim for backend validation", () => {
    const source = { schema: "origins-project-import", version: 1, title: "A deliberate scene", description: "Test", language: "English", items: [{ type: "speech", role: "narrator", text: "The harbor woke before dawn." }] }
    expect(decodeProjectImportJson(JSON.stringify(source))).toEqual(source)
  })

  it("reports only JSON syntax errors locally", () => {
    expect(() => decodeProjectImportJson("{broken")).toThrow("This file is not valid JSON")
  })
})
