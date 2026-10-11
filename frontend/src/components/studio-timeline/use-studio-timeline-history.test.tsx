// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {useStudioTimelineHistory as useTimelineHistory} from "./use-studio-timeline-history"

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


describe("composition history owner adapter", () => {
  it("returns the single owner's availability and original actions without replaying or creating history", async () => {
    const undo = vi.fn(), redo = vi.fn()
    const {result, rerender} = renderHook(({canUndo,canRedo}) => useTimelineHistory({owner:{canUndo,canRedo,undo,redo}}), {initialProps:{canUndo:true,canRedo:false}})
    expect(result.current.undo).toBe(undo);expect(result.current.redo).toBe(redo)
    expect(result.current.undoDomain).toBe('composition');expect(result.current.canUndo).toBe(true)
    expect(undo).not.toHaveBeenCalled();expect(redo).not.toHaveBeenCalled()
    await act(async()=>result.current.undo())
    rerender({canUndo:false,canRedo:true})
    expect(result.current.canUndo).toBe(false);expect(result.current.canRedo).toBe(true)
    await act(async()=>result.current.redo())
    expect(undo).toHaveBeenCalledOnce();expect(redo).toHaveBeenCalledOnce()
  })
  it("does not race repeated dual-service Undo while the first operation is pending", async () => {
    let finish!:()=>void
    const undoAudio=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}))
    const {result}=renderHook(()=>useTimelineHistory({audioRevision:1,audioRevisionKind:'operator',visualRevision:1,audioCanUndo:true,audioCanRedo:false,visualCanUndo:false,visualCanRedo:false,undoAudio,redoAudio:vi.fn()}))
    let first!:Promise<void>
    await act(async()=>{first=result.current.undo();await result.current.undo()})
    expect(undoAudio).toHaveBeenCalledOnce()
    await act(async()=>{finish();await first})
    expect(result.current.redoDomain).toBe('audio')
  })
  it("releases the dual-service operation guard after a failed Undo", async () => {
    const undoAudio=vi.fn().mockRejectedValueOnce(Error('network')).mockResolvedValue(undefined)
    const {result}=renderHook(()=>useTimelineHistory({audioRevision:1,audioRevisionKind:'operator',visualRevision:1,audioCanUndo:true,audioCanRedo:false,visualCanUndo:false,visualCanRedo:false,undoAudio,redoAudio:vi.fn()}))
    await act(async()=>{await expect(result.current.undo()).rejects.toThrow('network')})
    await act(async()=>result.current.undo())
    expect(undoAudio).toHaveBeenCalledTimes(2)
  })
})
