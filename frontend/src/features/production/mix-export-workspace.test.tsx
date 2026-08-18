// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MixExportWorkspace, productionMixReadiness } from "@/features/production/mix-export-workspace"
import type { Production, SoundScene } from "@/types/domain"

afterEach(cleanup)

const production = {
  id: 6,
  name: "Evening Reset",
  parts: [{ id: 12, created_at: "2026-08-09T08:00:00", position: 0, kind: "speech", text: "Rest", filename: "part.mp3", clip_id: 22, duration_ms: 2000, cost: 0 }],
  exports: [{ id: 91, production_id: 6, filename: "evening-reset.mp3", manifest: {}, renderer: "ffmpeg-normalized-v1", duration_ms: 2000, size_bytes: 1000, created_at: "2026-08-09T08:10:00" }],
} as unknown as Production
const soundScene = { production_id: 6, revision: 1, document: { version: 1, tracks: [{ id: "music", kind: "music", name: "Music", volume: 1, muted: false, clips: [] }] }, can_undo: false, can_redo: false, updated_at: "2026-08-18", resolved: { version: 1, signature: "scene", duration_ms: 2_000, sequence_projection: { signature: "sequence", duration_ms: 2_000, sample_rate: 48_000, spans: [] }, tracks: [{ id: "music", kind: "music", name: "Music", volume: 1, muted: false, clips: [] }], orphans: [] }, sequence_stem: { url: "/audio/stem.mp3", filename: "stem.mp3", duration_ms: 2_000, signature: "sequence", cached: true } } as SoundScene

describe("MixExportWorkspace", () => {
  it("excludes disabled Parts from readiness and output duration", () => {
    const readiness = productionMixReadiness({ ...production, parts: [
      production.parts[0]!,
      { ...production.parts[0]!, id: 3, kind: "draft", enabled: false, clip_id: null },
    ] })
    expect(readiness.ready).toBe(true)
    expect(readiness.sequence.map((part) => part.id)).toEqual([12])
    expect(readiness.issues).toEqual([])
  })

  it("shows the current mix, recorded Parts and canonical Export history", () => {
    render(<MixExportWorkspace production={production} soundScene={soundScene} previewing={false} productionPlaying={false} previewReady previewStale={false} exportJob={null} onPreview={vi.fn()} onExport={vi.fn()} onLocatePart={vi.fn()} onOpenHealth={vi.fn()} exporting={false} />)
    expect(screen.getByText("1 of 1 recorded")).toBeTruthy()
    expect(screen.getByText("evening-reset.mp3")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Download/ }).getAttribute("href")).toBe("/api/v1/exports/91/download")
    expect(screen.getByText(/does not call a speech provider/)).toBeTruthy()
  })

  it("keeps durable Export progress visible", () => {
    render(<MixExportWorkspace production={production} soundScene={soundScene} previewing={false} productionPlaying={false} previewReady={false} previewStale={false} exportJob={{ id: "job-1", type: "render", status: "running", progress: 0.4, detail: "Mixing audio", error: null, retries: 0, result: {} }} onPreview={vi.fn()} onExport={vi.fn()} onLocatePart={vi.fn()} onOpenHealth={vi.fn()} exporting />)
    expect(screen.getByText("Export in progress")).toBeTruthy()
    expect(screen.getByText("Mixing audio")).toBeTruthy()
    expect(screen.getByRole("progressbar", { name: "Export 40% complete" })).toBeTruthy()
  })

  it("does not describe a completed Export as zero-percent complete", () => {
    render(<MixExportWorkspace production={production} soundScene={soundScene} previewing={false} productionPlaying={false} previewReady previewStale={false} exportJob={{ id: "job-2", type: "render", status: "ok", progress: 0, detail: "", error: null, retries: 0, result: { url: "/audio/final.mp3" } }} onPreview={vi.fn()} onExport={vi.fn()} onLocatePart={vi.fn()} onOpenHealth={vi.fn()} exporting={false} />)
    expect(screen.getByText("Finished and recorded as an immutable Production output.")).toBeTruthy()
    expect(screen.queryByText("0% complete")).toBeNull()
  })

  it("keeps planned Drafts nonblocking and makes incomplete export explicit", () => {
    const onExport = vi.fn()
    const planned = { ...production, parts: [production.parts[0]!, { ...production.parts[0], id: 13, position: 1, kind: "draft", clip_id: null, filename: undefined }] } as Production
    render(<MixExportWorkspace production={planned} soundScene={soundScene} previewing={false} productionPlaying={false} previewReady={false} previewStale exportJob={null} onPreview={vi.fn()} onExport={onExport} onLocatePart={vi.fn()} onOpenHealth={vi.fn()} exporting={false} />)
    expect(screen.getByRole("button", { name: /Refresh preview/ })).toBeTruthy()
    expect(screen.queryByText(/blocking issue/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Export recorded audio/ }))
    expect(onExport).toHaveBeenCalledOnce()
  })
})

describe("productionMixReadiness", () => {
  it("allows a real silence-only output and reports no invented provider requirement", () => {
    const result = productionMixReadiness({ ...production, parts: [{ id: 41, created_at: "2026-08-09T08:00:00", position: 0, kind: "silence", title: "2.5", text: "", duration_ms: 2500 }] } as Production)
    expect(result.ready).toBe(true)
    expect(result.blocking).toEqual([])
  })

  it("keeps stable Part numbers on every blocking issue", () => {
    const result = productionMixReadiness({ ...production, parts: [
      { ...production.parts[0], kind: "draft", clip_id: null, filename: undefined },
      { ...production.parts[0], id: 13, position: 1, kind: "asset", missing: true },
    ] } as Production)
    expect(result.ready).toBe(false)
    expect(result.blocking.map((issue) => [issue.number, issue.title])).toEqual([[2, "Linked media missing"]])
  })
})
