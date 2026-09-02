// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { originsApi } from "@/lib/api"
import { MediaComposer } from "./media-composer"
import type { MediaGeneration } from "./media-generation-types"
import { inputMode, ratioChoices, type MediaOperationCapability } from "./media-composer-config"
import { assignInputs, inputModeIssue } from "./media-composer-state"
import { VisualsGallery } from "@/features/projects/audiovisual/visuals/visuals-gallery"

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

vi.mock("@/lib/api", () => ({ originsApi: {
  mediaModels: vi.fn(), mediaGenerations: vi.fn(),
  mediaInputCompatibility: vi.fn(),
  createMediaGeneration: vi.fn(), cancelMediaGeneration: vi.fn(),
  confirmJob: vi.fn(), retryMediaGenerationIngestion: vi.fn(),
  workspaceSavedVisualReferences: vi.fn(), createWorkspaceSavedVisualReference: vi.fn(),
} }))

const catalog = {
  operations: [
    { id: "image", label: "Image", detail: "Create a still visual", presentation: { mode_label: "Image", icon: "wallpaper" } },
    { id: "frames-to-video", label: "Frames to video", detail: "Move between frames", presentation: { mode_label: "Frames", icon: "panels" } },
    { id: "talking-video", label: "Talking video", detail: "Animate a character", presentation: { mode_label: "Talking", icon: "message-video" } },
  ],
  models: [
    { id: "model-a", label: "Model A", provider: "Prototype Lab", version: "a-1", description: "Still images", operations: [{ operation: "image", output_media_type: "image", prompt: { supported: true, required: true, negative_prompt: true }, inputs: [{ role: "reference", label: "Reference", required: false, media_types: ["image"], max: 1 }], ratios: ["1:1", "16:9"], resolutions: ["1K", "2K"], durations: [], fps: [], supports_seed: true, supports_cancel: true }] },
    { id: "model-b", label: "Model B", provider: "Prototype Lab", version: "b-1", description: "Frames", operations: [{ operation: "frames-to-video", output_media_type: "video", prompt: { supported: true, required: false, negative_prompt: true }, inputs: [{ role: "start-frame", label: "Start frame", required: true, media_types: ["image"], max: 1 }, { role: "end-frame", label: "End frame", required: false, media_types: ["image"], max: 1 }], ratios: ["16:9"], resolutions: ["1080p"], durations: [5, 8], fps: [24, 30], supports_seed: true, supports_cancel: true }] },
    { id: "model-c", label: "Model C", provider: "Prototype Lab", version: "c-1", description: "Character and voice", operations: [{ operation: "talking-video", output_media_type: "video", prompt: { supported: true, required: false, negative_prompt: true }, inputs: [{ role: "character", label: "Character", required: true, media_types: ["image"], max: 1 }, { role: "voice", label: "Voice audio", required: true, media_types: ["audio"], max: 1 }, { role: "reference", label: "Reference image", required: false, media_types: ["image"], max: 2 }], ratios: ["16:9"], resolutions: ["1080p"], durations: [5], fps: [24], supports_seed: true, supports_cancel: true }] },
  ],
}

const kieParameters = [
  { key: "audio", type: "boolean", label: "Generate audio", exposure: "primary", required: false, default: false, options: [], min: null, max: null, step: null, max_length: null, visible_when: {}, conflicts_with: [], item: {} },
  { key: "customize_multi_shots", type: "boolean", label: "Direct multiple shots", exposure: "advanced", required: false, default: false, options: [], min: null, max: null, step: null, max_length: null, visible_when: {}, conflicts_with: ["prefer_multi_shots"], item: {} },
  { key: "prefer_multi_shots", type: "boolean", label: "Plan shots automatically", exposure: "advanced", required: false, default: false, options: [], min: null, max: null, step: null, max_length: null, visible_when: {}, conflicts_with: ["customize_multi_shots"], item: {} },
  { key: "multi_prompt", type: "structured_shots", label: "Shots", exposure: "advanced", required: true, default: [], options: [], min: null, max: null, step: null, max_length: null, visible_when: { customize_multi_shots: true }, conflicts_with: [], item: { prompt_max_length: 512, duration_min: 1, duration_max: 15, max_items: 6 } },
  { key: "elements", type: "file_list", label: "Characters & subjects", exposure: "advanced", required: false, default: [], options: [], min: null, max: 3, step: null, max_length: null, visible_when: {}, conflicts_with: [], item: { name_max_length: 64, description_max_length: 300, description_required: true, variants: [{ id: "images", label: "Image subject", media_types: ["image"], min_files: 2, max_files: 4 }], audio: { media_types: ["audio"], max_files: 1 } } },
]

