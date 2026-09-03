// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { GeneratePayload } from "@/types/domain"

const api = vi.hoisted(() => ({
  enqueueGenerate: vi.fn(),
  recordingHistory: vi.fn(),
  confirmJob: vi.fn(),
}))
const player = vi.hoisted(() => ({ toggleSource: vi.fn(), source: null, state: "idle" }))

vi.mock("@/lib/api", () => ({ originsApi: api }))
vi.mock("@/hooks/use-voice-directory", () => ({ useVoiceDirectory: () => ({
  loading: false,
  error: "",
  config: {},
  directory: { registry: null, identities: [], catalog: [], cloned: [], meta: {} },
  refresh: vi.fn(),
}) }))
vi.mock("@/components/global-player-provider", () => ({ useGlobalPlayer: () => player }))
vi.mock("@/hooks/use-job-execution", () => ({ useJobExecution: () => ({
  id: "speech-job",
  type: "speech",
  status: "ok",
  progress: 1,
  detail: "Ready",
  retries: 0,
  result: { url: "/media/speech.mp3", name: "speech.mp3" },
  output_file_ids: [91],
}) }))
vi.mock("@/lib/voice", () => ({
  resolveRequestRoute: () => null,
  resolveRequestVoice: () => ({ name: "Test Voice" }),
}))
vi.mock("@/components/recording-clip-card", () => ({ RecordingClipCard: () => <div>Recording</div> }))
vi.mock("./standalone-speech-creator-host", () => ({
  StandaloneSpeechCreatorHost: ({ onGenerate }: { onGenerate: (payload: GeneratePayload) => Promise<unknown> }) => <button type="button" onClick={() => void onGenerate({
    context: { workspace_id: 999 },
    text: "Folder speech",
    binding_id: "binding-1",
    format: "mp3",
    language: "English",
    instruction: "",
    speech_mode: "exact",
    rate: 1,
    pitch: 1,
    volume: 100,
    seed: 0,
  })}>Generate fixture speech</button>,
}))

import { SpeechCreatorPage } from "./speech-creator-page"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  api.recordingHistory.mockResolvedValue({ recordings: [], total_cost: 0 })
  player.toggleSource.mockResolvedValue(undefined)
})

describe("Speech Creator result contract", () => {
  it("keeps the host context, emits CreatorResult, and exposes its contextual action", async () => {
    api.recordingHistory.mockResolvedValue({ recordings: [], total_cost: 0 })
    api.enqueueGenerate.mockResolvedValue({
      id: "speech-job", type: "speech", status: "queued", progress: 0,
      detail: "Queued", retries: 0, result: {}, output_file_ids: [],
    })
    player.toggleSource.mockResolvedValue(undefined)
    const onResult = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn().mockResolvedValue(undefined)
    const context = {
      workspace_id: 4,
      folder_id: 27,
      production_id: 7,
      production_type: "audiovisual",
      selection: { capability: "speech" },
    }

    render(<SpeechCreatorPage
      context={context}
      panelOnly
      onResult={onResult}
      resultAction={{
        label: "Add to Timeline",
        detail: "Place this File at the current playhead.",
        busyLabel: "Adding to Timeline…",
        run,
      }}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Generate fixture speech" }))

    await waitFor(() => expect(api.enqueueGenerate).toHaveBeenCalledWith(expect.objectContaining({ context })))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ file_ids: [91] }))
    const action = await screen.findByRole("button", { name: "Add to Timeline" })
    expect(screen.getByText("Place this File at the current playhead.")).toBeTruthy()
    fireEvent.click(action)
    await waitFor(() => expect(run).toHaveBeenCalledWith({ file_ids: [91] }))
  })
})
