// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VoiceDirectory } from "@/types/domain"
import { VoicePicker } from "./voice-picker"

afterEach(cleanup)

const directory: VoiceDirectory = {
  config: null,
  cloned: [],
  meta: {},
  catalog: [{ id: "qwen-audio-3.0-tts-plus-loongolivialin", name: "Olivia Lin", trait: "gentle", sample: "olivia.mp3" }],
  usage: {},
}

describe("VoicePicker", () => {
  const choice = (id: string, source: "mine" | "alibaba", engine: "audio" | "omni", model: "plus" | "flash", compatible: boolean) => ({ id, identityId: `${source}:${id}`, name: id, description: "", source, engine, model, modelId: `${engine}-${model}`, compatible, languages: ["English"], status: "active" })
  it("previews a voice without selecting it", async () => {
    const onChange = vi.fn()
    const onPlay = vi.fn()
    render(<VoicePicker choices={[choice(directory.catalog[0]!.id, "alibaba", "audio", "plus", true)]} summary={{ engine: "audio", tier: "plus", model_id: "audio-plus", label: "Qwen Audio TTS", system_count: 1, custom_count: 0, total_count: 1, clone_supported: false }} value={directory.catalog[0]!.id} directory={directory} engineLabel="Qwen Audio TTS" modelLabel="Plus" playerPlaying={false} onChange={onChange} onPlay={onPlay} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose a voice" }))
    expect(await screen.findByText("Plus · 1 compatible")).toBeTruthy()
    expect(screen.getByText("1 Alibaba · 0 yours")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Alibaba voices" })).toBeTruthy()
    fireEvent.click(await screen.findByRole("button", { name: "Preview Olivia Lin" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ url: "/samples/olivia.mp3", kind: "voice" }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("explains unavailable previews instead of showing a broken disabled play button", async () => {
    render(<VoicePicker choices={[choice("Tina", "alibaba", "omni", "plus", true)]} summary={null} value="Tina" directory={{ ...directory, config: { voices: { plus: {}, flash: {} }, default_voice: { plus: "", flash: "" }, formats: ["mp3"], languages: ["Arabic"], instruction_max: 100, has_key: true, capabilities: { omni: { label: "Qwen 3.5 Omni", purpose: "", models: { plus: "qwen3.5-omni-plus", flash: "qwen3.5-omni-flash" }, system_languages: ["Arabic"], system_voices: { Tina: "warm multilingual voice" }, exact_text: false, estimate_rates_per_million_chars: {} } } } }} engineLabel="Qwen 3.5 Omni" modelLabel="Plus" playerPlaying={false} onChange={vi.fn()} onPlay={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose a voice" }))
    expect(await screen.findByText("No preview")).toBeTruthy()
    expect(screen.queryByText(/Preview is free/)).toBeNull()
  })

  it("keeps an incompatible cloned voice discoverable and requests its exact route", async () => {
    const onChange = vi.fn()
    const serenity = choice("qwen-audio-3.0-tts-flash-serinity1-abc", "mine", "audio", "flash", false)
    render(<VoicePicker choices={[serenity]} summary={null} value="Tina" directory={directory} engineLabel="Qwen 3.5 Omni" modelLabel="Plus" playerPlaying={false} onChange={onChange} onPlay={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose a voice" }))
    fireEvent.click(screen.getByRole("button", { name: "All setups" }))
    expect(await screen.findByText("Available in Audio Flash")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Serinity 1/ }))
    expect(onChange).toHaveBeenCalledWith(serenity)
  })

  it("renders one cloned identity while preserving all of its model routes", async () => {
    const onChange = vi.fn()
    const audio = { ...choice("serinity-audio", "mine", "audio", "flash", false), identityId: "voice-serinity", name: "Serinity" }
    const omni = { ...choice("serinity-omni", "mine", "omni", "plus", false), identityId: "voice-serinity", name: "Serinity" }
    render(<VoicePicker choices={[audio, omni]} summary={{ engine: "audio", tier: "plus", model_id: "audio-plus", label: "Qwen Audio", system_count: 0, custom_count: 0, total_count: 0, clone_supported: false }} value="Tina" directory={{ ...directory, registry: { models: [], bindings: [{ identity_id: "voice-serinity", provider_voice_id: audio.id, name: "Serinity", description: "Warm", languages: ["English"], source: "custom", provider: "alibaba", engine: "audio", tier: "flash", model_id: "audio-flash", status: "active" }, { identity_id: "voice-serinity", provider_voice_id: omni.id, name: "Serinity", description: "Warm", languages: ["English"], source: "custom", provider: "alibaba", engine: "omni", tier: "plus", model_id: "omni-plus", status: "active" }], presets: [], source: { provider: "Alibaba", verified_at: "2026-08-07", audio_url: "", omni_url: "" } } }} engineLabel="Qwen Audio" modelLabel="Plus" playerPlaying={false} onChange={onChange} onPlay={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose a voice" }))
    fireEvent.click(screen.getByRole("button", { name: "All setups" }))
    expect((await screen.findAllByText("Serinity")).length).toBe(1)
    expect(screen.getByText("Available in Audio Flash · Omni Plus")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Serinity/ }))
    expect(onChange).toHaveBeenCalledWith(audio)
  })
})
