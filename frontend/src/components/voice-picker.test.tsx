// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VoiceIdentityChoice } from "@/lib/voice-options"
import type { VoiceDirectory } from "@/types/domain"
import { VoicePicker } from "./voice-picker"

afterEach(cleanup)

const directory: VoiceDirectory = {
  config: null,
  cloned: [],
  meta: {},
  catalog: [{ id: "olivia", name: "Olivia Lin", trait: "gentle", sample: "olivia.mp3" }],
  usage: {},
}

function identity(overrides: Partial<VoiceIdentityChoice> = {}): VoiceIdentityChoice {
  return {
    identityId: "system:olivia",
    name: "Olivia Lin",
    description: "Gentle narration",
    source: "alibaba",
    sourceLanguage: "",
    routes: [{ id: "olivia", identityId: "system:olivia", name: "Olivia Lin", description: "Gentle narration", source: "alibaba", engine: "audio", model: "plus", modelId: "audio-plus", compatible: true, languages: ["English"], status: "active" }],
    ...overrides,
  }
}

describe("VoicePicker", () => {
  it("previews a voice without selecting it", async () => {
    const onChange = vi.fn(); const onPlay = vi.fn()
    render(<VoicePicker identities={[identity()]} value="system:olivia" directory={directory} playerPlaying={false} onChange={onChange} onPlay={onPlay} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose a voice" }))
    expect(await screen.findByText("Choose the person first. Language and recording style come next.")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Alibaba voices" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Preview Olivia Lin" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ url: "/samples/olivia.mp3", kind: "voice" }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("shows each cloned identity once with source language as information", async () => {
    const onChange = vi.fn()
    const serenity = identity({
      identityId: "voice-serinity", name: "Serinity", source: "mine", sourceLanguage: "en",
      routes: [
        { ...identity().routes[0]!, id: "serinity-audio", identityId: "voice-serinity", name: "Serinity", source: "mine", model: "flash" },
        { ...identity().routes[0]!, id: "serinity-omni", identityId: "voice-serinity", name: "Serinity", source: "mine", engine: "omni" },
      ],
    })
    render(<VoicePicker identities={[serenity]} value="" directory={directory} playerPlaying={false} onChange={onChange} onPlay={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose a voice" }))
    expect((await screen.findAllByText("Serinity Audio")).length).toBe(1)
    expect(screen.getByText("🇬🇧 English source · 2 methods")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Serinity Audio/ }))
    expect(onChange).toHaveBeenCalledWith(serenity)
  })

  it("explains unavailable previews without a broken play control", async () => {
    render(<VoicePicker identities={[identity({ name: "Tina", identityId: "system:tina", routes: [{ ...identity().routes[0]!, id: "Tina", name: "Tina", identityId: "system:tina" }] })]} value="system:tina" directory={directory} playerPlaying={false} onChange={vi.fn()} onPlay={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose a voice" }))
    expect(await screen.findByText("No preview")).toBeTruthy()
  })
})
