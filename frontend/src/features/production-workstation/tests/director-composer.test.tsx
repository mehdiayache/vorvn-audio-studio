// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { DirectorComposer } from "../director/composer/director-composer"
import type { DirectorGeneration } from "../director/composer/director-generation-types"
import { inputMode, ratioChoices, type DirectorOperationCapability } from "../director/composer/director-composer-config"
import { assignInputs, inputModeIssue } from "../director/composer/director-composer-state"

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

vi.mock("@/lib/api", () => ({ studioApi: {
  directorModels: vi.fn(), directorGenerations: vi.fn(),
  createDirectorGeneration: vi.fn(), cancelDirectorGeneration: vi.fn(),
  confirmJob: vi.fn(), retryDirectorGenerationIngestion: vi.fn(),
  savedVisualReferences: vi.fn(), createSavedVisualReference: vi.fn(),
} }))

const catalog = {
  operations: [
    { id: "image", label: "Image", detail: "Create a still visual" },
    { id: "frames-to-video", label: "Frames to video", detail: "Move between frames" },
    { id: "talking-video", label: "Talking video", detail: "Animate a character" },
  ],
  models: [
    { id: "model-a", label: "Model A", provider: "Prototype Lab", version: "a-1", description: "Still images", operations: [{ operation: "image", output_media_type: "image", prompt: { supported: true, required: true, negative_prompt: true }, inputs: [{ role: "reference", label: "Reference", required: false, media_types: ["image"], max: 1 }], ratios: ["1:1", "16:9"], resolutions: ["1K", "2K"], durations: [], fps: [], supports_seed: true, supports_cancel: true }] },
    { id: "model-b", label: "Model B", provider: "Prototype Lab", version: "b-1", description: "Frames", operations: [{ operation: "frames-to-video", output_media_type: "video", prompt: { supported: true, required: false, negative_prompt: true }, inputs: [{ role: "start-frame", label: "Start frame", required: true, media_types: ["image"], max: 1 }, { role: "end-frame", label: "End frame", required: false, media_types: ["image"], max: 1 }], ratios: ["16:9"], resolutions: ["1080p"], durations: [5, 8], fps: [24, 30], supports_seed: true, supports_cancel: true }] },
    { id: "model-c", label: "Model C", provider: "Prototype Lab", version: "c-1", description: "Character and voice", operations: [{ operation: "talking-video", output_media_type: "video", prompt: { supported: true, required: false, negative_prompt: true }, inputs: [{ role: "character", label: "Character", required: true, media_types: ["image"], max: 1 }, { role: "voice", label: "Voice audio", required: true, media_types: ["audio"], max: 1 }, { role: "reference", label: "Reference image", required: false, media_types: ["image"], max: 2 }], ratios: ["16:9"], resolutions: ["1080p"], durations: [5], fps: [24], supports_seed: true, supports_cancel: true }] },
  ],
}

