// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePlayer } from "@/hooks/use-player"
import { setCaptionPresentation } from "@/lib/caption-presentation"

class FakeAudio extends EventTarget {
  preload = ""
  src = ""
  currentTime = 0
  duration = 30
  volume = 1
  playbackRate = 1
  paused = true
  ended = false
  play = vi.fn(async () => {
    this.paused = false
    this.dispatchEvent(new Event("playing"))
  })
  pause = vi.fn(() => {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event("pause"))
  })
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = ""
  })
}

let element: FakeAudio

beforeEach(() => {
  element = new FakeAudio()
  class AudioMock {
    constructor() {
      return element
    }
  }
  vi.stubGlobal("Audio", AudioMock)
})

afterEach(() => {
  setCaptionPresentation("standard")
  window.localStorage.clear()
  cleanup()
  vi.unstubAllGlobals()
})

describe("usePlayer", () => {
  it("uses the displayed defaults on the real audio element", () => {
    renderHook(() => usePlayer())
    expect(element.volume).toBe(0.85)
    expect(element.playbackRate).toBe(1)
  })

  it("plays, pauses, and resumes the same source without replacing it", async () => {
    const { result } = renderHook(() => usePlayer())
    const source = { key: "part:12", url: "/audio/part.mp3", title: "Part 12", kind: "take" as const }

    await act(async () => result.current.toggleSource(source))
    expect(result.current.state).toBe("playing")
    expect(element.src).toContain("/audio/part.mp3")
    expect(element.play).toHaveBeenCalledTimes(1)

    await act(async () => result.current.toggleSource(source))
    expect(result.current.state).toBe("paused")
    expect(element.pause).toHaveBeenCalledTimes(1)

    await act(async () => result.current.toggleSource(source))
    expect(result.current.state).toBe("playing")
    expect(element.play).toHaveBeenCalledTimes(2)
    expect(result.current.source?.key).toBe("part:12")
  })

  it("stops the old source before playing a different one", async () => {
    const { result } = renderHook(() => usePlayer())
    await act(async () => result.current.toggleSource({ key: "part:1", url: "/audio/one.mp3", title: "One", kind: "take" }))
    await act(async () => result.current.toggleSource({ key: "asset-source:2", url: "/audio/two.mp3", title: "Two", kind: "music" }))

    expect(element.pause).toHaveBeenCalledTimes(1)
    expect(element.play).toHaveBeenCalledTimes(2)
    expect(element.src).toContain("/audio/two.mp3")
    expect(result.current.source?.key).toBe("asset-source:2")
    expect(result.current.state).toBe("playing")
  })

  it("loads a replacement file when a take changes behind the same part id", async () => {
    const { result } = renderHook(() => usePlayer())
    await act(async () => result.current.toggleSource({ key: "part:7", url: "/audio/old-take.mp3", title: "Part 7", kind: "take" }))
    await act(async () => result.current.toggleSource({ key: "part:7", url: "/audio/promoted-take.mp3", title: "Part 7", kind: "take" }))

    expect(element.pause).toHaveBeenCalledTimes(1)
    expect(element.play).toHaveBeenCalledTimes(2)
    expect(element.src).toContain("/audio/promoted-take.mp3")
    expect(result.current.source?.url).toContain("/audio/promoted-take.mp3")
  })

  it("restarts an ended source from the beginning", async () => {
    const { result } = renderHook(() => usePlayer())
    const source = { key: "take:3", url: "/audio/take.mp3", title: "Take", kind: "take" as const }
    await act(async () => result.current.toggleSource(source))
    element.paused = true
    element.ended = true
    element.currentTime = element.duration

    await act(async () => result.current.toggleSource(source))
    expect(element.currentTime).toBe(0)
    expect(result.current.state).toBe("playing")
  })

  it("seeks, changes volume and speed on the single audio element", async () => {
    const { result } = renderHook(() => usePlayer())
    await act(async () => result.current.toggleSource({ key: "voice:4", url: "/audio/voice.mp3", title: "Voice", kind: "voice" }))
    act(() => result.current.seek(12.5))
    expect(element.currentTime).toBe(12.5)
    act(() => result.current.setVolume(.35))
    expect(element.volume).toBe(.35)
    act(() => result.current.setSpeed(1.5))
    expect(element.playbackRate).toBe(1.5)
  })

  it("keeps caption language and the current cue in the one global player", async () => {
    const { result } = renderHook(() => usePlayer())
    await act(async () => result.current.toggleSource({
      key: "part:4", url: "/audio/part.mp3", title: "Part 4", kind: "take",
      captionTracks: [
        { id: "en", language: "English", label: "English · Original", stale: false, cues: [{ startMs: 0, endMs: 2000, text: "Open the old wooden door.", partId: 4 }] },
        { id: "fr", language: "French", label: "French", stale: false, cues: [{ startMs: 0, endMs: 2000, text: "Ouvre la vieille porte en bois.", partId: 4 }] },
      ],
    }))
    act(() => result.current.setCaptionTrack("fr"))
    expect(result.current.captionsEnabled).toBe(true)
    expect(result.current.captionTrack?.language).toBe("French")
    expect(result.current.currentCaptionCue?.text).toContain("vieille porte")
    act(() => result.current.toggleCaptions())
    expect(result.current.currentCaptionCue).toBeNull()
  })

  it("switches the current cue between reusable caption presentations", async () => {
    const { result } = renderHook(() => usePlayer())
    await act(async () => result.current.toggleSource({
      key: "part:9", url: "/audio/part.mp3", title: "Part 9", kind: "take",
      captionTracks: [{
        id: "en", language: "English", label: "English · Original", stale: false,
        cues: [{ startMs: 0, endMs: 2000, text: "The complete sentence.", partId: 9 }],
        presentations: {
          standard: [{ startMs: 0, endMs: 2000, text: "The complete sentence.", partId: 9 }],
          short: [{ startMs: 0, endMs: 2000, text: "Complete sentence", partId: 9 }],
          words: [{ startMs: 0, endMs: 2000, text: "Complete", partId: 9 }],
        },
      }],
    }))
    act(() => result.current.setCaptionTrack("en"))
    expect(result.current.currentCaptionCue?.text).toBe("The complete sentence.")
    act(() => result.current.setCaptionProfile("words"))
    expect(result.current.captionProfile).toBe("words")
    expect(result.current.currentCaptionCue?.text).toBe("Complete")
  })

  it("keeps playback errors observable until the operator closes the source", async () => {
    const { result } = renderHook(() => usePlayer())
    await act(async () => result.current.toggleSource({ key: "subtitle:4", url: "/audio/missing.mp3", title: "Missing source", kind: "subtitle" }))
    act(() => element.dispatchEvent(new Event("error")))
    expect(result.current.state).toBe("error")
    expect(result.current.source?.key).toBe("subtitle:4")
    act(() => result.current.close())
    expect(result.current.state).toBe("idle")
    expect(result.current.source).toBeNull()
    expect(element.src).toBe("")
  })
})
