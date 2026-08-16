// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { VoiceChoice } from "@/lib/voice-options"
import type { StudioConfig } from "@/types/domain"
import { ComposerLanguagePicker } from "./composer-language-picker"
import { ComposerMethodPicker } from "./composer-method-picker"

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

describe("Composer context pickers", () => {
  it("searches output languages and keeps undocumented choices available", async () => {
    const onChange = vi.fn()
    render(<ComposerLanguagePicker value="English" options={["Auto", "English", "French", "Indonesian"]} route={route} customVoice onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Output language" }))
    fireEvent.change(await screen.findByPlaceholderText("Search languages…"), { target: { value: "French" } })
    const french = screen.getByRole("option", { name: /French.*Not documented/ })
    expect(french.getAttribute("aria-disabled")).not.toBe("true")
    fireEvent.click(french)
    expect(onChange).toHaveBeenCalledWith("French")
  })

  it("groups exact recording methods by provider without a closed vendor enum", async () => {
    const onSelect = vi.fn()
    render(<ComposerMethodPicker routes={[route]} availableRoutes={[route]} selectedRouteId="" selectedCapabilityId={null} language="English" customVoice config={config} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole("button", { name: "Recording method" }))
    expect(await screen.findByText("Aurora Labs")).toBeTruthy()
    expect(screen.getByText("aurora-natural-v2")).toBeTruthy()
    fireEvent.click(screen.getByRole("option", { name: /Directed speech/ }))
    expect(onSelect).toHaveBeenCalledWith(route, "directing")
  })

  it("shows a restored single-capability route as the selected method", () => {
    render(<ComposerMethodPicker routes={[route]} availableRoutes={[route]} selectedRouteId={route.id} selectedCapabilityId="directing" language="English" customVoice config={config} onSelect={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Recording method" }).textContent).toContain("Directed speech")
  })
})
