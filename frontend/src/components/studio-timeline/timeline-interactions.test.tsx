// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react"
import { createElement, type PointerEvent as ReactPointerEvent } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAudioTimelineGestures, type AudioTimelineSessionPort } from "./use-audio-timeline-gestures"
import { useVisualTimelineGestures, type VisualTimelineSessionPort } from "./use-visual-timeline-gestures"
import { useTimelineSnapping } from "./use-timeline-snapping"
import { useTimelineViewport } from "./use-timeline-viewport"

const ref = { trackId: "track", clipId: "clip" }
function pointer(clientX = 0, clientY = 0, extras = {}) {
  return { button: 0, pointerId: 1, clientX, clientY, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extras } as unknown as ReactPointerEvent
}
function dispatch(type: string, extras = {}) {
  const event = Object.assign(new Event(type), { pointerId: 1, clientX: 0, clientY: 0, altKey: false, ...extras })
  window.dispatchEvent(event)
}
function audioSession(): AudioTimelineSessionPort {
  return {
    selectClip: vi.fn(), selectedClips: () => [ref],
    currentClip: () => ({ gain: 1, locked: false, fade_in_ms: 0, fade_out_ms: 0, duration_ms: 1000 }),
    canMoveClips: () => true, beginGesture: vi.fn(), moveClips: vi.fn(), trimClip: vi.fn(), updateClip: vi.fn(),
    commitGesture: vi.fn(), cancelGesture: vi.fn(), reportError: vi.fn(),
  }
}
function audioOptions(session = audioSession()) {
  return { session, engine: { tracks: [{ id: "track", clips: [{ id: "clip", startSample: 48000, durationSamples: 48000 }] }] }, selectedRefs: [ref], saving: false, pixelsPerSecond: 100, snap: (value: number) => value, clearSnapGuide: vi.fn(), activeCancel: { current: null as (() => void) | null } }
}
function visualOptions() {
  const visualSession: VisualTimelineSessionPort<{ id: number }> = {
    currentClip: () => ({ file_id: 4, start_ms: 1000, duration_ms: 1000, locked: false }),
    selectClip: vi.fn(), beginGesture: vi.fn(), moveClip: vi.fn(), trimClip: vi.fn(),
    commitGesture: vi.fn(), cancelGesture: vi.fn(), reportError: vi.fn(),
  }
  return { visualSession, session: { select: vi.fn() }, files: [{ id: 4 }], visualTracks: [{ id: "track", locked: false }], selectedRefs: [ref], saving: false, pixelsPerSecond: 100, snap: (value: number) => value, clearSnapGuide: vi.fn(), activeCancel: { current: null as (() => void) | null } }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe("extracted Studio gestures", () => {
  it("preserves group selection, begins after the click threshold, and commits incremental audio moves once", () => {
    const options = audioOptions()
    options.selectedRefs.push({ trackId: "other", clipId: "other" })
    const { result } = renderHook(() => useAudioTimelineGestures(options))
    act(() => result.current(pointer(), "track", "clip", "move"))
    act(() => dispatch("pointermove", { clientX: 2 }))
    expect(options.session.beginGesture).not.toHaveBeenCalled()
    act(() => dispatch("pointermove", { clientX: 50 }))
    act(() => dispatch("pointermove", { clientX: 60 }))
    expect(options.session.selectClip).not.toHaveBeenCalled()
    expect(options.session.moveClips).toHaveBeenNthCalledWith(1, options.selectedRefs, 24000)
    expect(options.session.moveClips).toHaveBeenNthCalledWith(2, options.selectedRefs, 4800)
    act(() => dispatch("pointerup", { pointerId: 2 }))
    expect(options.session.commitGesture).not.toHaveBeenCalled()
    act(() => dispatch("pointerup"))
    expect(options.session.commitGesture).toHaveBeenCalledOnce()
    act(() => dispatch("pointermove", { clientX: 100 }))
    expect(options.session.moveClips).toHaveBeenCalledTimes(2)
    expect(options.activeCancel.current).toBeNull()
  })

  it.each(["pointercancel", "blur", "unmount", "inactive", "readonly", "revision", "escape"])("rolls back an audio draft and removes listeners on %s", mode => {
    const options = audioOptions()
    const { result, rerender, unmount } = renderHook(({ active, editable, revisionKey }) => useAudioTimelineGestures({ ...options, active, editable, revisionKey }), { initialProps: { active: true, editable: true, revisionKey: 1 } })
    act(() => result.current(pointer(), "track", "clip", "move"))
    act(() => dispatch("pointermove", { clientX: 50 }))
    act(() => {
      if (mode === "unmount") unmount()
      else if (mode === "inactive") rerender({ active: false, editable: true, revisionKey: 1 })
      else if (mode === "readonly") rerender({ active: true, editable: false, revisionKey: 1 })
      else if (mode === "revision") rerender({ active: true, editable: true, revisionKey: 2 })
      else if (mode === "escape") { const handle = document.createElement("button"); document.body.append(handle); handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); handle.remove() }
      else dispatch(mode)
    })
    expect(options.session.cancelGesture).toHaveBeenCalledOnce()
    act(() => dispatch("pointerup"))
    expect(options.session.commitGesture).not.toHaveBeenCalled()
    expect(options.activeCancel.current).toBeNull()
  })

  it("previews source gain and bounded fades without changing timing", () => {
    const options = audioOptions()
    const { result } = renderHook(() => useAudioTimelineGestures(options))
    act(() => result.current(pointer(), "track", "clip", "gain"))
    act(() => dispatch("pointermove", { clientY: -100 }))
    expect(options.session.updateClip).toHaveBeenLastCalledWith("track", "clip", { gain: 10 ** (6 / 20) })
    act(() => dispatch("pointerup"))
    act(() => result.current(pointer(), "track", "clip", "fade-in"))
    act(() => dispatch("pointermove", { clientX: 200 }))
    expect(options.session.updateClip).toHaveBeenLastCalledWith("track", "clip", { fade_in_ms: 1000 })
    expect(options.session.moveClips).not.toHaveBeenCalled()
  })

  it("keeps the cumulative audio move bounded when the pointer crosses zero then reverses", () => {
    const options = audioOptions()
    const { result } = renderHook(() => useAudioTimelineGestures(options))
    act(() => result.current(pointer(), "track", "clip", "move"))
    act(() => dispatch("pointermove", { clientX: -300 }))
    act(() => dispatch("pointermove", { clientX: -50 }))
    expect(options.session.moveClips).toHaveBeenNthCalledWith(1, [ref], -48000)
    expect(options.session.moveClips).toHaveBeenNthCalledWith(2, [ref], 24000)
  })

  it("keeps visual group offsets when moving its later placement across zero", () => {
    const options = visualOptions()
    options.selectedRefs.push({ trackId: "track", clipId: "earlier" })
    options.visualSession.currentClip = item => ({ file_id: 4, start_ms: item.clipId === "clip" ? 1000 : 500, duration_ms: 1000, locked: false })
    const { result } = renderHook(() => useVisualTimelineGestures(options))
    act(() => result.current(pointer(), ref, "move"))
    act(() => dispatch("pointermove", { clientX: -300 }))
    expect(options.visualSession.moveClip).toHaveBeenCalledWith(ref, 500)
    expect(options.visualSession.selectClip).not.toHaveBeenCalled()
  })

  it("uses the actual applied trim delta when reversing from the source boundary", () => {
    const options = audioOptions()
    options.session.trimClip = vi.fn().mockReturnValueOnce(4800).mockReturnValueOnce(-2400)
    const { result } = renderHook(() => useAudioTimelineGestures(options))
    act(() => result.current(pointer(), "track", "clip", "right"))
    act(() => dispatch("pointermove", { clientX: 100 }))
    act(() => dispatch("pointermove", { clientX: 5 }))
    expect(options.session.trimClip).toHaveBeenNthCalledWith(1, "track", "clip", "right", 48000)
    expect(options.session.trimClip).toHaveBeenNthCalledWith(2, "track", "clip", "right", -2400)
  })

  it("keeps visual timing absolute in milliseconds and retains its file for trimming", () => {
    const options = visualOptions()
    const { result } = renderHook(() => useVisualTimelineGestures(options))
    act(() => result.current(pointer(), ref, "end"))
    act(() => dispatch("pointermove", { clientX: 50 }))
    expect(options.visualSession.trimClip).toHaveBeenCalledWith(ref, "end", 2500, options.files[0])
    act(() => dispatch("blur"))
    expect(options.visualSession.cancelGesture).toHaveBeenCalledOnce()
    expect(options.visualSession.commitGesture).not.toHaveBeenCalled()
  })

  it("cancels a visual trim through Escape even when its button owns focus", () => {
    const options = visualOptions()
    const { result } = renderHook(() => useVisualTimelineGestures(options))
    act(() => result.current(pointer(), ref, "end"))
    act(() => dispatch("pointermove", { clientX: 50 }))
    const button = document.createElement("button"); document.body.append(button)
    act(() => button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })))
    button.remove()
    expect(options.visualSession.cancelGesture).toHaveBeenCalledOnce()
    act(() => dispatch("pointerup"))
    expect(options.visualSession.commitGesture).not.toHaveBeenCalled()
  })

  it("guards locked visuals and inactive controllers", () => {
    const options = visualOptions()
    options.visualTracks[0]!.locked = true
    const { result, rerender } = renderHook(({ active }) => useVisualTimelineGestures({ ...options, active }), { initialProps: { active: true } })
    act(() => result.current(pointer(), ref, "move"))
    expect(options.visualSession.reportError).toHaveBeenCalledOnce()
    expect(options.activeCancel.current).toBeNull()
    rerender({ active: false })
    act(() => result.current(pointer(), ref, "move"))
    expect(options.visualSession.reportError).toHaveBeenCalledOnce()
  })

  it("reports asynchronous commit failures through the owning session", async () => {
    const options = audioOptions()
    options.session.commitGesture = () => Promise.reject(new Error("save failed"))
    const { result } = renderHook(() => useAudioTimelineGestures(options))
    act(() => result.current(pointer(), "track", "clip", "move"))
    act(() => dispatch("pointermove", { clientX: 50 }))
    await act(async () => dispatch("pointerup"))
    expect(options.session.reportError).toHaveBeenCalledWith("save failed")
  })
})

