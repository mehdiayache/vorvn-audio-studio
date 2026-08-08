// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePlayer } from "@/hooks/use-player"

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
    const source = { key: "part:12", url: "/audio/part.mp3", title: "Part 12", kind: "part" as const }

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
    await act(async () => result.current.toggleSource({ key: "part:1", url: "/audio/one.mp3", title: "One", kind: "part" }))
    await act(async () => result.current.toggleSource({ key: "asset-source:2", url: "/audio/two.mp3", title: "Two", kind: "music" }))

    expect(element.pause).toHaveBeenCalledTimes(1)
    expect(element.play).toHaveBeenCalledTimes(2)
    expect(element.src).toContain("/audio/two.mp3")
    expect(result.current.source?.key).toBe("asset-source:2")
    expect(result.current.state).toBe("playing")
  })

  it("loads a replacement file when a take changes behind the same part id", async () => {
    const { result } = renderHook(() => usePlayer())
    await act(async () => result.current.toggleSource({ key: "part:7", url: "/audio/old-take.mp3", title: "Part 7", kind: "part" }))
    await act(async () => result.current.toggleSource({ key: "part:7", url: "/audio/promoted-take.mp3", title: "Part 7", kind: "part" }))

    expect(element.pause).toHaveBeenCalledTimes(1)
    expect(element.play).toHaveBeenCalledTimes(2)
    expect(element.src).toContain("/audio/promoted-take.mp3")
    expect(result.current.source?.url).toContain("/audio/promoted-take.mp3")
  })

  it("restarts an ended source from the beginning", async () => {
    const { result } = renderHook(() => usePlayer())
    const source = { key: "take:3", url: "/audio/take.mp3", title: "Take", kind: "part" as const }
    await act(async () => result.current.toggleSource(source))
    element.paused = true
    element.ended = true
    element.currentTime = element.duration

    await act(async () => result.current.toggleSource(source))
    expect(element.currentTime).toBe(0)
    expect(result.current.state).toBe("playing")
  })
})
