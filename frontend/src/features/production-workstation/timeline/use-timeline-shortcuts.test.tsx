// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { acceptsTimelineShortcut } from "./use-timeline-shortcuts"

describe("Timeline shortcut focus boundary", () => {
  it("does not steal keys from operator controls", () => {
    const slider = document.createElement("span")
    slider.setAttribute("role", "slider")
    const sliderThumb = document.createElement("span")
    slider.append(sliderThumb)
    const button = document.createElement("button")
    const input = document.createElement("input")

    expect(acceptsTimelineShortcut(sliderThumb)).toBe(false)
    expect(acceptsTimelineShortcut(button)).toBe(false)
    expect(acceptsTimelineShortcut(input)).toBe(false)
  })

  it("keeps precise editing shortcuts on focused Timeline clips", () => {
    const clip = document.createElement("div")
    clip.setAttribute("role", "button")
    clip.dataset.timelineShortcutSurface = "true"

    expect(acceptsTimelineShortcut(clip)).toBe(true)
    expect(acceptsTimelineShortcut(document.body)).toBe(true)
  })
})
