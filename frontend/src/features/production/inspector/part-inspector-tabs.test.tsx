// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/use-part-detail-data", () => ({ usePartDetailData: () => ({
  captions: [], transcript: null, loading: false, captionBusy: null,
  captionConfirmation: null, captionJob: null, message: "",
  selectTranscript: vi.fn(),
  makeCaptions: vi.fn(), translate: vi.fn(), confirmCaptionAction: vi.fn(), cancelCaptionAction: vi.fn(),
  retryCaptionJob: vi.fn(), dismissCaptionJob: vi.fn(),
}) }))
vi.mock("./part-inspector-script", () => ({ PartInspectorScript: () => <div>Script panel</div> }))
vi.mock("./part-inspector-details", () => ({ PartInspectorDetails: () => <div>Details panel</div> }))
vi.mock("@/components/part-caption-panel", () => ({ PartCaptionPanel: () => <div>Captions panel</div> }))

import { PartInspectorContent } from "./part-inspector"

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("PartInspector tab ownership", () => {
  it("opens the requested recorded-Part tab directly", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
    const part = { id: 5, public_id: "part-5", position: 0, created_at: "", text: "Words", kind: "speech", clip_id: 25 }
    const props = { productionId: 7, part, directory: { config: null }, playerPlaying: false, onClose: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(), onRecordPart: vi.fn(), onPlay: vi.fn(), onChanged: vi.fn(), initialTab: "captions" } as unknown as ComponentProps<typeof PartInspectorContent>

    render(<PartInspectorContent {...props} />)

    await waitFor(() => expect(screen.getByRole("tab", { name: /Captions/i }).getAttribute("data-state")).toBe("active"))
    expect(screen.getByText("Captions panel")).toBeTruthy()
  })

  it("falls back to Script when a requested tab is invalid for the Part", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
    const part = { id: 6, public_id: "part-6", position: 0, created_at: "", text: "Words", kind: "draft" }
    const props = { productionId: 7, part, directory: { config: null }, playerPlaying: false, onClose: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(), onRecordPart: vi.fn(), onPlay: vi.fn(), onChanged: vi.fn(), initialTab: "captions" } as unknown as ComponentProps<typeof PartInspectorContent>

    render(<PartInspectorContent {...props} />)

    await waitFor(() => expect(screen.getByRole("tab", { name: "Text" }).getAttribute("data-state")).toBe("active"))
    expect(screen.queryByRole("tab", { name: /Captions/i })).toBeNull()
  })

  it("resets an invalid speech tab when the same Part identity changes type", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
    const base = { id: 4, public_id: "part-4", position: 0, created_at: "", text: "Words" }
    const props = { productionId: 7, directory: { config: null }, playerPlaying: false, onClose: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(), onRecordPart: vi.fn(), onPlay: vi.fn(), onChanged: vi.fn() }
    const speechProps = { ...props, part: { ...base, kind: "speech", clip_id: 24 } } as unknown as ComponentProps<typeof PartInspectorContent>
    const silenceProps = { ...props, part: { ...base, kind: "silence", text: "" } } as unknown as ComponentProps<typeof PartInspectorContent>
    const view = render(<PartInspectorContent {...speechProps} />)
    const captionsTab = screen.getByRole("tab", { name: /Captions/i })
    fireEvent.mouseDown(captionsTab, { button: 0, ctrlKey: false })
    fireEvent.click(captionsTab)
    await waitFor(() => expect(screen.getByRole("tab", { name: /Captions/i }).getAttribute("data-state")).toBe("active"))

    view.rerender(<PartInspectorContent {...silenceProps} />)
    await waitFor(() => expect(screen.queryByRole("tab", { name: /Captions/i })).toBeNull())
    expect(screen.getByRole("tab", { name: "Timing" }).getAttribute("data-state")).toBe("active")
  })
})
