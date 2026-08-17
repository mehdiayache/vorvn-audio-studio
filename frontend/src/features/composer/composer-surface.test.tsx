// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ProductionPart, StudioConfig, VoiceDirectory } from "@/types/domain"
import { ComposerSurface } from "@/features/composer/composer-surface"
import { studioApi } from "@/lib/api"

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const directory = {
  config: null, cloned: [], meta: {}, catalog: [], identities: [], usage: {},
  registry: {
    bindings: [
      { binding_id: "binding-sarah", identity_id: "identity-sarah", provider_voice_id: "sarah-provider", name: "Sarah", description: "", languages: ["English"], source: "custom", provider: "alibaba", region: "intl", adapter_key: "audio", engine: "audio", tier: "flash", model_id: "qwen-audio-flash", status: "ready", capabilities: [{ id: "expressive_tags", name: "Expressive + tags", description: "Expressive speech", controls: { delivery_tags: true, natural_direction: true, rate: true, pitch: true, volume: true }, ui_metadata: { direction_label: "Voice direction" } }] },
      { binding_id: "binding-eva-cosy", identity_id: "identity-eva", provider_voice_id: "eva-cosy-provider", name: "Eva", description: "", languages: ["English"], source: "custom", provider: "alibaba", region: "intl", adapter_key: "cosyvoice", engine: "cosyvoice", tier: "plus", model_id: "cosyvoice-v3-plus", status: "ready", capabilities: [{ id: "controlled_exact", name: "Controlled exact reading", description: "Exact speech with SSML", controls: { delivery_tags: false, natural_direction: false, direction_modes: ["exact"], rate: true, pitch: true, volume: true, seed: true, ssml: true, word_timestamps: true }, ui_metadata: { output_note: "Supports SSML and captured word timing." } }] },
      { binding_id: "binding-maya", identity_id: "identity-maya", provider_voice_id: "maya-provider", name: "Maya", description: "", languages: ["English"], source: "custom", provider: "alibaba", region: "intl", adapter_key: "audio", engine: "audio", tier: "flash", model_id: "qwen-audio-flash", status: "ready", capabilities: [{ id: "expressive_tags", name: "Expressive + tags", description: "Expressive speech", controls: { delivery_tags: true, natural_direction: true, rate: true, pitch: true, volume: true }, ui_metadata: { direction_label: "Voice direction" } }] },
    ],
    models: [], presets: [], source: { provider: "Alibaba", verified_at: "", audio_url: "" },
  },
} as unknown as VoiceDirectory

const config = {
  has_key: true,
  formats: ["mp3"],
  languages: ["Auto", "English"],
  capabilities: {
    audio: { estimate_rates_per_million_chars: { flash: 1 }, inline_tags: true, purpose: "Speech", models: { flash: "qwen-audio-flash" } },
  },
  tags: {}, retired_tags: {}, prefs: {}, text_preparation: {},
} as unknown as StudioConfig

const common = {
  config,
  directory,
  playerPlaying: false,
  onGenerate: vi.fn(),
  onPlay: vi.fn(),
}