function kieCapability(operation: string, inputs: unknown[], requiredAnyOf: string[][] = [], ratioRules: unknown[] = []) {
  return {
    operation, output_media_type: "video", prompt: { supported: true, required: true, negative_prompt: false, max_length: 3072 },
    inputs, required_any_of: requiredAnyOf, ratios: ratioRules.length ? ["auto", "16:9", "9:16", "1:1"] : ["16:9", "9:16"], ratio_rules: ratioRules, resolutions: ["720p", "1080p", "4k"], durations: [],
    duration_range: { min: 3, max: 15, step: 1, default: 5 }, fps: [], supports_seed: false, supports_cancel: false,
    output: { mime_type: "video/mp4", extension: "mp4" }, parameters: kieParameters,
  }
}

const kieCatalog = {
  providers: [{ id: "kie", label: "KIE" }],
  operations: [
    { id: "text_to_video", label: "Create video", detail: "Create motion from a written direction", presentation: { mode_label: "Text", icon: "type" } },
    { id: "image_to_video", label: "Animate image", detail: "Create motion from a source image", presentation: { mode_label: "Image", icon: "wallpaper" } },
    { id: "reference_to_video", label: "Direct with references", detail: "Use visual references", presentation: { mode_label: "References", icon: "images" } },
  ],
  models: [
    { id: "kling-3.0-omni/text-to-video", label: "Kling 3.0 Omni", provider: "KIE", provider_id: "kie", provider_model_id: "kling-3.0-omni/text-to-video", adapter_key: "kie-kling-omni", adapter_version: "adapter-1", capability_manifest_version: "manifest-1", status: "enabled", description: "Video", operations: [kieCapability("text_to_video", [])] },
    { id: "kling-3.0-omni/image-to-video", label: "Kling 3.0 Omni", provider: "KIE", provider_id: "kie", provider_model_id: "kling-3.0-omni/image-to-video", adapter_key: "kie-kling-omni", adapter_version: "adapter-1", capability_manifest_version: "manifest-1", status: "enabled", description: "Animate image", operations: [kieCapability("image_to_video", [{ role: "source-image", label: "Source image", required: true, media_types: ["image"], max: 1 }], [], [{ when: { customize_multi_shots: false }, values: ["auto"], default: "auto" }, { when: { customize_multi_shots: true }, values: ["16:9", "9:16", "1:1"], default: "16:9" }])] },
    { id: "kling-3.0-omni/reference-to-video", label: "Kling 3.0 Omni", provider: "KIE", provider_id: "kie", provider_model_id: "kling-3.0-omni/reference-to-video", adapter_key: "kie-kling-omni", adapter_version: "adapter-1", capability_manifest_version: "manifest-1", status: "enabled", description: "References", operations: [kieCapability("reference_to_video", [{ role: "reference-image", label: "Reference images", required: false, media_types: ["image"], max: 7 }], [["reference-image"]])] },
  ],
}

function generation(prompt = "A quiet violet horizon"): MediaGeneration {
  return {
    id: "job-1", job_id: "job-1", status: "ready", progress: 100, detail: "Prototype ready", error: null,
    preset: { prompt, negative_prompt: "text", operation: "image", model_id: "model-a", inputs: [], controls: { ratio: "16:9", resolution: "2K", duration: null, fps: null, seed: 42, provider_parameters: {} } },
    provider: "Prototype Lab", model_label: "Model A", model_version: "a-1", output_media_type: "image", output_file_ids: [], provider_job_id: null, estimated_cost: null,
    created_at: "2026-08-28T00:00:00Z", updated_at: "2026-08-28T00:00:01Z",
  }
}

function setup() {
  vi.mocked(originsApi.mediaModels).mockResolvedValue(catalog as never)
  vi.mocked(originsApi.mediaInputCompatibility).mockImplementation(((_context: unknown, payload: { file_ids: number[] }) => Promise.resolve(payload.file_ids.map((file_id) => ({ file_id, state: "compatible", reasons: [] })))) as never)
  vi.mocked(originsApi.mediaGenerations).mockResolvedValue([] as never)
  vi.mocked(originsApi.createMediaGeneration).mockResolvedValue({} as never)
  vi.mocked(originsApi.cancelMediaGeneration).mockResolvedValue({} as never)
  vi.mocked(originsApi.confirmJob).mockResolvedValue({} as never)
  vi.mocked(originsApi.retryMediaGenerationIngestion).mockResolvedValue({} as never)
  vi.mocked(originsApi.workspaceSavedVisualReferences).mockResolvedValue([] as never)
  vi.mocked(originsApi.createWorkspaceSavedVisualReference).mockResolvedValue({} as never)
}

