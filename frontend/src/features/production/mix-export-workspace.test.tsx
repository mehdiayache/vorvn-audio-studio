// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MixExportWorkspace } from "@/features/production/mix-export-workspace"
import type { Production } from "@/types/domain"

afterEach(cleanup)

const production = {
  id: 6,
  name: "Evening Reset",
  parts: [{ id: 12, created_at: "2026-08-09T08:00:00", position: 0, kind: "speech", text: "Rest", filename: "part.mp3", selected_take_id: 22, duration_ms: 2000, cost: 0 }],
  exports: [{ id: 91, production_id: 6, filename: "evening-reset.mp3", manifest: {}, renderer: "ffmpeg-normalized-v1", duration_ms: 2000, size_bytes: 1000, created_at: "2026-08-09T08:10:00" }],
} as unknown as Production

describe("MixExportWorkspace", () => {
  it("shows the current mix, selected Takes and canonical Export history", () => {
    render(<MixExportWorkspace production={production} music={{}} previewing={false} productionPlaying={false} exportJob={null} onPreview={vi.fn()} onExport={vi.fn()} exporting={false} />)
    expect(screen.getByText("1 selected Takes")).toBeTruthy()
    expect(screen.getByText("evening-reset.mp3")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Download/ }).getAttribute("href")).toBe("/api/v1/exports/91/download")
  })

  it("keeps durable Export progress visible", () => {
    render(<MixExportWorkspace production={production} music={{}} previewing={false} productionPlaying={false} exportJob={{ id: "job-1", type: "render", status: "running", progress: 0.4, detail: "Mixing audio", error: null, retries: 0, result: {} }} onPreview={vi.fn()} onExport={vi.fn()} exporting />)
    expect(screen.getByText("Export in progress")).toBeTruthy()
    expect(screen.getByText("Mixing audio")).toBeTruthy()
  })
})
