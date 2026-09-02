import { describe, expect, it } from "vitest"

import type { WorkspaceFile } from "@/types/domain"
import { fileDetails, fileProvenance, fileSource, fileSourceLine } from "../file-provenance"

function file(metadata: Record<string, unknown> = {}, versionMetadata: Record<string, unknown> = {}): WorkspaceFile {
  return { id: 1, media_type: "image", metadata, version_metadata: versionMetadata }
}

describe("canonical File provenance", () => {
  it.each([
    ["audio generation", file({ origin: "generated" })],
    ["version-level generation", file({}, { origin: "generated" })],
  ])("classifies %s as generated", (_label, value) => {
    expect(fileSource(value)).toBe("generated")
  })

  it("classifies Freesound from its canonical origin", () => {
    expect(fileSource(file({ origin: "freesound" }))).toBe("freesound")
  })

  it("distinguishes uploads from Files without invented provenance", () => {
    expect(fileSource(file({ origin: "uploaded" }))).toBe("uploaded")
    expect(fileSource(file())).toBe("library")
    expect(fileSourceLine(file())).toBe("Existing File")
  })

  it("uses immutable version metadata when presenting generated model identity", () => {
    expect(fileSourceLine(file({}, {
      origin: "generated",
      provider_model_id: "kling-3.0-omni",
    }))).toBe("Generated · kling-3.0-omni")
  })

  it("uses only persisted provider and model identity", () => {
    const kling = file({}, {
      origin: "generated",
      provider_id: "kie",
      provider_model_id: "kling-3.0-omni",
    })
    expect(fileProvenance(kling)).toMatchObject({
      provider: "kie",
      model: "kling-3.0-omni",
      detail: "Generated · kie · kling-3.0-omni",
    })
    expect(fileDetails(kling)).toEqual(expect.arrayContaining([
      { label: "Provider", value: "kie" },
      { label: "Model", value: "kling-3.0-omni" },
    ]))
    expect(fileDetails(file({ origin: "generated" })).some(({ value }) => value.includes("VORVN") || value.includes("ai.vrn.one"))).toBe(false)
  })
})
