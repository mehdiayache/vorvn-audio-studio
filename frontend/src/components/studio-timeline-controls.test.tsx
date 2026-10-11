// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StudioTimelineToolbar, StudioTimelineZoom } from "./studio-timeline-controls"

vi.mock("./ui/slider", () => ({ Slider: ({ value, min, max, onValueChange, ...props }: { value: number[]; min: number; max: number; onValueChange: (value: number[]) => void; "aria-label": string }) => <input type="range" aria-label={props["aria-label"]} value={value[0]} min={min} max={max} onChange={event => onValueChange([Number(event.target.value)])} /> }))
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const actions = () => ({ onUndo: vi.fn(), onRedo: vi.fn(), onMoveView: vi.fn(), onSnappingChange: vi.fn(), onFollowPlayheadChange: vi.fn() })

describe("Actual Studio Timeline controls", () => {
  it("keeps view controls usable when editing is denied and exposes contextual tools", () => {
    const handlers = actions()
    render(<StudioTimelineToolbar {...handlers} disabled canUndo canRedo snapping followPlayhead onAddAudio={vi.fn()} extraTools={<button>Captions</button>} />)
    expect((screen.getByRole("button", { name: "Undo edit" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Add to Timeline" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Previous view" }))
    fireEvent.click(screen.getByRole("button", { name: "Next view" }))
    fireEvent.click(screen.getByRole("button", { name: "Turn snapping off" }))
    fireEvent.click(screen.getByRole("button", { name: "Follow" }))
    expect(handlers.onMoveView.mock.calls).toEqual([[-1], [1]])
    expect(handlers.onSnappingChange).toHaveBeenCalledWith(false)
    expect(handlers.onFollowPlayheadChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole("button", { name: "Captions" })).toBeTruthy()
  })

  it("omits media insertion without supported callbacks and localizes controls", () => {
    render(<StudioTimelineToolbar {...actions()} canUndo={false} canRedo={false} snapping={false} followPlayhead={false} locale="fr" />)
    expect(screen.queryByRole("button", { name: "Ajouter à la Timeline" })).toBeNull()
    expect(screen.getByRole("button", { name: "Activer le magnétisme" })).toBeTruthy()
  })

  it("offers only supported media actions through the original insertion menu", async () => {
    const onAddAudio = vi.fn()
    render(<StudioTimelineToolbar {...actions()} canUndo canRedo snapping followPlayhead onAddAudio={onAddAudio} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Add to Timeline" }), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Audio" }))
    expect(onAddAudio).toHaveBeenCalledOnce()
    expect(screen.queryByRole("menuitem", { name: "Image or video" })).toBeNull()
  })

  it("preserves historical indexed zoom steps and fit", () => {
    const onChange = vi.fn(), onFit = vi.fn()
    render(<StudioTimelineZoom pixelsPerSecond={10} zoomSteps={[2, 10, 40]} onChange={onChange} onFit={onFit} />)
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }))
    expect(onChange).toHaveBeenLastCalledWith(2)
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(onChange).toHaveBeenLastCalledWith(40)
    fireEvent.change(screen.getByRole("slider", { name: "Timeline zoom" }), { target: { value: "0" } })
    expect(onChange).toHaveBeenLastCalledWith(2)
    fireEvent.click(screen.getByRole("button", { name: "Fit entire timeline" }))
    expect(onFit).toHaveBeenCalledOnce()
  })

  it("reaches long-composition zoom endpoints and disables bounded zoom actions", () => {
    const onChange = vi.fn()
    const { rerender } = render(<StudioTimelineZoom pixelsPerSecond={.001} onChange={onChange} onFit={vi.fn()} />)
    expect((screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole("slider", { name: "Timeline zoom" }), { target: { value: "1000" } })
    expect(onChange).toHaveBeenLastCalledWith(200)
    rerender(<StudioTimelineZoom pixelsPerSecond={200} onChange={onChange} onFit={vi.fn()} />)
    expect((screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole("slider", { name: "Timeline zoom" }), { target: { value: "0" } })
    expect(onChange).toHaveBeenLastCalledWith(.001)
  })
})
