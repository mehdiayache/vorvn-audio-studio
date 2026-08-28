// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { DirectorComposer } from "../director/composer/director-composer"
import type { DirectorGeneration } from "../director/composer/director-generation-types"

vi.mock("@/lib/api", () => ({ studioApi: {
  directorGenerationCapabilities: vi.fn(), directorGenerations: vi.fn(),
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

function generation(prompt = "A quiet violet horizon"): DirectorGeneration {
  return {
    id: "job-1", job_id: "job-1", status: "ready", progress: 100, detail: "Prototype ready", error: null,
    recipe: { prompt, negative_prompt: "text", operation: "image", model_id: "model-a", inputs: [], controls: { ratio: "16:9", resolution: "2K", duration: null, fps: null, seed: 42, provider_parameters: {} } },
    provider: "Prototype Lab", model_label: "Model A", model_version: "a-1", output_media_type: "image", output_asset_ids: [], provider_job_id: null, estimated_cost: null,
    created_at: "2026-08-28T00:00:00Z", updated_at: "2026-08-28T00:00:01Z",
  }
}

function setup() {
  vi.mocked(studioApi.directorGenerationCapabilities).mockResolvedValue(catalog as never)
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
    expect(await screen.findByText("Prototype ready")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remix" }))
    expect((screen.getByRole("textbox", { name: "Director prompt" }) as HTMLTextAreaElement).value).toBe(saved.recipe.prompt)
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    await waitFor(() => expect(studioApi.createDirectorGeneration).toHaveBeenCalledWith(7, saved.recipe))
  })
})