describe("Studio snapping", () => {
  it("snaps either placement edge to the closest peer and publishes the actual aligned guide", () => {
    const { result } = renderHook(() => useTimelineSnapping({ pixelsPerSecond: 100, playhead: 20, sequence: [], audioTracks: [{ clips: [{ id: "peer", resolved_start_ms: 5000, resolved_duration_ms: 5000 }] }], visualTracks: [] }))
    let value = 0
    act(() => { value = result.current.snapPlacement(3.05, 2, false) })
    expect(value).toBeCloseTo(3)
    expect(result.current.guide).toBe(5)
    act(() => { value = result.current.snapPlacement(4.93, 5.06, false) })
    expect(value).toBeCloseTo(4.94)
    expect(result.current.guide).toBe(10)
    act(() => { value = result.current.snapPlacement(3.05, 2, true) })
    expect(value).toBe(3.05)
    expect(result.current.guide).toBeNull()
  })
  it("uses an eight pixel tolerance, excludes selected/orphan edges and clears contextual guides", () => {
    const { result } = renderHook(() => useTimelineSnapping({ pixelsPerSecond: 100, playhead: 20, sequence: [{ start_ms: 1000, duration_ms: 1000 }], audioTracks: [{ clips: [{ id: "selected", resolved_start_ms: 3000, resolved_duration_ms: 1000 }, { id: "orphan", orphan: true, resolved_start_ms: 5000, resolved_duration_ms: 1000 }] }], visualTracks: [{ clips: [{ id: "visual", start_ms: 7000, duration_ms: 1000 }] }], excludeClipIds: ["selected"] }))
    let value = 0
    act(() => { value = result.current.snap(1.07, false) })
    expect(value).toBe(1)
    expect(result.current.guide).toBe(1)
    act(() => { value = result.current.snap(3.02, false) })
    expect(value).toBe(3.02)
    act(() => { value = result.current.snap(5.02, false) })
    expect(value).toBe(5.02)
    act(() => { value = result.current.snap(7.01, true) })
    expect(value).toBe(7.01)
    expect(result.current.guide).toBeNull()
    act(() => result.current.changeEnabled(false))
    act(() => { value = result.current.snap(1.01, false) })
    expect(value).toBe(1.01)
  })
})

