import { describe, expect, it } from "vitest"

import { fileDetails, fileSource, fileSourceLine } from "@/lib/file-provenance"
import type { WorkspaceFile } from "@/types/domain"

function file(metadata: Record<string, unknown>): WorkspaceFile {
  return {
    id: 1, name: "Test File", metadata, version_metadata: {},
    tags: [], media_type: "audio", audio_format: "wav", duration_ms: 3200,
  } as WorkspaceFile
}

describe("File provenance", () => {
  it("normalizes generated metadata without provider-specific UI branches", () => {
    const generated = file({
      origin: "generated", model: "stable-audio-3-small-music",
      resolved_prompt: "Quiet piano underscore", seed: 71,
    })
    expect(fileSource(generated)).toBe("generated")
    expect(fileSourceLine(generated)).toBe("Generated · Stable Audio")
    expect(fileDetails(generated)).toEqual(expect.arrayContaining([
      { label: "Prompt", value: "Quiet piano underscore" },
      { label: "Seed", value: "71" },
    ]))
    expect(fileDetails(generated).some((detail) => detail.label === "Scope"))
      .toBe(false)
  })

  it("keeps Freesound and upload truth explicit", () => {
    expect(fileSourceLine(file({
      origin: "imported", provider_id: "freesound", creator: "Ana",
    }))).toBe("Imported · Freesound · Ana")
    expect(fileDetails(file({ origin: "uploaded", original_filename: "room.wav" })))
      .toContainEqual({ label: "Original file", value: "room.wav" })
  })
})