const kieParameters = [
  { key: "audio", type: "boolean", label: "Generate audio", exposure: "advanced", required: false, default: false, options: [], min: null, max: null, step: null, max_length: null, visible_when: {}, conflicts_with: [], item: {} },
  { key: "customize_multi_shots", type: "boolean", label: "Direct multiple shots", exposure: "advanced", required: false, default: false, options: [], min: null, max: null, step: null, max_length: null, visible_when: {}, conflicts_with: ["prefer_multi_shots"], item: {} },
  { key: "prefer_multi_shots", type: "boolean", label: "Plan shots automatically", exposure: "advanced", required: false, default: false, options: [], min: null, max: null, step: null, max_length: null, visible_when: {}, conflicts_with: ["customize_multi_shots"], item: {} },
  { key: "multi_prompt", type: "structured_shots", label: "Shots", exposure: "advanced", required: true, default: [], options: [], min: null, max: null, step: null, max_length: null, visible_when: { customize_multi_shots: true }, conflicts_with: [], item: { prompt_max_length: 512, duration_min: 1, duration_max: 15, max_items: 6 } },
  { key: "elements", type: "asset_list", label: "Characters & subjects", exposure: "advanced", required: false, default: [], options: [], min: null, max: 3, step: null, max_length: null, visible_when: {}, conflicts_with: [], item: { name_max_length: 64, description_max_length: 300, description_required: true, variants: [{ id: "images", label: "Image subject", media_types: ["image"], min_assets: 2, max_assets: 4 }], audio: { media_types: ["audio"], max_assets: 1 } } },
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
    { id: "text_to_video", label: "Create video", detail: "Create motion from a written direction" },
    { id: "image_to_video", label: "Animate image", detail: "Create motion from a source image" },
    { id: "reference_to_video", label: "Direct with references", detail: "Use visual references" },
  ],
  models: [
    { id: "kling-3.0-omni/text-to-video", label: "Kling 3.0 Omni", provider: "KIE", provider_id: "kie", provider_model_id: "kling-3.0-omni/text-to-video", adapter_key: "kie-kling-omni", adapter_version: "adapter-1", capability_manifest_version: "manifest-1", status: "enabled", description: "Video", operations: [kieCapability("text_to_video", [])] },
    { id: "kling-3.0-omni/image-to-video", label: "Kling 3.0 Omni", provider: "KIE", provider_id: "kie", provider_model_id: "kling-3.0-omni/image-to-video", adapter_key: "kie-kling-omni", adapter_version: "adapter-1", capability_manifest_version: "manifest-1", status: "enabled", description: "Animate image", operations: [kieCapability("image_to_video", [{ role: "source-image", label: "Source image", required: true, media_types: ["image"], max: 1 }], [], [{ when: { customize_multi_shots: false }, values: ["auto"], default: "auto" }, { when: { customize_multi_shots: true }, values: ["16:9", "9:16", "1:1"], default: "16:9" }])] },
    { id: "kling-3.0-omni/reference-to-video", label: "Kling 3.0 Omni", provider: "KIE", provider_id: "kie", provider_model_id: "kling-3.0-omni/reference-to-video", adapter_key: "kie-kling-omni", adapter_version: "adapter-1", capability_manifest_version: "manifest-1", status: "enabled", description: "References", operations: [kieCapability("reference_to_video", [{ role: "reference-image", label: "Reference images", required: false, media_types: ["image"], max: 7 }], [["reference-image"]])] },
  ],
}

function generation(prompt = "A quiet violet horizon"): DirectorGeneration {
  return {
    id: "job-1", job_id: "job-1", status: "ready", progress: 100, detail: "Prototype ready", error: null,
    recipe: { prompt, negative_prompt: "text", operation: "image", model_id: "model-a", inputs: [], controls: { ratio: "16:9", resolution: "2K", duration: null, fps: null, seed: 42, provider_parameters: {} } },
    provider: "Prototype Lab", model_label: "Model A", model_version: "a-1", output_media_type: "image", output_asset_ids: [], provider_job_id: null, estimated_cost: null,
    created_at: "2026-08-28T00:00:00Z", updated_at: "2026-08-28T00:00:01Z",
  }
}

function setup() {
  vi.mocked(studioApi.directorModels).mockResolvedValue(catalog as never)
  vi.mocked(studioApi.directorGenerations).mockResolvedValue([] as never)
  vi.mocked(studioApi.createDirectorGeneration).mockResolvedValue({} as never)
  vi.mocked(studioApi.cancelDirectorGeneration).mockResolvedValue({} as never)
  vi.mocked(studioApi.confirmJob).mockResolvedValue({} as never)
  vi.mocked(studioApi.retryDirectorGenerationIngestion).mockResolvedValue({} as never)
  vi.mocked(studioApi.savedVisualReferences).mockResolvedValue([] as never)
  vi.mocked(studioApi.createSavedVisualReference).mockResolvedValue({} as never)
}

function renderComposer(overrides: Partial<React.ComponentProps<typeof DirectorComposer>> = {}) {
  return render(<DirectorComposer productionId={7} uploading={false} uploadLabel="" libraryAssets={[]} onUploadReference={vi.fn()} {...overrides} />)
}

async function openOperationPicker() {
  fireEvent.pointerDown(await screen.findByRole("button", { name: /Creation type:/ }), { button: 0, ctrlKey: false })
}

async function chooseModel(name: string) {
  fireEvent.click(await screen.findByRole("combobox", { name: "Choose generation model" }))
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }))
}

