// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

import { AssetTool } from "./asset-tool"
import { studioApi } from "@/lib/api"

const assets = [{ id: 11, title: "Harbor Intro", folder: "Intros", filename: "harbor.wav", duration_ms: 8_400 }]
Element.prototype.scrollIntoView = vi.fn()
afterEach(() => cleanup())

describe("AssetTool", () => {
  it("keeps source navigation on top and names every Library filter explicitly", () => {
    const { container } = render(<AssetTool assets={assets} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    const view = within(container)
    expect(view.getByRole("tablist", { name: "Audio Library views" })).toBeTruthy()
    expect(view.getByRole("tab", { name: "Library" }).getAttribute("aria-selected")).toBe("true")
    fireEvent.click(view.getByRole("button", { name: "Filters" }))
    expect(screen.getByRole("combobox", { name: "Asset category" }).textContent).toContain("All categories")
    expect(screen.getByRole("combobox", { name: "Asset library" }).textContent).toContain("All libraries")
    expect(screen.getByRole("combobox", { name: "Asset source" }).textContent).toContain("All sources")
    expect(container.querySelector(".asset-source-rail")).toBeNull()
  })

  it("submits one explicit generated-audio Job without creating an Asset", async () => {
    const status = vi.spyOn(studioApi, "audioGenerationStatus").mockResolvedValue({
      configured: true, sfx_ready: true, music_ready: true, reason: "", models: {},
    })
    const recent = vi.spyOn(studioApi, "recentAudioGenerations").mockResolvedValue([])
    const taxonomy = vi.spyOn(studioApi, "soundRecipeTaxonomy").mockResolvedValue({
      version: "audio-taxonomy-v1", items: [],
    })
    const compile = vi.spyOn(studioApi, "compileSoundRecipe").mockResolvedValue({
      capability: "sfx", semantic_state: {}, source_free_text: "",
      compiled_prompt: "A dry match strikes once.", conflicts: [],
      model: "stable-audio-3-small-sfx", semantic_schema_version: "sfx-semantic-v2",
      compiler_version: "sfx-compiler-v2", taxonomy_version: "audio-taxonomy-v1",
    })
    const normalize = vi.spyOn(studioApi, "normalizeSoundRecipe").mockImplementation(async (payload) => ({
      capability: "sfx",
      semantic_state: payload.semantic_state,
      source_free_text: payload.source_free_text,
      compiled_prompt: "A dry match strikes once.", conflicts: [],
      model: "stable-audio-3-small-sfx", semantic_schema_version: "sfx-semantic-v2",
      compiler_version: "sfx-compiler-v2", taxonomy_version: "audio-taxonomy-v1",
      normalization_model: "qwen3.7-plus", normalization_cost: 0.00001, usage: {},
    }))
    const enqueue = vi.spyOn(studioApi, "enqueueAudioGeneration").mockResolvedValue({
      id: "generation-job", type: "audio_generate", status: "queued",
      progress: 0, detail: "Queued", retries: 0, result: {
        candidate_id: "generation-job", candidate_url: "",
        capability: "sfx", prompt: "", prompt_mode: "simple", seconds: 5, seed: 0,
        duration_ms: 0, audio_format: "wav", size_bytes: 0,
      },
    })
    const onKeepGenerated = vi.fn()
    const { container } = render(<AssetTool assets={assets} mode="sound" productionId={81} playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} onKeepGenerated={onKeepGenerated} />)
    const view = within(container)
    fireEvent.click(view.getByRole("tab", { name: "Generate" }))
    await waitFor(() => expect(status).toHaveBeenCalled())
    expect(view.getByRole("tab", { name: "Sound Effect" }).getAttribute("aria-selected")).toBe("true")
    fireEvent.change(view.getByPlaceholderText(/heavy wooden church door/i), { target: { value: "A dry match strikes once in a quiet room" } })
    fireEvent.click(view.getByRole("radio", { name: "1" }))
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
      generation_brief: null, seconds: 5, seed: null, production_id: 81,
    })))
    expect(onKeepGenerated).not.toHaveBeenCalled()
    status.mockRestore(); recent.mockRestore(); taxonomy.mockRestore(); compile.mockRestore(); normalize.mockRestore(); enqueue.mockRestore()
  })

  it("keeps audition separate from explicit insertion", async () => {
    const onPlay = vi.fn()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<AssetTool assets={assets} mode="sequence" playerPlaying={false} onChoose={onChoose} onPlay={onPlay} onUpload={vi.fn()} onKeep={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Audition Harbor Intro" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ key: "asset-source:11" }))
    expect(onChoose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Select Harbor Intro" }))
    expect(screen.getAllByText("Harbor Intro").length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole("button", { name: "Insert in Sequence" }))
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(assets[0]))
  })

  it("preselects the linked source when replacing an Asset Part", () => {
    render(<AssetTool assets={assets} mode="sequence" chooseLabel="Replace linked asset" initialSelectedId={11} playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Replace linked asset" }).hasAttribute("disabled")).toBe(false)
  })

  it("sends canonical classification separately from the legacy collection", async () => {
    const onUpload = vi.fn().mockResolvedValue({ id: 44, name: "Rain at dusk" })
    const { container } = render(<AssetTool assets={assets} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={onUpload} onKeep={vi.fn()} />)
    fireEvent.click(within(container).getByRole("tab", { name: "Upload" }))
    const file = new File(["rain"], "rain_at_dusk.wav", { type: "audio/wav" })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(screen.getByDisplayValue("Rain at dusk")).toBeTruthy()
    fireEvent.click(screen.getByRole("combobox", { name: "Category" }))
    fireEvent.click(screen.getByRole("option", { name: "Ambience" }))
    fireEvent.click(screen.getByRole("combobox", { name: "Available in" }))
    fireEvent.click(screen.getByRole("option", { name: "Studio Library" }))
    const tags = screen.getByPlaceholderText(/calm, night/)
    fireEvent.change(tags, { target: { value: "rain" } })
    fireEvent.keyDown(tags, { key: "Enter" })
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }))
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith("Stingers", {
      file, name: "Rain at dusk", category: "ambience", scope: "studio",
      tags: ["rain"],
    }))
  })

  it("prepares a dropped file without saving it immediately", () => {
    const onUpload = vi.fn()
    const { container } = render(<AssetTool assets={assets} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={onUpload} onKeep={vi.fn()} />)
    const file = new File(["room tone"], "quiet-night_room.flac", { type: "audio/flac" })

    fireEvent.drop(container.querySelector(".asset-tool")!, {
      dataTransfer: { files: [file], types: ["Files"] },
    })

    expect(screen.getByDisplayValue("Quiet night room")).toBeTruthy()
    expect(screen.getAllByText("quiet-night_room.flac").length).toBe(2)
    expect(onUpload).not.toHaveBeenCalled()
  })

  it("discards the prepared local form when the operator cancels", () => {
    const { container } = render(<AssetTool assets={assets} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
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

  it("searches canonical names and tags and filters reusable scope", () => {
    const library = [
      { id: 21, name: "Night room", category: "ambience", scope: "venture" as const, tags: ["quiet"] },
      { id: 22, name: "Wooden knock", category: "sfx", scope: "studio" as const, tags: ["door"] },
    ]
    const { container } = render(<AssetTool assets={library} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    const view = within(container)
    fireEvent.change(view.getByPlaceholderText("Search your audio"), { target: { value: "door" } })
    expect(view.getByRole("button", { name: "Select Wooden knock" })).toBeTruthy()
    expect(view.queryByRole("button", { name: "Select Night room" })).toBeNull()
    fireEvent.change(view.getByPlaceholderText("Search your audio"), { target: { value: "" } })
    fireEvent.click(view.getByRole("button", { name: "Filters" }))
    fireEvent.click(screen.getByRole("combobox", { name: "Asset library" }))
    fireEvent.click(screen.getByRole("option", { name: "Studio Library" }))
    expect(view.getByRole("button", { name: "Select Wooden knock" })).toBeTruthy()
    expect(view.queryByRole("button", { name: "Select Night room" })).toBeNull()
  })

  it("combines duration, actual tags and Production usage filters with a clear count", () => {
    const library = [
      { id: 21, name: "Short rain", duration_ms: 2_000, tags: ["rain", "soft"] },
      { id: 22, name: "Room rain", duration_ms: 8_000, tags: ["rain"] },
      { id: 23, name: "Long wind", duration_ms: 140_000, tags: ["wind"] },
    ]
    render(<AssetTool assets={library} usedAssetIds={[22]} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} onKeep={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    fireEvent.click(screen.getByRole("combobox", { name: "Asset duration" }))
    fireEvent.click(screen.getByRole("option", { name: "3–10 seconds" }))
    fireEvent.click(screen.getByRole("combobox", { name: "Asset usage in this Production" }))
    fireEvent.click(screen.getByRole("option", { name: "Used in this Production" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "rain" }))

    expect(screen.getByRole("button", { name: "Select Room rain" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Select Short rain" })).toBeNull()
    expect(screen.getByRole("button", { name: "Filters, 3 active" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(screen.getByRole("button", { name: "Select Short rain" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Select Long wind" })).toBeTruthy()
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
    const search = vi.spyOn(studioApi, "searchFreesound").mockResolvedValue([result])
    const onPlay = vi.fn()
    const onKeep = vi.fn().mockResolvedValue({ asset: { id: 77 }, duplicate: false })
    const { container } = render(<AssetTool assets={assets} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={onPlay} onUpload={vi.fn()} onKeep={onKeep} />)
    const view = within(container)
    fireEvent.click(view.getByRole("tab", { name: "Freesound" }))
    fireEvent.change(view.getByPlaceholderText("Describe the sound you need"), { target: { value: "wooden door closing" } })
    await waitFor(() => expect(view.getByText("Wooden door close.wav")).toBeTruthy())
    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      query: "wooden door closing", license: "all",
    }), expect.any(AbortSignal))
    expect(view.getByText(/CC BY-NC/)).toBeTruthy()

    fireEvent.click(view.getByRole("button", { name: "Audition Wooden door close.wav" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({
      key: "freesound-preview:931",
      url: "https://cdn.freesound.org/preview.mp3",
    }))
    expect(onKeep).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole("button", { name: "Select Wooden door close.wav" }))
    fireEvent.click(view.getByRole("button", { name: "Keep in Library" }))
    await waitFor(() => expect(onKeep).toHaveBeenCalledWith("Stingers", {
      result, name: result.name, category: "sfx", scope: "studio",
      tags: ["door", "wood"],
    }))
    expect(view.getByRole("button", { name: /In Library/ })).toBeTruthy()
    search.mockRestore()
  })
})
