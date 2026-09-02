import { describe, expect, it } from "vitest"

import { decodeProjectImportJson } from "@/features/projects/audiovisual/support/project-import"

describe("Project import JSON boundary", () => {
  it("decodes JSON without inventing configuration", () => {
    const document = decodeProjectImportJson(JSON.stringify({
      schema: "origins-project-import",
      version: 1,
      title: "Quiet story",
      items: [{ type: "speech", role: "Narrator", text: "The room became quiet." }],
    })) as Record<string, unknown>

    expect(document.title).toBe("Quiet story")
    expect((document.items as Record<string, unknown>[])[0]).not.toHaveProperty("speech_mode")
  })

  it("rejects malformed JSON and delegates all schema validation", () => {
    expect(() => decodeProjectImportJson("{broken")).toThrow("not valid JSON")
    expect(decodeProjectImportJson(JSON.stringify({ anything: true }))).toEqual({ anything: true })
  })
})
