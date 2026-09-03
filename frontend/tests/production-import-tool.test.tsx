// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ProductionImportTool } from "@/features/productions/audiovisual/support/production-import-tool"
import type { ProductionImportValidation } from "@/features/productions/audiovisual/support/production-import"
import { originsApi } from "@/lib/api"
import type { VoiceDirectory } from "@/types/domain"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/voice-options", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voice-options")>()
  return { ...actual, getVoiceIdentities: () => [] }
})

const directory = { identities: [], registry: null } as unknown as VoiceDirectory
const document = {
  schema: "origins-production-import",
  version: 1,
  title: "Esther enters the court",
  description: "A focused story test.",
  language: "English",
  items: [
    { type: "speech", role: "Esther", text: "If I have found favor with you, hear my request." },
    { type: "silence", seconds: 1.2 },
  ],
}
const validation = {
  document,
  summary: {
    items: 2,
    speech: 1,
    silence: 1,
    estimated_duration_ms: 5400,
    roles: [{ name: "Esther", count: 1 }],
  },
} as unknown as ProductionImportValidation

function renderTool() {
  return render(<ProductionImportTool
    workspaceId={7}
    existing={{ id: 41, publicId: "production-current", name: "Current Production", description: "Keep this context.", partCount: 4 }}
    config={null}
    directory={directory}
    playerPlaying={false}
    onPlay={vi.fn()}
    onCompleted={vi.fn()}
    onCancel={vi.fn()}
  />)
}

describe("ProductionImportTool", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(cleanup)

  it("uses backend validation and makes current versus JSON metadata explicit", async () => {
    const validate = vi.spyOn(originsApi, "validateProductionImport").mockResolvedValue(validation)
    const { container } = renderTool()
    const file = new File([JSON.stringify(document)], "esther.json", { type: "application/json" })
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(document) })

    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })

    expect(await screen.findByRole("heading", { name: "Esther enters the court" })).toBeTruthy()
    expect(screen.getAllByText(/about 0:05/).length).toBeGreaterThan(0)
    expect(validate).toHaveBeenCalledWith(document)
    expect(screen.getByRole("button", { name: /Add to Current Production/ }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: /Keep current details/ }).getAttribute("aria-pressed")).toBe("true")
    expect((screen.getByLabelText("Production title") as HTMLInputElement).value).toBe("Current Production")

    fireEvent.click(screen.getByRole("button", { name: /Use JSON details/ }))
    expect((screen.getByLabelText("Production title") as HTMLInputElement).value).toBe("Esther enters the court")

    fireEvent.click(screen.getByRole("button", { name: /Create a new Production/ }))
    expect((screen.getByLabelText("Production title") as HTMLInputElement).value).toBe("Esther enters the court")
  })

  it("surfaces the canonical backend validation error without changing stage", async () => {
    vi.spyOn(originsApi, "validateProductionImport").mockRejectedValue(new Error("Item 2 must be Speech or Pause."))
    const { container } = renderTool()
    const file = new File([JSON.stringify(document)], "broken.json", { type: "application/json" })
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(document) })

    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })

    expect((await screen.findByRole("alert")).textContent).toContain("Item 2 must be Speech or Pause.")
    expect(screen.getByRole("heading", { name: "Bring in the authored story" })).toBeTruthy()
  })
})
