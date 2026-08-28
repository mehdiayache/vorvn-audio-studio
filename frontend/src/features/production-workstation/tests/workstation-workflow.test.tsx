// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ attachDirectorAsset: vi.fn(), detachDirectorAsset: vi.fn() }))
vi.mock("@/lib/api", () => ({ studioApi: api }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})

import { DirectorStage } from "../director/director-stage"
import { DirectorPreviewDialog } from "../director/director-preview-dialog"
import { visualAssetDetails, visualAssetPlaybackUrl, visualAssetPosterUrl, visualFileIssue } from "../director/director-assets"
import { VisualAssetCard } from "../director/visual-asset-card"
import { WORKSTATION_STAGES } from "../workstation-workflow"

describe("Production workflow", () => {
  it("presents the four accepted operator stages in order", () => {
    expect(WORKSTATION_STAGES.map(({ id, label, description }) => ({ id, label, description }))).toEqual([
      { id: "sequence", label: "Script", description: "Voice and story" },
      { id: "director", label: "Director", description: "Create and collect visuals" },
      { id: "sound", label: "Timeline", description: "Assemble the production" },
      { id: "mix", label: "Export", description: "Finish and deliver" },
    ])
  })

  it("starts Director as an intentional visual workspace instead of a fake tool", () => {
    render(<DirectorStage productionId={7} assets={[]} directorAssetIds={[]} onUpload={vi.fn()} onRefresh={vi.fn()} />)

    expect(screen.getByRole("textbox", { name: "Visual direction" })).toBeTruthy()
    expect(screen.getByText("Creation providers will connect here later. Upload and Library work now.")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "No visuals collected yet" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy()
    expect(screen.queryByText(/AI|Generate/)).toBeNull()
  })

  it("adds a reusable visual to the Production without placing it on the Timeline", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    api.attachDirectorAsset.mockResolvedValue({ asset_id: 88, duplicate: false })
    render(<DirectorStage
      productionId={7}
      assets={[{ id: 88, media_type: "image", name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }]}
      directorAssetIds={[]}
      onUpload={vi.fn()}
      onRefresh={refresh}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Library" }))
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(api.attachDirectorAsset).toHaveBeenCalledWith(7, 88))
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole("button", { name: /Add to Timeline/ })).toBeNull()
  })

  it("accepts visual files across the Director surface and shows the real pending object", async () => {
    let finishUpload: ((asset: { id: number; media_type: "image"; name: string; filename: string }) => void) | undefined
    const onUpload = vi.fn(() => new Promise<{ id: number; media_type: "image"; name: string; filename: string }>((resolve) => { finishUpload = resolve }))
    const refresh = vi.fn().mockResolvedValue(undefined)
    api.attachDirectorAsset.mockResolvedValue({ asset_id: 91, duplicate: false })
    render(<DirectorStage productionId={7} assets={[]} directorAssetIds={[]} onUpload={onUpload} onRefresh={refresh} />)

    const file = new File(["visual"], "harbour-dusk.png", { type: "image/png" })
    fireEvent.drop(screen.getByRole("main"), { dataTransfer: { files: [file], types: ["Files"], dropEffect: "none" } })

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file))
    expect(screen.getByRole("heading", { name: "harbour-dusk.png" })).toBeTruthy()
    expect(screen.getByText("Uploading…")).toBeTruthy()

    finishUpload?.({ id: 91, media_type: "image", name: "Harbour dusk", filename: "harbour-dusk.png" })
    await waitFor(() => expect(api.attachDirectorAsset).toHaveBeenCalledWith(7, 91))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it("keeps a failed upload visible with an explicit retry", async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error("The video container is not supported."))
    render(<DirectorStage productionId={7} assets={[]} directorAssetIds={[]} onUpload={onUpload} onRefresh={vi.fn()} />)

    fireEvent.drop(screen.getByRole("main"), { dataTransfer: { files: [new File(["video"], "scene.mov", { type: "video/quicktime" })], types: ["Files"], dropEffect: "none" } })

    expect(await screen.findByText("Upload needs attention")).toBeTruthy()
    expect(screen.getByText("The video container is not supported.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Retry scene.mov" })).toBeTruthy()
  })

  it("rejects unsupported and oversized visuals before upload", () => {
    expect(visualFileIssue(new File(["text"], "notes.txt", { type: "text/plain" }))).toContain("not a supported image or video")
    const large = new File(["video"], "feature.mp4", { type: "video/mp4" })
    Object.defineProperty(large, "size", { value: 1_000_000_001 })
    expect(visualFileIssue(large)).toContain("over the 1 GB media limit")
  })

  it("projects canonical visual metadata into editing facts without inventing missing values", () => {
    expect(visualAssetDetails({
      id: 44,
      media_type: "video",
      width: 1920,
      height: 1080,
      duration_ms: 12_400,
      media_format: "mp4",
      mime_type: "video/mp4",
      video_codec: "h264",
      frame_rate: 29.97,
      size_bytes: 2_621_440,
      scope: "venture",
      category: "other",
      tags: ["harbour", "dusk"],
      created_at: "2026-08-25T10:00:00Z",
    })).toMatchObject({
      technical: expect.arrayContaining([
        { label: "Dimensions", value: "1920 × 1080" },
        { label: "Duration", value: "12.4s" },
        { label: "Codec", value: "H264" },
        { label: "Frame rate", value: "29.97 fps" },
        { label: "File size", value: "2.5 MB" },
      ]),
      library: expect.arrayContaining([
        { label: "Available in", value: "Venture Library" },
        { label: "Tags", value: "harbour, dusk" },
      ]),
    })
  })

  it("marks Director removal as a confirmation-opening collection action", async () => {
    const asset = { id: 88, media_type: "image" as const, name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }
    const remove = vi.fn()
    render(<VisualAssetCard asset={asset} onPreview={vi.fn()} onRemove={remove} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Harbour dusk" }), { button: 0, ctrlKey: false })
    const action = await screen.findByText("Remove from Director…")
    expect(screen.queryByText("Remove from Production")).toBeNull()
    fireEvent.click(action)
    expect(remove).toHaveBeenCalledWith(asset)
  })

  it("offers both Director images and videos for Timeline placement", async () => {
    const image = { id: 88, media_type: "image" as const, name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }
    const add = vi.fn()
    render(<VisualAssetCard asset={image} onPreview={vi.fn()} onAddToTimeline={add} />)
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Harbour dusk" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText("Add to Timeline"))
    expect(add).toHaveBeenCalledWith(image)

    cleanup()
    const video = { ...image, media_type: "video" as const, name: "Harbour move", filename: "harbour.mp4", duration_ms: 8_000, media_format: "mp4", video_codec: "h264" }
    render(<VisualAssetCard asset={video} onPreview={vi.fn()} onAddToTimeline={add} />)
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Harbour move" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText("Add to Timeline"))
    expect(add).toHaveBeenCalledWith(video)
  })

  it("exposes direct preview and Timeline actions without opening the overflow menu", () => {
    const asset = { id: 88, media_type: "image" as const, name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }
    const preview = vi.fn()
    const add = vi.fn()
    render(<VisualAssetCard asset={asset} onPreview={preview} onAddToTimeline={add} />)

    fireEvent.click(screen.getAllByRole("button", { name: "Preview Harbour dusk" })[1]!)
    fireEvent.click(screen.getByRole("button", { name: "Add Harbour dusk to Timeline" }))

    expect(preview).toHaveBeenCalledWith(asset)
    expect(add).toHaveBeenCalledWith(asset)
  })

  it("requires confirmation before detaching a visual from Director", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const confirm = vi.fn()
    const asset = { id: 88, media_type: "image" as const, name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }
    api.detachDirectorAsset.mockResolvedValue({ asset_id: 88 })
    render(<DirectorStage productionId={7} assets={[asset]} directorAssetIds={[88]} onUpload={vi.fn()} onRefresh={refresh} onConfirmAction={confirm} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Harbour dusk" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText("Remove from Director…"))

    expect(api.detachDirectorAsset).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledOnce()
    const request = confirm.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      title: "Remove “Harbour dusk” from Director?",
      confirmLabel: "Remove from Director",
      variant: "default",
    })

    await request.action()
    expect(api.detachDirectorAsset).toHaveBeenCalledWith(7, 88)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("preserves a five-lane masonry Gallery and remembers the List choice", () => {
    const assets = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      media_type: "image" as const,
      name: `Visual ${index + 1}`,
      filename: `visual-${index + 1}.webp`,
      width: 1200,
      height: 800,
    }))
    render(<DirectorStage productionId={7} assets={assets} directorAssetIds={assets.map(({ id }) => id)} onUpload={vi.fn()} onRefresh={vi.fn()} />)

    const gallery = screen.getByRole("radio", { name: "Gallery view" })
    const list = screen.getByRole("radio", { name: "List view" })
    expect(gallery.getAttribute("data-state")).toBe("on")
    expect(document.querySelector('[data-view="gallery"]')).toBeTruthy()
    expect(document.querySelectorAll(".director-gallery-column")).toHaveLength(5)
    expect(screen.getAllByRole("heading", { level: 3 })[0]?.textContent).toBe("Visual 6")

    fireEvent.click(list)
    expect(list.getAttribute("data-state")).toBe("on")
    expect(document.querySelector('.director-gallery-items[data-view="list"]')).toBeTruthy()
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Visual 6", "Visual 5", "Visual 4", "Visual 3", "Visual 2", "Visual 1",
    ])
    expect(window.localStorage.getItem("auvi-director-gallery-view")).toBe("list")
  })

  it("shows canonical technical and library facts beside the full media preview", () => {
    render(<DirectorPreviewDialog asset={{
      id: 44,
      media_type: "video",
      name: "Harbour move",
      filename: "harbour.mp4",
      width: 1920,
      height: 1080,
      duration_ms: 12_400,
      media_format: "mp4",
      mime_type: "video/mp4",
      video_codec: "h264",
      frame_rate: 29.97,
      size_bytes: 2_621_440,
      scope: "venture",
      tags: ["harbour"],
    }} onOpenChange={vi.fn()} />)

    expect(screen.getByRole("dialog", { name: "Harbour move" })).toBeTruthy()
    expect(screen.getByText("Technical")).toBeTruthy()
    expect(screen.getByText("1920 × 1080")).toBeTruthy()
    expect(screen.getByText("29.97 fps")).toBeTruthy()
    expect(screen.getByText("Venture Library")).toBeTruthy()
    const video = screen.getByRole("dialog", { name: "Harbour move" }).querySelector("video")
    expect(video?.getAttribute("src")).toBe("/media/harbour.mp4")
    expect(video?.getAttribute("poster")).toBe("/api/v1/media/video-poster/harbour.mp4")
  })

  it("uses a cached browser proxy only when the original video is not reliably playable", () => {
    const mov = { id: 45, media_type: "video", filename: "camera original.mov", media_format: "mov", video_codec: "prores" } as const
    const mp4 = { id: 46, media_type: "video", filename: "delivery.mp4", media_format: "mp4", video_codec: "h264" } as const

    expect(visualAssetPosterUrl(mov)).toBe("/api/v1/media/video-poster/camera%20original.mov")
    expect(visualAssetPlaybackUrl(mov)).toBe("/api/v1/media/video-proxy/camera%20original.mov")
    expect(visualAssetPlaybackUrl(mp4)).toBe("/media/delivery.mp4")
  })
})
