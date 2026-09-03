// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  attachProjectLibraryFile: vi.fn(), detachProjectLibraryFile: vi.fn(),
  mediaModels: vi.fn().mockResolvedValue({
    operations: [{ id: "text_to_video", label: "Text", detail: "Create a video from a written direction" }],
    models: [{ id: "model-a", label: "Model A", provider: "Prototype Lab", version: "a-1", description: "Videos", operations: [{ operation: "text_to_video", output_media_type: "video", prompt: { supported: true, required: true, negative_prompt: true }, inputs: [{ role: "reference", label: "Reference", required: false, media_types: ["image"], max: 1 }], ratios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: [5], fps: [24], supports_seed: true, supports_cancel: true }] }],
  }),
  mediaGenerations: vi.fn().mockResolvedValue([]),
  mediaInputCompatibility: vi.fn().mockResolvedValue([]),
  workspaceSavedVisualReferences: vi.fn().mockResolvedValue([]),
  createWorkspaceSavedVisualReference: vi.fn(),
  createMediaGeneration: vi.fn(), cancelMediaGeneration: vi.fn(),
  confirmJob: vi.fn(), retryMediaGenerationIngestion: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ originsApi: api }))
vi.mock("@/components/global-player-provider", () => ({ useGlobalPlayer: () => ({
  source: null, state: "idle", toggleSource: vi.fn(),
}) }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})
Element.prototype.scrollIntoView = vi.fn()

import { ProjectLibraryStage } from "../library/project-library-stage"
import { FilePreviewDialog } from "@/features/creator/library/file-preview-dialog"
import { visualFileDetails, visualFilePlaybackUrl, visualFilePosterUrl, visualFileIssue } from "@/features/creator/library/visual-file-presentation"
import { VisualFileCard } from "../library/visual-file-card"
import { WORKSTATION_STAGES } from "../workstation-workflow"