beforeEach(() => {
  setup()
  Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((file: File) => `blob:${file.name}`) })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("Director composer", () => {
  it("keeps Start and End references in semantic order", () => {
    const capability = {
      inputs: [
        { role: "start-frame", media_types: ["image"], max: 1, required: true },
        { role: "end-frame", media_types: ["image"], max: 1, required: true },
      ], input_order: ["start-frame", "end-frame"], input_modes: [],
    } as unknown as DirectorOperationCapability
    const ordered = assignInputs([
      { id: "end", assetId: 2, name: "End", kind: "image", role: "end-frame", previewUrl: null, posterUrl: null, status: "ready" },
      { id: "start", assetId: 1, name: "Start", kind: "image", role: "start-frame", previewUrl: null, posterUrl: null, status: "ready" },
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
    } as unknown as DirectorOperationCapability
    const counts = { "reference-image": 0, "reference-video": 1 }
    expect(inputMode(capability, counts)?.id).toBe("video")
    expect(ratioChoices(capability, { audio: false }, counts)).toEqual({ values: ["auto"], default: "auto" })
    expect(inputModeIssue(capability, [
      { id: "video", assetId: 2, name: "Video", kind: "video", role: "reference-video", previewUrl: null, posterUrl: null, status: "ready" },
    ], { audio: true })).toContain("Generate audio")
  })

  it("counts direct and nested images in the same reference quota", () => {
    const capability = {
      inputs: [{ role: "reference-image", media_types: ["image"], max: 7 }],
      input_modes: [{
        id: "images", when_counts: { "reference-image": { min: 1 } },
        ratios: ["16:9"], default_ratio: "16:9", parameter_values: {},
        elements: { max_image_assets_total: 7 },
      }],
      parameters: [], ratios: ["16:9"], ratio_rules: [],
    } as unknown as DirectorOperationCapability
    const attachments = Array.from({ length: 7 }, (_, index) => ({
      id: `direct-${index}`, assetId: index + 1, name: `Image ${index + 1}`,
      kind: "image" as const, role: "reference-image", previewUrl: null,
      posterUrl: null, status: "ready" as const,
    }))
    expect(inputModeIssue(capability, attachments, {
      elements: [{ variant: "images", asset_ids: [99] }],
    })).toBe("This reference mode has too many image references.")
  })

  it("accepts the four-image boundary with one video subject", () => {
    const capability = {
      inputs: [{ role: "reference-image", media_types: ["image"], max: 7 }],
      input_modes: [{
        id: "images", when_counts: { "reference-image": { min: 1 } },
        ratios: ["16:9"], default_ratio: "16:9", parameter_values: {},
        elements: {
          max_video_subjects: 3, max_image_assets_total: 7,
          max_image_assets_with_video_subjects: 4,
        },
      }],
      parameters: [], ratios: ["16:9"], ratio_rules: [],
    } as unknown as DirectorOperationCapability
    const attachments = Array.from({ length: 2 }, (_, index) => ({
      id: `direct-${index}`, assetId: index + 1, name: `Image ${index + 1}`,
      kind: "image" as const, role: "reference-image", previewUrl: null,
      posterUrl: null, status: "ready" as const,
    }))
    expect(inputModeIssue(capability, attachments, {
      elements: [
        { variant: "images", asset_ids: [3, 4] },
        { variant: "video", asset_ids: [5] },
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
    } as unknown as DirectorOperationCapability
    const attachments = [
      { id: "video", assetId: 1, name: "Video", kind: "video" as const, role: "reference-video", previewUrl: null, posterUrl: null, status: "ready" as const },
      { id: "image", assetId: 2, name: "Image", kind: "image" as const, role: "reference-image", previewUrl: null, posterUrl: null, status: "ready" as const },
    ]
    expect(inputModeIssue(capability, attachments, {
      customize_multi_shots: true,
      elements: [{ variant: "video", asset_ids: [3] }],
    })).toBe("Video subjects cannot be mixed with image references in this mode.")
    expect(inputModeIssue(capability, attachments.slice(0, 1), {
      customize_multi_shots: false,
      elements: [{ variant: "video", asset_ids: [3] }],
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
    vi.mocked(studioApi.directorModels).mockResolvedValue(primaryCatalog as never)
    renderComposer()
    expect(await screen.findByText("Style", { selector: ".director-primary-parameters span" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Model settings" })).toBeTruthy()
  })

  it("renders controls from the selected model-operation capability", async () => {
    renderComposer()
    expect(await screen.findByRole("combobox", { name: "Aspect ratio" })).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Duration" })).toBeNull()
    await chooseModel("Model B")
    expect(screen.getByRole("combobox", { name: "Choose generation model" }).textContent).toContain("Model B")
    expect(screen.getByRole("button", { name: "Start frame" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "End frame" })).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Duration" })).toBeTruthy()
  })

  it("uploads a file through the canonical Asset pipeline before using it", async () => {
    const onUploadReference = vi.fn().mockResolvedValue({ id: 41, media_type: "image", name: "Canonical image", filename: "canonical.webp" })
    renderComposer({ onUploadReference })
    await screen.findByRole("textbox", { name: "Director prompt" })
    const file = new File(["image"], "reference.png", { type: "image/png" })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    expect(onUploadReference).toHaveBeenCalledWith(file)
    expect(await screen.findByText("Canonical image")).toBeTruthy()
  })

  it("shows only compatible media in an exact semantic slot", async () => {
    renderComposer({ libraryAssets: [
      { id: 41, media_type: "image", name: "Character", filename: "character.webp" },
      { id: 42, media_type: "audio", name: "Voice", filename: "voice.wav" },
    ] })
    await chooseModel("Model C")
    fireEvent.click(await screen.findByRole("button", { name: "Voice audio" }))
    expect(await screen.findByRole("heading", { name: "Choose voice audio" })).toBeTruthy()
    expect(screen.getByText("Voice", { selector: ".director-reference-item strong" })).toBeTruthy()
    expect(screen.queryByText("Character", { selector: ".director-reference-item strong" })).toBeNull()
    fireEvent.click(screen.getByText("Voice", { selector: ".director-reference-item strong" }).closest("button")!)
    expect(await screen.findByText("Voice", { selector: ".attachment-chip-copy strong" })).toBeTruthy()
    expect(screen.getByText("Voice audio", { selector: ".attachment-chip-role" })).toBeTruthy()
  })

  it("places a durable-looking queued card immediately while creation starts", async () => {
    let resolveCreate: (value: DirectorGeneration) => void = () => undefined
    vi.mocked(studioApi.createDirectorGeneration).mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve as (value: DirectorGeneration) => void }) as never)
    renderComposer()
    fireEvent.change(await screen.findByRole("textbox", { name: "Director prompt" }), { target: { value: "A calm harbor at dawn" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    expect(await screen.findByText("Queued")).toBeTruthy()
    expect(screen.getByText("A calm harbor at dawn", { selector: ".director-generation-copy strong" })).toBeTruthy()
    resolveCreate(generation("A calm harbor at dawn"))
    await waitFor(() => expect(studioApi.createDirectorGeneration).toHaveBeenCalledTimes(1))
  })

  it("does not silently squeeze a multi-media saved reference into one exact slot", async () => {
    vi.mocked(studioApi.savedVisualReferences).mockResolvedValue([
      { id: "single", name: "One look", type: "character", asset_ids: [41] },
      { id: "bundle", name: "Two looks", type: "character", asset_ids: [41, 42] },
    ] as never)
    renderComposer({ ventureId: 8, libraryAssets: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })
    await chooseModel("Model B")
    fireEvent.click(await screen.findByRole("button", { name: "Start frame" }))
    expect(await screen.findByRole("button", { name: /One look/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Two looks/ })).toBeNull()
  })

  it("restores durable history and reuses its exact saved recipe", async () => {
    const saved = generation()
    vi.mocked(studioApi.directorGenerations).mockResolvedValue([saved] as never)
    renderComposer()
    expect(await screen.findByText("Ready")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    await waitFor(() => expect(studioApi.createDirectorGeneration).toHaveBeenCalledWith(7, saved.recipe))
    fireEvent.click(screen.getByRole("button", { name: "Remix" }))
    expect((screen.getByRole("textbox", { name: "Director prompt" }) as HTMLTextAreaElement).value).toBe(saved.recipe.prompt)
  })

  it("keeps generated outputs represented by their creation instead of duplicate media cards", async () => {
    const saved = Array.from({ length: 8 }, (_, index) => ({
      ...generation(`Request ${index + 1}`),
      id: `job-${index + 1}`,
      job_id: `job-${index + 1}`,
      output_asset_ids: [100 + index],
    }))
    vi.mocked(studioApi.directorGenerations).mockResolvedValue(saved as never)
    let hiddenOutputIds = new Set<number>()
    let primaryCount = 0
    let hasHistory = false
    renderComposer({ renderCreations: (outputIds, items, history) => {
      hiddenOutputIds = outputIds
      primaryCount = items.length
      hasHistory = Boolean(history)
      return <div>Unified creations</div>
    } })
    expect(await screen.findByText("Unified creations")).toBeTruthy()
    await waitFor(() => expect(hiddenOutputIds.size).toBe(8))
    expect(primaryCount).toBe(6)
    expect(hasHistory).toBe(true)
  })

  it("refreshes canonical outputs and exposes preview and Timeline actions", async () => {
    const saved = { ...generation(), output_asset_ids: [41] }
    const onGenerationOutputReady = vi.fn().mockResolvedValue(undefined)
    const onPreviewGenerated = vi.fn()
    const onAddGeneratedToTimeline = vi.fn().mockResolvedValue(undefined)
    vi.mocked(studioApi.directorGenerations).mockResolvedValue([saved] as never)
    const asset = { id: 41, media_type: "image" as const, name: "Generated sunrise", filename: "sunrise.webp" }
    renderComposer({
      libraryAssets: [asset], onGenerationOutputReady,
      onPreviewGenerated, onAddGeneratedToTimeline,
    })
    await waitFor(() => expect(onGenerationOutputReady).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    expect(onPreviewGenerated).toHaveBeenCalledWith(asset)
    fireEvent.click(screen.getByRole("button", { name: "Add to Timeline" }))
    await waitFor(() => expect(onAddGeneratedToTimeline).toHaveBeenCalledWith(asset))
  })

  it("keeps cost approval and ingestion recovery at the generation that needs action", async () => {
    const approval = {
      ...generation(), status: "failed", needs_confirmation: true,
      confirmation_message: "This generation is estimated at $1.20. Confirm to continue.",
    } as DirectorGeneration
    vi.mocked(studioApi.directorGenerations).mockResolvedValue([approval] as never)
    renderComposer()
    expect(await screen.findByText("Approval needed")).toBeTruthy()
    expect(screen.getByText(approval.confirmation_message!).className).toContain("director-generation-note")
    fireEvent.click(screen.getByRole("button", { name: "Confirm and generate" }))
    await waitFor(() => expect(studioApi.confirmJob).toHaveBeenCalledWith(approval.job_id))

    const recovery = {
      ...generation(), status: "failed", can_retry_ingestion: true,
      local_ingestion_pending: true, error: "The provider finished, but the result could not be saved.",
    } as DirectorGeneration
    vi.mocked(studioApi.directorGenerations).mockResolvedValue([recovery] as never)
    cleanup()
    renderComposer()
    expect(await screen.findByText("Saving failed")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Retry saving" }))
    await waitFor(() => expect(studioApi.retryDirectorGenerationIngestion).toHaveBeenCalledWith(7, recovery.job_id))
  })

  it("keeps optional provider controls in one explicit settings surface", async () => {
    vi.mocked(studioApi.directorModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryAssets: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })
    const settings = await screen.findByRole("button", { name: "Model settings" })
    expect(screen.queryByText("Generate audio")).toBeNull()
    fireEvent.click(settings)
    expect(await screen.findByText("Generate audio")).toBeTruthy()
    expect(screen.getByText("Plan shots automatically")).toBeTruthy()
    expect(screen.getByText("Characters & subjects")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add subject" }))
    expect(screen.getByText("Subject 1")).toBeTruthy()
    expect((screen.getByRole("textbox", { name: "Prompt name" }) as HTMLInputElement).value).toBe("subject_1")
  })

  it("keeps the operator's creation type explicit when reference capacity is full", async () => {
    vi.mocked(studioApi.directorModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryAssets: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })
    fireEvent.change(await screen.findByRole("textbox", { name: "Director prompt" }), { target: { value: "The product turns slowly" } })

    await openOperationPicker()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Animate image/ }))

    fireEvent.pointerDown(screen.getByRole("button", { name: "Add a reference" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Choose from Visual Library" }))
    fireEvent.click((await screen.findByText("Hero front", { selector: ".director-reference-item strong" })).closest("button")!)

    expect(await screen.findByLabelText("Generation inputs")).toBeTruthy()
    expect(screen.getByText("Hero front", { selector: ".attachment-chip-copy strong" })).toBeTruthy()
    expect(screen.getByText("Source image", { selector: ".attachment-chip-role" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Creation type: Animate image/ })).toBeTruthy()
    expect(screen.queryByText(/subject/i, { selector: ".attachment-chip-role" })).toBeNull()

    expect((screen.getByRole("button", { name: "Add a reference" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("button", { name: /Creation type: Animate image/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Creation type: Direct with references/ })).toBeNull()
    expect((screen.getByRole("textbox", { name: "Director prompt" }) as HTMLTextAreaElement).value).toBe("The product turns slowly")
  })

  it("uses the source image ratio until custom shot direction is enabled", async () => {
    vi.mocked(studioApi.directorModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryAssets: [
      { id: 41, media_type: "image", name: "Portrait source" },
    ] })
    await openOperationPicker()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Animate image/ }))
    fireEvent.pointerDown(await screen.findByRole("button", { name: "Add a reference" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Choose from Visual Library" }))
    fireEvent.click((await screen.findByText("Portrait source", { selector: ".director-reference-item strong" })).closest("button")!)

    expect(await screen.findByText("auto", { selector: ".director-capability-static" })).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Aspect ratio" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Model settings" }))
    fireEvent.click(screen.getByRole("switch", { name: "Direct multiple shots" }))
    expect(await screen.findByRole("combobox", { name: "Aspect ratio" })).toBeTruthy()
    expect(screen.queryByText("auto", { selector: ".director-capability-static" })).toBeNull()
  })

  it("shows shot planning in settings and explains why Create is unavailable", async () => {
    vi.mocked(studioApi.directorModels).mockResolvedValue(kieCatalog as never)
    renderComposer()
    fireEvent.change(await screen.findByRole("textbox", { name: "Director prompt" }), { target: { value: "A calm harbor at dawn" } })
    fireEvent.click(await screen.findByRole("button", { name: "Model settings" }))
    fireEvent.click(screen.getByRole("switch", { name: "Direct multiple shots" }))
    expect(await screen.findByRole("button", { name: "Add shot" })).toBeTruthy()
    expect(screen.getByText("Add at least one directed shot.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("keeps conflicting creative modes mutually exclusive", async () => {
    vi.mocked(studioApi.directorModels).mockResolvedValue(kieCatalog as never)
    renderComposer()
    fireEvent.click(await screen.findByRole("button", { name: "Model settings" }))
    const direct = screen.getByRole("switch", { name: "Direct multiple shots" })
    const automatic = screen.getByRole("switch", { name: "Plan shots automatically" })
    fireEvent.click(direct)
    expect(direct.getAttribute("data-state")).toBe("checked")
    fireEvent.click(automatic)
    expect(automatic.getAttribute("data-state")).toBe("checked")
    expect(direct.getAttribute("data-state")).toBe("unchecked")
  })

  it("does not invent a persistent subject when adding an ordinary reference", async () => {
    vi.mocked(studioApi.directorModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryAssets: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })
    await openOperationPicker()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Direct with references/ }))
    fireEvent.pointerDown(await screen.findByRole("button", { name: "Add a reference" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Choose from Visual Library" }))
    const hero = await screen.findByText("Hero front", { selector: ".director-reference-item strong" })
    fireEvent.click(hero.closest("button")!)
    fireEvent.click(screen.getByRole("button", { name: "Model settings" }))
    expect(await screen.findByText(/Optional\. Add a character/)).toBeTruthy()
    expect(screen.queryByText("Subject 1")).toBeNull()
  })
})
