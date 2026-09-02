// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

import { AudioLibrary } from "./audio-library"
import { originsApi } from "@/lib/api"

const files = [{ id: 11, title: "Harbor Intro", folder: "Intros", filename: "harbor.wav", duration_ms: 8_400 }]
Element.prototype.scrollIntoView = vi.fn()
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("AudioLibrary", () => {
  it("distinguishes a loading Library from an empty Library", () => {
    const { container } = render(<AudioLibrary files={[]} loading mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)

    expect(screen.getByRole("status", { name: "Loading Audio Library" })).toBeTruthy()
    expect(container.querySelectorAll(".audio-file-card-skeleton")).toHaveLength(8)
    expect(screen.queryByText("No matching audio")).toBeNull()
  })

  it("keeps a failed Library inside its modal with a retry action", () => {
    const retry = vi.fn().mockResolvedValue(undefined)
    render(<AudioLibrary files={[]} resourceError="files offline" onRetryResource={retry} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)

    expect(screen.getByRole("alert").textContent).toContain("files offline")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it("keeps source navigation on top and names every Library filter explicitly", () => {
    const { container } = render(<AudioLibrary files={files} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    const view = within(container)
    expect(view.getByRole("tablist", { name: "Audio Library views" })).toBeTruthy()
    expect(view.getByRole("tab", { name: "Library" }).getAttribute("aria-selected")).toBe("true")
    fireEvent.click(view.getByRole("button", { name: "Filters" }))
    expect(screen.getByRole("combobox", { name: "File category" }).textContent).toContain("All categories")
    expect(screen.getByRole("combobox", { name: "File duration" }).textContent).toContain("Any duration")
    expect(screen.getByRole("combobox", { name: "File source" }).textContent).toContain("All sources")
    expect(screen.getByRole("combobox", { name: "File usage in this Project" }).textContent).toContain("Any usage")
    expect(screen.getByRole("combobox", { name: "Sort files" }).textContent).toContain("Recently added")
    fireEvent.click(screen.getByRole("combobox", { name: "File source" }))
    expect(screen.getByRole("option", { name: "AI" })).toBeTruthy()
    expect(screen.getByRole("option", { name: "Import" })).toBeTruthy()
    expect(screen.getByRole("option", { name: "Upload" })).toBeTruthy()
    expect(container.querySelector(".file-source-rail")).toBeNull()
  })

  it("submits one explicit generated-audio Job without creating a File", async () => {
    const status = vi.spyOn(originsApi, "audioGenerationStatus").mockResolvedValue({
      configured: true, sfx_ready: true, music_ready: true, reason: "", models: {
        sfx: { id: "stable-audio-3-small-sfx" },
        music: { id: "stable-audio-3-small-music" },
      },
    })
    const recent = vi.spyOn(originsApi, "recentAudioGenerations").mockResolvedValue([])
    const taxonomy = vi.spyOn(originsApi, "soundPresetTaxonomy").mockResolvedValue({
      version: "audio-taxonomy-v1", items: [],
    })
    const compile = vi.spyOn(originsApi, "compileSoundPreset").mockResolvedValue({
      capability: "sfx", semantic_state: {}, source_free_text: "",
      compiled_prompt: "A dry match strikes once.", conflicts: [],
      model: "stable-audio-3-small-sfx", semantic_schema_version: "sfx-semantic-v2",
      compiler_version: "sfx-compiler-v2", taxonomy_version: "audio-taxonomy-v1",
    })
    const normalize = vi.spyOn(originsApi, "normalizeSoundPreset").mockImplementation(async (payload) => ({
      capability: "sfx",
      semantic_state: payload.semantic_state,
      source_free_text: payload.source_free_text,
      compiled_prompt: "A dry match strikes once.", conflicts: [],
      model: "stable-audio-3-small-sfx", semantic_schema_version: "sfx-semantic-v2",
      compiler_version: "sfx-compiler-v2", taxonomy_version: "audio-taxonomy-v1",
      normalization_model: "qwen3.7-plus", normalization_cost: 0.00001, usage: {},
    }))
    const enqueue = vi.spyOn(originsApi, "enqueueAudioGeneration").mockResolvedValue({
      id: "generation-job", type: "audio_generate", status: "queued",
      progress: 0, detail: "Queued", retries: 0, result: {
        candidate_id: "generation-job", candidate_url: "",
        capability: "sfx", prompt: "", prompt_mode: "simple", seconds: 5, seed: 0,
        duration_ms: 0, audio_format: "wav", size_bytes: 0,
      },
    })
    const onKeepGenerated = vi.fn()
    const { container } = render(<AudioLibrary files={files} mode="sound" projectId={81} playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} onKeepGenerated={onKeepGenerated} />)
    const view = within(container)
    fireEvent.click(view.getByRole("tab", { name: "Generate" }))
    await waitFor(() => expect(status).toHaveBeenCalled())
    expect(view.getByText("Stable Audio 3 Small SFX")).toBeTruthy()
    expect(view.getByRole("heading", { name: "What do you want to create?" })).toBeTruthy()
    expect(view.getByRole("button", { name: "Sound Effect" }).getAttribute("aria-pressed")).toBe("true")
    expect(view.getByRole("button", { name: "Simple" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(view.getByRole("button", { name: "Continue" }))
    fireEvent.change(view.getByPlaceholderText(/heavy wooden church door/i), { target: { value: "A dry match strikes once in a quiet room" } })
    await waitFor(() => expect(compile).toHaveBeenCalled())
    fireEvent.click(view.getByRole("button", { name: "Generate 1 variation" }))
    await waitFor(() => expect(normalize).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      capability: "sfx", prompt: null, prompt_mode: "simple",
      semantic_state: expect.objectContaining({
        model_type: "sfx", creative_brief: "A dry match strikes once in a quiet room",
        variation_count: 1,
      }),
      source_free_text: "A dry match strikes once in a quiet room",
      generation_brief: null, seconds: 5, seed: null, project_id: 81,
    })))
    expect(onKeepGenerated).not.toHaveBeenCalled()
    status.mockRestore(); recent.mockRestore(); taxonomy.mockRestore(); compile.mockRestore(); normalize.mockRestore(); enqueue.mockRestore()
  })

  it("opens Generate as a fresh composition instead of selecting previous audio", async () => {
    const status = vi.spyOn(originsApi, "audioGenerationStatus").mockResolvedValue({
      configured: true, sfx_ready: true, music_ready: true, reason: "", models: {},
    })
    const recent = vi.spyOn(originsApi, "recentAudioGenerations").mockResolvedValue([{
      job_id: "old-job",
      status: "succeeded",
      progress: 1,
      detail: "Ready",
      error: null,
      candidate_available: true,
      request: {
        capability: "sfx", resolved_prompt: "Old ceramic tea cup", source_free_text: "Old ceramic tea cup",
        authored_prompt: null, semantic_state: null, prompt_mode: "simple", seconds: 3, seed: 41,
      },
      candidate: {
        candidate_id: "old-candidate", candidate_url: "/old.wav", capability: "sfx",
        prompt: "Old ceramic tea cup", prompt_mode: "simple", seconds: 3, seed: 41,
        duration_ms: 3_000, audio_format: "wav", size_bytes: 400,
      },
      kept_file: null,
    }])
    const taxonomy = vi.spyOn(originsApi, "soundPresetTaxonomy").mockResolvedValue({ version: "audio-taxonomy-v1", items: [] })
    const compile = vi.spyOn(originsApi, "compileSoundPreset").mockResolvedValue({
      capability: "sfx", semantic_state: {}, source_free_text: "", compiled_prompt: "",
      conflicts: [], model: "stable-audio-3-small-sfx", semantic_schema_version: "sfx-semantic-v2",
      compiler_version: "sfx-compiler-v2", taxonomy_version: "audio-taxonomy-v1",
    })

    const { container } = render(<AudioLibrary files={files} mode="sound" projectId={81} playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} onKeepGenerated={vi.fn()} />)
    const view = within(container)
    fireEvent.click(view.getByRole("tab", { name: "Generate" }))
    await waitFor(() => expect(recent).toHaveBeenCalled())

    expect(view.getByRole("heading", { name: "What do you want to create?" })).toBeTruthy()
    expect(view.getByRole("button", { name: "Previous generations" }).textContent).toContain("1")
    expect(view.queryByRole("button", { name: /Generate \d variation/ })).toBeNull()
    expect(view.queryByText("Name and keep the audio")).toBeNull()
    expect(view.queryByRole("button", { name: "Keep in Library" })).toBeNull()

    fireEvent.click(view.getByRole("button", { name: "Continue" }))
    expect(view.getByRole("heading", { name: "What should we hear?" })).toBeTruthy()
    expect(view.getByRole("button", { name: "Generate 1 variation" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(view.getByRole("button", { name: "Change setup" }))

    fireEvent.click(view.getByRole("button", { name: "Previous generations" }))
    fireEvent.click(screen.getByRole("option", { name: /Old ceramic tea cup/ }))
    expect(view.getByText("Previous generation")).toBeTruthy()
    expect(view.queryByText("Chosen variation A")).toBeNull()

    status.mockRestore(); recent.mockRestore(); taxonomy.mockRestore(); compile.mockRestore()
  })

  it("keeps type and mode together, then presents Expert as focused funnel screens", async () => {
    vi.spyOn(originsApi, "audioGenerationStatus").mockResolvedValue({
      configured: true, sfx_ready: true, music_ready: true, reason: "", models: {
        sfx: { id: "stable-audio-3-small-sfx" },
        music: { id: "stable-audio-3-small-music" },
      },
    })
    vi.spyOn(originsApi, "recentAudioGenerations").mockResolvedValue([])
    vi.spyOn(originsApi, "soundPresetTaxonomy").mockResolvedValue({ version: "audio-taxonomy-v1", items: [] })
    vi.spyOn(originsApi, "compileSoundPreset").mockResolvedValue({
      capability: "sfx", semantic_state: {}, source_free_text: "", compiled_prompt: "",
      conflicts: [], model: "stable-audio-3-small-sfx", semantic_schema_version: "sfx-semantic-v2",
      compiler_version: "sfx-compiler-v2", taxonomy_version: "audio-taxonomy-v1",
    })

    const { container } = render(<AudioLibrary files={files} mode="sound" projectId={81} playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} onKeepGenerated={vi.fn()} />)
    const view = within(container)
    fireEvent.click(view.getByRole("tab", { name: "Generate" }))
    expect(view.getByRole("button", { name: "Sound Effect" })).toBeTruthy()
    expect(view.getByRole("button", { name: "Music" })).toBeTruthy()
    expect(view.getByRole("button", { name: "Simple" })).toBeTruthy()
    fireEvent.click(view.getByRole("button", { name: "Expert" }))
    fireEvent.click(view.getByRole("button", { name: "Continue" }))

    const steps = view.getByRole("navigation", { name: "Sound Effect preset steps" })
    expect(view.getByRole("heading", { name: "Sound" })).toBeTruthy()
    expect(within(steps).getAllByRole("button")).toHaveLength(7)
    expect(view.queryByRole("button", { name: "Generate 1 variation" })).toBeNull()
    fireEvent.click(view.getByRole("button", { name: "Continue" }))
    expect(view.getByRole("heading", { name: "Action" })).toBeTruthy()
    fireEvent.click(within(steps).getByText("Review").closest("button")!)
    expect(view.getByRole("heading", { name: "Review" })).toBeTruthy()
    expect(view.getByRole("button", { name: "Generate 1 variation" }).hasAttribute("disabled")).toBe(true)
  })

  it("moves one generation through compare and deliberate finalization", async () => {
    vi.spyOn(originsApi, "audioGenerationStatus").mockResolvedValue({
      configured: true, sfx_ready: true, music_ready: true, reason: "", models: {
        sfx: { id: "stable-audio-3-small-sfx" },
        music: { id: "stable-audio-3-small-music" },
      },
    })
    vi.spyOn(originsApi, "soundPresetTaxonomy").mockResolvedValue({ version: "audio-taxonomy-v1", items: [] })
    vi.spyOn(originsApi, "compileSoundPreset").mockResolvedValue({
      capability: "sfx", semantic_state: {}, source_free_text: "",
      compiled_prompt: "A close wooden knock.", conflicts: [],
      model: "stable-audio-3-small-sfx", semantic_schema_version: "sfx-semantic-v2",
      compiler_version: "sfx-compiler-v2", taxonomy_version: "audio-taxonomy-v1",
    })
    vi.spyOn(originsApi, "normalizeSoundPreset").mockImplementation(async (payload) => ({
      capability: "sfx", semantic_state: payload.semantic_state, source_free_text: payload.source_free_text,
      compiled_prompt: "A close wooden knock.", conflicts: [], model: "stable-audio-3-small-sfx",
      semantic_schema_version: "sfx-semantic-v2", compiler_version: "sfx-compiler-v2",
      taxonomy_version: "audio-taxonomy-v1", normalization_model: "qwen3.7-plus",
      normalization_cost: 0.00001, usage: {},
    }))
    const readyItem = {
      job_id: "new-job", status: "succeeded", progress: 1, detail: "Ready", error: null,
      candidate_available: true,
      request: {
        capability: "sfx", resolved_prompt: "A close wooden knock", source_free_text: "A close wooden knock",
        authored_prompt: null, semantic_state: null, prompt_mode: "simple", seconds: 2, seed: 73,
      },
      candidate: {
        candidate_id: "new-candidate", candidate_url: "/new.wav", capability: "sfx",
        prompt: "A close wooden knock", prompt_mode: "simple", seconds: 2, seed: 73,
        duration_ms: 2_000, audio_format: "wav", size_bytes: 400,
      },
      kept_file: null,
    }
    let recentItems: typeof readyItem[] = []
    vi.spyOn(originsApi, "recentAudioGenerations").mockImplementation(async () => recentItems)
    vi.spyOn(originsApi, "enqueueAudioGeneration").mockImplementation(async () => {
      recentItems = [readyItem]
      return {
        id: "new-job", type: "audio_generate", status: "queued", progress: 0, detail: "Queued", retries: 0,
        result: { ...readyItem.candidate, candidate_url: "", duration_ms: 0, size_bytes: 0 },
      }
    })

    const { container } = render(<AudioLibrary files={files} mode="sound" projectId={81} playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} onKeepGenerated={vi.fn()} />)
    const view = within(container)
    fireEvent.click(view.getByRole("tab", { name: "Generate" }))
    fireEvent.click(view.getByRole("button", { name: "Continue" }))
    await waitFor(() => expect(view.getByRole("combobox", { name: "Sound Effect engine and model" }).textContent).toContain("Stability AI"))
    fireEvent.change(view.getByPlaceholderText(/heavy wooden church door/i), { target: { value: "A close wooden knock" } })
    await waitFor(() => expect(view.getByRole("button", { name: "Generate 1 variation" }).hasAttribute("disabled")).toBe(false))
    fireEvent.click(view.getByRole("button", { name: "Generate 1 variation" }))

    await waitFor(() => expect(view.getByRole("heading", { name: "Compare the variations" })).toBeTruthy())
    expect(view.queryByRole("button", { name: "Keep in Library" })).toBeNull()
    fireEvent.click(view.getByRole("button", { name: "Choose variation A" }))
    expect(view.getByRole("heading", { name: "Name and keep the audio" })).toBeTruthy()
    expect(view.getByRole("button", { name: "Save to Library" })).toBeTruthy()
  })

  it("keeps audition separate from explicit insertion", async () => {
    const onPlay = vi.fn()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<AudioLibrary files={files} mode="sequence" playerPlaying={false} onChoose={onChoose} onPlay={onPlay} onUpload={vi.fn()} onKeep={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Audition Harbor Intro" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ key: "file-source:11" }))
    expect(onChoose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Select Harbor Intro" }))
    expect(screen.getAllByText("Harbor Intro").length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole("button", { name: "Insert" }))
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(files[0]))
  })

  it("preselects the linked source when replacing an File Part", () => {
    render(<AudioLibrary files={files} mode="sequence" chooseLabel="Replace linked file" initialSelectedId={11} playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Replace linked file" }).hasAttribute("disabled")).toBe(false)
  })

  it("sends canonical File classification", async () => {
    const onUpload = vi.fn().mockResolvedValue({ id: 44, name: "Rain at dusk" })
    const { container } = render(<AudioLibrary files={files} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={onUpload} onKeep={vi.fn()} />)
    fireEvent.click(within(container).getByRole("tab", { name: "Upload" }))
    const file = new File(["rain"], "rain_at_dusk.wav", { type: "audio/wav" })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(screen.getByDisplayValue("Rain at dusk")).toBeTruthy()
    fireEvent.click(screen.getByRole("combobox", { name: "Category" }))
    fireEvent.click(screen.getByRole("option", { name: "Ambience" }))
    const tags = screen.getByPlaceholderText(/calm, night/)
    fireEvent.change(tags, { target: { value: "rain" } })
    fireEvent.keyDown(tags, { key: "Enter" })
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }))
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith("Files", {
      file, name: "Rain at dusk", category: "ambience",
      tags: ["rain"],
    }))
  })

  it("prepares a dropped file without saving it immediately", () => {
    const onUpload = vi.fn()
    const { container } = render(<AudioLibrary files={files} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={onUpload} onKeep={vi.fn()} />)
    const file = new File(["room tone"], "quiet-night_room.flac", { type: "audio/flac" })

    fireEvent.drop(container.querySelector(".file-tool")!, {
      dataTransfer: { files: [file], types: ["Files"] },
    })

    expect(screen.getByDisplayValue("Quiet night room")).toBeTruthy()
    expect(screen.getAllByText("quiet-night_room.flac").length).toBe(2)
    expect(onUpload).not.toHaveBeenCalled()
  })

  it("discards the prepared local form when the operator cancels", () => {
    const { container } = render(<AudioLibrary files={files} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    fireEvent.click(within(container).getByRole("tab", { name: "Upload" }))
    const file = new File(["room tone"], "quiet-night_room.flac", { type: "audio/flac" })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    const view = within(container)
    fireEvent.change(view.getByPlaceholderText("Human-readable audio name"), { target: { value: "Edited room tone" } })
    fireEvent.click(view.getByRole("button", { name: "Cancel" }))
    fireEvent.click(view.getByRole("tab", { name: "Upload" }))

    expect(view.getByRole("button", { name: "Choose file" })).toBeTruthy()
    expect(view.queryByDisplayValue("Edited room tone")).toBeNull()
    expect(view.getByRole("button", { name: "Add to Library" }).hasAttribute("disabled")).toBe(true)
  })

  it("searches canonical names and tags", () => {
    const library = [
      { id: 21, name: "Night room", category: "ambience", tags: ["quiet"] },
      { id: 22, name: "Wooden knock", category: "sfx", tags: ["door"] },
    ]
    const { container } = render(<AudioLibrary files={library} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    const view = within(container)
    fireEvent.change(view.getByPlaceholderText("Search your audio"), { target: { value: "door" } })
    expect(view.getByRole("button", { name: "Select Wooden knock" })).toBeTruthy()
    expect(view.queryByRole("button", { name: "Select Night room" })).toBeNull()
  })

  it("can focus the audio Library on Files already used in this Project", () => {
    const library = [
      { id: 21, name: "Night room" },
      { id: 22, name: "Wooden knock" },
    ]
    const { container } = render(<AudioLibrary files={library} usedFileIds={[22]} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    const view = within(container)
    expect(view.getByLabelText("Used in Timeline")).toBeTruthy()
    expect(view.getAllByRole("button", { name: "Add to Timeline" })).toHaveLength(2)
    fireEvent.click(view.getByRole("button", { name: "Filters" }))
    fireEvent.click(screen.getByRole("combobox", { name: "File usage in this Project" }))
    fireEvent.click(screen.getByRole("option", { name: "Used in this Project" }))

    expect(view.getByRole("button", { name: "Select Wooden knock" })).toBeTruthy()
    expect(view.queryByRole("button", { name: "Select Night room" })).toBeNull()
  })

  it("keeps visual Files out of the audio-only Library surface", () => {
    const library = [
      { id: 21, name: "Night room", media_type: "audio" as const, filename: "night.wav" },
      { id: 22, name: "Harbor still", media_type: "image" as const, filename: "harbor.png" },
      { id: 23, name: "Slow harbor pan", media_type: "video" as const, filename: "harbor.mp4" },
    ]
    render(<AudioLibrary files={library} initialSelectedId={22} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Select Night room" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Select Harbor still" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Select Slow harbor pan" })).toBeNull()
    expect(screen.getByRole("button", { name: "Select Night room" }).getAttribute("aria-pressed")).toBe("false")
  })

  it("combines duration, actual tags and Project usage filters with a clear count", () => {
    const library = [
      { id: 21, name: "Short rain", duration_ms: 2_000, tags: ["rain", "soft"] },
      { id: 22, name: "Room rain", duration_ms: 8_000, tags: ["rain"] },
      { id: 23, name: "Long wind", duration_ms: 140_000, tags: ["wind"] },
    ]
    render(<AudioLibrary files={library} usedFileIds={[22]} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    fireEvent.click(screen.getByRole("combobox", { name: "File duration" }))
    fireEvent.click(screen.getByRole("option", { name: "3–10 seconds" }))
    fireEvent.click(screen.getByRole("combobox", { name: "File usage in this Project" }))
    fireEvent.click(screen.getByRole("option", { name: "Used in this Project" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "rain" }))

    expect(screen.getByRole("button", { name: "Select Room rain" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Select Short rain" })).toBeNull()
    expect(screen.getByRole("button", { name: "Filters, 3 active" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(screen.getByRole("button", { name: "Select Short rain" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Select Long wind" })).toBeTruthy()
  })

  it("opens Freesound with a creator-first welcome before any remote search", async () => {
    const search = vi.spyOn(originsApi, "searchFreesound").mockResolvedValue([])
    render(<AudioLibrary files={[]} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)

    fireEvent.click(screen.getByRole("tab", { name: "Freesound" }))
    expect(screen.getByRole("heading", { name: "What do you want to find?" })).toBeTruthy()
    expect(screen.getByText(/temporary candidates until you keep one/i)).toBeTruthy()
    expect(search).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "wooden door" }))
    await waitFor(() => expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "wooden door" }), expect.any(AbortSignal),
    ))
  })

  it("acknowledges a Freesound query before the debounced request begins", async () => {
    let finishSearch!: (results: never[]) => void
    const search = vi.spyOn(originsApi, "searchFreesound").mockImplementation(
      () => new Promise((resolve) => { finishSearch = resolve }),
    )
    render(<AudioLibrary files={[]} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)

    fireEvent.click(screen.getByRole("tab", { name: "Freesound" }))
    fireEvent.change(screen.getByPlaceholderText("Describe the sound you need"), { target: { value: "wooden door" } })

    expect(screen.getByText("Searching Freesound…")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "What do you want to find?" })).toBeNull()
    expect(search).not.toHaveBeenCalled()
    await waitFor(() => expect(search).toHaveBeenCalled())
    finishSearch([])
    await waitFor(() => expect(screen.getByText("No matching sounds")).toBeTruthy())
  })

  it("edits human File classification without touching its source identity", async () => {
    const file = { id: 41, name: "Raw sound", media_type: "audio" as const, category: null, tags: [], metadata: { origin: "freesound", source_tags: ["door", "wood"] }, filename: "raw.wav" }
    const onUpdate = vi.fn().mockResolvedValue({ ...file, name: "Door close", category: "sfx" })
    render(<AudioLibrary files={[file]} initialSelectedId={41} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onUpdate={onUpdate} onKeep={vi.fn()} />)

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Door close" } })
    fireEvent.click(screen.getByRole("combobox", { name: "Category" }))
    fireEvent.click(screen.getByRole("option", { name: "SFX" }))
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(file, {
      name: "Door close", category: "sfx", tags: [],
    }))
    expect(screen.getByText("Source tags")).toBeTruthy()
  })

  it("auditions an external result without keeping it, then Keeps explicitly", async () => {
    const result = {
      external_id: "931", name: "Wooden door close.wav",
      duration_ms: 2400, creator: "fieldrecorder",
      license: "cc-by-nc" as const,
      license_url: "https://creativecommons.org/licenses/by-nc/4.0/",
      source_url: "https://freesound.org/s/931/",
      preview_url: "https://cdn.freesound.org/preview.mp3",
      original_format: "wav", tags: ["door", "wood"],
      attribution_required: true,
      attribution_text: "Wooden door close by fieldrecorder",
    }
    const search = vi.spyOn(originsApi, "searchFreesound").mockResolvedValue([result])
    const onPlay = vi.fn()
    const onKeep = vi.fn().mockResolvedValue({ file: { id: 77 }, duplicate: false })
    const { container } = render(<AudioLibrary files={files} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={onPlay} onUpload={vi.fn()} onKeep={onKeep} />)
    const view = within(container)
    fireEvent.click(view.getByRole("tab", { name: "Freesound" }))
    fireEvent.change(view.getByPlaceholderText("Describe the sound you need"), { target: { value: "wooden door closing" } })
    await waitFor(() => expect(view.getByText("Wooden door close.wav")).toBeTruthy())
    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      query: "wooden door closing", license: "all",
    }), expect.any(AbortSignal))
    fireEvent.click(view.getByRole("button", { name: "Audition Wooden door close.wav" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({
      key: "freesound-preview:931",
      url: "https://cdn.freesound.org/preview.mp3",
    }))
    expect(view.getByText(/CC BY-NC/)).toBeTruthy()
    expect(onKeep).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole("button", { name: "Keep as File" }))
    await waitFor(() => expect(onKeep).toHaveBeenCalledWith("Files", {
      result, name: result.name, category: null,
      tags: [],
    }))
    expect(view.getByRole("button", { name: "Saved File" })).toBeTruthy()
    search.mockRestore()
  })

  it("keeps Freesound taxonomy separate from the user's optional category", async () => {
    const result = {
      external_id: "ocean-1", name: "Calm ocean waves",
      duration_ms: 12_000, creator: "coastrecorder",
      license: "cc0" as const,
      license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
      source_url: "https://freesound.org/s/ocean-1/",
      preview_url: "https://cdn.freesound.org/ocean.mp3",
      original_format: "wav", tags: ["ocean", "waves", "calm"],
      attribution_required: false,
      attribution_text: "",
    }
    vi.spyOn(originsApi, "searchFreesound").mockResolvedValue([result])
    const onKeep = vi.fn().mockResolvedValue({ file: { id: 88 }, duplicate: false })
    const { container } = render(<AudioLibrary files={files} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={onKeep} />)
    const view = within(container)
    fireEvent.click(view.getByRole("tab", { name: "Freesound" }))
    fireEvent.change(view.getByPlaceholderText("Describe the sound you need"), { target: { value: "calm ocean waves" } })
    await waitFor(() => expect(view.getByRole("button", { name: "Select Calm ocean waves" })).toBeTruthy())
    expect(view.queryByLabelText("Suggested Ambience family")).toBeNull()
    fireEvent.click(view.getByRole("button", { name: "Keep as File" }))
    await waitFor(() => expect(onKeep).toHaveBeenCalledWith("Files", {
      result, name: result.name, category: null,
      tags: [],
    }))
  })
})
