// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { speechModelKey, type VoiceChoice } from "@/lib/voice-options"
import type { StudioConfig } from "@/types/domain"
import { CreatorLanguagePicker } from "./creator-language-picker"
import { CreatorMethodPicker } from "./creator-method-picker"
import { CreatorModelPicker } from "./creator-model-picker"

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
})
afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals() })

const config = {
  capabilities: {
    studio: { models: { natural: "aurora-natural-v2" } },
  },
} as unknown as StudioConfig

const route: VoiceChoice = {
  id: "aurora-route",
  identityId: "voice-rhea",
  name: "Rhea",
  description: "Warm documentary",
  gender: "female",
  source: "owned",
  provider: "aurora-labs",
  region: "global",
  adapterKey: "studio",
  engine: "studio",
  model: "natural",
  modelId: "aurora-natural-v2",
  languages: ["English"],
  status: "ready",
  compatible: true,
  capabilities: [{ id: "directing", name: "Directed speech", description: "Natural language performance direction", controls: { natural_direction: true }, uiMetadata: {} }],
}

describe("Creator context pickers", () => {
  it("searches output languages and keeps undocumented choices available", async () => {
    const onChange = vi.fn()
    render(<CreatorLanguagePicker value="English" options={["Auto", "English", "French", "Indonesian"]} route={route} customVoice onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Output language" }))
    fireEvent.change(await screen.findByPlaceholderText("Search languages…"), { target: { value: "French" } })
    const french = screen.getByRole("option", { name: /French.*Not documented/ })
    expect(french.getAttribute("aria-disabled")).not.toBe("true")
    fireEvent.click(french)
    expect(onChange).toHaveBeenCalledWith("French")
  })

  it("groups exact speech models by provider without a closed vendor enum", async () => {
    const onSelect = vi.fn()
    render(<CreatorModelPicker routes={[route]} selectedModelKey={speechModelKey(route)} selectedCapabilityId={null} config={config} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole("combobox", { name: "Speech model" }))
    expect((await screen.findAllByText("Aurora Labs")).length).toBeGreaterThan(0)
    expect(screen.getByText("aurora-natural-v2")).toBeTruthy()
    fireEvent.click(screen.getByRole("option", { name: /aurora-natural-v2/i }))
    expect(onSelect).toHaveBeenCalledWith(route, "directing")
  })

  it("shows the recording modes of only the selected model", async () => {
    const onSelect = vi.fn()
    render(<CreatorMethodPicker route={route} selectedCapabilityId="directing" onSelect={onSelect} />)
    expect(screen.getByRole("button", { name: "Recording mode" }).textContent).toContain("Directed speech")
    fireEvent.click(screen.getByRole("button", { name: "Recording mode" }))
    fireEvent.click(await screen.findByRole("option", { name: /Directed speech/ }))
    expect(onSelect).toHaveBeenCalledWith(route, "directing")
  })
})
