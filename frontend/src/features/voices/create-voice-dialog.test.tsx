// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { CreateVoiceDialog } from "./create-voice-dialog"

vi.mock("@/lib/api", () => ({ studioApi: {
  createVoicePackage: vi.fn(),
  saveUploadedVoiceReferenceWindow: vi.fn(),
  uploadVoiceReference: vi.fn(),
  voicePackagePreflight: vi.fn(),
} }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const route = {
  provider_model_id: "alibaba:intl:qwen3-tts-vc-2026-01-22",
  provider: "alibaba", region: "intl", adapter_key: "qwen_tts",
  engine: "qwen_tts", tier: "vc", model_id: "qwen3-tts-vc-2026-01-22",
  label: "Qwen3 TTS Voice Clone", role: "Exact long reading",
  language: "en", source_language_documented: true,
  documented_output_languages: ["English"], estimated_creation_cost: 0,
  capability_ids: ["exact_longform"],
  clone_source_duration_ms: { minimum: 3_000, recommended_minimum: 10_000, recommended_maximum: 20_000, maximum: 60_000 },
}

describe("CreateVoiceDialog", () => {
  it("requires sex during identity setup and sends it with the new voice", async () => {
    vi.mocked(studioApi.uploadVoiceReference).mockResolvedValue({ reference_id: "ref-new", name: "voice.wav", duration_ms: 15_000, sample_rate: 24_000, channels: 1 })
    vi.mocked(studioApi.saveUploadedVoiceReferenceWindow).mockResolvedValue({
      id: "vwin-new", reference_id: "ref-new", provider_model_id: route.provider_model_id,
      start_ms: 0, duration_ms: 15_000, source_language: "en",
      transcript: "A faithful reference sentence.", enable_preprocess: null,
      derived_path: "", created_at: "", updated_at: "",
    })
    vi.mocked(studioApi.voicePackagePreflight).mockResolvedValue({
      region: "intl", region_label: "Singapore", language: "en",
      package: "complete", routes: [route], available_routes: [route],
      packages: [], total_estimated_creation_cost: 0,
    })
    vi.mocked(studioApi.createVoicePackage).mockResolvedValue({
      identity: {} as never, queued: 1,
      plan: { region: "intl", region_label: "Singapore", language: "en", package: "complete", routes: [route], available_routes: [route], packages: [], total_estimated_creation_cost: 0 },
    })
    render(<CreateVoiceDialog open onOpenChange={() => undefined} config={null} onQueued={() => undefined} />)

    fireEvent.change(screen.getByRole("textbox", { name: "Voice name" }), { target: { value: "New narrator" } })
    fireEvent.change(screen.getByRole("combobox", { name: "Language spoken in this recording" }), { target: { value: "en" } })
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true)

    fireEvent.click(screen.getByRole("radio", { name: "Female voice" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
    fireEvent.change(fileInput!, { target: { files: [new File(["voice"], "voice.wav", { type: "audio/wav" })] } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare recording" }))
    const transcript = await screen.findByPlaceholderText("Paste exactly what the speaker says in this selected window")
    fireEvent.change(transcript, { target: { value: "A faithful reference sentence." } })
    fireEvent.click(screen.getByRole("button", { name: "Review voice" }))
    await screen.findByText("1 recording methods are ready")
    fireEvent.click(screen.getByRole("button", { name: "Create voice" }))

    await waitFor(() => expect(studioApi.createVoicePackage).toHaveBeenCalledWith(expect.objectContaining({
      name: "New narrator", gender: "female", language: "en", reference_id: "ref-new",
      reference_window_ids: { [route.provider_model_id]: "vwin-new" },
    })))
  })
})
