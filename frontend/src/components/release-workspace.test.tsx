// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ReleaseWorkspace } from "@/components/release-workspace"
import type { Production } from "@/types/domain"

afterEach(cleanup)

const production = {
  id: 6,
  name: "Evening Reset",
  parts: [{ id: 12, created_at: "2026-08-09T08:00:00", position: 0, kind: "audio", text: "Rest", filename: "part.mp3", cost: 0 }],
  exports: [{ id: 91, production_id: 6, generation_id: 150, filename: "evening-reset.mp3", manifest: {}, renderer: "ffmpeg-normalized-v1", duration_ms: 2000, size_bytes: 1000, created_at: "2026-08-09T08:10:00" }],
} as unknown as Production

describe("ReleaseWorkspace", () => {
  it("shows canonical Export history and downloads by Export identity", () => {
    render(<ReleaseWorkspace production={production} music={{}} previewing={false} productionPlaying={false} onPreview={vi.fn()} onExport={vi.fn()} exporting={false} />)
    expect(screen.getByText("evening-reset.mp3")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Download/ }).getAttribute("href")).toBe("/api/v1/exports/91/download")
  })
})
