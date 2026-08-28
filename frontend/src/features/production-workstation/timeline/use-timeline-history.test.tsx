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
})
