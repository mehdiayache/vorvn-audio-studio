// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FilePreviewDialog } from "./file-preview-dialog"

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("FilePreviewDialog", () => {
  it("loads plain-text content on demand and exposes copy and download", async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    const fetchMock = vi.fn(async () => new Response("Origins universal File\nSecond line", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    render(<FilePreviewDialog file={{
      id: 21,
      name: "Production brief",
      media_type: "document",
      filename: "stored-brief.txt",
      mime_type: "text/plain",
      metadata: { original_filename: "client-brief.txt" },
    }} onOpenChange={vi.fn()} />)

    expect(await screen.findByText(/Origins universal File/)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith("/media/stored-brief.txt", expect.objectContaining({ signal: expect.any(AbortSignal) }))
    const toolbar = screen.getByRole("toolbar", { name: "File actions" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Copy" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Origins universal File\nSecond line"))
    const download = within(toolbar).getByRole("link", { name: "Download Production brief" })
    expect(download.getAttribute("href")).toBe("/media/stored-brief.txt")
    expect(download.getAttribute("download")).toBe("client-brief.txt")
    expect(document.querySelector(".file-text-preview button[aria-label='Copy']")).toBeNull()
  })

  it("renders Markdown as a safe document and keeps its source available", async () => {
    render(<FilePreviewDialog file={{
      id: 25,
      name: "Read me",
      media_type: "document",
      filename: "read-me.md",
      mime_type: "text/markdown",
      text: "# Origins brief\n\n**Important** context.\n\n<script>unsafe()</script>",
    }} onOpenChange={vi.fn()} />)

    expect(await screen.findByRole("heading", { name: "Origins brief" })).toBeTruthy()
    expect(document.querySelector(".file-markdown-document script")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Source" }))
    expect(screen.getByRole("region", { name: "MD preview" }).querySelector("pre")?.textContent).toContain("# Origins brief")
  })

  it("presents CSV content as a bounded data table", async () => {
    render(<FilePreviewDialog file={{
      id: 26,
      name: "Campaign metrics",
      media_type: "data",
      filename: "metrics.csv",
      mime_type: "text/csv",
      text: 'channel,headline,notes\nemail,"Launch, now","Line one\nLine two"',
    }} onOpenChange={vi.fn()} />)

    const table = await screen.findByRole("table")
    expect(within(table).getByRole("columnheader", { name: "channel" })).toBeTruthy()
    expect(within(table).getByRole("cell", { name: "Launch, now" })).toBeTruthy()
    expect(within(table).getByRole("cell", { name: /Line one/ }).textContent).toBe("Line one\nLine two")
  })

  it("formats valid JSON without executing it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"name":"Origins","ready":true}', { status: 200 })))

    render(<FilePreviewDialog file={{
      id: 22,
      name: "Manifest",
      media_type: "data",
      filename: "manifest.json",
      mime_type: "application/json",
    }} onOpenChange={vi.fn()} />)

    const preview = await screen.findByRole("region", { name: "JSON preview" })
    expect(preview.querySelector("pre")?.textContent).toBe('{\n  "name": "Origins",\n  "ready": true\n}')
  })

  it("renders a full-width audio control and keeps download universal", () => {
    render(<FilePreviewDialog file={{
      id: 23,
      name: "Voice note",
      media_type: "audio",
      filename: "voice-note.mp3",
      mime_type: "audio/mpeg",
      duration_ms: 1_900,
    }} onOpenChange={vi.fn()} />)

    const player = document.querySelector<HTMLAudioElement>(".file-audio-preview audio")
    expect(player?.controls).toBe(true)
    expect(player?.getAttribute("src")).toBe("/audio/voice-note.mp3")
    expect(screen.getByRole("link", { name: "Download Voice note" })).toBeTruthy()
  })

  it("reports a failed text preview without removing the download path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })))

    render(<FilePreviewDialog file={{ id: 24, name: "Missing notes", media_type: "document", filename: "missing.txt" }} onOpenChange={vi.fn()} />)

    expect((await screen.findByRole("alert")).textContent).toContain("The File is still safe to download.")
    expect(screen.getByRole("link", { name: "Download Missing notes" })).toBeTruthy()
  })
})