function renderComposer(overrides: Partial<React.ComponentProps<typeof MediaComposer>> = {}) {
  return render(<MediaComposer context={{ workspace_id: 1, project_id: 7, project_type: "audiovisual" }} uploading={false} uploadLabel="" libraryFiles={[]} onUploadReference={vi.fn()} {...overrides} />)
}

async function chooseMode(name: string) {
  fireEvent.click(await screen.findByRole("radio", { name: new RegExp(`^${name}:`, "i") }))
}

async function chooseModel(name: string) {
  fireEvent.click(await screen.findByRole("combobox", { name: "Choose generation model" }))
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }))
}

beforeEach(() => {
  setup()
  window.localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((file: File) => `blob:${file.name}`) })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("Media composer", () => {
  it("does not substitute a video route when an image Creation Action has no engine", async () => {
    vi.mocked(originsApi.mediaModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ context: {
      workspace_id: 1,
      selection: { output_media_type: "image" },
    } })

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No image generation model is currently available.",
    )
    expect(screen.getByText("Connect an image-capable model to use this Creation Action.")).toBeTruthy()
    expect(screen.queryByText("Kling 3.0 Omni")).toBeNull()
    expect(screen.queryByRole("slider", { name: "Duration in seconds" })).toBeNull()
  })

  it("keeps the model-first creation form in semantic top-to-bottom order", async () => {
    renderComposer()
    await chooseModel("Model B")
    const form = document.querySelector(".media-composer-form")!
    const ordered = [
      screen.getByRole("combobox", { name: "Choose generation model" }),
      screen.getByRole("radiogroup", { name: "Creation mode" }),
      screen.getByRole("button", { name: "Choose image for Start frame" }),
      screen.getByRole("button", { name: "Choose image for End frame" }),
      screen.getByRole("textbox", { name: "Media prompt" }),
      screen.getByRole("heading", { name: "Primary controls" }),
      screen.getByRole("button", { name: "Advanced settings" }),
      screen.getByRole("button", { name: "Generate" }),
    ]
    expect(ordered.every((element) => form.contains(element))).toBe(true)
    ordered.slice(1).forEach((element, index) => {
      expect(ordered[index]!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
    expect(screen.queryByRole("button", { name: "Add a reference" })).toBeNull()
    expect(screen.getByRole("button", { name: "Generate" }).closest(".media-composer-actions")).toBeTruthy()
    expect(document.querySelector(".media-composer-scroll")?.contains(screen.getByRole("button", { name: "Generate" }))).toBe(false)
  })

  it("collapses creation into a narrow rail without hiding Creations", async () => {
    renderComposer({ renderCreations: () => <div>Creation wall</div> })
    fireEvent.click(await screen.findByRole("button", { name: "Hide Create panel" }))

    expect(screen.getByRole("button", { name: "Show Create panel" })).toBeTruthy()
    expect(screen.getByText("Creation wall")).toBeTruthy()
    expect(document.querySelector(".media-composer-shell")?.classList.contains("is-create-collapsed")).toBe(true)
  })

  it("keeps failed requests out of the normal media wall until failed items are revealed", () => {
    render(<VisualsGallery
      files={[]} uploads={[]}
      creationItems={[
        { id: "ready", status: "ready", mediaType: "image", node: <div>Ready creation</div> },
        { id: "failed", status: "failed", mediaType: "video", node: <div>Failed creation</div> },
      ]}
      pendingId={null}
      onPreview={vi.fn()} onRemove={vi.fn()} onRetryUpload={vi.fn()} onDismissUpload={vi.fn()} onUpload={vi.fn()} onOpenLibrary={vi.fn()}
    />)
    expect(screen.getByText("Ready creation")).toBeTruthy()
    expect(screen.queryByText("Failed creation")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show failed 1" }))
    expect(screen.getByText("Failed creation")).toBeTruthy()
    expect(document.querySelector(".visuals-gallery-items")?.classList.contains("is-single-row")).toBe(true)
  })

  it("offers every canonical provenance filter without calling legacy Files imported", () => {
    render(<VisualsGallery
      files={[{ id: 7, media_type: "image", name: "Legacy", filename: "legacy.png" }]} uploads={[]}
      pendingId={null}
      onPreview={vi.fn()} onRemove={vi.fn()} onRetryUpload={vi.fn()} onDismissUpload={vi.fn()} onUpload={vi.fn()} onOpenLibrary={vi.fn()}
    />)
    expect(screen.getByRole("radio", { name: "Generated" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Freesound" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Uploaded" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Existing File" })).toBeTruthy()
    expect(screen.queryByText("Imported")).toBeNull()
  })

  it("keeps Start and End references in semantic order", () => {
    const capability = {
      inputs: [
        { role: "start-frame", media_types: ["image"], max: 1, required: true },
        { role: "end-frame", media_types: ["image"], max: 1, required: true },
      ], input_order: ["start-frame", "end-frame"], input_modes: [],
    } as unknown as MediaOperationCapability
    const ordered = assignInputs([
      { id: "end", fileId: 2, name: "End", kind: "image", role: "end-frame", previewUrl: null, posterUrl: null, status: "ready" },
      { id: "start", fileId: 1, name: "Start", kind: "image", role: "start-frame", previewUrl: null, posterUrl: null, status: "ready" },
    ], capability)
    expect(ordered.map(({ role }) => role)).toEqual(["start-frame", "end-frame"])
  })

  it("derives reference-video controls from the active input contract", () => {
    const capability = {
      inputs: [
        { role: "reference-image", media_types: ["image"], max: 7 },
        { role: "reference-video", media_types: ["video"], max: 1 },
      ],
      input_modes: [{
        id: "video", when_counts: { "reference-image": { max: 0 }, "reference-video": { min: 1, max: 1 } },
        ratios: ["auto"], default_ratio: "auto", parameter_values: { audio: [false] },
      }],
      ratios: ["auto", "16:9"], ratio_rules: [], parameters: [{ key: "audio", label: "Generate audio" }],
    } as unknown as MediaOperationCapability
    const counts = { "reference-image": 0, "reference-video": 1 }
    expect(inputMode(capability, counts)?.id).toBe("video")
    expect(ratioChoices(capability, { audio: false }, counts)).toEqual({ values: ["auto"], default: "auto" })
    expect(inputModeIssue(capability, [
      { id: "video", fileId: 2, name: "Video", kind: "video", role: "reference-video", previewUrl: null, posterUrl: null, status: "ready" },
    ], { audio: true })).toContain("Generate audio")
  })

  it("counts direct and nested images in the same reference quota", () => {
    const capability = {
      inputs: [{ role: "reference-image", media_types: ["image"], max: 7 }],
      input_modes: [{
        id: "images", when_counts: { "reference-image": { min: 1 } },
        ratios: ["16:9"], default_ratio: "16:9", parameter_values: {},
        elements: { max_image_files_total: 7 },
      }],
      parameters: [], ratios: ["16:9"], ratio_rules: [],
    } as unknown as MediaOperationCapability
    const attachments = Array.from({ length: 7 }, (_, index) => ({
      id: `direct-${index}`, fileId: index + 1, name: `Image ${index + 1}`,
      kind: "image" as const, role: "reference-image", previewUrl: null,
      posterUrl: null, status: "ready" as const,
    }))
    expect(inputModeIssue(capability, attachments, {
      elements: [{ variant: "images", file_ids: [99] }],
    })).toBe("This reference mode has too many image references.")
  })

  it("accepts the four-image boundary with one video subject", () => {
    const capability = {
      inputs: [{ role: "reference-image", media_types: ["image"], max: 7 }],
      input_modes: [{
        id: "images", when_counts: { "reference-image": { min: 1 } },
        ratios: ["16:9"], default_ratio: "16:9", parameter_values: {},
        elements: {
          max_video_subjects: 3, max_image_files_total: 7,
          max_image_files_with_video_subjects: 4,
        },
      }],
      parameters: [], ratios: ["16:9"], ratio_rules: [],
    } as unknown as MediaOperationCapability
    const attachments = Array.from({ length: 2 }, (_, index) => ({
      id: `direct-${index}`, fileId: index + 1, name: `Image ${index + 1}`,
      kind: "image" as const, role: "reference-image", previewUrl: null,
      posterUrl: null, status: "ready" as const,
    }))
    expect(inputModeIssue(capability, attachments, {
      elements: [
        { variant: "images", file_ids: [3, 4] },
        { variant: "video", file_ids: [5] },
      ],
    })).toBeUndefined()
  })

  it("rejects subjects forbidden by the active video reference mode", () => {
    const capability = {
      inputs: [
        { role: "reference-image", media_types: ["image"], max: 4 },
        { role: "reference-video", media_types: ["video"], max: 1 },
      ],
      input_modes: [{
        id: "video-images", when_counts: {
          "reference-image": { min: 1, max: 4 },
          "reference-video": { min: 1, max: 1 },
        }, ratios: ["16:9"], default_ratio: "16:9", parameter_values: {},
        elements: {
          available_when: { customize_multi_shots: true },
          max_video_subjects: 1, allow_video_subject_with_images: false,
        },
      }, {
        id: "video", when_counts: {
          "reference-image": { max: 0 },
          "reference-video": { min: 1, max: 1 },
        }, ratios: ["auto"], default_ratio: "auto", parameter_values: {},
        elements: { available_when: { customize_multi_shots: true } },
      }],
      parameters: [], ratios: ["16:9"], ratio_rules: [],
    } as unknown as MediaOperationCapability
    const attachments = [
      { id: "video", fileId: 1, name: "Video", kind: "video" as const, role: "reference-video", previewUrl: null, posterUrl: null, status: "ready" as const },
      { id: "image", fileId: 2, name: "Image", kind: "image" as const, role: "reference-image", previewUrl: null, posterUrl: null, status: "ready" as const },
    ]
    expect(inputModeIssue(capability, attachments, {
      customize_multi_shots: true,
      elements: [{ variant: "video", file_ids: [3] }],
    })).toBe("Video subjects cannot be mixed with image references in this mode.")
    expect(inputModeIssue(capability, attachments.slice(0, 1), {
      customize_multi_shots: false,
      elements: [{ variant: "video", file_ids: [3] }],
    })).toBe("Character references require directed multi-shot mode with this video input.")
  })

  it("renders manifest-declared primary controls beside the prompt", async () => {
    const primaryCatalog = structuredClone(catalog) as any
    primaryCatalog.models[0].operations[0].parameters = [{
      key: "style", type: "select", label: "Style", exposure: "primary",
      required: false, default: "natural", options: ["natural", "cinematic"],
      min: null, max: null, step: null, max_length: null,
      visible_when: {}, conflicts_with: [], item: {},
    }]
    vi.mocked(originsApi.mediaModels).mockResolvedValue(primaryCatalog as never)
    renderComposer()
    expect(await screen.findByText("Style", { selector: ".media-primary-parameters span" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Advanced settings" })).toBeTruthy()
  })

  it("renders controls from the selected model-operation capability", async () => {
    renderComposer()
    expect(await screen.findByRole("combobox", { name: "Ratio" })).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Duration" })).toBeNull()
    await chooseModel("Model B")
    expect(screen.getByRole("combobox", { name: "Choose generation model" }).textContent).toContain("Model B")
    expect(screen.getByRole("button", { name: "Choose image for Start frame" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Choose image for End frame" })).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Duration" })).toBeTruthy()
  })

  it("uploads a file through the canonical File pipeline before using it", async () => {
    const onUploadReference = vi.fn().mockResolvedValue({ id: 41, media_type: "image", name: "Canonical image", filename: "canonical.webp" })
    renderComposer({ onUploadReference })
    await screen.findByRole("textbox", { name: "Media prompt" })
    fireEvent.click(screen.getByRole("button", { name: "Choose image for Reference" }))
    fireEvent.click(await screen.findByRole("button", { name: "Upload" }))
    const file = new File(["image"], "reference.png", { type: "image/png" })
    fireEvent.change(document.querySelector('input[accept="image/*"]') as HTMLInputElement, { target: { files: [file] } })
    expect(onUploadReference).toHaveBeenCalledWith(file)
    expect(await screen.findByRole("button", { name: "Open reference: Canonical image" })).toBeTruthy()
  })

  it("shows only compatible media in an exact semantic slot", async () => {
    renderComposer({ libraryFiles: [
      { id: 41, media_type: "image", name: "Character", filename: "character.webp" },
      { id: 42, media_type: "audio", name: "Voice", filename: "voice.wav" },
    ] })
    await chooseModel("Model C")
    fireEvent.click(await screen.findByRole("button", { name: "Choose audio for Voice audio" }))
    expect(await screen.findByRole("heading", { name: "Choose voice audio" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Use Voice" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Use Character" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Use Voice" }))
    expect(await screen.findByRole("button", { name: "Remove voice audio" })).toBeTruthy()
    expect(screen.getByText("Voice audio", { selector: ".media-visual-slot > header span" })).toBeTruthy()
  })

  it("does not let a late compatibility response overwrite a newer slot", async () => {
    let resolveStart: (value: unknown[]) => void = () => undefined
    let resolveEnd: (value: unknown[]) => void = () => undefined
    vi.mocked(originsApi.mediaInputCompatibility).mockImplementation(((_context: unknown, payload: { role?: string }) => new Promise((resolve) => {
      if (payload.role === "start-frame") resolveStart = resolve
      else resolveEnd = resolve
    })) as never)
    renderComposer({ libraryFiles: [
      { id: 41, media_type: "image", name: "Start only", filename: "start.webp" },
      { id: 42, media_type: "image", name: "End only", filename: "end.webp" },
    ] })
    await chooseModel("Model B")
    fireEvent.click(await screen.findByRole("button", { name: "Choose image for Start frame" }))
    expect(await screen.findByRole("heading", { name: "Choose start frame" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    fireEvent.click(screen.getByRole("button", { name: "Choose image for End frame" }))
    expect(await screen.findByRole("heading", { name: "Choose end frame" })).toBeTruthy()
    await act(async () => resolveEnd([
      { file_id: 41, state: "incompatible", reasons: ["Wrong slot"] },
      { file_id: 42, state: "compatible", reasons: [] },
    ]))
    expect(await screen.findByRole("button", { name: "Use End only" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Use Start only" })).toBeNull()
    await act(async () => resolveStart([
      { file_id: 41, state: "compatible", reasons: [] },
      { file_id: 42, state: "incompatible", reasons: ["Wrong slot"] },
    ]))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Use End only" })).toBeTruthy()
      expect(screen.queryByRole("button", { name: "Use Start only" })).toBeNull()
    })
  })

  it("uses canonical technical compatibility for nested Kling subjects", async () => {
    vi.mocked(originsApi.mediaModels).mockResolvedValue(kieCatalog as never)
    vi.mocked(originsApi.mediaInputCompatibility).mockImplementation(((_context: unknown, payload: { parameter_key?: string; variant_id?: string; audio?: boolean; file_ids: number[] }) => Promise.resolve(payload.file_ids.map((file_id) => ({
      file_id,
      state: payload.parameter_key === "elements" && (
        (payload.variant_id === "images" && file_id === 51)
        || (payload.audio === true && file_id === 53)
      ) ? "compatible" : "incompatible",
      reasons: [],
    })))) as never)
    renderComposer({ libraryFiles: [
      { id: 51, media_type: "image", name: "Valid subject", filename: "valid.png" },
      { id: 52, media_type: "image", name: "Too small subject", filename: "small.png" },
      { id: 53, media_type: "audio", name: "Valid voice", filename: "voice.wav" },
    ] })
    fireEvent.click(await screen.findByRole("button", { name: "Advanced settings" }))
    fireEvent.click(await screen.findByRole("button", { name: "Add subject" }))
    const subjectPicker = await screen.findByRole("combobox", { name: "Choose image subject" })
    fireEvent.click(subjectPicker)
    expect(await screen.findByRole("option", { name: /Valid subject/ })).toBeTruthy()
    expect(screen.queryByRole("option", { name: /Too small subject/ })).toBeNull()
    expect(originsApi.mediaInputCompatibility).toHaveBeenCalledWith(
      { workspace_id: 1, project_id: 7, project_type: "audiovisual" },
      expect.objectContaining({
        model_id: "kling-3.0-omni/text-to-video",
        operation: "text_to_video",
        parameter_key: "elements",
        variant_id: "images",
      }),
      expect.any(AbortSignal),
    )
  })

  it("places a durable-looking queued card immediately while creation starts", async () => {
    let resolveCreate: (value: MediaGeneration) => void = () => undefined
    vi.mocked(originsApi.createMediaGeneration).mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve as (value: MediaGeneration) => void }) as never)
    renderComposer()
    fireEvent.change(await screen.findByRole("textbox", { name: "Media prompt" }), { target: { value: "A calm harbor at dawn" } })
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))
    expect(await screen.findByText("Queued")).toBeTruthy()
    expect(screen.getByText("A calm harbor at dawn", { selector: ".media-generation-copy strong" })).toBeTruthy()
    resolveCreate(generation("A calm harbor at dawn"))
    await waitFor(() => expect(originsApi.createMediaGeneration).toHaveBeenCalledTimes(1))
  })

  it("does not silently squeeze a multi-media saved reference into one exact slot", async () => {
    vi.mocked(originsApi.workspaceSavedVisualReferences).mockResolvedValue([
      { id: "single", name: "One look", type: "character", file_ids: [41] },
      { id: "bundle", name: "Two looks", type: "character", file_ids: [41, 42] },
    ] as never)
    renderComposer({ context: { workspace_id: 8, project_id: 7, project_type: "audiovisual" }, libraryFiles: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })
    await chooseModel("Model B")
    fireEvent.click(await screen.findByRole("button", { name: "Choose image for Start frame" }))
    expect(await screen.findByRole("button", { name: /One look/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Two looks/ })).toBeNull()
  })

  it("restores durable history and reuses its exact saved preset", async () => {
    const saved = generation()
    vi.mocked(originsApi.mediaGenerations).mockResolvedValue([saved] as never)
    renderComposer()
    expect(await screen.findByText("Ready")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    await waitFor(() => expect(originsApi.createMediaGeneration).toHaveBeenCalledWith({
      context: { workspace_id: 1, project_id: 7, project_type: "audiovisual" },
      preset: saved.preset,
    }))
    fireEvent.click(screen.getByRole("button", { name: "Remix" }))
    expect((screen.getByRole("textbox", { name: "Media prompt" }) as HTMLTextAreaElement).value).toBe(saved.preset.prompt)
  })

  it("keeps generated outputs represented by their creation instead of duplicate media cards", async () => {
    const saved = Array.from({ length: 8 }, (_, index) => ({
      ...generation(`Request ${index + 1}`),
      id: `job-${index + 1}`,
      job_id: `job-${index + 1}`,
      output_file_ids: [100 + index],
    }))
    vi.mocked(originsApi.mediaGenerations).mockResolvedValue(saved as never)
    let hiddenOutputIds = new Set<number>()
    let creationCount = 0
    renderComposer({ renderCreations: (outputIds, items) => {
      hiddenOutputIds = outputIds
      creationCount = items.length
      return <div>Unified creations</div>
    } })
    expect(await screen.findByText("Unified creations")).toBeTruthy()
    await waitFor(() => expect(hiddenOutputIds.size).toBe(8))
    expect(creationCount).toBe(8)
  })

  it("refreshes canonical outputs and exposes preview and Timeline actions", async () => {
    const saved = { ...generation(), output_file_ids: [41] }
    const onGenerationOutputReady = vi.fn().mockResolvedValue(undefined)
    const onPreviewGenerated = vi.fn()
    const onAddGeneratedToTimeline = vi.fn().mockResolvedValue(undefined)
    vi.mocked(originsApi.mediaGenerations).mockResolvedValue([saved] as never)
    const file = { id: 41, media_type: "image" as const, name: "Generated sunrise", filename: "sunrise.webp" }
    renderComposer({
      libraryFiles: [file], onGenerationOutputReady,
      onPreviewGenerated, onAddGeneratedToTimeline,
    })
    await waitFor(() => expect(onGenerationOutputReady).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    expect(onPreviewGenerated).toHaveBeenCalledWith(file)
    fireEvent.click(screen.getByRole("button", { name: "Add to Timeline" }))
    await waitFor(() => expect(onAddGeneratedToTimeline).toHaveBeenCalledWith(file))
  })

  it("keeps cost approval and ingestion recovery at the generation that needs action", async () => {
    const approval = {
      ...generation(), status: "failed", needs_confirmation: true,
      confirmation_message: "This generation is estimated at $1.20. Confirm to continue.",
    } as MediaGeneration
    vi.mocked(originsApi.mediaGenerations).mockResolvedValue([approval] as never)
    renderComposer()
    expect(await screen.findByText("Approval needed")).toBeTruthy()
    expect(screen.getByText(approval.confirmation_message!).className).toContain("media-generation-note")
    fireEvent.click(screen.getByRole("button", { name: "Confirm and generate" }))
    await waitFor(() => expect(originsApi.confirmJob).toHaveBeenCalledWith(approval.job_id))

    const recovery = {
      ...generation(), status: "failed", can_retry_ingestion: true,
      local_ingestion_pending: true, error: "The provider finished, but the result could not be saved.",
    } as MediaGeneration
    vi.mocked(originsApi.mediaGenerations).mockResolvedValue([recovery] as never)
    cleanup()
    renderComposer()
    expect(await screen.findByText("Saving failed")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Retry saving" }))
    await waitFor(() => expect(originsApi.retryMediaGenerationIngestion).toHaveBeenCalledWith(
      { workspace_id: 1, project_id: 7, project_type: "audiovisual" },
      recovery.job_id,
    ))
  })

  it("keeps optional provider controls in one explicit settings surface", async () => {
    vi.mocked(originsApi.mediaModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryFiles: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })
    const settings = await screen.findByRole("button", { name: "Advanced settings" })
    expect(screen.getByText("Generate audio", { selector: ".media-parameter-toggle.is-audio span span" })).toBeTruthy()
    fireEvent.click(settings)
    expect(screen.getByText("Plan shots automatically")).toBeTruthy()
    expect(screen.getByText("Characters & subjects")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add subject" }))
    expect(screen.getByText("Subject 1")).toBeTruthy()
    expect((screen.getByRole("textbox", { name: "Prompt name" }) as HTMLInputElement).value).toBe("subject_1")
  })

  it("keeps the operator's creation type explicit when reference capacity is full", async () => {
    vi.mocked(originsApi.mediaModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryFiles: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })
    fireEvent.change(await screen.findByRole("textbox", { name: "Media prompt" }), { target: { value: "The product turns slowly" } })

    await chooseMode("Image")

    fireEvent.click(screen.getByRole("button", { name: "Choose image for Source image" }))
    fireEvent.click(await screen.findByRole("button", { name: "Use Hero front" }))

    expect(await screen.findByLabelText("Generation inputs")).toBeTruthy()
    expect(screen.getByRole("img", { name: "Source image: Hero front" })).toBeTruthy()
    expect(screen.getByText("Source image", { selector: ".media-visual-slot > header span" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: /^Image:/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.queryByText(/subject/i, { selector: ".media-visual-slot > header span" })).toBeNull()

    expect(screen.queryByRole("button", { name: "Choose image for Source image" })).toBeNull()
    expect(screen.getByRole("radio", { name: /^Image:/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: /^References:/ })).toBeTruthy()
    expect((screen.getByRole("textbox", { name: "Media prompt" }) as HTMLTextAreaElement).value).toBe("The product turns slowly")
  })

  it("uses the source image ratio until custom shot direction is enabled", async () => {
    vi.mocked(originsApi.mediaModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryFiles: [
      { id: 41, media_type: "image", name: "Portrait source" },
    ] })
    await chooseMode("Image")
    fireEvent.click(await screen.findByRole("button", { name: "Choose image for Source image" }))
    fireEvent.click(await screen.findByRole("button", { name: "Use Portrait source" }))

    expect(await screen.findByText("auto", { selector: ".media-capability-static" })).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Ratio" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }))
    fireEvent.click(screen.getByRole("switch", { name: "Direct multiple shots" }))
    expect(await screen.findByRole("combobox", { name: "Ratio" })).toBeTruthy()
    expect(screen.queryByText("auto", { selector: ".media-capability-static" })).toBeNull()
  })

  it("shows shot planning in settings and explains why Create is unavailable", async () => {
    vi.mocked(originsApi.mediaModels).mockResolvedValue(kieCatalog as never)
    renderComposer()
    fireEvent.change(await screen.findByRole("textbox", { name: "Media prompt" }), { target: { value: "A calm harbor at dawn" } })
    fireEvent.click(await screen.findByRole("button", { name: "Advanced settings" }))
    fireEvent.click(screen.getByRole("switch", { name: "Direct multiple shots" }))
    expect(await screen.findByRole("button", { name: "Add shot" })).toBeTruthy()
    expect(screen.getByText("Add at least one directed shot.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Generate" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("keeps conflicting creative modes mutually exclusive", async () => {
    vi.mocked(originsApi.mediaModels).mockResolvedValue(kieCatalog as never)
    renderComposer()
    fireEvent.click(await screen.findByRole("button", { name: "Advanced settings" }))
    const direct = screen.getByRole("switch", { name: "Direct multiple shots" })
    const automatic = screen.getByRole("switch", { name: "Plan shots automatically" })
    fireEvent.click(direct)
    expect(direct.getAttribute("data-state")).toBe("checked")
    fireEvent.click(automatic)
    expect(automatic.getAttribute("data-state")).toBe("checked")
    expect(direct.getAttribute("data-state")).toBe("unchecked")
  })

  it("does not invent a persistent subject when adding an ordinary reference", async () => {
    vi.mocked(originsApi.mediaModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryFiles: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })
    await chooseMode("References")
    fireEvent.click(await screen.findByRole("button", { name: "Choose images for Reference images" }))
    fireEvent.click(await screen.findByRole("button", { name: "Use Hero front" }))
    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }))
    expect(await screen.findByText(/Optional\. Add a character/)).toBeTruthy()
    expect(screen.queryByText("Subject 1")).toBeNull()
  })
})
