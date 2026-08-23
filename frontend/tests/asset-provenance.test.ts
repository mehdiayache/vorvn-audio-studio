import { describe, expect, it } from "vitest"

import { assetDetails, assetSource, assetSourceLine } from "@/lib/asset-provenance"

describe("asset provenance", () => {
  it("normalizes generated metadata without provider-specific UI branches", () => {
    const asset = {
      id: 1, scope: "studio" as const, audio_format: "wav", duration_ms: 3200,
      metadata: {
        origin: "generated", model: "stable-audio-3-small-music",
        resolved_prompt: "Quiet piano underscore", seed: 71,
      },
    }
    expect(assetSource(asset)).toBe("generated")
    expect(assetSourceLine(asset)).toBe("Generated · Stable Audio · Music")
    expect(assetDetails(asset)).toEqual(expect.arrayContaining([
      { label: "Prompt", value: "Quiet piano underscore" },
      { label: "Seed", value: "71" },
      { label: "Scope", value: "Studio Library" },
    ]))
  })

  it("keeps Freesound and upload truth explicit", () => {
    expect(assetSourceLine({ id: 2, metadata: { origin: "freesound", creator: "Ana" } }))
      .toBe("Freesound · Ana")
    expect(assetDetails({ id: 3, metadata: { origin: "upload", original_filename: "room.wav" } }))
      .toContainEqual({ label: "Original file", value: "room.wav" })
  })
})
