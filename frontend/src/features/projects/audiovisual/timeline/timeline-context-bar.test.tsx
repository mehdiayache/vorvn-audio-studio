// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: toastError } }))
vi.mock("@/features/sound-scene/timeline/sound-scene-context-toolbar", () => ({
  SoundSceneContextToolbar: () => <div>Audio selection</div>,
}))
vi.mock("@/features/visual-scene/timeline/visual-timeline-parts", () => ({
  VisualContextToolbar: () => <div>Visual selection</div>,
}))

import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { TimelineContextBar } from "./timeline-context-bar"

describe("TimelineContextBar feedback", () => {
  it("sends an interaction error to the global toaster and never leaves it in the next Selection bar", async () => {
    const audioSession = { clearError: vi.fn() } as unknown as SoundSceneSession
    const visualSession = { clearError: vi.fn() } as unknown as VisualSceneSession
    render(<TimelineContextBar
      audioSession={audioSession}
      visualSession={visualSession}
      selectedAudioRefs={[]}
      selectedPart={null}
      context={null}
      selectedVisualRefs={[]}
      selectedVisualTrack={null}
      playhead={0}
      saving={false}
      visualSaving={false}
      canSplitAudio={false}
      canSplitVisual={false}
      canCrossfade={false}
      error={null}
      visualError="Unlock this visual before changing its timing."
      onFollowPlayhead={vi.fn()}
      onRemoveAudio={vi.fn()}
      onRemoveVisual={vi.fn()}
    />)

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(
      "Unlock this visual before changing its timing.",
      { id: "timeline-selection-error" },
    ))
    expect(audioSession.clearError).toHaveBeenCalled()
    expect(visualSession.clearError).toHaveBeenCalled()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByText("Select a clip or Script Part to edit it")).toBeTruthy()
  })
})
