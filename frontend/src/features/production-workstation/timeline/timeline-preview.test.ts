import { describe, expect, it } from "vitest"

import type { SequenceProjectionSpan, VentureAsset } from "@/types/domain"

import { resolvePreviewTarget } from "./timeline-preview"
import type { WorkstationSelection } from "./workstation-selection"

const assets = [
  { id: 1, media_type: "image", name: "Opening frame" },
  { id: 2, media_type: "audio", name: "Room tone" },
] as VentureAsset[]
const selection = {
  kind: "script-part",
  span: { part_id: 7, part_public_id: "part-7", title: "Opening" } as SequenceProjectionSpan,
} satisfies WorkstationSelection

describe("resolvePreviewTarget", () => {
  it("keeps Timeline Preview explicit even while a clip remains selected", () => {
    expect(resolvePreviewTarget({ kind: "timeline" }, selection, assets)).toEqual({ kind: "timeline" })
  })

  it("resolves the selected clip only in Clip Preview mode", () => {
    expect(resolvePreviewTarget({ kind: "clip" }, selection, assets)).toEqual({ kind: "clip", selection })
    expect(resolvePreviewTarget({ kind: "clip" }, null, assets)).toEqual({ kind: "timeline" })
  })

  it("opens a library asset as Source Preview without replacing selection", () => {
    expect(resolvePreviewTarget({ kind: "source", assetId: 2 }, selection, assets)).toEqual({ kind: "source", asset: assets[1] })
  })

  it("returns safely to Timeline Preview when a source no longer exists", () => {
    expect(resolvePreviewTarget({ kind: "source", assetId: 999 }, selection, assets)).toEqual({ kind: "timeline" })
  })
})
