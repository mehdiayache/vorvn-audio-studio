// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/use-part-detail-data", () => ({ usePartDetailData: () => ({
  takes: [], captions: [], transcript: null, loading: false, captionBusy: null,
  captionConfirmation: null, captionJob: null, takeConfirmation: null, message: "",
  selectTranscript: vi.fn(), promote: vi.fn(), confirmTake: vi.fn(), cancelTakeConfirmation: vi.fn(),
  makeCaptions: vi.fn(), translate: vi.fn(), confirmCaptionAction: vi.fn(), cancelCaptionAction: vi.fn(),
  retryCaptionJob: vi.fn(), dismissCaptionJob: vi.fn(),
}) }))
vi.mock("./part-inspector-script", () => ({ PartInspectorScript: () => <div>Script panel</div> }))
vi.mock("./part-inspector-takes", () => ({ PartInspectorTakes: () => <div>Takes panel</div> }))
vi.mock("./part-inspector-details", () => ({ PartInspectorDetails: () => <div>Details panel</div> }))
vi.mock("@/components/part-caption-panel", () => ({ PartCaptionPanel: () => <div>Captions panel</div> }))

import { PartInspector } from "./part-inspector"

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("PartInspector tab ownership", () => {
  it("resets an invalid speech tab when the same Part identity changes type", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
    const base = { id: 4, public_id: "part-4", position: 0, created_at: "", text: "Words" }
    const props = { productionId: 7, directory: { config: null }, playerPlaying: false, onClose: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(), onNewTake: vi.fn(), onPlay: vi.fn(), onChanged: vi.fn() }
    const speechProps = { ...props, part: { ...base, kind: "speech" } } as unknown as ComponentProps<typeof PartInspector>
    const silenceProps = { ...props, part: { ...base, kind: "silence", text: "" } } as unknown as ComponentProps<typeof PartInspector>
    const view = render(<PartInspector {...speechProps} />)
    const takesTab = screen.getByRole("tab", { name: /Takes/i })
    fireEvent.mouseDown(takesTab, { button: 0, ctrlKey: false })
    fireEvent.click(takesTab)
    await waitFor(() => expect(screen.getByRole("tab", { name: /Takes/i }).getAttribute("data-state")).toBe("active"))

    view.rerender(<PartInspector {...silenceProps} />)
    await waitFor(() => expect(screen.queryByRole("tab", { name: /Takes/i })).toBeNull())
    expect(screen.getByRole("tab", { name: "Script" }).getAttribute("data-state")).toBe("active")
  })
})
