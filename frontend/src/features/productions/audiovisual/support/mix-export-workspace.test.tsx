// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MixExportWorkspace, productionMixReadiness } from "@/features/productions/audiovisual/support/mix-export-workspace"
import type { Production, SoundScene, VisualScene } from "@/types/domain"

afterEach(cleanup)

const production = {
  id: 6,
  name: "Evening Reset",
  parts: [{ id: 12, created_at: "2026-08-09T08:00:00", position: 0, kind: "speech", text: "Rest", filename: "part.mp3", clip_id: 22, duration_ms: 2000, cost: 0 }],
  exports: [{ id: 91, production_id: 6, filename: "evening-reset.mp3", manifest: {}, renderer: "ffmpeg-normalized-v1", duration_ms: 2000, size_bytes: 1000, created_at: "2026-08-09T08:10:00" }],
} as unknown as Production
const soundScene = { production_id: 6, revision: 1, document: { version: 1, sequence_overrides: {}, tracks: [{ id: "music", kind: "audio", role: "music", name: "Music", volume: 1, muted: false, clips: [] }] }, can_undo: false, can_redo: false, updated_at: "2026-08-18", resolved: { version: 1, signature: "scene", duration_ms: 2_000, sequence_projection: { signature: "sequence", duration_ms: 2_000, sample_rate: 48_000, spans: [] }, tracks: [{ id: "music", kind: "audio", role: "music", name: "Music", volume: 1, muted: false, clips: [] }], orphans: [] }, sequence_stem: { url: "/audio/stem.mp3", filename: "stem.mp3", duration_ms: 2_000, signature: "sequence", cached: true } } as SoundScene
const visualScene = { production_id: 6, revision: 1, updated_at: "2026-08-27", document: { version: 1, canvas: { width: 1920, height: 1080 }, tracks: [{ id: "video", name: "Video", media_type: "video", visible: true, locked: false, clips: [{ id: "b73bb44a-c8be-4e67-9b65-a554611161a3", file_id: 91, start_ms: 0, duration_ms: 2000, source_offset_ms: 0, fit: "cover", locked: false }] }] } } as VisualScene

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
    render(<MixExportWorkspace production={production} soundScene={soundScene} visualScene={visualScene} exportJob={null} onExport={vi.fn()} onLocatePart={vi.fn()} onOpenHealth={vi.fn()} exporting={false} exportingFormat={null} />)
    expect(screen.getByText("1 of 1 recorded")).toBeTruthy()
    expect(screen.getByText("evening-reset.mp3")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Download/ }).getAttribute("href")).toBe("/api/v1/exports/91/download")
    expect(screen.getByRole("link", { name: "Download MP3" }).getAttribute("download")).toBe("evening-reset.mp3")
    expect(screen.getByText("No provider call or generation spend.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Export MP3" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Export MP4" })).toBeTruthy()
    expect(screen.queryByText(/immutable/i)).toBeNull()
    expect(screen.queryByRole("button", { name: /preview/i })).toBeNull()
  })

  it("keeps durable Export progress visible", () => {
    render(<MixExportWorkspace production={production} soundScene={soundScene} visualScene={visualScene} exportJob={{ id: "job-1", type: "render", status: "running", progress: 0.4, detail: "Mixing audio", error: null, retries: 0, result: {} }} onExport={vi.fn()} onLocatePart={vi.fn()} onOpenHealth={vi.fn()} exporting exportingFormat="mp3" />)
    expect(screen.getByText("Export in progress")).toBeTruthy()
    expect(screen.getByText("Mixing audio")).toBeTruthy()
    expect(screen.getByRole("progressbar", { name: "Export 40% complete" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Exporting MP3…" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Export MP4" })).toBeTruthy()
  })

  it("does not describe a completed Export as zero-percent complete", () => {
    render(<MixExportWorkspace production={production} soundScene={soundScene} visualScene={visualScene} exportJob={{ id: "job-2", type: "render", status: "ok", progress: 0, detail: "", error: null, retries: 0, result: { url: "/audio/final.mp4", name: "final.mp4" } }} onExport={vi.fn()} onLocatePart={vi.fn()} onOpenHealth={vi.fn()} exporting={false} exportingFormat={null} />)
    expect(screen.getByText("Your file is ready to download.")).toBeTruthy()
    expect(screen.getByText("MP4 ready")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Download MP4" }).getAttribute("download")).toBe("final.mp4")
    expect(screen.queryByText("0% complete")).toBeNull()
  })

  it("keeps planned Drafts nonblocking and makes incomplete export explicit", () => {
    const onExport = vi.fn()
    const planned = { ...production, parts: [production.parts[0]!, { ...production.parts[0], id: 13, position: 1, kind: "draft", clip_id: null, filename: undefined }] } as Production
    render(<MixExportWorkspace production={planned} soundScene={soundScene} visualScene={visualScene} exportJob={null} onExport={onExport} onLocatePart={vi.fn()} onOpenHealth={vi.fn()} exporting={false} exportingFormat={null} />)
    expect(screen.queryByText(/blocking issue/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Export MP4" }))
    expect(onExport).toHaveBeenCalledWith("mp4")
  })

  it("keeps MP4 unavailable until a visual is placed", () => {
    const emptyVisual = { ...visualScene, document: { ...visualScene.document, tracks: [] } }
    render(<MixExportWorkspace production={production} soundScene={soundScene} visualScene={emptyVisual} exportJob={null} onExport={vi.fn()} onLocatePart={vi.fn()} onOpenHealth={vi.fn()} exporting={false} exportingFormat={null} />)
    expect(screen.getByRole("button", { name: "Export MP4" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByText("Add an image or video to Timeline first")).toBeTruthy()
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
      { ...production.parts[0], id: 13, position: 1, kind: "file", missing: true },
    ] } as Production)
    expect(result.ready).toBe(false)
    expect(result.blocking.map((issue) => [issue.number, issue.title])).toEqual([[2, "Linked media missing"]])
  })
})
