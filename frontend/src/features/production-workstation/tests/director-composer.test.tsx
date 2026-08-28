// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { DirectorComposer } from "../director/composer/director-composer"
import type { DirectorGeneration } from "../director/composer/director-generation-types"

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

vi.mock("@/lib/api", () => ({ studioApi: {
  directorModels: vi.fn(), directorGenerations: vi.fn(),
  createDirectorGeneration: vi.fn(), cancelDirectorGeneration: vi.fn(),
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

const kieCatalog = {
  providers: [{ id: "kie", label: "KIE" }],
  operations: [{ id: "text_to_video", label: "Create video", detail: "Create motion from a written direction" }],
  models: [{
    id: "kling-3.0-omni/text-to-video", label: "Kling 3.0 Omni", provider: "KIE", provider_id: "kie",
    provider_model_id: "kling-3.0-omni/text-to-video", adapter_key: "kie-kling-omni", adapter_version: "adapter-1",
    capability_manifest_version: "manifest-1", status: "enabled", description: "Video",
    operations: [{
      operation: "text_to_video", output_media_type: "video", prompt: { supported: true, required: true, negative_prompt: false, max_length: 3072 },
      inputs: [], required_any_of: [], ratios: ["16:9", "9:16"], resolutions: ["720p", "1080p", "4k"], durations: [],
      duration_range: { min: 3, max: 15, step: 1, default: 5 }, fps: [], supports_seed: false, supports_cancel: false,
      output: { mime_type: "video/mp4", extension: "mp4" },
      parameters: [
        { key: "audio", type: "boolean", label: "Generate audio", required: false, default: false, options: [], min: null, max: null, step: null, max_length: null, visible_when: {}, conflicts_with: [], item: {} },
        { key: "customize_multi_shots", type: "boolean", label: "Direct multiple shots", required: false, default: false, options: [], min: null, max: null, step: null, max_length: null, visible_when: {}, conflicts_with: ["prefer_multi_shots"], item: {} },
        { key: "prefer_multi_shots", type: "boolean", label: "Plan shots automatically", required: false, default: false, options: [], min: null, max: null, step: null, max_length: null, visible_when: {}, conflicts_with: ["customize_multi_shots"], item: {} },
        { key: "multi_prompt", type: "structured_shots", label: "Shots", required: false, default: [], options: [], min: null, max: null, step: null, max_length: null, visible_when: { customize_multi_shots: true }, conflicts_with: [], item: { prompt_max_length: 512, duration_min: 1, duration_max: 15, max_items: 6 } },
        { key: "elements", type: "asset_list", label: "Subject references", required: false, default: [], options: [], min: null, max: 7, step: null, max_length: null, visible_when: {}, conflicts_with: [], item: { name_max_length: 64, description_max_length: 300, variants: [{ id: "images", label: "Image subject", media_types: ["image"], min_assets: 2, max_assets: 4 }], audio: { media_types: ["audio"], max_assets: 1 } } },
      ],
    }],
  }],
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
}

function renderComposer(overrides: Partial<React.ComponentProps<typeof DirectorComposer>> = {}) {
  return render(<DirectorComposer productionId={7} uploading={false} uploadLabel="" libraryAssets={[]} onUploadReference={vi.fn()} {...overrides} />)
}

async function openOperationPicker() {
  fireEvent.pointerDown(await screen.findByRole("button", { name: /Creation type:/ }), { button: 0, ctrlKey: false })
}

beforeEach(() => {
  setup()
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((file: File) => `blob:${file.name}`) })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("Director composer", () => {
  it("renders controls from the selected model-operation capability", async () => {
    renderComposer()
    expect(await screen.findByRole("combobox", { name: "Aspect ratio" })).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Duration" })).toBeNull()
    await openOperationPicker()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Frames to video/ }))
    expect(screen.getByRole("combobox", { name: "Choose generation model" }).textContent).toContain("Model B")
    expect(screen.getByRole("button", { name: "Start frame" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "End frame" })).toBeNull()
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

  it("uses canonical audio and image Assets in role-aware slots", async () => {
    renderComposer({ libraryAssets: [
      { id: 41, media_type: "image", name: "Character", filename: "character.webp" },
      { id: 42, media_type: "audio", name: "Voice", filename: "voice.wav" },
    ] })
    await openOperationPicker()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Talking video/ }))
    fireEvent.pointerDown(screen.getByRole("button", { name: "Add a reference" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Choose from Visual Library" }))
    const character = await screen.findByText("Character", { selector: ".director-reference-item strong" })
    fireEvent.click(character.closest("button")!)
    expect(await screen.findByText("Character", { selector: ".attachment-chip-copy strong" })).toBeTruthy()
  })

  it("restores durable history and reuses its exact saved recipe", async () => {
    const saved = generation()
    vi.mocked(studioApi.directorGenerations).mockResolvedValue([saved] as never)
    renderComposer()
    fireEvent.click(await screen.findByRole("button", { name: /Generation history/ }))
    expect(await screen.findByText("Ready")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    await waitFor(() => expect(studioApi.createDirectorGeneration).toHaveBeenCalledWith(7, saved.recipe))
    fireEvent.click(screen.getByRole("button", { name: "Remix" }))
    expect((screen.getByRole("textbox", { name: "Director prompt" }) as HTMLTextAreaElement).value).toBe(saved.recipe.prompt)
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
    fireEvent.click(await screen.findByRole("button", { name: /Generation history/ }))
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    expect(onPreviewGenerated).toHaveBeenCalledWith(asset)
    fireEvent.click(screen.getByRole("button", { name: "Add to Timeline" }))
    await waitFor(() => expect(onAddGeneratedToTimeline).toHaveBeenCalledWith(asset))
  })

  it("renders model-declared Kling settings without model-specific composer code", async () => {
    vi.mocked(studioApi.directorModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryAssets: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })
    fireEvent.click(await screen.findByRole("button", { name: "Model settings" }))
    expect(await screen.findByText("Generate audio")).toBeTruthy()
    expect(screen.getByText("Plan shots automatically")).toBeTruthy()
    expect(screen.getByText("Subject references")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add subject" }))
    expect(screen.getByText("Subject 1")).toBeTruthy()
    expect((screen.getByRole("textbox", { name: "Prompt name" }) as HTMLInputElement).value).toBe("subject_1")
  })

  it("routes a canonical image into the nested provider reference contract", async () => {
    vi.mocked(studioApi.directorModels).mockResolvedValue(kieCatalog as never)
    renderComposer({ libraryAssets: [
      { id: 41, media_type: "image", name: "Hero front" },
      { id: 42, media_type: "image", name: "Hero side" },
    ] })

    fireEvent.pointerDown(await screen.findByRole("button", { name: "Add a reference" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Choose from Visual Library" }))
    fireEvent.click((await screen.findByText("Hero front", { selector: ".director-reference-item strong" })).closest("button")!)

    fireEvent.click(screen.getByRole("button", { name: "Model settings" }))
    expect(await screen.findByText("Subject 1")).toBeTruthy()
    expect(screen.getByText("Hero front", { selector: ".director-subject-asset" })).toBeTruthy()
    expect((screen.getByLabelText("Description (optional)") as HTMLInputElement).value).toBe("Hero front")
  })
})
