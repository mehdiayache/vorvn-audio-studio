// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ProductionImportTool } from "@/features/production/production-import-tool"
import type { VoiceIdentityChoice } from "@/lib/voice-options"
import type { VoiceDirectory } from "@/types/domain"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/voice-picker", () => ({
  VoicePicker: ({ identities, onChange }: { identities: VoiceIdentityChoice[]; onChange: (identity: VoiceIdentityChoice) => void }) => <button type="button" onClick={() => onChange(identities[0]!)}>Choose owned Voice</button>,
}))

const identity: VoiceIdentityChoice = {
  identityId: "owned-esther",
  name: "Esther",
  description: "Clear and composed",
  gender: "female",
  source: "owned",
  editorialLanguage: "English",
  routes: [{
    id: "route-esther", bindingId: "binding-esther", identityId: "owned-esther",
    name: "Esther", description: "", gender: "female", source: "owned",
    engine: "fixture", model: "fixture", modelId: "fixture", provider: "fixture",
    region: "fixture", adapterKey: "fixture", capabilities: [], compatible: true,
    languages: ["English"], status: "active",
  }],
}
const directory = { identities: [], registry: null } as unknown as VoiceDirectory
const document = {
  schema: "audio-studio-production-import",
  version: 1,
  title: "Esther enters the court",
  items: [
    { type: "speech", role: "esther", text: "If I have found favor with you, hear my request.", language: "English", speech_mode: "directed", instruction: "Brave, formal, and controlled.", rate: 0.9, pitch: 1, volume: 62, seed: 31, format: "mp3" },
    { type: "silence", seconds: 1.2 },
  ],
}

describe("ProductionImportTool", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it("requires owned role mapping, imports once, then requests refresh", async () => {
    const onImport = vi.fn().mockResolvedValue({ items: 2, speech: 1, silence: 1 })
    const onImported = vi.fn()
    const { container } = render(<ProductionImportTool currentPartCount={4} identities={[identity]} directory={directory} playerPlaying={false} onPlay={vi.fn()} onImport={onImport} onImported={onImported} onCancel={vi.fn()} />)
    const file = new File([JSON.stringify(document)], "esther.json", { type: "application/json" })
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(document) })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(await screen.findByText("Esther enters the court")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Append 2 items" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Choose owned Voice" }))
    fireEvent.click(screen.getByRole("button", { name: "Append 2 items" }))
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce())
    expect(onImport.mock.calls[0]![1]).toEqual({ esther: "owned-esther" })
    expect(onImported).toHaveBeenCalledOnce()
  })

  it("cancels without calling the import mutation", () => {
    const onImport = vi.fn()
    const onCancel = vi.fn()
    render(<ProductionImportTool currentPartCount={0} identities={[identity]} directory={directory} playerPlaying={false} onPlay={vi.fn()} onImport={onImport} onImported={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onImport).not.toHaveBeenCalled()
  })
})
