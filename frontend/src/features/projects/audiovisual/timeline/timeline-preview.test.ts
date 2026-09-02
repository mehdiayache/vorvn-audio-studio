import { describe, expect, it } from "vitest"

import type { WorkspaceFile } from "@/types/domain"

import { resolvePreviewTarget } from "./timeline-preview"

const files = [
  { id: 1, media_type: "image", name: "Opening frame" },
  { id: 2, media_type: "audio", name: "Room tone" },
] as WorkspaceFile[]
describe("resolvePreviewTarget", () => {
  it("keeps Timeline Preview explicit independently of Timeline selection", () => {
    expect(resolvePreviewTarget({ kind: "timeline" }, files)).toEqual({ kind: "timeline" })
  })

  it("opens a Media Browser file as Source Preview", () => {
    expect(resolvePreviewTarget({ kind: "source", fileId: 2 }, files)).toEqual({ kind: "source", file: files[1] })
  })

  it("returns safely to Timeline Preview when a source no longer exists", () => {
    expect(resolvePreviewTarget({ kind: "source", fileId: 999 }, files)).toEqual({ kind: "timeline" })
  })
})