describe("Studio viewport", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16))
    vi.stubGlobal("cancelAnimationFrame", clearTimeout)
    vi.stubGlobal("ResizeObserver", class { constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {} observe() { this.callback([{ contentRect: { width: 600 } }]) } disconnect() {} })
  })
  function viewport(total = 100, pixelsPerSecond = 100) {
    let samplesPerPixel = 48000 / pixelsPerSecond
    const session = { seek: vi.fn(), setZoomLevel: vi.fn((value: number) => { samplesPerPixel = value }), snapshot: () => ({ engine: { samplesPerPixel } }) }
    let current!: ReturnType<typeof useTimelineViewport>
    function Harness({ active = true, playback = "idle" as "idle" | "playing", playhead = 0 }) {
      current = useTimelineViewport({ session, total, pixelsPerSecond, samplesPerPixel, playhead, playback, zoomLevels: [240, 480, 960, 48000, 48000000], active })
      return createElement("div", { ref: current.scrollRef, "data-testid": "scroll" })
    }
    const rendered = render(createElement(Harness))
    const element = rendered.getByTestId("scroll") as HTMLDivElement
    Object.defineProperty(element, "clientWidth", { value: 600 })
    element.getBoundingClientRect = () => ({ left: 0, width: 600 } as DOMRect)
    element.scrollTo = vi.fn((options?: ScrollToOptions | number, _y?: number) => { if (typeof options === "number") element.scrollLeft = options; else if (options?.left !== undefined) element.scrollLeft = options.left })
    return { current: () => current, element, session, rendered, Harness }
  }
  it("bounds ruler rendering to the visible viewport of a thousand hour composition", () => {
    const view = viewport(3600000)
    expect(view.current().width).toBe(360000000)
    expect(view.current().marks.length).toBeLessThan(20)
    act(() => { view.element.scrollLeft = 1000000; view.current().syncVerticalScroll(0) })
    expect(view.current().marks[0]).toBeGreaterThan(9900)
    expect(view.current().marks.length).toBeLessThan(20)
  })
  it("fits the entire composition and preserves the centered time when zooming", () => {
    const view = viewport(100)
    act(() => { view.element.scrollLeft = 300; view.current().setCenteredZoom(4) })
    act(() => vi.advanceTimersByTime(16))
    expect(view.session.setZoomLevel).toHaveBeenLastCalledWith(240)
    expect(view.element.scrollLeft).toBe(900)
    act(() => view.current().fitTimeline())
    act(() => vi.advanceTimersByTime(16))
    expect(view.session.setZoomLevel).toHaveBeenLastCalledWith(48000)
    expect(view.element.scrollLeft).toBe(0)
    expect(view.current().followPlayhead).toBe(false)
  })
  it("keeps automatic follow enabled after its own scroll and stops following on user wheel", () => {
    const view = viewport()
    view.rendered.rerender(createElement(view.Harness, { playback: "playing", playhead: 20 }))
    expect(view.element.scrollLeft).toBe(1808)
    act(() => view.current().syncVerticalScroll(0))
    expect(view.current().followPlayhead).toBe(true)
    act(() => view.element.dispatchEvent(new WheelEvent("wheel", { deltaY: 10 })))
    expect(view.current().followPlayhead).toBe(false)
  })
  it.each(["pointercancel", "blur", "unmount"])("cleans ruler seeking on %s and ignores another pointer", mode => {
    const view = viewport(5)
    act(() => view.current().seekFromPointer(pointer(200)))
    expect(view.session.seek).toHaveBeenLastCalledWith(2)
    act(() => dispatch("pointermove", { pointerId: 2, clientX: 400 }))
    expect(view.session.seek).toHaveBeenCalledTimes(1)
    act(() => dispatch("pointermove", { clientX: 1000 }))
    expect(view.session.seek).toHaveBeenLastCalledWith(5)
    act(() => { if (mode === "unmount") view.rendered.unmount(); else dispatch(mode) })
    act(() => dispatch("pointermove", { clientX: 100 }))
    expect(view.session.seek).toHaveBeenCalledTimes(2)
    expect(view.current().activeCancel.current).toBeNull()
  })
  it("cancels background panning on blur and synchronizes the scrolled ruler window", () => {
    const view = viewport(100)
    view.element.scrollLeft = 1000
    act(() => view.current().panTimeline(pointer(100, 0, { target: view.element, currentTarget: view.element })))
    act(() => dispatch("pointermove", { clientX: 50 }))
    expect(view.element.scrollLeft).toBe(1050)
    expect(view.current().panning).toBe(true)
    act(() => dispatch("blur"))
    expect(view.current().panning).toBe(false)
    act(() => dispatch("pointermove", { clientX: 0 }))
    expect(view.element.scrollLeft).toBe(1050)
  })
})
