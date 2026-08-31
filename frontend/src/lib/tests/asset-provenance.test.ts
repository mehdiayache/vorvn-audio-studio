import { describe, expect, it } from "vitest"

import type { VentureAsset } from "@/types/domain"
import { assetSource, assetSourceLine } from "../asset-provenance"

function asset(metadata: Record<string, unknown> = {}, versionMetadata: Record<string, unknown> = {}): VentureAsset {
  return { id: 1, media_type: "image", metadata, version_metadata: versionMetadata }
}

describe("canonical Asset provenance", () => {
  it.each([
    ["audio generation", asset({ origin: "generated" })],
    ["Director generation", asset({ origin: "director-generation" })],
    ["legacy generated flag", asset({ generated: true })],
    ["legacy generator identity", asset({ generator: "stable-audio" })],
    ["version-level Director generation", asset({}, { origin: "director-generation" })],
  ])("classifies %s as generated", (_label, value) => {
    expect(assetSource(value)).toBe("generated")
  })

  it.each([
    ["origin", asset({ origin: "freesound" })],
    ["provider", asset({ provider: "Freesound API" })],
    ["version source", asset({}, { source: "freesound-import" })],
  ])("classifies Freesound from %s", (_label, value) => {
    expect(assetSource(value)).toBe("freesound")
  })

  it("distinguishes uploads from legacy Assets without invented provenance", () => {
    expect(assetSource(asset({ origin: "upload" }))).toBe("uploaded")
    expect(assetSource(asset({ origin: "uploaded" }))).toBe("uploaded")
    expect(assetSource(asset())).toBe("library")
    expect(assetSourceLine(asset())).toBe("Existing Asset")
  })

  it("uses immutable version metadata when presenting generated model identity", () => {
    expect(assetSourceLine(asset({}, {
      origin: "director-generation",
      provider_model_id: "kling-3.0-omni",
    }))).toBe("Generated · kling-3.0-omni")
  })
})