describe("Project workflow", () => {
  it("keeps the three daily workspaces in the accepted order", () => {
    expect(WORKSTATION_STAGES.map(({ id, label, description }) => ({ id, label, description }))).toEqual([
      { id: "sequence", label: "Script", description: "Write and record the story" },
      { id: "sound", label: "Timeline", description: "Assemble audio and visuals" },
      { id: "library", label: "Creator Library", description: "Create and collect reusable Files" },
    ])
  })

  it("starts the Project Library with Creator open and the five creation capabilities", async () => {
    render(<ProjectLibraryStage projectId={7} workspaceId={1} files={[]} libraryFileIds={[]} onUpload={vi.fn()} onRefresh={vi.fn()} />)

    expect(screen.getByRole("complementary", { name: "Creator" }).classList.contains("ws-left-pane")).toBe(true)
    expect(screen.getByRole("main", { name: "Library" }).classList.contains("ws-center-pane")).toBe(true)
    expect(screen.getByRole("heading", { name: "No Files yet" })).toBeTruthy()
    expect(await screen.findByRole("textbox", { name: "Media prompt" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Creation capability" })).toBeTruthy()
    expect(["Image", "Video", "Speech", "Music", "Sound Effect"].map((name) => screen.getByRole("button", { name }).getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false", "false"])
    expect(screen.queryByRole("button", { name: "Subtitles" })).toBeNull()
    expect(screen.getByRole("radio", { name: "Text: Create a video from a written direction" })).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Choose generation model" }).textContent).toContain("Model A")
    expect(screen.getByRole("button", { name: "Choose image for Reference" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Add a reference" })).toBeNull()
    expect(screen.queryByText("Creation providers will connect here later. Upload and Library work now.")).toBeNull()
  })

  it("adds a reusable visual to the Project without placing it on the Timeline", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    api.attachProjectLibraryFile.mockResolvedValue({ file_id: 88, duplicate: false })
    render(<ProjectLibraryStage
      projectId={7}
      workspaceId={1}
      files={[{ id: 88, media_type: "image", name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }]}
      libraryFileIds={[]}
      onUpload={vi.fn()}
      onRefresh={refresh}
    />)

    fireEvent.click(screen.getByRole("combobox", { name: "Library scope" }))
    fireEvent.click(await screen.findByRole("option", { name: "Workspace" }))
    fireEvent.click(screen.getByRole("button", { name: "Add Harbour dusk to this Project" }))

    await waitFor(() => expect(api.attachProjectLibraryFile).toHaveBeenCalledWith(7, 88))
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole("button", { name: /Add to Timeline/ })).toBeNull()
  })

  it("collects reusable audio from Workspace Files through the same Project Library", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    api.attachProjectLibraryFile.mockResolvedValue({ file_id: 89, duplicate: false })
    render(<ProjectLibraryStage
      projectId={7}
      workspaceId={1}
      files={[{ id: 89, media_type: "audio", name: "Quiet score", filename: "quiet-score.mp3", category: "music", duration_ms: 12_000 }]}
      libraryFileIds={[]}
      onUpload={vi.fn()}
      onRefresh={refresh}
    />)

    fireEvent.click(screen.getByRole("combobox", { name: "Library scope" }))
    fireEvent.click(await screen.findByRole("option", { name: "Workspace" }))
    expect(screen.getByRole("radiogroup", { name: "File type" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add Quiet score to this Project" }))

    await waitFor(() => expect(api.attachProjectLibraryFile).toHaveBeenCalledWith(7, 89))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("accepts visual files across the Project Library and shows the real pending object", async () => {
    let finishUpload: ((file: { id: number; media_type: "image"; name: string; filename: string }) => void) | undefined
    const onUpload = vi.fn(() => new Promise<{ id: number; media_type: "image"; name: string; filename: string }>((resolve) => { finishUpload = resolve }))
    const refresh = vi.fn().mockResolvedValue(undefined)
    api.attachProjectLibraryFile.mockResolvedValue({ file_id: 91, duplicate: false })
    render(<ProjectLibraryStage projectId={7} workspaceId={1} files={[]} libraryFileIds={[]} onUpload={onUpload} onRefresh={refresh} />)

    const file = new File(["visual"], "harbour-dusk.png", { type: "image/png" })
    fireEvent.drop(screen.getByRole("main"), { dataTransfer: { files: [file], types: ["Files"], dropEffect: "none" } })

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file))
    expect(screen.getByRole("heading", { name: "harbour-dusk.png" })).toBeTruthy()
    expect(screen.getByText("Uploading…")).toBeTruthy()

    finishUpload?.({ id: 91, media_type: "image", name: "Harbour dusk", filename: "harbour-dusk.png" })
    await waitFor(() => expect(api.attachProjectLibraryFile).toHaveBeenCalledWith(7, 91))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it("accepts audio uploads through the Project Library File entrance", async () => {
    const onUpload = vi.fn().mockResolvedValue({ id: 92, media_type: "audio", name: "Narration", filename: "narration.mp3" })
    const refresh = vi.fn().mockResolvedValue(undefined)
    api.attachProjectLibraryFile.mockResolvedValue({ file_id: 92, duplicate: false })
    render(<ProjectLibraryStage projectId={7} workspaceId={1} files={[]} libraryFileIds={[]} onUpload={onUpload} onRefresh={refresh} />)

    const file = new File(["audio"], "narration.mp3", { type: "audio/mpeg" })
    fireEvent.drop(screen.getByRole("main"), { dataTransfer: { files: [file], types: ["Files"], dropEffect: "none" } })

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file))
    await waitFor(() => expect(api.attachProjectLibraryFile).toHaveBeenCalledWith(7, 92))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("keeps a failed upload visible with an explicit retry", async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error("The video container is not supported."))
    render(<ProjectLibraryStage projectId={7} workspaceId={1} files={[]} libraryFileIds={[]} onUpload={onUpload} onRefresh={vi.fn()} />)

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
    expect(visualFileDetails({
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
      category: null,
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
        { label: "Tags", value: "harbour, dusk" },
        { label: "Added", value: "Aug 25, 2026" },
      ]),
    })
  })

  it("uses canonical provenance for generated Project Library visuals", () => {
    const { container } = render(<VisualFileCard file={{
      id: 45,
      media_type: "image",
      name: "Generated harbour",
      filename: "generated-harbour.webp",
      version_metadata: {
        origin: "generated",
        provider_id: "kling",
        provider_model_id: "kling-3.0-omni",
      },
    }} onPreview={vi.fn()} />)

    expect(container.querySelector(".visual-file-origin")?.classList.contains("is-generated")).toBe(true)
    expect(container.querySelector(".visual-file-origin")?.textContent).toBe("AI")
  })

  it("marks Project Library removal as a confirmation-opening collection action", async () => {
    const file = { id: 88, media_type: "image" as const, name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }
    const remove = vi.fn()
    render(<VisualFileCard file={file} onPreview={vi.fn()} onRemove={remove} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Harbour dusk" }), { button: 0, ctrlKey: false })
    const action = await screen.findByText("Remove from Project…")
    fireEvent.click(action)
    expect(remove).toHaveBeenCalledWith(file)
  })

  it("offers both Project Library images and videos for Timeline placement", async () => {
    const image = { id: 88, media_type: "image" as const, name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }
    const add = vi.fn()
    render(<VisualFileCard file={image} onPreview={vi.fn()} onAddToTimeline={add} />)
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Harbour dusk" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText("Add to Timeline"))
    expect(add).toHaveBeenCalledWith(image)

    cleanup()
    const video = { ...image, media_type: "video" as const, name: "Harbour move", filename: "harbour.mp4", duration_ms: 8_000, media_format: "mp4", video_codec: "h264" }
    render(<VisualFileCard file={video} onPreview={vi.fn()} onAddToTimeline={add} />)
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Harbour move" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText("Add to Timeline"))
    expect(add).toHaveBeenCalledWith(video)
  })

  it("exposes direct preview and Timeline actions without opening the overflow menu", () => {
    const file = { id: 88, media_type: "image" as const, name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }
    const preview = vi.fn()
    const add = vi.fn()
    render(<VisualFileCard file={file} onPreview={preview} onAddToTimeline={add} />)

    fireEvent.click(screen.getAllByRole("button", { name: "Preview Harbour dusk" })[1]!)
    fireEvent.click(screen.getByRole("button", { name: "Add Harbour dusk to Timeline" }))

    expect(preview).toHaveBeenCalledWith(file)
    expect(add).toHaveBeenCalledWith(file)
  })

  it("requires confirmation before detaching a visual from the Project Library", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const confirm = vi.fn()
    const file = { id: 88, media_type: "image" as const, name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }
    api.detachProjectLibraryFile.mockResolvedValue({ file_id: 88 })
    render(<ProjectLibraryStage projectId={7} workspaceId={1} files={[file]} projectFileIds={[88]} libraryFileIds={[88]} onUpload={vi.fn()} onRefresh={refresh} onConfirmAction={confirm} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Harbour dusk" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText("Remove from Project…"))

    expect(api.detachProjectLibraryFile).not.toHaveBeenCalled()
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    const request = confirm.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      title: "Remove “Harbour dusk” from the Project Library?",
      confirmLabel: "Remove from Project",
      variant: "default",
    })

    await request.action()
    expect(api.detachProjectLibraryFile).toHaveBeenCalledWith(7, 88)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("keeps Library as a newest-first five-lane masonry without a parallel List mode", () => {
    const files = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      media_type: "image" as const,
      name: `Visual ${index + 1}`,
      filename: `visual-${index + 1}.webp`,
      created_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      width: 1200,
      height: 800,
    }))
    render(<ProjectLibraryStage projectId={7} workspaceId={1} files={files} projectFileIds={files.map(({ id }) => id)} libraryFileIds={files.map(({ id }) => id)} onUpload={vi.fn()} onRefresh={vi.fn()} />)

    const gallery = document.querySelector<HTMLElement>(".project-library-gallery-items")
    expect(gallery).toBeTruthy()
    expect(gallery?.style.getPropertyValue("--project-library-gallery-columns")).toBe("5")
    expect(screen.queryByRole("radio", { name: "List view" })).toBeNull()
    expect(Array.from(document.querySelectorAll<HTMLButtonElement>(".visual-file-preview-target")).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Preview Visual 6", "Preview Visual 5", "Preview Visual 4", "Preview Visual 3", "Preview Visual 2", "Preview Visual 1",
    ])
  })

  it("shows canonical technical and library facts beside the full media preview", () => {
    render(<FilePreviewDialog file={{
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
      tags: ["harbour"],
    }} onOpenChange={vi.fn()} />)

    expect(screen.getByRole("dialog", { name: "Harbour move" })).toBeTruthy()
    expect(screen.getByText("Technical")).toBeTruthy()
    expect(screen.getByText("1920 × 1080")).toBeTruthy()
    expect(screen.getByText("29.97 fps")).toBeTruthy()
    expect(screen.getByText("harbour")).toBeTruthy()
    const video = screen.getByRole("dialog", { name: "Harbour move" }).querySelector("video")
    expect(video?.getAttribute("src")).toBe("/media/harbour.mp4")
    expect(video?.getAttribute("poster")).toBe("/api/v1/media/video-poster/harbour.mp4")
  })

  it("uses a cached browser proxy only when the original video is not reliably playable", () => {
    const mov = { id: 45, media_type: "video", filename: "camera original.mov", media_format: "mov", video_codec: "prores" } as const
    const mp4 = { id: 46, media_type: "video", filename: "delivery.mp4", media_format: "mp4", video_codec: "h264" } as const

    expect(visualFilePosterUrl(mov)).toBe("/api/v1/media/video-poster/camera%20original.mov")
    expect(visualFilePlaybackUrl(mov)).toBe("/api/v1/media/video-proxy/camera%20original.mov")
    expect(visualFilePlaybackUrl(mp4)).toBe("/media/delivery.mp4")
  })
})
