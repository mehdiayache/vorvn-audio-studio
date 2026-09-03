// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useTimelineHistory } from "./use-timeline-history"

describe("useTimelineHistory", () => {
  it("undoes the latest edited domain, independent of the current selection", async () => {
    const undoAudio = vi.fn(async () => undefined)
    const undoVisual = vi.fn(async () => undefined)
    const redoAudio = vi.fn(async () => undefined)
    const redoVisual = vi.fn(async () => undefined)
    let audioRevision = 1
    let visualRevision = 1

    const { result, rerender } = renderHook(() => useTimelineHistory({
      audioRevision,
      audioRevisionKind: "operator",
      visualRevision,
      audioCanUndo: true,
      audioCanRedo: false,
      visualCanUndo: true,
      visualCanRedo: false,
      undoAudio,
      redoAudio,
      undoVisual,
      redoVisual,
    }))

    visualRevision = 2
    rerender()
    expect(result.current.undoDomain).toBe("visual")

    await act(async () => result.current.undo())
    expect(undoVisual).toHaveBeenCalledTimes(1)
    expect(undoAudio).not.toHaveBeenCalled()

    visualRevision = 1
    rerender()
    audioRevision = 2
    rerender()
    expect(result.current.undoDomain).toBe("audio")

    await act(async () => result.current.undo())
    expect(undoAudio).toHaveBeenCalledTimes(1)
  })

  it("treats video-audio synchronization as part of the visual edit", async () => {
    const undoAudio = vi.fn(async () => undefined)
    const undoVisual = vi.fn(async () => undefined)
    let audioRevision = 1
    let audioRevisionKind: "external" | "derived_visual_audio" = "external"
    let visualRevision = 1
    const { result, rerender } = renderHook(() => useTimelineHistory({
      audioRevision, audioRevisionKind, visualRevision,
      audioCanUndo: true, audioCanRedo: true,
      visualCanUndo: true, visualCanRedo: true,
      undoAudio, redoAudio: vi.fn(), undoVisual, redoVisual: vi.fn(),
    }))

    visualRevision = 2
    rerender()
    audioRevision = 2
    audioRevisionKind = "derived_visual_audio"
    rerender()

    expect(result.current.undoDomain).toBe("visual")
    await act(async () => result.current.undo())
    expect(undoVisual).toHaveBeenCalledOnce()
    expect(undoAudio).not.toHaveBeenCalled()
  })

  it("keeps audio, paired video-audio, audio in one chronological order", async () => {
    const calls: string[] = []
    const undoAudio = vi.fn(async () => { calls.push("audio") })
    const undoVisual = vi.fn(async () => { calls.push("visual+linked-audio") })
    let audioRevision = 1
    let audioRevisionKind: "operator" | "derived_visual_audio" = "operator"
    let visualRevision = 1
    const { result, rerender } = renderHook(() => useTimelineHistory({
      audioRevision, audioRevisionKind, visualRevision,
      audioCanUndo: true, audioCanRedo: true,
      visualCanUndo: true, visualCanRedo: true,
      undoAudio, redoAudio: vi.fn(), undoVisual, redoVisual: vi.fn(),
    }))

    audioRevision = 2
    rerender()
    visualRevision = 2
    rerender()
    audioRevision = 3
    audioRevisionKind = "derived_visual_audio"
    rerender()
    audioRevision = 4
    audioRevisionKind = "operator"
    rerender()

    await act(async () => result.current.undo())
    audioRevision = 5
    rerender()
    await act(async () => result.current.undo())
    visualRevision = 3
    rerender()
    audioRevision = 6
    audioRevisionKind = "derived_visual_audio"
    rerender()
    await act(async () => result.current.undo())

    expect(calls).toEqual(["audio", "visual+linked-audio", "audio"])
  })
})
