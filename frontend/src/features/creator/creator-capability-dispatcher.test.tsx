// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CreatorCapabilityDispatcher } from "./creator-capability-dispatcher"
import { CreatorHost, type CreatorCapabilityId } from "./creator-host"

vi.mock("./media/media-creator", () => ({
  MediaCreator: ({ context, onResult }: { context: { workspace_id: number; selection?: Record<string, unknown> }; onResult?: unknown }) => <div data-testid="implementation" data-workspace={context.workspace_id} data-result-contract={String(Boolean(onResult))}>media:{String(context.selection?.output_media_type)}</div>,
}))
vi.mock("./audio/audio-creator", () => ({
  AudioCreator: ({ context, fixedCapability, onResult }: { context: { workspace_id: number; selection?: Record<string, unknown> }; fixedCapability: string; onResult?: unknown }) => <div data-testid="implementation" data-workspace={context.workspace_id} data-output={String(context.selection?.output_media_type || "")} data-result-contract={String(Boolean(onResult))}>audio:{fixedCapability}</div>,
}))
vi.mock("./speech/speech-creator-page", () => ({
  SpeechCreatorPage: ({ context, onResult }: { context: { workspace_id: number; selection?: Record<string, unknown> }; onResult?: unknown }) => <div data-testid="implementation" data-workspace={context.workspace_id} data-output={String(context.selection?.output_media_type || "")} data-result-contract={String(Boolean(onResult))}>speech</div>,
}))

afterEach(cleanup)

describe("CreatorCapabilityDispatcher", () => {
  it.each([
    ["image", "media:image"],
    ["video", "media:video"],
    ["speech", "speech"],
    ["music", "audio:music"],
    ["sfx", "audio:sfx"],
  ] as const)("resolves %s through the canonical Creator composition point", async (capability, implementation) => {
    render(<CreatorHost context={{ workspace_id: 4 }} initialCapability={capability as CreatorCapabilityId} allowedCapabilities={[capability as CreatorCapabilityId]}>
      {(session) => <CreatorCapabilityDispatcher
        session={session}
        libraryDetail="Workspace Files"
        mediaProps={{ uploading: false, uploadLabel: "", libraryFiles: [], onUploadReference: vi.fn() }}
        audioProps={{ playerPlaying: false, onPlay: vi.fn() }}
        onResult={vi.fn()}
        renderLibrary={() => <div>Library</div>}
      />}
    </CreatorHost>)

    const panel = await screen.findByTestId("implementation")
    expect(panel.textContent).toBe(implementation)
    expect(panel.getAttribute("data-workspace")).toBe("4")
    expect(panel.getAttribute("data-result-contract")).toBe("true")
    if (capability === "speech" || capability === "music" || capability === "sfx") {
      expect(panel.getAttribute("data-output")).toBe("")
    }
  })
})