describe("shared Composer contract", () => {
  it("keeps recording context attached above a dominant script workspace", async () => {
    render(<ComposerSurface {...common} presentation="dialog" productionId={3} />)
    expect(await screen.findByRole("region", { name: "Voice and recording context" })).toBeTruthy()
    expect(screen.getByRole("main", { name: "Script canvas" })).toBeTruthy()
    expect(screen.getByRole("complementary", { name: "Sound and output" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Focus editor" })).toBeTruthy()
    expect(screen.queryByText("Recording setup")).toBeNull()
  })

  it("keeps the full Composer contract available in compact inline presentation with a 20k script", async () => {
    const script = "A deliberate long-form narration sentence with performance detail. ".repeat(350).slice(0, 20_000)
    const part = { id: 6, kind: "draft", text: script, text_raw: script, revision: 1, cost: 0, created_at: "", position: 4, voice_identity_id: "identity-sarah", binding_id: "binding-sarah" } as ProductionPart
    render(<ComposerSurface {...common} presentation="inline" productionId={3} part={part} />)
    const editor = await screen.findByRole("textbox", { name: "Original script" }) as HTMLTextAreaElement
    expect(editor.value).toHaveLength(20_000)
    expect(screen.getAllByText("Performance").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Output").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Generate Part/ }).closest("footer")?.classList.contains("composer-footer")).toBe(true)
  })

  it("does not silently select the first identity or exact route in fresh Speak", async () => {
    render(<ComposerSurface {...common} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose a voice" })).toBeTruthy())
    expect(screen.getByText("Recording method")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Recording method" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Create recording" }).hasAttribute("disabled")).toBe(true)
  })

  it("restores the exact persisted Part route for editing", async () => {
    const part = { id: 7, kind: "speech", text: "Hello", cost: 0, created_at: "", position: 0, voice_identity_id: "identity-sarah", binding_id: "binding-sarah" } as ProductionPart
    render(<ComposerSurface {...common} productionId={3} part={part} />)
    await waitFor(() => expect(screen.getAllByText("Sarah").length).toBeGreaterThan(0))
    expect(screen.getAllByText("Expressive + tags").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Generate Part/ }).hasAttribute("disabled")).toBe(false)
    expect(screen.getByRole("button", { name: "Choose Spoken preparation method" })).toBeTruthy()
  })

  it("labels an existing recording as one safe replacement action", async () => {
    const part = { id: 7, kind: "speech", text: "Hello", text_raw: "Hello", clip_id: 44, cost: 0, created_at: "", position: 0, voice_identity_id: "identity-sarah", binding_id: "binding-sarah" } as ProductionPart
    render(<ComposerSurface {...common} productionId={3} part={part} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate again" }).hasAttribute("disabled")).toBe(false))
  })

  it("converts plain recording input into a valid SSML document before generation", async () => {
    const onGenerate = vi.fn().mockResolvedValue({ id: "job-ssml" })
    const onUpdateEditorial = vi.fn().mockResolvedValue(undefined)
    const part = {
      id: 74,
      kind: "draft",
      text: "Stay <still> & breathe.",
      text_raw: "Stay <still> & breathe.",
      revision: 1,
      cost: 0,
      created_at: "",
      position: 0,
      voice_identity_id: "identity-eva",
      binding_id: "binding-eva-cosy",
      capability_id: "controlled_exact",
    } as ProductionPart
    render(<ComposerSurface {...common} productionId={3} part={part} onGenerate={onGenerate} onUpdateEditorial={onUpdateEditorial} />)

    fireEvent.click(await screen.findByRole("button", { name: "Convert to SSML" }))
    expect((screen.getByRole("textbox", { name: "Original SSML document" }) as HTMLTextAreaElement).value)
      .toBe("<speak>\nStay &lt;still&gt; &amp; breathe.\n</speak>")
    expect(screen.getByText("Valid SSML document")).toBeTruthy()
    expect(screen.queryByText("SSML script")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /Generate Part/ }))
    fireEvent.click(screen.getByRole("button", { name: "Update Part and generate" }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
      text: "<speak>\nStay &lt;still&gt; &amp; breathe.\n</speak>",
      enable_ssml: true,
      binding_id: "binding-eva-cosy",
      capability_id: "controlled_exact",
    })))
  })

  it("blocks malformed SSML before a Job or provider call can be created", async () => {
    const onGenerate = vi.fn().mockResolvedValue({ id: "must-not-run" })
    const part = {
      id: 75,
      kind: "draft",
      text: "<speak>Broken",
      text_raw: "<speak>Broken",
      enable_ssml: true,
      revision: 1,
      cost: 0,
      created_at: "",
      position: 0,
      voice_identity_id: "identity-eva",
      binding_id: "binding-eva-cosy",
      capability_id: "controlled_exact",
    } as ProductionPart
    render(<ComposerSurface {...common} productionId={3} part={part} onGenerate={onGenerate} />)

    expect(await screen.findByText(/Invalid SSML:/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /Generate Part/ }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: /Generate Part/ }))
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it("shows and edits the authored story role as Part metadata", async () => {
    const onUpdateEditorial = vi.fn().mockResolvedValue(undefined)
    const part = { id: 7, kind: "speech", text: "Hello", text_raw: "Hello", authored_role: "narrator", revision: 3, cost: 0, created_at: "", position: 0, voice_identity_id: "identity-sarah", binding_id: "binding-sarah" } as ProductionPart
    render(<ComposerSurface {...common} presentation="dialog" productionId={3} part={part} onUpdateEditorial={onUpdateEditorial} />)
    expect(await screen.findByText("Edit Narrator · Part 01")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Narrator" }))
    fireEvent.change(screen.getByLabelText("Story role"), { target: { value: "Esther" } })
    fireEvent.click(screen.getByRole("button", { name: "Save role" }))
    await waitFor(() => expect(onUpdateEditorial).toHaveBeenCalledWith({ expected_revision: 3, authored_role: "Esther" }))
  })

  it("carries a new story role into the first Production recording", async () => {
    vi.spyOn(studioApi, "composerDraft").mockResolvedValue(null)
    vi.spyOn(studioApi, "saveComposerDraft").mockResolvedValue({ id: "draft-role", state: {} as never, version: 1, updatedAt: "now" })
    const onGenerate = vi.fn().mockResolvedValue({ id: "job-new-role" })
    render(<ComposerSurface {...common} presentation="dialog" productionId={3} onGenerate={onGenerate} />)

    fireEvent.click(await screen.findByRole("button", { name: "Add story role" }))
    fireEvent.change(screen.getByLabelText("Story role"), { target: { value: "  Night   Guide  " } })
    fireEvent.click(screen.getByRole("button", { name: "Save role" }))
    expect(await screen.findByRole("button", { name: "Night Guide" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Choose a voice" }))
    fireEvent.click(screen.getByRole("button", { name: /Sarah.*1 method/ }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose a voice" }).textContent).toContain("Sarah"))
    fireEvent.click(screen.getByRole("button", { name: "Recording method" }))
    fireEvent.click(await screen.findByRole("option", { name: /Expressive \+ tags/ }))
    fireEvent.change(screen.getByPlaceholderText("Type or paste what should be said…"), { target: { value: "Let the room settle before the story begins." } })
    const generate = screen.getByRole("button", { name: /Generate and add Part/ })
    await waitFor(() => expect(generate.hasAttribute("disabled")).toBe(false))
    fireEvent.click(generate)

    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ authored_role: "Night Guide" })))
  })

  it("compares immutable Original words with the prepared Spoken version", async () => {
    const part = {
      id: 71,
      kind: "draft",
      text: "The signal is live.",
      text_raw: "The signal is live.",
      text_shaped: "The signal is live…",
      text_state: "shaped",
      revision: 1,
      cost: 0,
      created_at: "",
      position: 0,
      voice_identity_id: "identity-sarah",
      binding_id: "binding-sarah",
    } as ProductionPart
    render(<ComposerSurface {...common} productionId={3} part={part} />)

    expect((await screen.findByRole("textbox", { name: "Spoken script" }) as HTMLTextAreaElement).value).toBe("The signal is live…")
    fireEvent.click(screen.getByRole("button", { name: "Compare" }))

    expect(screen.getByRole("dialog", { name: "Compare script versions" })).toBeTruthy()
    expect(screen.getByText("The signal is live.")).toBeTruthy()
    expect(screen.getAllByText("The signal is live…").length).toBeGreaterThan(1)
  })

  it("keeps the tagged script presentation visible while its editor has focus", async () => {
    const taggedText = "[whispers] The signal is live."
    const part = {
      id: 72,
      kind: "draft",
      text: taggedText,
      text_raw: "The signal is live.",
      text_tagged: taggedText,
      text_state: "tagged",
      revision: 1,
      cost: 0,
      created_at: "",
      position: 0,
      voice_identity_id: "identity-sarah",
      binding_id: "binding-sarah",
    } as ProductionPart
    render(<ComposerSurface {...common} productionId={3} part={part} />)

    const editor = await screen.findByRole("textbox", { name: "Tagged script" }) as HTMLTextAreaElement
    const presentation = editor.closest(".tagged-script-editor")?.querySelector("pre")
    expect(presentation?.textContent).toBe(taggedText)

    editor.focus()
    expect(document.activeElement).toBe(editor)
    expect(presentation?.textContent).toBe(taggedText)
  })

  it("reopens the attached recording input and sends it unchanged to Generate again", async () => {
    const taggedText = "[whispers] The exact attached performance."
    const onGenerate = vi.fn().mockResolvedValue({ id: "job-replacement" })
    const part = {
      id: 73,
      kind: "speech",
      text: "The exact attached performance.",
      recording_text_state: "tagged",
      clip_id: 44,
      clip_raw_text: "The exact attached performance.",
      clip_spoken_text: "The exact attached performance…",
      clip_tagged_text: taggedText,
      revision: 1,
      cost: 0,
      created_at: "",
      position: 2,
      voice_identity_id: "identity-sarah",
      binding_id: "binding-sarah",
      capability_id: "expressive_tags",
      language: "English",
      speech_job: {
        result: { clip_id: 44 },
        request: {
          text: taggedText,
          text_raw: "The exact attached performance.",
          text_shaped: "The exact attached performance…",
          text_tagged: taggedText,
          text_state: "tagged",
        },
      },
    } as ProductionPart
    render(<ComposerSurface {...common} productionId={3} part={part} onGenerate={onGenerate} />)

    expect((await screen.findByRole("textbox", { name: "Tagged script" }) as HTMLTextAreaElement).value).toBe(taggedText)
    expect(screen.getByRole("button", { name: "Recording method" }).textContent).toContain("Expressive + tags")
    fireEvent.click(screen.getByRole("button", { name: "Generate again" }))

    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
      text: taggedText,
      text_raw: "The exact attached performance.",
      text_shaped: "The exact attached performance…",
      text_tagged: taggedText,
      text_state: "tagged",
      binding_id: "binding-sarah",
      capability_id: "expressive_tags",
    })))
  })

  it("requires an explicit editorial decision before generating changed Part words", async () => {
    const onGenerate = vi.fn().mockResolvedValue({ id: "job-1" })
    const onUpdateEditorial = vi.fn().mockResolvedValue(undefined)
    const part = { id: 8, kind: "draft", text: "Original words", text_raw: "Original words", revision: 3, cost: 0, created_at: "", position: 0, voice_identity_id: "identity-sarah", binding_id: "binding-sarah" } as ProductionPart
    render(<ComposerSurface {...common} productionId={3} part={part} onGenerate={onGenerate} onUpdateEditorial={onUpdateEditorial} />)
    await waitFor(() => expect(screen.getByRole("button", { name: /Generate Part/ }).hasAttribute("disabled")).toBe(false))
    fireEvent.change(screen.getByPlaceholderText("Type or paste what should be said…"), { target: { value: "Revised words" } })
    fireEvent.click(screen.getByRole("button", { name: /Generate Part/ }))
    expect(screen.getByText("Update this Part before generating?")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Update Part and generate" }))
    await waitFor(() => expect(onUpdateEditorial).toHaveBeenCalledWith(expect.objectContaining({ expected_revision: 3, script: "Revised words" })))
    expect(onGenerate).toHaveBeenCalledWith(expect.not.objectContaining({ select_result: expect.anything() }))
  })

  it("clears the recoverable Speak draft after a successful generation", async () => {
    vi.spyOn(studioApi, "composerDraft").mockResolvedValue(null)
    vi.spyOn(studioApi, "deleteComposerDraft").mockResolvedValue({ deleted: true })
    const saveDraft = vi.spyOn(studioApi, "saveComposerDraft").mockResolvedValue({ id: "draft-1", state: {} as never, version: 1, updatedAt: "now" })
    const onGenerate = vi.fn().mockResolvedValue({ id: "job-1" })
    const catalogueDirectory = {
      ...directory,
      registry: {
        ...directory.registry,
        bindings: directory.registry!.bindings.map((binding) => ({ ...binding, binding_id: null, catalogue_voice_id: `catalogue-${binding.provider_voice_id}`, source: "system" })),
      },
    } as unknown as VoiceDirectory
    render(<ComposerSurface {...common} directory={catalogueDirectory} onGenerate={onGenerate} />)

    await waitFor(() => expect(screen.getByRole("button", { name: "Choose a voice" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Choose a voice" }))
    fireEvent.click(screen.getByRole("button", { name: /Sarah.*1 method/ }))
    fireEvent.click(screen.getByRole("button", { name: "Recording method" }))
    fireEvent.click(await screen.findByRole("option", { name: /Expressive \+ tags/ }))
    fireEvent.change(screen.getByPlaceholderText("Type or paste what should be said…"), { target: { value: "A recoverable recording" } })
    await waitFor(() => expect(saveDraft).toHaveBeenCalled())
    expect(saveDraft.mock.calls.some(([, saved]) => saved.voiceIdentityId === "identity-sarah" && saved.route?.kind === "catalogue")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Create recording" }))

    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(studioApi.deleteComposerDraft).toHaveBeenCalledWith(expect.anything(), 1))
  })
})
