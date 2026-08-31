import { describe, expect, it } from "vitest"

import type { VentureAsset } from "@/types/domain"

import { resolvePreviewTarget } from "./timeline-preview"

const assets = [
  { id: 1, media_type: "image", name: "Opening frame" },
  { id: 2, media_type: "audio", name: "Room tone" },
] as VentureAsset[]
describe("resolvePreviewTarget", () => {
  it("keeps Timeline Preview explicit independently of Timeline selection", () => {
    expect(resolvePreviewTarget({ kind: "timeline" }, assets)).toEqual({ kind: "timeline" })
  })

  it("opens a Media Browser asset as Source Preview", () => {
    expect(resolvePreviewTarget({ kind: "source", assetId: 2 }, assets)).toEqual({ kind: "source", asset: assets[1] })
  })

  it("returns safely to Timeline Preview when a source no longer exists", () => {
    expect(resolvePreviewTarget({ kind: "source", assetId: 999 }, assets)).toEqual({ kind: "timeline" })
  })
})
