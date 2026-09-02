// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CreatorCapabilityDispatcher } from "./creator-capability-dispatcher"
import { CreatorHost, type CreatorCapabilityId } from "./creator-host"

vi.mock("./media/media-creator", () => ({
  MediaCreator: ({ context }: { context: { selection?: Record<string, unknown> } }) => <div data-testid="implementation">media:{String(context.selection?.output_media_type)}</div>,
}))
vi.mock("./audio/audio-creator", () => ({
  AudioCreator: ({ fixedCapability }: { fixedCapability: string }) => <div data-testid="implementation">audio:{fixedCapability}</div>,
}))
vi.mock("./speech/speech-creator-page", () => ({
  SpeechCreatorPage: () => <div data-testid="implementation">speech</div>,
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
        speechCallbacks={{}}
        audioProps={{ playerPlaying: false, onPlay: vi.fn(), onKeep: vi.fn(), onKept: vi.fn() }}
        renderLibrary={() => <div>Library</div>}
      />}
    </CreatorHost>)

    expect((await screen.findByTestId("implementation")).textContent).toBe(implementation)
  })
})
